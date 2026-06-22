import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { SiteHeader } from "@/components/SiteHeader";
import { DepthBadge, MaturityBadge, TierBadge } from "@/components/Badges";
import {
  getRegistryCoverage,
  listCapabilities,
  listClaimsByCapability,
  type RegistryCoverageRow,
} from "@/lib/atlas.functions";
import { accent } from "@/lib/fabric-theme";

export const Route = createFileRoute("/registry/$id")({
  head: ({ params }) => ({
    meta: [{ title: `${params.id} — Capability Registry — Fabric Atlas` }],
  }),
  component: CapabilityDetailPage,
});

function CapabilityDetailPage() {
  const { id } = Route.useParams();

  const caps = useQuery({ queryKey: ["capabilities-registry"], queryFn: () => listCapabilities() });
  const coverage = useQuery({
    queryKey: ["registry-coverage"],
    queryFn: () => getRegistryCoverage(),
  });
  const claims = useQuery({
    queryKey: ["claims", id],
    queryFn: () => listClaimsByCapability({ data: { capabilityId: id, limit: 500 } }),
  });

  const cap = (caps.data ?? []).find((c: any) => c.id === id);
  const cov = ((coverage.data ?? []) as RegistryCoverageRow[]).find((r) => r.id === id);
  const a = accent(cap?.accent);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main className="mx-auto max-w-4xl px-6 py-10">
        <Link to="/registry" className="text-xs text-muted-foreground hover:text-foreground">
          ← Registry
        </Link>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <span className={`h-3 w-3 rounded-full ${a.dot}`} />
          <h1 className="text-3xl font-semibold tracking-tight">{cap?.name ?? id}</h1>
          <MaturityBadge maturity={cap?.maturity} />
        </div>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{cap?.description || "—"}</p>

        {cov && (
          <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Verified claims" value={cov.verified_count} />
            <Stat label="Total claims" value={cov.claim_count} />
            <Stat label="Blogs" value={cov.blog_count} />
            <Stat label="Diagrams" value={cov.diagram_count} />
          </div>
        )}

        <h2 className="mt-10 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Claims
        </h2>
        {claims.isLoading ? (
          <div className="mt-3 rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            Loading claims…
          </div>
        ) : (claims.data ?? []).length === 0 ? (
          <div className="mt-3 rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No active claims for this capability yet. This is a coverage gap — ingest a source to
            fill it.
          </div>
        ) : (
          <ul className="mt-3 space-y-2">
            {(claims.data ?? []).map((c: any) => (
              <li key={c.id} className="rounded-2xl border border-border bg-card p-4">
                <p className="text-sm leading-relaxed text-foreground">{c.text}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <DepthBadge depth={c.depth} />
                  {c.sources?.tier && <TierBadge tier={c.sources.tier} />}
                  {c.sources?.url ? (
                    <a
                      href={c.sources.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-teal-300 hover:underline"
                    >
                      {c.sources.title}
                    </a>
                  ) : (
                    c.sources?.title && (
                      <span className="text-xs text-muted-foreground">{c.sources.title}</span>
                    )
                  )}
                  {(c.tags ?? []).slice(0, 4).map((t: string) => (
                    <span
                      key={t}
                      className="rounded border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground"
                    >
                      #{t}
                    </span>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-border bg-card px-4 py-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold tracking-tight">{value}</div>
    </div>
  );
}
