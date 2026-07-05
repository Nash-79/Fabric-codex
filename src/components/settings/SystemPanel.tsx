import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ShieldCheck } from "lucide-react";
import { getRegistryCoverage } from "@/lib/atlas.functions";
import { Empty, Panel, pct } from "@/components/settings/shared";

export function SystemPanel({
  stats,
  loading,
}: {
  stats: Record<string, number>;
  loading: boolean;
}) {
  const coverageFn = useServerFn(getRegistryCoverage);
  const cov = useQuery({ queryKey: ["registry-coverage"], queryFn: () => coverageFn() });
  const rows = (cov.data ?? []) as Array<{
    maturity: string;
    verified_count: number;
    claim_count: number;
  }>;
  const preview = rows.filter((r) => (r.maturity ?? "ga") === "preview").length;
  const ga = rows.filter((r) => (r.maturity ?? "ga") === "ga").length;
  const deprecated = rows.filter((r) => r.maturity === "deprecated").length;
  const verified = rows.reduce((n, r) => n + r.verified_count, 0);
  const totalClaims = rows.reduce((n, r) => n + r.claim_count, 0);
  const pending = Math.max(0, totalClaims - verified);
  const verifiedPct = totalClaims ? Math.round((verified / totalClaims) * 100) : 0;

  return (
    <Panel title="System">
      {loading ? (
        <Empty text="Loading system stats..." />
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            {Object.entries(stats).map(([key, value]) => (
              <div key={key} className="rounded-md border border-border bg-card p-4">
                <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
                  <ShieldCheck className="h-4 w-4" />
                  {key}
                </div>
                <div className="mt-2 text-2xl font-semibold">{value}</div>
              </div>
            ))}
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-md border border-border bg-card p-4">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                Capability maturity
              </div>
              <div className="mt-3 flex h-3 w-full overflow-hidden rounded-full bg-muted">
                <span
                  className="bg-amber-400/70"
                  style={{ width: `${pct(preview, rows.length)}%` }}
                />
                <span className="bg-emerald-400/70" style={{ width: `${pct(ga, rows.length)}%` }} />
                <span
                  className="bg-zinc-500/70"
                  style={{ width: `${pct(deprecated, rows.length)}%` }}
                />
              </div>
              <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
                <span>
                  <span className="text-amber-300">●</span> Preview {preview}
                </span>
                <span>
                  <span className="text-emerald-300">●</span> GA {ga}
                </span>
                <span>
                  <span className="text-zinc-400">●</span> Deprecated {deprecated}
                </span>
              </div>
            </div>
            <div className="rounded-md border border-border bg-card p-4">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                Claim verification
              </div>
              <div className="mt-3 flex h-3 w-full overflow-hidden rounded-full bg-muted">
                <span className="bg-emerald-400/70" style={{ width: `${verifiedPct}%` }} />
              </div>
              <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
                <span className="text-foreground font-medium">{verifiedPct}% verified</span>
                <span>{verified} verified</span>
                <span>{pending} pending</span>
              </div>
            </div>
          </div>
          <div className="rounded-md border border-border bg-card p-4 text-sm text-muted-foreground">
            <div className="font-medium text-foreground">Content source of truth</div>
            <p className="mt-1">
              Settings writes operational metadata and versioned CMS changes to the backend. Export
              DB-edited content back to <code>content/</code> before treating it as
              source-controlled truth.
            </p>
            <code className="mt-3 block rounded-sm bg-black/30 p-2 text-xs text-teal-100">
              python scripts/import_content.py --dry-run
            </code>
          </div>
        </div>
      )}
    </Panel>
  );
}
