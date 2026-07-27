import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { getContentItem, getContentSiblings, listTopics } from "@/lib/atlas.functions";
import { SiteHeader } from "@/components/SiteHeader";
import { ReaderShell } from "@/components/readers/ReaderShell";

const KINDS = new Set(["article", "design", "lesson"]);

type BlogDetailSearch = { from?: string; fromSlug?: string; q?: string };

const contentItemQO = (kind: string, slug: string) =>
  queryOptions({
    queryKey: ["content-item", kind, slug],
    queryFn: () =>
      getContentItem({ data: { kind: kind as "article" | "design" | "lesson", slug } }),
  });

const siblingsQO = (kind: string, slug: string) =>
  queryOptions({
    queryKey: ["content-siblings", kind, slug],
    queryFn: () =>
      getContentSiblings({ data: { kind: kind as "article" | "design" | "lesson", slug } }),
  });

const topicsQO = queryOptions({ queryKey: ["topics"], queryFn: () => listTopics() });

export const Route = createFileRoute("/blogs/$kind/$slug")({
  validateSearch: (search: Record<string, unknown>): BlogDetailSearch => ({
    from: typeof search.from === "string" ? search.from : undefined,
    fromSlug: typeof search.fromSlug === "string" ? search.fromSlug : undefined,
    q: typeof search.q === "string" ? search.q.slice(0, 500) : undefined,
  }),
  head: ({ loaderData }: { loaderData?: Awaited<ReturnType<typeof getContentItem>> }) => ({
    meta: [
      { title: loaderData ? `${loaderData.item.title} — Fabric Atlas` : "Content — Fabric Atlas" },
      { name: "description", content: loaderData?.item.summary ?? "" },
      { property: "og:title", content: loaderData?.item.title ?? "Fabric Atlas" },
      { property: "og:description", content: loaderData?.item.summary ?? "" },
    ],
  }),
  loader: async ({ context, params }) => {
    if (!KINDS.has(params.kind)) throw notFound();
    try {
      const [item] = await Promise.all([
        context.queryClient.ensureQueryData(contentItemQO(params.kind, params.slug)),
        context.queryClient.ensureQueryData(topicsQO),
        context.queryClient.ensureQueryData(siblingsQO(params.kind, params.slug)),
      ]);
      return item;
    } catch {
      throw notFound();
    }
  },
  errorComponent: ({ error, reset }) => (
    <div className="min-h-screen bg-background p-10 text-foreground">
      <SiteHeader />
      <p className="mt-6 text-rose-300">{error.message}</p>
      <button className="mt-3 underline" onClick={reset}>
        Retry
      </button>
    </div>
  ),
  notFoundComponent: () => (
    <div className="min-h-screen bg-background p-10 text-foreground">
      <SiteHeader />
      <p className="mt-6">Content not found.</p>
      <Link to="/blogs" className="mt-3 inline-block underline">
        Back to blogs
      </Link>
    </div>
  ),
  component: ContentItemPage,
});

function ContentItemPage() {
  const { kind, slug } = Route.useParams();
  const { from, fromSlug, q } = Route.useSearch();
  const { data } = useSuspenseQuery(contentItemQO(kind, slug));
  const { data: topics } = useSuspenseQuery(topicsQO);
  const { data: siblings } = useSuspenseQuery(siblingsQO(kind, slug));
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
