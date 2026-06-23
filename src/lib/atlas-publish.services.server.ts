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

type BlogPayload = {
  slug?: string;
  topic_slug?: string | null;
  title: string;
  summary?: string;
  body_md: string;
  cited_source_keys?: string[];
  tags?: string[];
  depth_levels?: number[];
  status?: string;
};

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

export async function publishBlog(sb: SupabaseAdmin, payload: BlogPayload) {
  if (!payload.title?.trim() || !payload.body_md?.trim()) {
    throw new Error("Blog title and body are required.");
  }
  const keys = payload.cited_source_keys ?? [];
  if (!keys.length) throw new Error("Blog has no cited_source_keys — refusing to publish.");
  const slug = (payload.slug ?? "").trim();
  if (!slug) throw new Error("Blog slug is required.");

  const { ids, missing } = await resolveCitedSources(sb, keys);
  if (missing.length) {
    throw new Error(`Cited source key(s) not approved on the server: ${missing.join(", ")}`);
  }

  // Upsert by slug; rebuild the citation legend (label S1, S2… in cited order).
  const { data: blog, error } = await sb
    .from("blogs")
    .upsert(
      {
        slug,
        topic_slug: payload.topic_slug ?? null,
        title: payload.title.trim(),
        summary: payload.summary ?? "",
        body_md: payload.body_md,
        status: payload.status ?? "draft",
        tags: payload.tags ?? [],
        depth_levels: payload.depth_levels ?? [],
        document: payload as any,
      },
      { onConflict: "slug" },
    )
    .select("id")
    .single();
  if (error || !blog) throw new Error(`blog ${slug}: ${error?.message ?? "upsert failed"}`);

  await sb.from("blog_sources").delete().eq("blog_id", blog.id);
  const rows = ids.map((sid, i) => ({
    blog_id: blog.id,
    source_id: sid,
    label: `S${i + 1}`,
    position: i,
  }));
  if (rows.length) {
    const { error: bsError } = await sb.from("blog_sources").insert(rows);
    if (bsError) throw new Error(`blog citations for ${slug}: ${bsError.message}`);
  }

  return { blogId: blog.id, slug, citedSources: rows.length };
}

type DesignPayload = {
  slug?: string;
  title: string;
  summary?: string;
  body_md: string;
  cited_source_keys?: string[];
  tags?: string[];
  status?: string;
};

export async function publishDesign(sb: SupabaseAdmin, payload: DesignPayload) {
  if (!payload.title?.trim() || !payload.body_md?.trim()) {
    throw new Error("Design title and body are required.");
  }
  const keys = payload.cited_source_keys ?? [];
  if (!keys.length) throw new Error("Design has no cited_source_keys — refusing to publish.");
  const slug = (payload.slug ?? "").trim();
  if (!slug) throw new Error("Design slug is required.");

  const { ids, missing } = await resolveCitedSources(sb, keys);
  if (missing.length) {
    throw new Error(`Cited source key(s) not approved on the server: ${missing.join(", ")}`);
  }

  const { data: design, error } = await sb
    .from("designs")
    .upsert(
      {
        slug,
        title: payload.title.trim(),
        summary: payload.summary ?? "",
        body_md: payload.body_md,
        status: payload.status ?? "published",
        document: payload as any,
      },
      { onConflict: "slug" },
    )
    .select("id")
    .single();
  if (error || !design) throw new Error(`design ${slug}: ${error?.message ?? "upsert failed"}`);

  await sb.from("design_sources").delete().eq("design_id", design.id);
  const rows = ids.map((sid, i) => ({
    design_id: design.id,
    source_id: sid,
    label: `S${i + 1}`,
    position: i,
  }));
  if (rows.length) {
    const { error: dsError } = await sb.from("design_sources").insert(rows);
    if (dsError) throw new Error(`design citations for ${slug}: ${dsError.message}`);
  }

  return { designId: design.id, slug, citedSources: rows.length };
}

type DiagramPayload = {
  // Accept either a single diagram object or the assets.json manifest array.
  slug?: string;
  path?: string;
  caption?: string;
  kind?: string;
  topic_slug?: string | null;
  capability_id?: string | null;
};

// Derive the registered slug + served path the way seed.functions / import_content do: the slug is
// the filename without extension, and the served path is /diagrams/<slug>.svg (mirrored to public/).
function diagramRow(entry: DiagramPayload) {
  const rawPath = entry.path ?? "";
  const slug =
    entry.slug ??
    rawPath
      .split("/")
      .pop()!
      .replace(/\.(svg|mmd)$/i, "");
  if (!slug) throw new Error("Diagram entry needs a slug or a path.");
  return {
    slug,
    path: `/diagrams/${slug}.svg`,
    caption: entry.caption ?? "",
    kind: entry.kind && entry.kind !== "generated" ? entry.kind : "architecture",
    topic_slug: entry.topic_slug ?? null,
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
  const rows = generated.map(diagramRow);
  if (!rows.length) throw new Error("No diagram entries to register.");
  const { error } = await sb.from("diagrams").upsert(rows, { onConflict: "slug" });
  if (error) throw new Error(`diagrams: ${error.message}`);
  return { registered: rows.length, slugs: rows.map((r) => r.slug) };
}

// Dispatch a pasted payload by kind. The agent files don't always carry an explicit "kind",
// so callers pass it from the chosen UI tab.
export async function publishFromFile(
  sb: SupabaseAdmin,
  kind: "source" | "blog" | "design" | "diagram",
  payload: any,
) {
  if (kind === "source") return { kind, ...(await publishSource(sb, payload)) };
  if (kind === "blog") return { kind, ...(await publishBlog(sb, payload)) };
  if (kind === "design") return { kind, ...(await publishDesign(sb, payload)) };
  if (kind === "diagram") return { kind, ...(await publishDiagram(sb, payload)) };
  throw new Error(`Unknown publish kind: ${kind}`);
}
