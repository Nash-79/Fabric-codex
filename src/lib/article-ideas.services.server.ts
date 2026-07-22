import { APICallError, generateObject, NoObjectGeneratedError } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";
import { ADVISOR_MODEL_IDS, DEFAULT_ADVISOR_MODEL } from "@/lib/advisor-models";

// Fallback chain tried in order after the requested/default model fails. Deliberately spans two
// providers (Google, then OpenAI) rather than just other Gemini tiers — the 2026-07-22 production
// failures were APICallError (the gateway/provider call itself failing, not a schema mismatch), so
// a same-provider fallback could hit the same outage. gpt-5-mini is the last resort, not the
// second try: it's the "moderate" tier, pricier than the Gemini flash tiers it's backing up.
const FALLBACK_MODEL_IDS = ["google/gemini-3.1-flash-lite-preview", "openai/gpt-5-mini"];

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
  target_content_kind: z
    .enum(["article", "lesson"])
    .describe(
      "article = /blog|/publish-topic pipeline (no length cap, mandatory diagrams+worked example); " +
        "lesson = /lesson pipeline (hard <400-word cap, capability+level input, no diagrams).",
    ),
  target_slug: z
    .string()
    .describe(
      "Proposed or existing content/topics.json slug this content should map to. For lessons, " +
        "still emit the mapped topic slug where one exists for consistency; supporting_capability_ids[0] " +
        "is the authoritative capability for /lesson, not this field.",
    ),
  capability_level: z
    .enum(["Beginner", "Intermediate", "Expert"])
    .optional()
    .describe("Required when target_content_kind is 'lesson'; omit for articles."),
  target_length_hint: z
    .string()
    .describe(
      "A rough guidance band, not a hard rule for articles: e.g. '1200-1800 words' for an article " +
        "(length is driven by grounding depth, not a fixed target) or the literal 'under 400 words' " +
        "for a lesson (learning-author's actual hard cap — never propose a different number here).",
    ),
  must_include_example: z
    .boolean()
    .describe("Whether the resulting content must include a concrete worked example."),
  diagram_guidance: z
    .string()
    .default("")
    .describe(
      "Article ideas only: short content guidance layered onto blog-author's own mandatory " +
        "architecture + decision/internals diagram pair — e.g. 'the decision/internals diagram " +
        "should contrast Direct Lake vs Import mode'. Never a diagram count or kind — blog-author " +
        "already owns that invariant. Leave empty for lesson ideas (learning-author has no diagram step).",
    ),
  supporting_capability_ids: z.array(z.string()).default([]),
  supporting_roadmap_ids: z.array(z.string()).default([]),
  suggested_diagrams: z
    .array(z.string())
    .default([])
    .describe(
      "Deprecated — use diagram_guidance instead. Kept only for backward-read compatibility.",
    ),
  priority: z.enum(["high", "medium", "low"]),
});

export type ArticleIdeaCandidate = z.infer<typeof ideaSchema>;

const ideaArraySchema = z.object({ ideas: z.array(ideaSchema).max(15) });

