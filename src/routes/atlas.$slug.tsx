import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { getAssetBySlug } from "@/lib/atlas.functions";
import { SiteHeader } from "@/components/SiteHeader";
import { accent } from "@/lib/fabric-theme";
import { ArrowLeft } from "lucide-react";

const assetQO = (slug: string) =>
  queryOptions({ queryKey: ["asset", slug], queryFn: () => getAssetBySlug({ data: { slug } }) });

export const Route = createFileRoute("/atlas/$slug")({
  head: ({ loaderData }) => ({
    meta: [
      { title: loaderData ? `${loaderData.title} — Fabric Atlas` : "Asset — Fabric Atlas" },
      { name: "description", content: loaderData?.summary ?? "Microsoft Fabric pattern." },
      { property: "og:title", content: loaderData?.title ?? "Fabric Atlas" },
      { property: "og:description", content: loaderData?.summary ?? "" },
    ],
  }),
  loader: async ({ context, params }) => {
    try {
      const data = await context.queryClient.ensureQueryData(assetQO(params.slug));
      return data;
    } catch {
      throw notFound();
    }
  },
  errorComponent: ({ error, reset }) => (
    <div className="min-h-screen bg-[#070b16] p-10 text-white">
      <p className="text-red-300">Could not load asset. {error.message}</p>
      <button onClick={reset} className="mt-3 underline">Try again</button>
    </div>
  ),
  notFoundComponent: () => (
    <div className="min-h-screen bg-[#070b16] p-10 text-white">
      <p>Asset not found.</p>
      <Link to="/atlas" className="mt-3 inline-block underline">Back to atlas</Link>
    </div>
  ),
  component: AssetPage,
});

function AssetPage() {
  const { slug } = Route.useParams();
  const { data: asset } = useSuspenseQuery(assetQO(slug));
  const a = accent(asset.domains?.accent);

  return (
    <div className="min-h-screen bg-[#070b16] text-white">
      <SiteHeader />
      <article className="mx-auto max-w-3xl px-6 py-12">
        <Link to="/atlas" className="inline-flex items-center gap-1.5 text-xs text-white/55 hover:text-white">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to atlas
        </Link>
        <div className="mt-6 flex items-center gap-2 text-[11px] uppercase tracking-wider text-white/55">
          <span className={`h-1.5 w-1.5 rounded-full ${a.dot}`} />
          {asset.domains?.name} · {asset.asset_type}
          {asset.maturity !== "stable" && (
            <span className="ml-2 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
              {asset.maturity}
            </span>
          )}
        </div>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight">{asset.title}</h1>
        <p className="mt-3 text-lg leading-relaxed text-white/70">{asset.summary}</p>
        <div className="mt-5 flex flex-wrap gap-1.5">
          {asset.tags.map((t) => (
            <span key={t} className={`rounded border px-1.5 py-0.5 text-[10px] font-medium ${a.chip}`}>
              {t}
            </span>
          ))}
        </div>

        <div className="prose prose-invert mt-10 max-w-none text-white/80">
          <p className="leading-relaxed">{asset.body}</p>
        </div>

        <div className="mt-12 rounded-xl border border-white/10 bg-white/[0.02] p-5 text-sm text-white/55">
          Part of the <span className="font-medium text-white/80">{asset.domains?.name}</span> domain — {asset.domains?.tagline}.
        </div>
      </article>
    </div>
  );
}
