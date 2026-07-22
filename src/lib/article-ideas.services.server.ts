import { generateObject } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";
import { ADVISOR_MODEL_IDS, DEFAULT_ADVISOR_MODEL } from "@/lib/advisor-models";

// Article idea generation reuses the same Lovable AI Gateway as /advisor/chat (bundled
// Lovable AI credits, not the metered Anthropic API — the actual article authoring stays
// on the free local-agent path). Ideas are stored as queue_items(kind='idea') rows —
// queue_items.kind has no CHECK constraint, so no migration is required to add this kind.

export type IdeaSignalType = "roadmap" | "coverage" | "backlog" | "staleness";

type SupabaseAdmin = any;

const STALE_MS = 1000 * 60 * 60 * 24 * 120; // 120 days without a version bump

export async function assembleIdeaSignals(sb: SupabaseAdmin, signalTypes: IdeaSignalType[]) {
  const want = new Set(
    signalTypes.length ? signalTypes : ["roadmap", "coverage", "backlog", "staleness"],
  );
  const [
    { data: roadmap },
    { data: capabilities },
    { data: claims },
    { data: topics },
    { data: topicCapabilities },
    { data: queueBacklog },
    { data: feedback },
    { data: contentItems },
  ] = await Promise.all([
    want.has("roadmap")
      ? sb
          .from("roadmap_items")
          .select(
            "id,title,link,status,release_type,target_release,capability_id,pub_date,feature_description,blog_url",
          )
          .eq("active", true)
          .order("pub_date", { ascending: false })
          .limit(100)
      : Promise.resolve({ data: [] }),
    sb.from("capabilities").select("id,name,description"),
    want.has("coverage") || want.has("roadmap")
      ? sb
          .from("claims")
          .select("capability_id,depth,status,active")
          .eq("active", true)
          .eq("status", "verified")
      : Promise.resolve({ data: [] }),
    sb.from("topics").select("slug,name,parent_slug,description").eq("active", true),
    sb.from("topic_capabilities").select("topic_slug,capability_id"),
    want.has("backlog")
      ? sb
          .from("queue_items")
          .select("id,kind,url,title,tier,tags,notes,target_slug,status,created_at")
          .in("status", ["queued", "claimed"])
          .order("created_at", { ascending: false })
          .limit(100)
      : Promise.resolve({ data: [] }),
    want.has("backlog")
      ? sb
          .from("content_feedback")
          .select("id,content_item_id,category,body,status,content_items(slug,title)")
          .eq("status", "new")
          .limit(50)
      : Promise.resolve({ data: [] }),
    want.has("staleness")
      ? sb
          .from("content_items")
          .select("id,kind,slug,topic_slug,title,updated_at,depth_levels,active,status")
          .eq("active", true)
          .eq("status", "published")
          .eq("kind", "article")
          .order("updated_at", { ascending: true })
          .limit(100)
      : Promise.resolve({ data: [] }),
  ]);

  // Coverage gap scoring — same shape coverage-auditor reasons over: capabilities with
  // zero verified claims, or claims only at L1/L2 (missing architect/perf/internals depth).
  const depthByCapability = new Map<string, Set<number>>();
  for (const claim of claims ?? []) {
    if (!claim.capability_id) continue;
    const set = depthByCapability.get(claim.capability_id) ?? new Set<number>();
    if (claim.depth) set.add(claim.depth);
    depthByCapability.set(claim.capability_id, set);
  }
  const coverageGaps = (capabilities ?? []).map((cap: any) => {
    const depths = depthByCapability.get(cap.id) ?? new Set<number>();
    return {
      capability_id: cap.id,
      name: cap.name,
      depths_covered: [...depths].sort(),
      has_claims: depths.size > 0,
      has_deep_coverage: [...depths].some((d) => d >= 3),
    };
  });

  const roadmapGaps = (roadmap ?? [])
    .filter((r: any) => r.capability_id)
    .map((r: any) => {
      const depths = depthByCapability.get(r.capability_id) ?? new Set<number>();
      return {
        roadmap_id: r.id,
        title: r.title,
        link: r.link ?? r.blog_url,
        status: r.status,
        target_release: r.target_release,
        capability_id: r.capability_id,
        depths_covered: [...depths].sort(),
      };
    })
    .filter(
      (r: any) => r.depths_covered.length === 0 || !r.depths_covered.some((d: number) => d >= 3),
    );

  const topicByCapability = new Map<string, string[]>();
  for (const row of topicCapabilities ?? []) {
    const list = topicByCapability.get(row.capability_id) ?? [];
    list.push(row.topic_slug);
    topicByCapability.set(row.capability_id, list);
  }

  const now = Date.now();
  const staleArticles = (contentItems ?? [])
    .filter((item: any) => now - new Date(item.updated_at).getTime() > STALE_MS)
    .map((item: any) => ({
      slug: item.slug,
      topic_slug: item.topic_slug,
      title: item.title,
      updated_at: item.updated_at,
      depth_levels: item.depth_levels ?? [],
    }));

  return {
    roadmap_gaps: want.has("roadmap") ? roadmapGaps.slice(0, 25) : [],
    coverage_gaps: want.has("coverage")
      ? coverageGaps.filter((c: any) => !c.has_claims || !c.has_deep_coverage).slice(0, 30)
      : [],
    queue_backlog: want.has("backlog") ? (queueBacklog ?? []).slice(0, 30) : [],
    reader_feedback: want.has("backlog") ? (feedback ?? []).slice(0, 20) : [],
    stale_articles: want.has("staleness") ? staleArticles.slice(0, 20) : [],
    topics: (topics ?? []).slice(0, 200),
    topic_by_capability: Object.fromEntries(topicByCapability),
  };
}

