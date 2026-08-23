import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { AdvisorContextSource } from "@/lib/advisor-types";

type SearchHit = { kind: string; rank?: number; payload: any };

type ClaimRow = {
  id: string;
  text: string;
  depth: number | null;
  type?: string | null;
  tags?: string[] | null;
  capability_id: string | null;
  sources?: {
    slug?: string | null;
    title?: string | null;
    url?: string | null;
    tier?: number | null;
  } | null;
};

type ContentRow = {
  id?: string;
  kind: string;
  slug: string;
  title: string;
  summary?: string | null;
  topic_slug?: string | null;
  capability_id?: string | null;
  depth_levels?: number[] | null;
};

type TopicRow = {
  slug: string;
  name: string;
  description?: string | null;
};

type CapabilityRow = {
  id: string;
  name: string;
  description?: string | null;
  maturity?: string | null;
};

type SourceRow = {
  slug: string;
  title: string;
  url?: string | null;
  tier?: number | null;
  summary?: string | null;
};

type DiagramRow = {
  slug: string;
  path: string;
  caption?: string | null;
  kind?: string | null;
  topic_slug?: string | null;
};

export type AdvisorRetrievedContext = {
  claims: ClaimRow[];
  content: ContentRow[];
  topics: TopicRow[];
  capabilities: CapabilityRow[];
  sources: SourceRow[];
  diagrams: DiagramRow[];
  uiSources: AdvisorContextSource[];
  summary: string;
};

const CONTENT_KINDS = new Set(["article", "design", "lesson"]);

function words(term: string) {
  return term
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .slice(0, 8);
}

function uniqBy<T>(rows: T[], key: (row: T) => string | null | undefined, limit: number) {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const row of rows) {
    const id = key(row);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(row);
    if (out.length >= limit) break;
  }
  return out;
}

function contentPath(item: ContentRow) {
  return `/blogs/${item.kind}/${item.slug}`;
}

function topicPath(topic: TopicRow) {
  return `/topics/${topic.slug}`;
}

function sourceLabel(index: number) {
  return `R${index + 1}`;
}

function includesTerm(value: string | null | undefined, termWords: string[]) {
  const hay = (value ?? "").toLowerCase();
  return termWords.some((word) => hay.includes(word));
}

