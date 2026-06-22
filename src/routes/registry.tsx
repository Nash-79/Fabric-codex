import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { MaturityBadge } from "@/components/Badges";
import { getRegistryCoverage, type RegistryCoverageRow } from "@/lib/atlas.functions";
import { accent, depthMeta } from "@/lib/fabric-theme";

export const Route = createFileRoute("/registry")({
  head: () => ({
    meta: [
      { title: "Capability Registry — Fabric Atlas" },
      {
        name: "description",
        content:
          "The capability registry is the spine of the Fabric Atlas. Browse every tracked Microsoft Fabric capability, its preview/GA maturity, and its live claim, depth, and diagram coverage.",
      },
      { property: "og:title", content: "Capability Registry — Fabric Atlas" },
      {
        property: "og:description",
        content: "Every tracked Microsoft Fabric capability and its live coverage.",
      },
    ],
  }),
  component: RegistryPage,
});

type MaturityFilter = "all" | "preview" | "ga" | "deprecated";

function RegistryPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["registry-coverage"],
    queryFn: () => getRegistryCoverage(),
  });
  const [maturity, setMaturity] = useState<MaturityFilter>("all");
  const [gapsOnly, setGapsOnly] = useState(false);
  const [q, setQ] = useState("");

  const rows = (data ?? []) as RegistryCoverageRow[];

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (maturity !== "all" && (r.maturity ?? "ga") !== maturity) return false;
      if (gapsOnly && !isGap(r)) return false;
      if (term && !`${r.name} ${r.description ?? ""} ${r.id}`.toLowerCase().includes(term))
        return false;
      return true;
    });
  }, [rows, maturity, gapsOnly, q]);

  const kpis = useMemo(() => summarize(rows), [rows]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-6 py-10">
        <div className="text-xs font-medium uppercase tracking-[0.18em] text-teal-300/80">
          Spine
        </div>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Capability Registry</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Every claim, lesson, and design in the atlas is tagged to a capability. This is the live
          coverage dashboard for the architectural spine — how much grounded knowledge each
          capability has, how deep it goes, and whether it is preview or GA.
        </p>

        {/* KPI strip */}
        <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Kpi label="Capabilities" value={kpis.total} />
          <Kpi
            label="With verified claims"
            value={`${kpis.verifiedPct}%`}
            hint={`${kpis.withVerified}/${kpis.total}`}
          />
          <Kpi label="Preview · GA" value={`${kpis.preview} · ${kpis.ga}`} />
          <Kpi
            label="Diagram coverage"
            value={`${kpis.diagramPct}%`}
            hint={`${kpis.withDiagram}/${kpis.total}`}
          />
        </div>

        {/* Filter bar */}
        <div className="mt-6 flex flex-wrap items-center gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filter capabilities…"
            className="h-8 w-56 rounded-md border border-border bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground"
          />
          <div className="flex gap-1 rounded-md border border-border bg-card p-1">
            {(["all", "preview", "ga", "deprecated"] as MaturityFilter[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMaturity(m)}
                className={`rounded px-2.5 py-1 text-xs capitalize ${
                  maturity === m
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setGapsOnly((v) => !v)}
            className={`rounded-md border px-2.5 py-1.5 text-xs ${
              gapsOnly
                ? "border-rose-400/30 bg-rose-500/10 text-rose-200"
                : "border-border bg-card text-muted-foreground hover:text-foreground"
            }`}
          >
            Gaps only
          </button>
          <span className="ml-auto text-xs text-muted-foreground">
            {filtered.length} of {rows.length}
          </span>
        </div>

        {isLoading && (
          <div className="mt-8 rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
            Loading coverage…
          </div>
        )}
        {error && (
          <div className="mt-8 rounded-md border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">
            {(error as Error).message}
          </div>
        )}
        {!isLoading && filtered.length === 0 && (
          <div className="mt-8 rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
            No capabilities match these filters.
          </div>
        )}

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((r) => (
            <CapabilityCard key={r.id} row={r} />
          ))}
        </div>
      </main>
    </div>
  );
}

function CapabilityCard({ row }: { row: RegistryCoverageRow }) {
  const a = accent(row.accent);
  const gap = isGap(row);
  return (
    <Link
      to="/registry/$id"
      params={{ id: row.id }}
      className={`group flex flex-col rounded-2xl border border-border bg-card p-4 transition hover:ring-1 ${a.ring}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={`h-2.5 w-2.5 rounded-full ${a.dot}`} />
          <span className="font-medium text-foreground group-hover:text-foreground">
            {row.name}
          </span>
        </div>
        <MaturityBadge maturity={row.maturity} />
      </div>
      <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{row.description || "—"}</p>

      <div className="mt-4 flex items-center gap-3 text-xs text-muted-foreground">
        <span>
          <span className="font-semibold text-foreground">{row.verified_count}</span> verified
        </span>
        <span>/ {row.claim_count} claims</span>
      </div>

      {/* Depth coverage meter L1..L5 */}
      <div className="mt-3 flex items-center gap-1.5">
        {([1, 2, 3, 4, 5] as const).map((d) => {
          const count = row.depth_coverage[d] ?? 0;
          const m = depthMeta[d];
          return (
            <span
              key={d}
              title={`${m.label}: ${count} claim(s)`}
              className={`flex h-5 flex-1 items-center justify-center rounded border text-[9px] font-semibold ${
                count > 0 ? m.cls : "border-border bg-muted/40 text-muted-foreground/50"
              }`}
            >
              L{d}
            </span>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
        <span className="rounded-md border border-border bg-muted/40 px-1.5 py-0.5 text-muted-foreground">
          {row.blog_count} blog{row.blog_count === 1 ? "" : "s"}
        </span>
        <span className="rounded-md border border-border bg-muted/40 px-1.5 py-0.5 text-muted-foreground">
          {row.diagram_count} diagram{row.diagram_count === 1 ? "" : "s"}
        </span>
        {gap && (
          <span className="rounded-md border border-rose-400/30 bg-rose-500/10 px-1.5 py-0.5 text-rose-200">
            gap
          </span>
        )}
      </div>
    </Link>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card px-4 py-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold tracking-tight">{value}</div>
      {hint && <div className="text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

function isGap(r: RegistryCoverageRow) {
  return r.verified_count === 0 || r.diagram_count === 0;
}

function summarize(rows: RegistryCoverageRow[]) {
  const total = rows.length;
  const withVerified = rows.filter((r) => r.verified_count > 0).length;
  const withDiagram = rows.filter((r) => r.diagram_count > 0).length;
  const preview = rows.filter((r) => (r.maturity ?? "ga") === "preview").length;
  const ga = rows.filter((r) => (r.maturity ?? "ga") === "ga").length;
  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);
  return {
    total,
    withVerified,
    verifiedPct: pct(withVerified),
    withDiagram,
    diagramPct: pct(withDiagram),
    preview,
    ga,
  };
}
