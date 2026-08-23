// The prev/next resolution behind getContentSiblings (atlas.functions.ts), split out so it's
// unit-testable against a Supabase stub the same way atlas-publish.services.server.ts is — takes
// `sb` as a parameter rather than calling admin() itself.
//
// This is the fix for D1 (docs/plan/phase-1-curriculum.md WP1.1): getContentSiblings used to
// order every kind by `updated_at DESC`, so Prev/Next was recency order and editing an old
// article silently reordered "next" for every reader. When the item sits in a learning path,
// order now follows path_items.position instead, which is stable across edits.

export type Sibling = { slug: string; title: string } | null;
export type SiblingsResult = {
  pathSlug: string | null;
  pathTitle: string | null;
  prev: Sibling;
  next: Sibling;
};

// Minimal shape of the Supabase client this module needs — matches the stub pattern in
// atlas-publish.services.test.ts (chainable query builder methods, awaitable for the result).
export type SupabaseLike = {
  from: (table: string) => any;
};

/**
 * Resolves which learning path governs this (kind, slug)'s reading order. Explicit pathSlug wins
 * (the reader can be mid-walkthrough of a specific path via the ?path search param, the same
 * pattern ?from/?fromSlug already use for topic-origin breadcrumbs). Without one, auto-detect: if
 * the item sits in exactly one active path, use it; zero or 2+ candidate paths is ambiguous, so
 * callers fall through to recency ordering rather than guess.
 */
export async function resolveGoverningPath(
  sb: SupabaseLike,
  kind: string,
  slug: string,
  requestedPathSlug: string | undefined,
): Promise<string | null> {
  if (requestedPathSlug) return requestedPathSlug;
  const { data: memberships } = await sb
    .from("path_items")
    .select("path_slug")
    .eq("content_kind", kind)
    .eq("content_slug", slug);
  const distinctPaths = [...new Set((memberships ?? []).map((m: any) => m.path_slug))] as string[];
  return distinctPaths.length === 1 ? distinctPaths[0] : null;
}

async function resolveFromPath(
  sb: SupabaseLike,
  pathSlug: string,
  kind: string,
  slug: string,
): Promise<SiblingsResult | null> {
  const [{ data: items, error }, { data: pathRow }] = await Promise.all([
    sb
      .from("path_items")
      .select("content_kind,content_slug,position")
      .eq("path_slug", pathSlug)
      .order("position", { ascending: true }),
    sb.from("learning_paths").select("title").eq("slug", pathSlug).maybeSingle(),
  ]);
  if (error) throw new Error(error.message);
  const list = (items ?? []) as { content_kind: string; content_slug: string; position: number }[];
  const idx = list.findIndex((r) => r.content_kind === kind && r.content_slug === slug);
  // Item claimed to be in this path but wasn't found (stale ?path param, e.g.) — caller falls
  // through to recency ordering rather than getting an empty result.
  if (idx === -1) return null;

  const slugsToLoad = [list[idx - 1]?.content_slug, list[idx + 1]?.content_slug].filter(
    Boolean,
  ) as string[];
  const titleBySlug = new Map<string, string>();
  if (slugsToLoad.length) {
    const { data: titleRows } = await sb
      .from("content_items")
      .select("slug,title")
      .in("slug", slugsToLoad)
      .eq("active", true)
      .eq("status", "published");
    for (const row of (titleRows ?? []) as { slug: string; title: string }[]) {
      titleBySlug.set(row.slug, row.title);
    }
  }

  return {
    pathSlug,
    pathTitle: (pathRow as { title: string } | null)?.title ?? null,
    prev:
      idx > 0
        ? {
            slug: list[idx - 1].content_slug,
            title: titleBySlug.get(list[idx - 1].content_slug) ?? list[idx - 1].content_slug,
          }
        : null,
    next:
      idx < list.length - 1
        ? {
            slug: list[idx + 1].content_slug,
            title: titleBySlug.get(list[idx + 1].content_slug) ?? list[idx + 1].content_slug,
          }
        : null,
  };
}

async function resolveFromRecency(
  sb: SupabaseLike,
  kind: string,
  slug: string,
): Promise<SiblingsResult> {
  const { data: rows, error } = await sb
    .from("content_items")
    .select("kind,slug,title")
    .eq("kind", kind)
    .eq("status", "published")
    .eq("active", true)
    .order("updated_at", { ascending: false })
    .order("slug", { ascending: true });
  if (error) throw new Error(error.message);
  const list = (rows ?? []) as { slug: string; title: string }[];
  const idx = list.findIndex((r) => r.slug === slug);
  if (idx === -1) return { pathSlug: null, pathTitle: null, prev: null, next: null };
  return {
    pathSlug: null,
    pathTitle: null,
    prev: idx > 0 ? { slug: list[idx - 1].slug, title: list[idx - 1].title } : null,
    next: idx < list.length - 1 ? { slug: list[idx + 1].slug, title: list[idx + 1].title } : null,
  };
}

export async function resolveContentSiblings(
  sb: SupabaseLike,
  kind: "article" | "design" | "lesson",
  slug: string,
  requestedPathSlug: string | undefined,
): Promise<SiblingsResult> {
  const pathSlug = await resolveGoverningPath(sb, kind, slug, requestedPathSlug);
  if (pathSlug) {
    const fromPath = await resolveFromPath(sb, pathSlug, kind, slug);
    if (fromPath) return fromPath;
  }
  return resolveFromRecency(sb, kind, slug);
}
