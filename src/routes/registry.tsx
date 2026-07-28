import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, queryOptions } from "@tanstack/react-query";
import { Filter, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { DepthBadge, MaturityBadge, TierBadge } from "@/components/Badges";
import {
  getRegistryCoverage,
  listClaimsByCapability,
  type RegistryCoverageRow,
} from "@/lib/atlas.functions";
import { accent, depthMeta } from "@/lib/fabric-theme";

const claimsQO = (
  capabilityId: string,
  depth: number | "all" = "all",
  tier: number | "all" = "all",
  q = "",
) =>
  queryOptions({
    queryKey: ["registry-claims", capabilityId, depth, tier, q],
    queryFn: () =>
      listClaimsByCapability({
        data: {
          capabilityId,
          limit: 8,
          depth: depth === "all" ? undefined : depth,
          tier: tier === "all" ? undefined : tier,
          q: q.trim() || undefined,
        },
      }),
  });

type RegistrySearch = {
  capability?: string;
  depth?: number | "all";
  tier?: number | "all";
  q?: string;
};

export const Route = createFileRoute("/registry")({
  validateSearch: (search: Record<string, unknown>): RegistrySearch => ({
    capability: typeof search.capability === "string" ? search.capability : undefined,
    depth:
      search.depth === "all"
        ? "all"
        : typeof search.depth === "number" && [1, 2, 3, 4, 5].includes(search.depth)
          ? search.depth
          : undefined,
    tier:
      search.tier === "all"
        ? "all"
        : typeof search.tier === "number" && [1, 2, 3, 4, 5, 6].includes(search.tier)
          ? search.tier
          : undefined,
    q: typeof search.q === "string" ? search.q.slice(0, 200) : undefined,
  }),
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

  const navigate = useNavigate({ from: "/registry" });
  const claimSearch = Route.useSearch();

  const rows = useMemo(() => (data ?? []) as RegistryCoverageRow[], [data]);

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
  const selectedCapability = claimSearch.capability ?? rows[0]?.id;
  const depth = claimSearch.depth ?? "all";
  const tier = claimSearch.tier ?? "all";
  const claimQuery = claimSearch.q ?? "";
  const claims = useQuery({
    ...claimsQO(selectedCapability ?? "", depth, tier, claimQuery),
    enabled: !!selectedCapability,
  });
  const selectedRow = rows.find((r) => r.id === selectedCapability);
  const setSelectedCapability = (capability: string) =>
    navigate({ search: { ...claimSearch, capability } });
  const setDepth = (value: number | "all") =>
    navigate({ search: { ...claimSearch, depth: value } });
  const setTier = (value: number | "all") =>
    navigate({ search: { ...claimSearch, tier: value } });
  const setClaimQuery = (value: string) =>
    navigate({ search: { ...claimSearch, q: value || undefined } });

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

        {!isLoading && filtered.length > 0 && <DepthHeatmap rows={filtered} />}

        {!isLoading && rows.length > 0 && (
          <section className="mt-10 rounded-md border border-border bg-card">
            <div className="flex flex-col gap-3 border-b border-border p-4 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
                  <Filter className="h-4 w-4" />
                  Claim workbench
                </div>
                <h2 className="mt-1 text-lg font-semibold">Source-grounded facts</h2>
              </div>
              <div className="flex w-full flex-wrap gap-2 md:w-auto">
                <select
                  value={selectedCapability ?? ""}
                  aria-label="Select capability"
                  onChange={(event) => setSelectedCapability(event.target.value)}
                  className="min-h-10 flex-1 rounded-md border border-border bg-card px-2 py-1.5 text-xs text-foreground md:flex-none"
                >
                  {rows.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
                <select
                  value={depth}
                  aria-label="Filter by depth level"
                  onChange={(event) =>
                    setDepth(event.target.value === "all" ? "all" : Number(event.target.value))
                  }
                  className="min-h-10 flex-1 rounded-md border border-border bg-card px-2 py-1.5 text-xs text-foreground md:flex-none"
                >
                  <option value="all">All depths</option>
                  {[1, 2, 3, 4, 5].map((d) => (
                    <option key={d} value={d}>
                      L{d}
                    </option>
                  ))}
                </select>
                <select
                  value={tier}
                  aria-label="Filter by trust tier"
                  onChange={(event) =>
                    setTier(event.target.value === "all" ? "all" : Number(event.target.value))
                  }
                  className="min-h-10 flex-1 rounded-md border border-border bg-card px-2 py-1.5 text-xs text-foreground md:flex-none"
                >
                  <option value="all">All tiers</option>
                  {[1, 2, 3, 4, 5, 6].map((t) => (
                    <option key={t} value={t}>
                      T{t}
                    </option>
                  ))}
                </select>
                <div className="relative w-full md:w-44">
                  <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <input
                    value={claimQuery}
                    onChange={(event) => setClaimQuery(event.target.value)}
                    placeholder="Filter claims"
                    className="min-h-10 w-full rounded-md border border-border bg-card py-1.5 pl-7 pr-2 text-xs text-foreground placeholder:text-muted-foreground"
                  />
                </div>
              </div>
            </div>
            {selectedRow && (
              <div className="border-b border-border px-4 py-2 text-xs text-muted-foreground">
                Browsing claims for{" "}
                <span className="font-medium text-foreground">{selectedRow.name}</span>
              </div>
            )}
            <div className="divide-y divide-border">
              {(claims.data ?? []).map((claim: any) => (
                <div key={claim.id} className="p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <DepthBadge depth={claim.depth} />
                    {claim.sources?.tier && <TierBadge tier={claim.sources.tier} />}
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      {claim.type}
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{claim.text}</p>
                  {claim.sources?.title && (
                    <a
                      href={claim.sources.url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-block text-xs text-teal-600 hover:underline dark:text-teal-300"
                    >
                      {claim.sources.title}
                    </a>
                  )}
                </div>
              ))}
              {claims.isFetched && (claims.data ?? []).length === 0 && (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  No claims match the current filters.
                </div>
              )}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

// Sequential heat steps (one hue, light→dark; dark mode picks its own steps against the dark
// surface). Text/background pairs are contrast-checked: every ink is ≥ 5.4:1 on its cell.
const HEAT_BUCKETS = [
  {
    max: 0,
    cls: "bg-muted/40 text-muted-foreground/60",
    swatch: "bg-muted/40",
    label: "0",
  },
  {
    max: 2,
    cls: "bg-teal-100 text-teal-950 dark:bg-teal-950 dark:text-teal-200",
    swatch: "bg-teal-100 dark:bg-teal-950",
    label: "1–2",
  },
  {
    max: 5,
    cls: "bg-teal-300 text-teal-950 dark:bg-teal-800 dark:text-teal-50",
    swatch: "bg-teal-300 dark:bg-teal-800",
    label: "3–5",
  },
  {
    max: 9,
    cls: "bg-teal-500 text-teal-950 dark:bg-teal-500 dark:text-teal-950",
    swatch: "bg-teal-500",
    label: "6–9",
  },
  {
    max: Infinity,
    cls: "bg-teal-700 text-white dark:bg-teal-300 dark:text-teal-950",
    swatch: "bg-teal-700 dark:bg-teal-300",
    label: "10+",
  },
] as const;

const heatFor = (count: number) => HEAT_BUCKETS.find((b) => count <= b.max)!;

// Depth-coverage matrix: capabilities × L1–L5 as a real table (accessible by construction),
// cell shade = verified knowledge density. This is the "where is the atlas thin?" infographic —
// the per-card meters show presence, this shows magnitude across the whole spine at once.
function DepthHeatmap({ rows }: { rows: RegistryCoverageRow[] }) {
  const sorted = [...rows].sort((a, b) => b.claim_count - a.claim_count);
  return (
    <section className="mt-10">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Depth coverage matrix</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Claims per capability and depth level — the darker the cell, the deeper the grounded
            knowledge.
          </p>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          {HEAT_BUCKETS.map((b) => (
            <span key={b.label} className="flex items-center gap-1">
              <span
                className={`inline-block h-3 w-3 rounded-sm border border-border/60 ${b.swatch}`}
                aria-hidden="true"
              />
              {b.label}
            </span>
          ))}
        </div>
      </div>
      <div className="mt-4 overflow-x-auto rounded-lg border border-border">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-muted/60">
            <tr>
              <th className="px-3 py-2 text-left font-semibold text-foreground">Capability</th>
              {([1, 2, 3, 4, 5] as const).map((d) => (
                <th
                  key={d}
                  title={depthMeta[d].label}
                  className="w-16 px-2 py-2 text-center font-semibold text-foreground"
                >
                  L{d}
                </th>
              ))}
              <th className="w-20 px-3 py-2 text-right font-semibold text-foreground">Total</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.id} className="border-t border-border/60">
                <td className="px-3 py-1.5">
                  <Link
                    to="/registry/$id"
                    params={{ id: r.id }}
                    className="text-foreground hover:text-teal-600 hover:underline dark:hover:text-teal-300"
                  >
                    {r.name}
                  </Link>
                </td>
                {([1, 2, 3, 4, 5] as const).map((d) => {
                  const count = r.depth_coverage[d] ?? 0;
                  return (
                    <td key={d} className="p-0.5">
                      <div
                        title={`${r.name} · ${depthMeta[d].label}: ${count} claim${count === 1 ? "" : "s"}`}
                        className={`flex h-8 items-center justify-center rounded-sm text-xs font-medium tabular-nums ${heatFor(count).cls}`}
                      >
                        {count}
                      </div>
                    </td>
                  );
                })}
                <td className="px-3 py-1.5 text-right text-xs tabular-nums text-muted-foreground">
                  {r.claim_count}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
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
