// Publish-from-files: persist a single agent-authored content/*.json payload into Supabase.
//
// Laptop agents (knowledge-curator, blog-author, solution-architect) run all LLM work locally
// on the user's subscription and write content/*.json + content/diagrams/* to git — keyless. They
// cannot write to Supabase (the service-role key is sealed in Lovable Cloud). So an admin pastes
// the authored JSON into Settings, and these server-side helpers (running with supabaseAdmin)
// replay one payload into the KB. This mirrors scripts/import_content.py, but per-file and online.
//
// Versioning note: the canonical version-aware path is still the Python backend. These helpers do a
// non-destructive replay (upsert by slug; refresh that entity's own children) and deliberately
// PRESERVE curated status — re-publishing a source keeps its verified claims and only refreshes the
// pending ones, so a re-publish never silently un-verifies human review.

import {
  presentationProfileSchema,
  lessonMetaSchema,
  type PresentationProfile,
  type LessonMeta,
} from "./content-presentation";

type SupabaseAdmin = any;

// The capability registry is the spine. Claims tagged to an id outside this set are dropped
// (mirrors import_content.lint + seed's capIds filter). Keep in sync with the curator's roster.
const CAPABILITY_IDS = new Set<string>([
  "fabric-platform",
  "onelake",
  "lakehouse",
  "warehouse",
  "polaris",
  "direct-lake",
  "semantic-model",
  "power-bi",
  "data-factory",
  "dataflow-gen2",
  "spark",
  "rti",
  "eventhouse-kql",
  "sql-database",
  "mirroring",
  "fabric-data-agent",
  "fabric-iq",
  "graphql-api",
  "purview",
  "capacity",
]);

const VALID_CLAIM_TYPES = new Set(["fact", "pattern", "antipattern", "internal"]);

function slugFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const tail = (u.pathname.split("/").filter(Boolean).pop() || u.hostname)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    return tail || u.hostname.replace(/[^a-z0-9]+/g, "-");
  } catch {
    return url
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }
}

type SourcePayload = {
  slug?: string;
  url: string;
  title: string;
  tier?: number;
  tags?: string[];
  summary?: string;
  audience?: string;
  why_it_matters?: string;
  takeaways?: string[];
  claims?: Array<{
    capability_id?: string;
    capabilityId?: string;
    text: string;
    depth?: number;
    type?: string;
    tags?: string[];
  }>;
};

// Ensure capability rows exist before claims reference them (FK safety), without renaming
// existing ones (id-only upsert keeps human-edited names/accents/maturity).
async function ensureCapabilities(sb: SupabaseAdmin, ids: string[]) {
  const rows = [...new Set(ids)]
    .filter((id) => CAPABILITY_IDS.has(id))
    .map((id) => ({ id, name: id }));
  if (!rows.length) return;
  const { data: existing } = await sb
    .from("capabilities")
    .select("id")
    .in(
      "id",
      rows.map((r) => r.id),
    );
  const have = new Set((existing ?? []).map((r: any) => r.id));
  const missing = rows.filter((r) => !have.has(r.id));
  if (missing.length) await sb.from("capabilities").insert(missing);
}

export async function publishSource(sb: SupabaseAdmin, payload: SourcePayload) {
  if (!payload.url?.trim()) throw new Error("Source url is required.");
  if (!payload.title?.trim()) throw new Error("Source title is required.");
  const slug = (payload.slug ?? slugFromUrl(payload.url)).trim();
  if (!slug) throw new Error("Could not derive a source slug.");

  const claims = payload.claims ?? [];
  const dropped: string[] = [];
  const validClaims = claims.filter((c) => {
    const cid = c.capability_id ?? c.capabilityId;
    if (!cid || !CAPABILITY_IDS.has(cid)) {
      dropped.push(`unknown capability "${cid}"`);
      return false;
    }
    if (!c.text?.trim()) {
      dropped.push("empty text");
      return false;
    }
    return true;
  });

  await ensureCapabilities(
    sb,
    validClaims.map((c) => (c.capability_id ?? c.capabilityId) as string),
  );

  // Upsert the source by slug (its family identity).
  const { data: src, error: srcError } = await sb
    .from("sources")
    .upsert(
      {
        slug,
        url: payload.url.trim(),
        title: payload.title.trim(),
        tier: payload.tier ?? 6,
        tags: payload.tags ?? [],
        summary: payload.summary ?? "",
        audience: payload.audience ?? "",
        why_it_matters: payload.why_it_matters ?? "",
        takeaways: payload.takeaways ?? [],
        document: payload as any,
      },
      { onConflict: "slug" },
    )
    .select("id")
    .single();
  if (srcError || !src) throw new Error(`source ${slug}: ${srcError?.message ?? "upsert failed"}`);

  // Non-destructive claim refresh: delete only this source's PENDING claims, then re-insert
  // from the payload. Verified/rejected/superseded claims (the human curation) are preserved.
  const { data: deleted } = await sb
    .from("claims")
    .delete({ count: "exact" })
    .eq("source_id", src.id)
    .eq("status", "pending");
  const removed = (deleted as any)?.length ?? 0;

  const claimRows = validClaims.map((c) => ({
    source_id: src.id,
    capability_id: (c.capability_id ?? c.capabilityId) as string,
    text: c.text.trim(),
    depth: c.depth ?? 2,
    type: c.type && VALID_CLAIM_TYPES.has(c.type) ? c.type : "fact",
    tags: c.tags ?? [],
    status: "pending",
    active: true,
  }));
  if (claimRows.length) {
    const { error: claimError } = await sb.from("claims").insert(claimRows);
    if (claimError) throw new Error(`claims for ${slug}: ${claimError.message}`);
  }

  return {
    sourceId: src.id,
    slug,
    claimsInserted: claimRows.length,
    pendingClaimsReplaced: removed,
    droppedClaims: dropped,
  };
}

