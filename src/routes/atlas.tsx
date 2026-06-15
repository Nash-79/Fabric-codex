import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { useMemo } from "react";
import { listCapabilities, listClaimsByCapability } from "@/lib/atlas.functions";
import { SiteHeader } from "@/components/SiteHeader";
import { accent } from "@/lib/fabric-theme";
import { DepthBadge, TierBadge } from "@/components/Badges";

const capsQO = queryOptions({ queryKey: ["capabilities"], queryFn: () => listCapabilities() });
const claimsQO = (capabilityId?: string) =>
  queryOptions({
    queryKey: ["claims", capabilityId ?? "all"],
    queryFn: () => listClaimsByCapability({ data: { capabilityId } }),
  });

const SearchSchema = z.object({ capability: z.string().optional() });

export const Route = createFileRoute("/atlas")({
  validateSearch: SearchSchema,
  head: () => ({
    meta: [
      { title: "Atlas — Fabric Atlas" },
      { name: "description", content: "The capability registry: cited claims tagged to Microsoft Fabric capabilities and depth levels." },
    ],
  }),
  loaderDeps: ({ search }) => ({ capability: search.capability }),
  loader: async ({ context, deps }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(capsQO),
      context.queryClient.ensureQueryData(claimsQO(deps.capability)),
    ]);
  },
  errorComponent: ({ error, reset }) => (
    <div className="min-h-screen bg-[#070b16] p-10 text-white">
      <SiteHeader />
      <p className="mt-6 text-rose-300">{error.message}</p>
      <button className="mt-3 underline" onClick={reset}>Retry</button>
    </div>
  ),
  notFoundComponent: () => <div className="p-10 text-white">Not found.</div>,
  component: AtlasPage,
});

function AtlasPage() {
  const { capability } = Route.useSearch();
  const nav = Route.useNavigate();
  const { data: caps } = useSuspenseQuery(capsQO);
  const { data: claims } = useSuspenseQuery(claimsQO(capability));

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of claims) m.set(c.capability_id, (m.get(c.capability_id) ?? 0) + 1);
    return m;
  }, [claims]);

  return (
    <div className="min-h-screen bg-[#070b16] text-white">
      <SiteHeader />
      <div className="mx-auto max-w-7xl px-6 py-10">
        <div className="text-xs font-medium uppercase tracking-[0.18em] text-teal-300/80">Capability spine</div>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight md:text-4xl">The Atlas</h1>
        <p className="mt-2 max-w-2xl text-sm text-white/55">
          Every claim ties back to an approved source. Filter by capability and read across depth levels L1 → L5.
        </p>

        <div className="mt-6 flex flex-wrap gap-2">
          <Chip
            active={!capability}
            label={`All (${claims.length})`}
            onClick={() => nav({ search: () => ({ capability: undefined }) })}
          />
          {caps.map((c) => {
            const a = accent(c.accent);
            return (
              <Chip
                key={c.id}
                active={capability === c.id}
                onClick={() => nav({ search: () => ({ capability: c.id }) })}
                label={
                  <span className="inline-flex items-center gap-1.5">
                    <span className={`h-1.5 w-1.5 rounded-full ${a.dot}`} /> {c.name}
                    {capability !== c.id && counts.get(c.id) ? (
                      <span className="text-white/40">{counts.get(c.id)}</span>
                    ) : null}
                  </span>
                }
              />
            );
          })}
        </div>

        <ul className="mt-8 grid gap-3 md:grid-cols-2">
          {claims.map((claim: any) => (
            <li key={claim.id} className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
              <div className="flex items-center gap-2">
                <DepthBadge depth={claim.depth} />
                {claim.sources?.tier && <TierBadge tier={claim.sources.tier} />}
                <span className="ml-auto text-[10px] uppercase tracking-wider text-white/40">{claim.type}</span>
              </div>
              <p className="mt-2.5 text-sm leading-relaxed text-white/80">{claim.text}</p>
              {claim.sources && (
                <a
                  href={claim.sources.url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 block truncate text-xs text-teal-300 hover:underline"
                >
                  {claim.sources.title}
                </a>
              )}
              {claim.tags?.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {claim.tags.slice(0, 6).map((t: string) => (
                    <span key={t} className="rounded border border-white/10 bg-white/[0.03] px-1.5 py-0.5 text-[10px] text-white/55">{t}</span>
                  ))}
                </div>
              )}
            </li>
          ))}
          {claims.length === 0 && (
            <div className="col-span-full rounded-xl border border-dashed border-white/15 p-12 text-center text-white/55">
              No claims yet. An admin can seed the content from{" "}
              <Link to="/admin" className="text-teal-300 underline-offset-4 hover:underline">/admin</Link>.
            </div>
          )}
        </ul>
      </div>
    </div>
  );
}

function Chip({ active, onClick, label }: { active: boolean; onClick: () => void; label: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
        active ? "border-white/30 bg-white/10 text-white" : "border-white/10 bg-white/[0.02] text-white/65 hover:bg-white/[0.05]"
      }`}
    >
      {label}
    </button>
  );
}
