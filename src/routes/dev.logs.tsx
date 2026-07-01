import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { SiteHeader } from "@/components/SiteHeader";

type LogLevel = "error" | "warn" | "info" | "debug";
type LogEntry = {
  id: number;
  ts: string;
  day: string;
  time: string;
  level: LogLevel;
  source: string;
  message: string;
  file?: string;
  raw: string;
};
type LogsResponse = {
  total: number;
  days: string[];
  counts: Record<string, number>;
  entries: LogEntry[];
};

export const Route = createFileRoute("/dev/logs")({
  head: () => ({ meta: [{ title: "Dev logs — Fabric Atlas" }] }),
  component: LogViewer,
});

const LEVELS: LogLevel[] = ["error", "warn", "info", "debug"];

const LEVEL_STYLES: Record<LogLevel, string> = {
  error: "bg-rose-500/15 text-rose-300 border-rose-500/30",
  warn: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  info: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  debug: "bg-zinc-500/15 text-zinc-300 border-zinc-500/30",
};

function LogViewer() {
  const [data, setData] = useState<LogsResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [day, setDay] = useState<string>("");
  const [enabledLevels, setEnabledLevels] = useState<Record<LogLevel, boolean>>({
    error: true,
    warn: true,
    info: true,
    debug: true,
  });
  const [q, setQ] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [loading, setLoading] = useState(false);

  const activeLevels = useMemo(() => LEVELS.filter((l) => enabledLevels[l]), [enabledLevels]);

  const fetchLogs = useMemo(
    () => async () => {
      const params = new URLSearchParams();
      if (day) params.set("day", day);
      if (q) params.set("q", q);
      params.set("levels", activeLevels.join(","));
      params.set("limit", "1000");
      setLoading(true);
      try {
        const res = await fetch(`/api/public/dev/logs?${params}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as LogsResponse;
        setData(json);
        setErr(null);
        if (!day && json.days[0]) setDay(json.days[0]);
      } catch (e) {
        setErr((e as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [day, q, activeLevels],
  );

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(fetchLogs, 3000);
    return () => clearInterval(id);
  }, [autoRefresh, fetchLogs]);

  const downloadNdjson = () => {
    if (!data) return;
    const ndjson = data.entries.map((e) => JSON.stringify(e)).join("\n");
    const blob = new Blob([ndjson], { type: "application/x-ndjson" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dev-logs-${day || "all"}.ndjson`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <SiteHeader />
      <div className="flex-1 p-4 md:p-6">
        <div className="mx-auto max-w-6xl">
          <header className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-4">
            <div>
              <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                Diagnostics
              </div>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight">Dev server logs</h1>
              <p className="mt-1 text-xs text-muted-foreground">
                Structured view of the mirrored Vite dev-server log. Dev only.
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">
                {data ? `${data.entries.length} / ${data.total} entries` : "—"}
              </span>
              <label className="flex items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1">
                <input
                  type="checkbox"
                  checked={autoRefresh}
                  onChange={(e) => setAutoRefresh(e.target.checked)}
                />
                Auto-refresh
              </label>
              <button
                onClick={fetchLogs}
                className="rounded-md border border-border bg-card px-3 py-1"
                disabled={loading}
              >
                {loading ? "Loading…" : "Refresh"}
              </button>
              <button
                onClick={downloadNdjson}
                className="rounded-md border border-border bg-card px-3 py-1"
              >
                Download NDJSON
              </button>
            </div>
          </header>

          <div className="my-4 grid gap-3 md:grid-cols-[1fr_2fr_1fr]">
            <div className="rounded-md border border-border bg-card p-3">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Day
              </div>
              <div className="flex flex-wrap gap-1">
                {(data?.days ?? []).map((d) => (
                  <button
                    key={d}
                    onClick={() => setDay(d)}
                    className={`rounded-sm border px-2 py-1 text-xs ${
                      day === d
                        ? "border-teal-400/40 bg-teal-500/10 text-teal-200"
                        : "border-border bg-background text-muted-foreground hover:bg-accent"
                    }`}
                  >
                    {d}
                  </button>
                ))}
                {!data?.days.length && (
                  <span className="text-xs text-muted-foreground">No days yet.</span>
                )}
              </div>
            </div>
            <div className="rounded-md border border-border bg-card p-3">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Levels
              </div>
              <div className="flex flex-wrap gap-1.5">
                {LEVELS.map((lvl) => (
                  <button
                    key={lvl}
                    onClick={() => setEnabledLevels((s) => ({ ...s, [lvl]: !s[lvl] }))}
                    className={`rounded-sm border px-2 py-1 text-xs font-medium uppercase ${
                      enabledLevels[lvl]
                        ? LEVEL_STYLES[lvl]
                        : "border-border bg-background text-muted-foreground"
                    }`}
                  >
                    {lvl} · {data?.counts[lvl] ?? 0}
                  </button>
                ))}
              </div>
            </div>
            <div className="rounded-md border border-border bg-card p-3">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Search
              </div>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="message, file, source…"
                className="w-full rounded-sm border border-border bg-background px-2 py-1 text-sm outline-none focus:border-teal-400/40"
              />
            </div>
          </div>

          {err && (
            <div className="mb-3 rounded-md border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">
              {err}
            </div>
          )}

          <div className="rounded-md border border-border bg-card">
            {(data?.entries ?? []).length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                No log entries match the current filters.
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {[...(data?.entries ?? [])].reverse().map((e) => (
                  <li key={e.id}>
                    <details className="group">
                      <summary className="flex cursor-pointer items-center gap-3 px-3 py-2 text-xs hover:bg-accent">
                        <span className="font-mono tabular-nums text-muted-foreground">
                          {e.time}
                        </span>
                        <span
                          className={`rounded-sm border px-1.5 py-0.5 text-[10px] font-semibold uppercase ${LEVEL_STYLES[e.level]}`}
                        >
                          {e.level}
                        </span>
                        <span className="text-muted-foreground">{e.source}</span>
                        <span className="flex-1 truncate font-mono text-foreground">
                          {e.message.split("\n")[0]}
                        </span>
                        {e.file && (
                          <span className="hidden truncate text-muted-foreground md:inline">
                            {e.file}
                          </span>
                        )}
                      </summary>
                      <div className="space-y-2 border-t border-border bg-background px-3 py-2 text-xs">
                        <div>
                          <div className="mb-1 font-semibold uppercase tracking-wide text-muted-foreground">
                            Message
                          </div>
                          <pre className="overflow-auto whitespace-pre-wrap break-words rounded-sm border border-border bg-card p-2 font-mono text-foreground">
                            {e.message}
                          </pre>
                        </div>
                        <div>
                          <div className="mb-1 font-semibold uppercase tracking-wide text-muted-foreground">
                            JSON
                          </div>
                          <pre className="overflow-auto rounded-sm border border-border bg-card p-2 font-mono text-muted-foreground">
                            {JSON.stringify(e, null, 2)}
                          </pre>
                          <button
                            className="mt-1 rounded-sm border border-border bg-card px-2 py-0.5 text-[11px]"
                            onClick={() =>
                              navigator.clipboard?.writeText(JSON.stringify(e, null, 2))
                            }
                          >
                            Copy JSON
                          </button>
                        </div>
                      </div>
                    </details>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