const ideaSchema = z.object({
  title: z.string().describe("A concrete, specific article headline — not a vague theme."),
  angle: z.string().describe("The specific angle/thesis this article would take."),
  rationale: z
    .string()
    .describe("Why this matters now, citing the concrete signal(s) it is grounded in."),
  signal_type: z.enum(["roadmap", "coverage", "backlog", "staleness"]),
  target_slug: z
    .string()
    .describe("Proposed or existing content/topics.json slug this article should map to."),
  supporting_capability_ids: z.array(z.string()).default([]),
  supporting_roadmap_ids: z.array(z.string()).default([]),
  suggested_diagrams: z
    .array(z.string())
    .default([])
    .describe("1-2 short diagram briefs, e.g. 'architecture flow', 'decision tree for X vs Y'"),
  priority: z.enum(["high", "medium", "low"]),
});

export type ArticleIdeaCandidate = z.infer<typeof ideaSchema>;

const ideaArraySchema = z.object({ ideas: z.array(ideaSchema).max(15) });

const SYSTEM_PROMPT = `You are the Fabric Atlas Editorial Radar — you propose article ideas for a governed
Microsoft Fabric knowledge platform. You are NOT the author; a separate local agent writes the
actual article later from verified claims. Your only job is to propose well-justified candidates.

Non-negotiable rules:
- Every idea MUST cite at least one concrete signal from the supplied CONTEXT: a roadmap_gaps
  entry, a coverage_gaps entry, a queue_backlog/reader_feedback entry, or a stale_articles entry.
  Put the concrete id(s) in supporting_capability_ids/supporting_roadmap_ids.
- NEVER invent a Fabric capability, product name, roadmap item, limit, quota, or pricing detail
  that is not present in the supplied CONTEXT. If you are not sure a feature exists, do not propose
  an article about it.
- Prefer ideas that close an L3-L5 depth gap (architecture/performance/internals) or map to a
  'rolling_out' or 'launched' roadmap item over speculative angles.
- If a genuinely useful idea has only weak/indirect signal support, still propose it but mark
  priority: "low" rather than omitting it — surfacing low-confidence ideas is more useful than
  silence, as long as it is honestly labeled.
- Do not propose an idea for a topic slug that already has deep (L3+) coverage per coverage_gaps,
  unless the signal is a roadmap item indicating the capability is changing.
- target_slug should match an existing content/topics.json slug from the topics list when the
  article maps to an existing topic; propose a new short kebab-case slug only when no topic fits.`;