// Resolve cited_source_keys (portable source slugs) → source ids. Reports any that aren't
// approved sources so the admin re-ingests them rather than publishing a broken citation legend.
async function resolveCitedSources(sb: SupabaseAdmin, keys: string[]) {
  if (!keys.length) return { ids: [] as string[], missing: [] as string[] };
  const { data, error } = await sb
    .from("sources")
    .select("id,slug")
    .in("slug", keys)
    .eq("active", true);
  if (error) throw new Error(error.message);
  const bySlug = new Map<string, string>((data ?? []).map((s: any) => [s.slug, s.id]));
  const ids: string[] = [];
  const missing: string[] = [];
  for (const k of keys) {
    const id = bySlug.get(k);
    if (id) ids.push(id);
    else missing.push(k);
  }
  return { ids, missing };
}

type ContentItemKind = "article" | "design" | "lesson";

type ContentItemPayload = {
  kind: ContentItemKind;
  slug?: string;
  topic_slug?: string | null;
  capability_id?: string | null;
  interaction_version?: string;
  static_hash?: string;
  qa_status?: "draft" | "passed" | "failed";
  accessible_summary?: string;
  supported_layers?: string[];
  title: string;
  summary?: string;
  body_md: string;
  cited_source_keys?: string[];
  tags?: string[];
  depth_levels?: number[];
  status?: string;
  scenario?: string;
  constraints?: Record<string, unknown>;
  presentation_profile?: PresentationProfile;
  lesson_meta?: LessonMeta;
};

// Publish a single article/design/lesson. This is the fix for the versioning bug that used to
// live in publishBlog()/publishDesign(): those did a bare upsert({onConflict:"slug"}), which
// silently overwrote the active row in place with no version increment and no supersedes_id
// chain. This function ALWAYS versions — it finds the current active (kind, slug) row, archives
// it (slug renamed to {slug}@v{version}, active=false, status="superseded"), then inserts a new
// row with version+1 and supersedes_id pointing back. Never a bare upsert.
export async function publishContentItem(sb: SupabaseAdmin, payload: ContentItemPayload) {
  const kindLabel = payload.kind;
  if (!payload.title?.trim() || !payload.body_md?.trim()) {
    throw new Error(`${kindLabel} title and body are required.`);
  }
  const keys = payload.cited_source_keys ?? [];
  if (!keys.length) {
    throw new Error(`${kindLabel} has no cited_source_keys — refusing to publish.`);
  }
  const slug = (payload.slug ?? "").trim();
  if (!slug) throw new Error(`${kindLabel} slug is required.`);

  // Publish must hard-fail on a malformed presentation_profile/lesson_meta rather than silently
  // drop or coerce it — same "refuse rather than degrade" posture as the citation checks above.
  const presentationProfile = payload.presentation_profile
    ? presentationProfileSchema.parse(payload.presentation_profile)
    : null;
  const lessonMeta = payload.lesson_meta ? lessonMetaSchema.parse(payload.lesson_meta) : null;

  const { ids, missing } = await resolveCitedSources(sb, keys);
  if (missing.length) {
    throw new Error(`Cited source key(s) not approved on the server: ${missing.join(", ")}`);
  }

  const { data: prior } = await sb
    .from("content_items")
    .select("*")
    .eq("kind", payload.kind)
    .eq("slug", slug)
    .eq("active", true)
    .maybeSingle();

  if (prior?.id) {
    const archivedSlug = `${slug}@v${prior.version ?? 1}`;
    const { error: archiveError } = await sb
      .from("content_items")
      .update({ active: false, status: "superseded", slug: archivedSlug })
      .eq("id", prior.id);
    if (archiveError) throw new Error(archiveError.message);
  }

  const { data: created, error } = await sb
    .from("content_items")
    .insert({
      kind: payload.kind,
      slug,
      topic_slug: payload.topic_slug ?? prior?.topic_slug ?? null,
      capability_id: payload.capability_id ?? prior?.capability_id ?? null,
      title: payload.title.trim(),
      summary: payload.summary ?? "",
      body_md: payload.body_md,
      // Default to "published": there is no separate review/promotion UI anywhere in the app —
      // Settings → Publish is, in practice, the act of going live.
      status: payload.status ?? "published",
      tags: payload.tags ?? [],
      depth_levels: payload.depth_levels ?? [],
      scenario: payload.scenario ?? "",
      constraints: payload.constraints ?? {},
      presentation_profile: presentationProfile,
      lesson_meta: lessonMeta,
      version: prior ? (prior.version ?? 1) + 1 : 1,
      supersedes_id: prior?.id ?? null,
      active: true,
      ready_to_share: false,
      validation_confidence: null,
      document: payload as any,
    })
    .select("id,version")
    .single();
  if (error || !created) {
    throw new Error(`${kindLabel} ${slug}: ${error?.message ?? "insert failed"}`);
  }

  const rows = ids.map((sid, i) => ({
    content_item_id: created.id,
    source_id: sid,
    label: `S${i + 1}`,
    position: i,
  }));
  if (rows.length) {
    const { error: citeError } = await sb.from("content_item_sources").insert(rows);
    if (citeError) {
      throw new Error(`${kindLabel} citations for ${slug}: ${citeError.message}`);
    }
  }

  return {
    contentItemId: created.id,
    kind: payload.kind,
    slug,
    version: created.version ?? 1,
    citedSources: rows.length,
  };
}

