import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import {
  clearPerfSamples,
  getPerfSamples,
  subscribePerf,
  type PerfSample,
} from "@/lib/perf-tracker";

export const Route = createFileRoute("/dev/perf")({
  head: () => ({ meta: [{ title: "Performance diagnostics — Fabric Atlas" }] }),
  component: PerfPage,
});

const KIND_STYLE: Record<PerfSample["kind"], string> = {
  route: "bg-teal-500/15 text-teal-300 border-teal-500/30",
  vital: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  query: "bg-rose-500/15 text-rose-300 border-rose-500/30",
};

function PerfPage() {
  const [samples, setSamples] = useState<PerfSample[]>([]);
  const [filter, setFilter] = useState<"all" | PerfSample["kind"]>("all");

  useEffect(() => {
    setSamples(getPerfSamples());
    return subscribePerf(() => setSamples(getPerfSamples()));
  }, []);

  const filtered = useMemo(
    () => (filter === "all" ? samples : samples.filter((s) => s.kind === filter)),
    [samples, filter],
  );

  const routeAvg = useMemo(() => {
    const r = samples.filter((s) => s.kind === "route");
    if (!r.length) return null;
    return Math.round(r.reduce((a, b) => a + b.ms, 0) / r.length);
  }, [samples]);

  const lcp = samples.find((s) => s.name === "LCP");
  const cls = samples.find((s) => s.name === "CLS");
  const inpMax = samples
    .filter((s) => s.name === "INP")
    .reduce((m, s) => Math.max(m, s.ms), 0);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-6 py-10">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Performance diagnostics</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              In-browser samples for this session — Web Vitals, route load times, and slow client
              queries. Data never leaves your browser.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {(["all", "route", "vital", "query"] as const).map((k) => (
              <button
                key={k}
                onClick={() => setFilter(k)}
                className={`rounded-md border px-2.5 py-1 text-xs uppercase tracking-wide ${
                  filter === k
                    ? "border-teal-500/50 bg-teal-500/10 text-teal-200"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {k}
              </button>
            ))}
            <button
              onClick={() => clearPerfSamples()}
              className="rounded-md border border-border px-2.5 py-1 text-xs uppercase tracking-wide text-muted-foreground hover:text-rose-300"
            >
              Clear
            </button>
          </div>
        </div>

        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MetricCard label="Samples" value={String(samples.length)} />
          <MetricCard
            label="Avg route load"
            value={routeAvg !== null ? `${routeAvg} ms` : "—"}
          />
          <MetricCard label="LCP" value={lcp ? `${lcp.ms} ms` : "—"} hint={rateLCP(lcp?.ms)} />
          <MetricCard label="Max INP" value={inpMax ? `${inpMax} ms` : "—"} hint={rateINP(inpMax)} />
        </section>

        {cls && (
          <p className="mt-3 text-xs text-muted-foreground">
            CLS this session: <span className="font-mono">{cls.ms}</span>{" "}
            {rateCLS(cls.ms) && <em className="not-italic">({rateCLS(cls.ms)})</em>}
          </p>
        )}

        <section className="mt-8 rounded-lg border border-border">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-card/60 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Kind</th>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2 text-right">ms</th>
                <th className="px-3 py-2">When</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">
                    No samples yet — navigate around the app to populate this page.
                  </td>
                </tr>
              ) : (
                filtered.map((s) => (
                  <tr key={s.id} className="border-b border-border/60 last:border-none">
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] uppercase ${KIND_STYLE[s.kind]}`}
                      >
                        {s.kind}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-foreground/90">{s.name}</td>
                    <td className="px-3 py-2 text-right font-mono">{s.ms}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {new Date(s.ts).toLocaleTimeString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>

        <p className="mt-6 text-xs text-muted-foreground">
          To run Lighthouse locally: <span className="font-mono">npx lighthouse https://…/ --view</span>{" "}
          against Preview or Production. This panel complements Lighthouse with per-session real
          user data.
        </p>
      </main>
    </div>
  );
}

function MetricCard({ label, value, hint }: { label: string; value: string; hint?: string | null }) {
  return (
    <div className="rounded-lg border border-border bg-card/60 p-3">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono text-lg">{value}</div>
      {hint && <div className="text-[10px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

function rateLCP(ms?: number) {
  if (!ms) return null;
  if (ms <= 2500) return "good";
  if (ms <= 4000) return "needs improvement";
  return "poor";
}
function rateINP(ms?: number) {
  if (!ms) return null;
  if (ms <= 200) return "good";
  if (ms <= 500) return "needs improvement";
  return "poor";
}
function rateCLS(v?: number) {
  if (v === undefined) return null;
  if (v <= 0.1) return "good";
  if (v <= 0.25) return "needs improvement";
  return "poor";
}