export async function generateIdeaCandidates(
  sb: SupabaseAdmin,
  opts: { signalTypes?: IdeaSignalType[]; modelId?: string } = {},
): Promise<ArticleIdeaCandidate[]> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY not configured");

  const modelId =
    opts.modelId && ADVISOR_MODEL_IDS.has(opts.modelId) ? opts.modelId : DEFAULT_ADVISOR_MODEL;
  const signalTypes = opts.signalTypes?.length
    ? opts.signalTypes
    : (["roadmap", "coverage", "backlog", "staleness"] as IdeaSignalType[]);

  const signals = await assembleIdeaSignals(sb, signalTypes);
  const hasAnySignal =
    signals.roadmap_gaps.length ||
    signals.coverage_gaps.length ||
    signals.queue_backlog.length ||
    signals.reader_feedback.length ||
    signals.stale_articles.length;
  if (!hasAnySignal) return [];

  const gateway = createLovableAiGatewayProvider(key);
  const { object } = await generateObject({
    model: gateway(modelId),
    schema: ideaArraySchema,
    system: SYSTEM_PROMPT,
    prompt: `CONTEXT (JSON):\n${JSON.stringify(signals)}`,
  });

  // The schema only enforces shape, not truth — the model can satisfy
  // supporting_capability_ids/supporting_roadmap_ids with plausible-looking but fabricated ids
  // while still writing a compelling rationale. Cross-check every cited id against the actual
  // signals we sent; an idea with zero real citations is not "low priority", it is ungrounded
  // and gets dropped rather than surfaced to an admin as if it were vetted.
  const realCapabilityIds = new Set(
    [
      ...signals.coverage_gaps.map((c: any) => c.capability_id),
      ...signals.roadmap_gaps.map((r: any) => r.capability_id),
    ].filter(Boolean),
  );
  const realRoadmapIds = new Set(signals.roadmap_gaps.map((r: any) => r.roadmap_id));

  return object.ideas.filter((idea) => {
    const citesRealCapability = idea.supporting_capability_ids.some((id) =>
      realCapabilityIds.has(id),
    );
    const citesRealRoadmap = idea.supporting_roadmap_ids.some((id) => realRoadmapIds.has(id));
    // backlog/staleness signals don't have a stable id in the schema to cross-check, so an idea
    // honestly labeled with those signal types is accepted on the rationale text alone.
    const isUnverifiableSignalType =
      idea.signal_type === "backlog" || idea.signal_type === "staleness";
    return citesRealCapability || citesRealRoadmap || isUnverifiableSignalType;
  });
}

export async function insertIdeaQueueItems(
  sb: SupabaseAdmin,
  ideas: ArticleIdeaCandidate[],
  submittedBy: string | null,
) {
  if (!ideas.length) return [];

  // Dedup against open idea work, same pattern as commissionWork/commissionDiagram: a repeated
  // "Generate ideas" click would otherwise pile up near-duplicate rows for the same target_slug
  // every time roadmap/coverage/backlog signal is still present.
  const { data: openIdeas } = await sb
    .from("queue_items")
    .select("target_slug")
    .eq("kind", "idea")
    .in("status", ["queued", "claimed"]);
  const openSlugs = new Set((openIdeas ?? []).map((r: any) => r.target_slug));
  const fresh = ideas.filter((idea) => !openSlugs.has(idea.target_slug));
  if (!fresh.length) return [];

  const rows = fresh.map((idea) => ({
    kind: "idea",
    url: `fabric-atlas://idea/${idea.target_slug}`,
    title: idea.title,
    target_slug: idea.target_slug,
    tags: [idea.signal_type, idea.priority],
    notes: JSON.stringify({
      angle: idea.angle,
      rationale: idea.rationale,
      signal_type: idea.signal_type,
      supporting_capability_ids: idea.supporting_capability_ids,
      supporting_roadmap_ids: idea.supporting_roadmap_ids,
      suggested_diagrams: idea.suggested_diagrams,
      priority: idea.priority,
    }),
    status: "queued",
    submitted_by: submittedBy,
  }));
  const { data, error } = await sb.from("queue_items").insert(rows).select("*");
  if (error) throw new Error(error.message);
  return data ?? [];
}