const SYSTEM_PROMPT = `You are the Fabric Atlas Editorial Radar — you propose article and lesson ideas for a
governed Microsoft Fabric knowledge platform. You are NOT the author; a separate local agent writes
the actual content later from verified claims. Your only job is to propose well-justified candidates.

Content kind:
- target_content_kind: "article" feeds the /blog or /publish-topic pipeline — no hard length cap
  (length is driven by grounding depth, not a fixed target), a mandatory worked example, and
  blog-author will itself commission an architecture diagram and a decision/internals diagram.
  Your diagram_guidance is short CONTENT guidance layered onto that existing pair (e.g. "the
  decision/internals diagram should contrast Direct Lake vs Import mode") — never a diagram count
  or kind; that invariant already belongs to blog-author, do not contradict or replace it.
- target_content_kind: "lesson" feeds the /lesson pipeline (learning-author) — a HARD cap of under
  400 words (set target_length_hint to exactly "under 400 words" for every lesson idea), a required
  capability_level (Beginner/Intermediate/Expert, mapped from claim depth: Beginner=L1-L2,
  Intermediate=L3, Expert=L4-L5), and NO diagrams at all — leave diagram_guidance empty for lessons,
  the lesson pipeline has no diagram-commissioning step to consume it.
- Prefer "article" for topics needing architecture/performance/internals depth or worked examples
  spanning multiple concepts; prefer "lesson" for a single, narrowly-scoped concept a reader could
  absorb in one short sitting at a specific depth level.

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
  content maps to an existing topic; propose a new short kebab-case slug only when no topic fits.
- must_include_example should be true for essentially every idea (a worked example is standard
  practice for both articles and lessons in this KB) — set it false only for a narrow conceptual
  overview where a worked example genuinely does not apply.

Output shape (follow exactly — do not rename or restructure):
- Return a single JSON object with exactly one top-level key: "ideas". Do NOT return a bare array.
  Correct: {"ideas": [ ... ]}. Incorrect: [ ... ].
- Each element of "ideas" is an object with exactly these keys: title, angle, rationale,
  signal_type, target_content_kind, target_slug, capability_level (lessons only), target_length_hint,
  must_include_example, diagram_guidance, supporting_capability_ids, supporting_roadmap_ids,
  suggested_diagrams, priority.
- "angle" and "rationale" are two distinct required fields, not one merged "justification" or
  "reasoning" field: angle is the specific thesis/take the content will argue; rationale is why it
  matters now, citing the concrete signal. Do not invent a different field name for either.`;

const ADMIN_DIRECTION_RULE = `
An ADMIN DIRECTION block below narrows *what* to propose ideas about — it does not exempt an idea
from the grounding requirement above. If no signal in CONTEXT supports the admin's direction, you
may still propose an idea if it is reasonable, but mark it priority: "low" and say explicitly in
rationale that it is admin-directed rather than signal-driven, so the human reviewing it is not
misled about how grounded it actually is.`;

const PRIOR_ROUND_RULE = `
A PRIOR ROUND block below lists ideas already proposed in an earlier generation for this same
editorial session, each labeled with its current disposition:
- dismissed = the admin rejected it. Do NOT propose the same idea again, and do not propose a
  trivial rewording of it — treat the underlying angle as ruled out unless the new ADMIN DIRECTION
  explicitly asks for it.
- kept (queued/claimed) = the admin is interested or already acting on it. Do not duplicate it, but
  you may propose a genuinely distinct companion idea (e.g. a deeper-depth follow-up or an adjacent
  capability) if ADMIN DIRECTION points that way.
Use PRIOR ROUND only to avoid repetition and to sharpen new ideas with the added context in ADMIN
DIRECTION — it is not itself a signal and does not satisfy the grounding requirement above.`;

export type PriorIdeaContext = {
  title: string;
  angle: string;
  signal_type: string;
  status: "dismissed" | "kept";
};

type GenerationFailureAudit = {
  action: "idea.generation_failed" | "idea.generation_filtered" | "idea.generation_fallback_used";
  metadata: Record<string, unknown>;
};

async function recordGenerationAudit(sb: SupabaseAdmin, event: GenerationFailureAudit) {
  // This module already holds `sb`; a 5-line inline insert here avoids adding a third copy of the
  // recordAudit shape already duplicated between settings.functions.ts and article-ideas.functions.ts
  // for one more call site. Best-effort: a logging failure must never mask the real error/result.
  try {
    await sb.from("admin_audit_events").insert({
      actor_id: null,
      action: event.action,
      target_type: "queue_item",
      target_id: "",
      metadata: event.metadata,
    });
  } catch {
    // Swallow — logging is diagnostic, not load-bearing; never let it throw over the real outcome.
  }
}

export type GenerateIdeaResult = {
  ideas: ArticleIdeaCandidate[];
  usedModelId: string;
  requestedModelId: string;
  attemptErrors: Array<{ model_id: string; message: string }>;
};

