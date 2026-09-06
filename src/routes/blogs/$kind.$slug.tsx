import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions, useQueryClient } from "@tanstack/react-query";
import { getContentItem, getContentSiblings, listTopics } from "@/lib/atlas.functions";
import { currentStamp } from "@/lib/content-version";
import { SiteHeader } from "@/components/SiteHeader";
import { ReaderShell } from "@/components/readers/ReaderShell";

const KINDS = new Set(["article", "design", "lesson"]);

type BlogDetailSearch = { from?: string; fromSlug?: string; q?: string; path?: string };

// Article bodies barely change during a session — cache for 30 min so returning
// to a previously-read article (or Prev/Next navigation) hydrates instantly
// from memory instead of re-fetching.
const contentItemQO = (kind: string, slug: string, stamp: string) =>
  queryOptions({
    queryKey: ["content-item", kind, slug, stamp],
    queryFn: () =>
      getContentItem({ data: { kind: kind as "article" | "design" | "lesson", slug } }),
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
  });

const siblingsQO = (kind: string, slug: string, stamp: string, pathSlug?: string) =>
  queryOptions({
    queryKey: ["content-siblings", kind, slug, stamp, pathSlug ?? null],
    queryFn: () =>
      getContentSiblings({
        data: { kind: kind as "article" | "design" | "lesson", slug, pathSlug },
      }),
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
  });

const topicsQO = queryOptions({
  queryKey: ["topics"],
  queryFn: () => listTopics(),
  staleTime: 30 * 60 * 1000,
});

export const Route = createFileRoute("/blogs/$kind/$slug")({
  validateSearch: (search: Record<string, unknown>): BlogDetailSearch => ({
    from: typeof search.from === "string" ? search.from : undefined,
    fromSlug: typeof search.fromSlug === "string" ? search.fromSlug : undefined,
    q: typeof search.q === "string" ? search.q.slice(0, 500) : undefined,
    path: typeof search.path === "string" ? search.path : undefined,
  }),
  head: ({ loaderData }: { loaderData?: Awaited<ReturnType<typeof getContentItem>> }) => ({
    meta: [
      { title: loaderData ? `${loaderData.item.title} — Fabric Codex` : "Content — Fabric Codex" },
      { name: "description", content: loaderData?.item.summary ?? "" },
      { property: "og:title", content: loaderData?.item.title ?? "Fabric Codex" },
      { property: "og:description", content: loaderData?.item.summary ?? "" },
    ],
  }),
  loader: async ({ context, params }) => {
    if (!KINDS.has(params.kind)) throw notFound();
    // Siblings only power the prev/next nav at the bottom of the article — no reason to block
    // first paint on them. Fire-and-forget prefetch; useSuspenseQuery below will pick it up
    // from cache (or wait, if the user scrolls that far before it resolves). Prefetched without
    // ?path here (the loader doesn't see search params) — the component's useSuspenseQuery below
    // still resolves the ?path-scoped query correctly, just without a warm cache hit on it.
    const stamp = currentStamp(context.queryClient);
    context.queryClient.prefetchQuery(siblingsQO(params.kind, params.slug, stamp));
    try {
      const [item] = await Promise.all([
        context.queryClient.ensureQueryData(contentItemQO(params.kind, params.slug, stamp)),
        context.queryClient.ensureQueryData(topicsQO),
      ]);
      return item;
    } catch {
      throw notFound();
    }
  },
  errorComponent: ({ error, reset }) => (
    <div className="min-h-screen bg-background p-10 text-foreground">
      <SiteHeader />
      <p className="mt-6 text-rose-600 dark:text-rose-300">{error.message}</p>
      <button className="mt-3 underline" onClick={reset}>
        Retry
      </button>
    </div>
  ),
  notFoundComponent: () => (
    <div className="min-h-screen bg-background p-10 text-foreground">
      <SiteHeader />
      <p className="mt-6">Content not found.</p>
      <Link to="/knowledge" search={{ kind: "article" }} className="mt-3 inline-block underline">
        Back to blogs
      </Link>
    </div>
  ),
  component: ContentItemPage,
});

function ContentItemPage() {
  const { kind, slug } = Route.useParams();
  const { from, fromSlug, q, path } = Route.useSearch();
  const queryClient = useQueryClient();
  const stamp = currentStamp(queryClient);
  const { data } = useSuspenseQuery(contentItemQO(kind, slug, stamp));
  const { data: topics } = useSuspenseQuery(topicsQO);
  const { data: siblings } = useSuspenseQuery(siblingsQO(kind, slug, stamp, path));
  const originTopicName = topics.find((t: any) => t.slug === fromSlug)?.name;
  const { item, citations } = data;
  const capabilities = (data as any).capabilities ?? [];
  const diagramMeta = (data as any).diagrams ?? [];

  return (
    <ReaderShell
      kind={kind as "article" | "design" | "lesson"}
      slug={slug}
      from={from}
      fromSlug={fromSlug}
      q={q}
      item={item}
      citations={citations}
      capabilities={capabilities}
      diagramMeta={diagramMeta}
      siblings={siblings}
      originTopicName={originTopicName}
    />
  );
}