export async function advisorRetrieveContext(term: string): Promise<AdvisorRetrievedContext> {
  const query = term.trim().slice(0, 500);
  const termWords = words(query);
  const hitKinds: Record<string, any[]> = {
    claim: [],
    source: [],
    topic: [],
    article: [],
    design: [],
    lesson: [],
  };

  if (query) {
    const { data: hits } = await supabaseAdmin.rpc("search_atlas", {
      term: query,
      max_results: 80,
    });
    for (const hit of (hits ?? []) as SearchHit[]) {
      if (hit.kind in hitKinds) {
        hitKinds[hit.kind].push(
          CONTENT_KINDS.has(hit.kind) ? { ...hit.payload, kind: hit.kind } : hit.payload,
        );
      }
    }
  }

  const hitClaimIds = hitKinds.claim
    .map((c) => c.id)
    .filter(Boolean)
    .slice(0, 48);
  const claimRows: ClaimRow[] = [];

  // 1. Try Hybrid Search (pgvector + tsvector RRF) if available
  let hybridWorked = false;
  if (query) {
    try {
      const { data: hybridHits, error: hybridErr } = await (supabaseAdmin as any).rpc(
        "match_claims_hybrid",
        {
          query_text: query,
          match_count: 48,
          rrf_k: 60,
        },
      );

      if (!hybridErr && Array.isArray(hybridHits) && hybridHits.length > 0) {
        const hybridIds = hybridHits.map((h: any) => h.id).filter(Boolean);
        if (hybridIds.length > 0) {
          const { data } = await supabaseAdmin
            .from("claims")
            .select("id,text,depth,type,tags,capability_id,sources(slug,title,url,tier)")
            .eq("active", true)
            .eq("status", "verified")
            .in("id", hybridIds)
            .limit(48);

          if (data && data.length > 0) {
            // Sort by RRF rank order
            const rowMap = new Map((data as any[]).map((r) => [r.id, r]));
            for (const hid of hybridIds) {
              const r = rowMap.get(hid);
              if (r) claimRows.push(r);
            }
            hybridWorked = true;
          }
        }
      }
    } catch {
      // Fall through to lexical search
    }
  }

  // 2. Lexical & search_atlas fallback if hybrid search wasn't used or yielded few results
  if (hitClaimIds.length) {
    const { data } = await supabaseAdmin
      .from("claims")
      .select("id,text,depth,type,tags,capability_id,sources(slug,title,url,tier)")
      .eq("active", true)
      .eq("status", "verified")
      .in("id", hitClaimIds)
      .limit(36);
    claimRows.push(...((data ?? []) as any[]));
  }

  if (!hybridWorked && termWords.length) {
    const ors = termWords.map((word) => `text.ilike.%${word}%`).join(",");
    const { data } = await supabaseAdmin
      .from("claims")
      .select("id,text,depth,type,tags,capability_id,sources(slug,title,url,tier)")
      .eq("active", true)
      .eq("status", "verified")
      .or(ors)
      .limit(36);
    claimRows.push(...((data ?? []) as any[]));
  }

  const claims = uniqBy(claimRows, (row) => row.id, 48);
  const capabilityIds = new Set(claims.map((c) => c.capability_id).filter(Boolean) as string[]);
  const hitTopicSlugs = new Set(hitKinds.topic.map((t) => t.slug).filter(Boolean));
  const hitContent = [...hitKinds.article, ...hitKinds.design, ...hitKinds.lesson]
    .filter((c) => c?.slug && CONTENT_KINDS.has(c.kind ?? ""))
    .slice(0, 24);

  let capabilities: CapabilityRow[] = [];
  if (capabilityIds.size) {
    const { data } = await supabaseAdmin
      .from("capabilities")
      .select("id,name,description,maturity")
      .in("id", [...capabilityIds])
      .limit(12);
    capabilities = (data ?? []) as CapabilityRow[];
  } else if (termWords.length) {
    const ors = termWords
      .flatMap((word) => [`name.ilike.%${word}%`, `description.ilike.%${word}%`])
      .join(",");
    const { data } = await supabaseAdmin
      .from("capabilities")
      .select("id,name,description,maturity")
      .or(ors)
      .limit(8);
    capabilities = (data ?? []) as CapabilityRow[];
    capabilities.forEach((c) => capabilityIds.add(c.id));
  }

  let topicSlugs = new Set<string>(hitTopicSlugs);
  if (capabilityIds.size) {
    const { data } = await supabaseAdmin
      .from("topic_capabilities")
      .select("topic_slug,capability_id")
      .in("capability_id", [...capabilityIds])
      .limit(24);
    for (const row of data ?? []) {
      if (row.topic_slug) topicSlugs.add(row.topic_slug);
    }
  }

  let topics: TopicRow[] = [];
  if (topicSlugs.size) {
    const { data } = await supabaseAdmin
      .from("topics")
      .select("slug,name,description")
      .in("slug", [...topicSlugs])
      .limit(12);
    topics = (data ?? []) as TopicRow[];
  } else if (termWords.length) {
    const ors = termWords
      .flatMap((word) => [`name.ilike.%${word}%`, `description.ilike.%${word}%`])
      .join(",");
    const { data } = await supabaseAdmin
      .from("topics")
      .select("slug,name,description")
      .eq("active", true)
      .or(ors)
      .limit(8);
    topics = (data ?? []) as TopicRow[];
    topicSlugs = new Set(topics.map((t) => t.slug));
  }

  const contentRows: ContentRow[] = hitContent;
  if (topicSlugs.size) {
    const { data } = await supabaseAdmin
      .from("content_items")
      .select("id,kind,slug,title,summary,topic_slug,capability_id,depth_levels")
      .eq("active", true)
      .eq("status", "published")
      .in("topic_slug", [...topicSlugs])
      .in("kind", ["article", "design", "lesson"])
      .order("updated_at", { ascending: false })
      .limit(18);
    contentRows.push(...((data ?? []) as any[]));
  }
  if (termWords.length && contentRows.length < 8) {
    const ors = termWords
      .flatMap((word) => [
        `title.ilike.%${word}%`,
        `summary.ilike.%${word}%`,
        `body_md.ilike.%${word}%`,
      ])
      .join(",");
    const { data } = await supabaseAdmin
      .from("content_items")
      .select("id,kind,slug,title,summary,topic_slug,capability_id,depth_levels")
      .eq("active", true)
      .eq("status", "published")
      .in("kind", ["article", "design", "lesson"])
      .or(ors)
      .order("updated_at", { ascending: false })
      .limit(12);
    contentRows.push(...((data ?? []) as any[]));
  }
  const content = uniqBy(contentRows, (row) => `${row.kind}:${row.slug}`, 10);

  const sourceRows: SourceRow[] = [];
  for (const claim of claims) {
    if (!claim.sources?.slug) continue;
    sourceRows.push({
      slug: claim.sources.slug,
      title: claim.sources.title ?? claim.sources.slug,
      url: claim.sources.url,
      tier: claim.sources.tier,
      summary: null,
    });
  }
  sourceRows.push(...(hitKinds.source as SourceRow[]));
  if (termWords.length && sourceRows.length < 8) {
    const ors = termWords
      .flatMap((word) => [`title.ilike.%${word}%`, `summary.ilike.%${word}%`])
      .join(",");
    const { data } = await supabaseAdmin
      .from("sources")
      .select("slug,title,url,tier,summary")
      .eq("active", true)
      .or(ors)
      .order("tier")
      .limit(10);
    sourceRows.push(...((data ?? []) as SourceRow[]));
  }
  const sources = uniqBy(sourceRows, (row) => row.slug, 10);

  const diagramRows: DiagramRow[] = [];
  if (topicSlugs.size) {
    const { data } = await supabaseAdmin
      .from("diagrams")
      .select("slug,path,caption,kind,topic_slug")
      .in("topic_slug", [...topicSlugs])
      .limit(10);
    diagramRows.push(...((data ?? []) as DiagramRow[]));
  }
  if (termWords.length && diagramRows.length < 4) {
    const { data } = await supabaseAdmin
      .from("diagrams")
      .select("slug,path,caption,kind,topic_slug")
      .limit(50);
    diagramRows.push(
      ...((data ?? []) as DiagramRow[]).filter((d) => includesTerm(d.caption, termWords)),
    );
  }

  const diagrams = uniqBy(diagramRows, (row) => row.slug, 6);

  const uiSources: AdvisorContextSource[] = [
    ...claims.map((claim, index) => ({
      id: claim.id,
      label: `C${index + 1}`,
      title: claim.sources?.title ?? claim.capability_id ?? "Verified claim",
      url: claim.sources?.url,
      tier: claim.sources?.tier,
      kind: "claim" as const,
      ref: claim.capability_id,
      summary: claim.text,
    })),
    ...content.map((item, index) => ({
      id: `${item.kind}:${item.slug}`,
      label: sourceLabel(index),
      title: item.title,
      url: contentPath(item),
      kind: "content" as const,
      ref: item.kind,
      summary: item.summary,
    })),
    ...sources.map((source, index) => ({
      id: `source:${source.slug}`,
      label: `S${index + 1}`,
      title: source.title,
      url: source.url,
      tier: source.tier,
      kind: "source" as const,
      ref: source.slug,
      summary: source.summary,
    })),
    ...topics.map((topic, index) => ({
      id: `topic:${topic.slug}`,
      label: `T${index + 1}`,
      title: topic.name,
      url: topicPath(topic),
      kind: "topic" as const,
      ref: topic.slug,
      summary: topic.description,
    })),
    ...capabilities.map((capability, index) => ({
      id: `capability:${capability.id}`,
      label: `K${index + 1}`,
      title: capability.name,
      url: `/registry/${capability.id}`,
      kind: "capability" as const,
      ref: capability.maturity ?? "ga",
      summary: capability.description,
    })),
    ...diagrams.map((diagram, index) => ({
      id: `diagram:${diagram.slug}`,
      label: `D${index + 1}`,
      title: diagram.caption || diagram.slug,
      url: diagram.path,
      kind: "diagram" as const,
      ref: diagram.kind,
      summary: diagram.topic_slug || null,
    })),
  ].slice(0, 32);

  return {
    claims,
    content,
    topics,
    capabilities,
    sources,
    diagrams,
    uiSources,
    summary: `${claims.length} verified claims, ${content.length} content items, ${sources.length} sources, ${topics.length} topics, ${diagrams.length} diagrams`,
  };
}