export async function generateIdeaCandidates(
  sb: SupabaseAdmin,
  opts: {
    signalTypes?: IdeaSignalType[];
    modelId?: string;
    userPrompt?: string;
    contentKind?: "article" | "lesson" | "both";
    priorIdeas?: PriorIdeaContext[];
  } = {},
): Promise<GenerateIdeaResult> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY not configured");

  const modelId =
    opts.modelId && ADVISOR_MODEL_IDS.has(opts.modelId) ? opts.modelId : DEFAULT_ADVISOR_MODEL;
  const signalTypes = opts.signalTypes?.length
    ? opts.signalTypes
    : (["roadmap", "coverage", "backlog", "staleness"] as IdeaSignalType[]);
  const userPrompt = opts.userPrompt?.trim() || undefined;
  const contentKind = opts.contentKind ?? "both";
  const priorIdeas = opts.priorIdeas?.length ? opts.priorIdeas : undefined;

  const signals = await assembleIdeaSignals(sb, signalTypes);
  const hasAnySignal =
    signals.roadmap_gaps.length ||
    signals.coverage_gaps.length ||
    signals.queue_backlog.length ||
    signals.reader_feedback.length ||
    signals.stale_articles.length;
  // A user-supplied direction can still produce a legitimate (if low-priority) idea even when the
  // default signal sweep is quiet — only bail out early in auto mode, where "no signal" genuinely
  // means "nothing to propose."
  if (!hasAnySignal && !userPrompt) {
    return { ideas: [], usedModelId: modelId, requestedModelId: modelId, attemptErrors: [] };
  }

  const contentKindInstruction =
    contentKind === "article"
      ? '\n\nOnly propose target_content_kind: "article" ideas this run.'
      : contentKind === "lesson"
        ? '\n\nOnly propose target_content_kind: "lesson" ideas this run.'
        : "";
  const system =
    SYSTEM_PROMPT +
    contentKindInstruction +
    (userPrompt ? ADMIN_DIRECTION_RULE : "") +
    (priorIdeas ? PRIOR_ROUND_RULE : "");
  const priorRoundBlock = priorIdeas
    ? `\n\nPRIOR ROUND (JSON):\n${JSON.stringify(priorIdeas)}`
    : "";
  const prompt = userPrompt
    ? `ADMIN DIRECTION:\n${userPrompt}\n\nCONTEXT (JSON):\n${JSON.stringify(signals)}${priorRoundBlock}`
    : `CONTEXT (JSON):\n${JSON.stringify(signals)}${priorRoundBlock}`;

  const gateway = createLovableAiGatewayProvider(key);

  // Try the requested/default model first, then fall back through FALLBACK_MODEL_IDS on any
  // failure (schema mismatch, gateway/provider API error, timeout, etc.) — a single flaky model
  // or provider outage should not zero out an idea-generation run. Each attempt's failure is
  // logged individually so Settings -> Logs shows the full chain, not just the last error.
  const attemptModelIds = [modelId, ...FALLBACK_MODEL_IDS.filter((id) => id !== modelId)];
  let object: z.infer<typeof ideaArraySchema> | undefined;
  let usedModelId: string | undefined;
  const attemptErrors: Array<{ model_id: string; message: string }> = [];

  for (let i = 0; i < attemptModelIds.length; i++) {
    const attemptModelId = attemptModelIds[i];
    const isLastAttempt = i === attemptModelIds.length - 1;
    try {
      ({ object } = await generateObject({
        model: gateway(attemptModelId),
        schema: ideaArraySchema,
        system,
        prompt,
      }));
      usedModelId = attemptModelId;
      break;
    } catch (err) {
      // Log every generation failure, not only the schema-mismatch case — the bug that prompted this
      // change was exactly a schema mismatch going completely unlogged, but a network error, an
      // invalid/missing key past the check above (e.g. revoked mid-request), a gateway-side rate
      // limit, or a timeout would have been just as invisible with a narrower catch.
      const baseMetadata = {
        model_id: attemptModelId,
        signal_types: signalTypes,
        user_prompt: userPrompt ?? null,
        attempt: i + 1,
        of_attempts: attemptModelIds.length,
        will_retry: !isLastAttempt,
      };
      let message: string;
      if (NoObjectGeneratedError.isInstance(err)) {
        message = err.message;
        await recordGenerationAudit(sb, {
          action: "idea.generation_failed",
          metadata: {
            ...baseMetadata,
            message: err.message,
            raw_text: err.text?.slice(0, 4000) ?? null,
            cause: err.cause ? String(err.cause) : null,
            finish_reason: err.finishReason ?? null,
            usage: err.usage ?? null,
            error_type: "NoObjectGeneratedError",
          },
        });
      } else if (APICallError.isInstance(err)) {
        message = err.message;
        await recordGenerationAudit(sb, {
          action: "idea.generation_failed",
          metadata: {
            ...baseMetadata,
            message: err.message,
            status_code: err.statusCode ?? null,
            response_body: err.responseBody?.slice(0, 4000) ?? null,
            is_retryable: err.isRetryable,
            url: err.url,
            cause: err.cause ? String(err.cause) : null,
            error_type: "APICallError",
          },
        });
      } else {
        message = err instanceof Error ? err.message : String(err);
        await recordGenerationAudit(sb, {
          action: "idea.generation_failed",
          metadata: {
            ...baseMetadata,
            message,
            error_type: err instanceof Error ? err.constructor.name : "unknown",
          },
        });
      }
      attemptErrors.push({ model_id: attemptModelId, message });
      if (isLastAttempt) {
        throw new Error(
          `Idea generation failed on all ${attemptModelIds.length} model(s): ` +
            attemptErrors.map((a) => `${a.model_id} (${a.message})`).join("; "),
        );
      }
    }
  }

  if (!object || !usedModelId) {
    // Unreachable in practice — the loop above either sets both and breaks, or throws on the
    // last attempt — but keeps TypeScript's control-flow analysis honest.
    throw new Error("Idea generation produced no object and no error");
  }
  if (usedModelId !== modelId) {
    await recordGenerationAudit(sb, {
      action: "idea.generation_fallback_used",
      metadata: {
        requested_model_id: modelId,
        used_model_id: usedModelId,
        signal_types: signalTypes,
        user_prompt: userPrompt ?? null,
      },
    });
  }

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

  const filtered = object.ideas.filter((idea) => {
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

  // "0 ideas produced" looks identical in the UI whether the model proposed nothing, or proposed N
  // ideas that all failed the grounding cross-check above — the latter means the model hallucinated
  // citations, a meaningfully different and more concerning outcome. Log the drop so an admin
  // reviewing Settings -> Logs can tell "quiet because there's nothing to say" apart from "quietly
  // discarding bad output," which a plain empty array can never distinguish on its own.
  if (filtered.length < object.ideas.length) {
    const keptTitles = new Set(filtered.map((idea) => idea.title));
    await recordGenerationAudit(sb, {
      action: "idea.generation_filtered",
      metadata: {
        proposed: object.ideas.length,
        kept: filtered.length,
        dropped_titles: object.ideas
          .filter((idea) => !keptTitles.has(idea.title))
          .map((idea) => idea.title),
        model_id: modelId,
        signal_types: signalTypes,
        user_prompt: userPrompt ?? null,
      },
    });
  }

  return { ideas: filtered, usedModelId, requestedModelId: modelId, attemptErrors };
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
    tags: [idea.signal_type, idea.priority, idea.target_content_kind],
    notes: JSON.stringify({
      angle: idea.angle,
      rationale: idea.rationale,
      signal_type: idea.signal_type,
      target_content_kind: idea.target_content_kind,
      capability_level: idea.capability_level ?? null,
      target_length_hint: idea.target_length_hint,
      must_include_example: idea.must_include_example,
      diagram_guidance: idea.diagram_guidance,
      supporting_capability_ids: idea.supporting_capability_ids,
      supporting_roadmap_ids: idea.supporting_roadmap_ids,
      priority: idea.priority,
    }),
    status: "queued",
    submitted_by: submittedBy,
  }));
  const { data, error } = await sb.from("queue_items").insert(rows).select("*");
  if (error) throw new Error(error.message);
  return data ?? [];
}