type DiagramPayload = {
  // Accept either a single diagram object or the assets.json manifest array.
  slug?: string;
  path?: string;
  caption?: string;
  kind?: string;
  topic_slug?: string | null;
  capability_id?: string | null;
  interaction_version?: string;
  static_hash?: string;
  qa_status?: "draft" | "passed" | "failed";
  accessible_summary?: string;
  supported_layers?: string[];
};

async function resolveTopicSlug(sb: SupabaseAdmin, entry: DiagramPayload): Promise<string | null> {
  if (entry.topic_slug) return entry.topic_slug;
  if (!entry.capability_id) return null;
  const { data } = await sb
    .from("topic_capabilities")
    .select("topic_slug")
    .eq("capability_id", entry.capability_id)
    .order("topic_slug")
    .limit(1)
    .maybeSingle();
  return data?.topic_slug ?? null;
}

async function diagramRow(sb: SupabaseAdmin, entry: DiagramPayload) {
  const rawPath = entry.path ?? "";
  const slug =
    entry.slug ??
    rawPath
      .split("/")
      .pop()!
      .replace(/\.(svg|mmd)$/i, "");
  if (!slug) throw new Error("Diagram entry needs a slug or a path.");
  const path = /^https?:\/\//i.test(rawPath) ? rawPath : `/diagrams/${slug}.svg`;
  return {
    slug,
    path,
    caption: entry.caption ?? "",
    kind: entry.kind && entry.kind !== "generated" ? entry.kind : "architecture",
    topic_slug: await resolveTopicSlug(sb, entry),
    capability_id: entry.capability_id ?? null,
    interaction_version: entry.interaction_version ?? "1",
    static_hash: entry.static_hash ?? "",
    qa_status: entry.qa_status ?? "draft",
    accessible_summary: entry.accessible_summary ?? entry.caption ?? "",
    supported_layers: entry.supported_layers ?? [],
  };
}

// Register one diagram (or a manifest array) into the `diagrams` table by upsert on slug — the
// non-destructive equivalent of the seed bootstrap's delete-all-then-reinsert, so it never wipes
// the other 17 registered diagrams. This is what makes the blog's embedded-diagram validation pass:
// validateContent looks up each embedded /diagrams/<slug> against this table.
export async function publishDiagram(
  sb: SupabaseAdmin,
  payload: DiagramPayload | DiagramPayload[],
) {
  const entries = Array.isArray(payload) ? payload : [payload];
  const generated = entries.filter(
    (e) => (e.kind ?? "generated") === "generated" || e.path || e.slug,
  );
  const rows = [];
  for (const entry of generated) rows.push(await diagramRow(sb, entry));
  if (!rows.length) throw new Error("No diagram entries to register.");
  const { error } = await sb.from("diagrams").upsert(rows, { onConflict: "slug" });
  if (error) throw new Error(`diagrams: ${error.message}`);
  return { registered: rows.length, slugs: rows.map((r) => r.slug) };
}

// Dispatch a pasted payload by kind. The agent files don't always carry an explicit "kind",
// so callers pass it from the chosen UI tab. "blog" is accepted as a legacy alias for "article"
// for one release, since existing agent-authored content/blogs/*.json and human muscle memory
// both still say "blog" — the underlying content_items.kind column value is always "article".
export async function publishFromFile(
  sb: SupabaseAdmin,
  kind: "source" | "blog" | "article" | "design" | "lesson" | "diagram",
  payload: any,
) {
  if (kind === "source") return { kind, ...(await publishSource(sb, payload)) };
  if (kind === "diagram") return { kind, ...(await publishDiagram(sb, payload)) };
  if (kind === "blog" || kind === "article") {
    return publishContentItem(sb, { ...payload, kind: "article" });
  }
  if (kind === "design" || kind === "lesson") {
    return publishContentItem(sb, { ...payload, kind });
  }
  throw new Error(`Unknown publish kind: ${kind}`);
}