export function advisorContextToPrompt(ctx: AdvisorRetrievedContext) {
  const claimBlock = ctx.claims.length
    ? ctx.claims
        .map(
          (claim, index) =>
            `[C${index + 1}] capability=${claim.capability_id ?? "unknown"} depth=L${claim.depth ?? "?"} tier=T${claim.sources?.tier ?? 6}\n${claim.text}\nsource: ${claim.sources?.title ?? "Unknown source"} — ${claim.sources?.url ?? ""}`,
        )
        .join("\n\n")
    : "(no verified matching claims found)";

  const contentBlock = ctx.content.length
    ? ctx.content
        .map(
          (item, index) =>
            `[R${index + 1}] ${item.kind}: ${item.title} — ${contentPath(item)}\n${item.summary ?? ""}`,
        )
        .join("\n\n")
    : "";

  const sourceBlock = ctx.sources.length
    ? ctx.sources
        .map(
          (source, index) =>
            `[S${index + 1}] tier=T${source.tier ?? 6}: ${source.title} — ${source.url ?? ""}\n${source.summary ?? ""}`,
        )
        .join("\n\n")
    : "";

  const topicBlock = ctx.topics.length
    ? ctx.topics
        .map(
          (topic, index) =>
            `[T${index + 1}] ${topic.name} — ${topicPath(topic)}\n${topic.description ?? ""}`,
        )
        .join("\n\n")
    : "";

  const capabilityBlock = ctx.capabilities.length
    ? ctx.capabilities
        .map(
          (capability, index) =>
            `[K${index + 1}] ${capability.name} (${capability.maturity ?? "ga"}) — /registry/${capability.id}\n${capability.description ?? ""}`,
        )
        .join("\n\n")
    : "";

  const diagramBlock = ctx.diagrams.length
    ? ctx.diagrams
        .map(
          (diagram, index) =>
            `[D${index + 1}] ${diagram.caption || diagram.slug} — ${diagram.path}`,
        )
        .join("\n")
    : "";

  return [
    `VERIFIED CLAIMS (cite factual statements as [C#]):\n${claimBlock}`,
    contentBlock &&
      `RELATED BLOGS, ARCHITECTURES, AND LESSONS (link as [R#] when useful):\n${contentBlock}`,
    sourceBlock && `SOURCE LIBRARY (trust/background, prefer lower tier numbers):\n${sourceBlock}`,
    topicBlock && `TOPICS:\n${topicBlock}`,
    capabilityBlock && `CAPABILITIES:\n${capabilityBlock}`,
    diagramBlock && `DIAGRAMS:\n${diagramBlock}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}
