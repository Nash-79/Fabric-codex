import { useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight, Copy, Download } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Empty, Panel } from "@/components/settings/shared";

type Level = "error" | "warn" | "info";

type LogEntry = {
  id: string;
  ts: string;
  stream: "admin" | "claim";
  action: string;
  target: string;
  actor: string;
  level: Level;
  detail?: string;
  metadata?: Record<string, unknown> | null;
  raw: unknown;
};

function relativeTime(iso: string) {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  if (Number.isNaN(then)) return "—";
  const s = Math.round(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

function classifyLevel(action: string, metadata: any): Level {
  const a = action.toLowerCase();
  if (/fail|error|reject|denied|unauthori[sz]ed|forbid|timeout|drift/.test(a)) return "error";
  if (metadata && typeof metadata === "object") {
    const err = (metadata as any).error;
    const failed = (metadata as any).failed;
    if (typeof err === "string" && err.trim()) return "error";
    if (typeof failed === "number" && failed > 0) return "error";
    const results = (metadata as any).results;
    if (Array.isArray(results) && results.some((r: any) => r && r.error)) return "error";
  }
  if (/warn|pending|paus|expire|review|superseded|deprecat|dismiss/.test(a)) return "warn";
  return "info";
}

function levelTone(level: Level) {
  if (level === "error") return "border-rose-400/40 bg-rose-500/10 text-rose-200";
  if (level === "warn") return "border-amber-400/40 bg-amber-500/10 text-amber-200";
  return "border-border bg-card text-muted-foreground";
}

function actionTone(action: string, level: Level) {
  if (level === "error") return "border-rose-400/30 bg-rose-500/10 text-rose-200";
  if (level === "warn") return "border-amber-400/30 bg-amber-500/10 text-amber-200";
  if (/verif|approv|complet|publish|subscrib|active|created|promote/.test(action))
    return "border-emerald-400/30 bg-emerald-500/10 text-emerald-200";
  return "border-border bg-card text-muted-foreground";
}

function extractErrorText(metadata: any): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const parts: string[] = [];
  if (typeof metadata.error === "string" && metadata.error.trim()) parts.push(metadata.error);
  if (Array.isArray(metadata.results)) {
    for (const r of metadata.results) {
      if (r && typeof r === "object" && typeof r.error === "string" && r.error.trim()) {
        parts.push(`${r.feed ?? "?"}: ${r.error}`);
      }
    }
  }
  return parts.length ? parts.join(" · ") : null;
}

export function LogsPanel({
  audit,
  claimLog,
  loading,
  updatedAt,
}: {
  audit: any[];
  claimLog: any[];
  loading: boolean;
  updatedAt?: number;
}) {
  const [stream, setStream] = useState<"all" | "admin" | "claim">("all");
  const [level, setLevel] = useState<"all" | Level>("all");
  const [q, setQ] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const entries: LogEntry[] = useMemo(() => {
    const a: LogEntry[] = (audit ?? []).map((e) => {
      const lvl = classifyLevel(e.action ?? "", e.metadata);
      return {
        id: `a-${e.id}`,
        ts: e.created_at,
        stream: "admin",
        action: e.action,
        target: [e.target_type, e.target_id].filter(Boolean).join(":"),
        actor: e.actor_email ?? e.actor_id ?? "system",
        level: lvl,
        detail: extractErrorText(e.metadata) ?? undefined,
        metadata: e.metadata ?? null,
        raw: e,
      };
    });
    const c: LogEntry[] = (claimLog ?? []).map((e) => ({
      id: `c-${e.id}`,
      ts: e.actioned_at,
      stream: "claim",
      action: `claim.${e.action}`,
      target: `${e.capability_id} (${e.prev_status}→${e.new_status})`,
      actor: "curation",
      level: classifyLevel(`claim.${e.action}`, null),
      detail: e.text_snippet,
      metadata: null,
      raw: e,
    }));
    return [...a, ...c].sort((x, y) => new Date(y.ts).getTime() - new Date(x.ts).getTime());
  }, [audit, claimLog]);

  const counts = useMemo(() => {
    const out = { error: 0, warn: 0, info: 0 } as Record<Level, number>;
    for (const e of entries) out[e.level]++;
    return out;
  }, [entries]);

  const filtered = entries.filter((e) => {
    if (stream !== "all" && e.stream !== stream) return false;
    if (level !== "all" && e.level !== level) return false;
    const term = q.trim().toLowerCase();
    if (term) {
      const hay =
        `${e.action} ${e.target} ${e.actor} ${e.detail ?? ""} ${JSON.stringify(e.metadata ?? {})}`.toLowerCase();
      if (!hay.includes(term)) return false;
    }
    return true;
  });

  const toggle = (id: string) => setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));

  const copy = (entry: LogEntry) => {
    try {
      navigator.clipboard?.writeText(JSON.stringify(entry.raw, null, 2));
    } catch {
      /* noop */
    }
  };

  const exportJson = () => {
    const blob = new Blob(
      [
        JSON.stringify(
          filtered.map((e) => e.raw),
          null,
          2,
        ),
      ],
      {
        type: "application/json",
      },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `activity-log-${new Date().toISOString().slice(0, 19)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Panel
      title="Activity log"
      action={
        <div className="flex flex-wrap items-center gap-2">
          {updatedAt ? (
            <span className="text-[11px] text-muted-foreground">
              updated {relativeTime(new Date(updatedAt).toISOString())}
            </span>
          ) : null}
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filter action, actor, JSON…"
            className="h-8 w-56 border-border bg-card text-foreground"
          />
          <div className="flex gap-1 rounded-md border border-border bg-card p-1">
            {(["all", "error", "warn", "info"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setLevel(s)}
                className={`rounded px-2 py-1 text-xs capitalize ${
                  level === s
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {s}
                {s !== "all" ? (
                  <span className="ml-1 text-[10px] opacity-70">{counts[s as Level]}</span>
                ) : null}
              </button>
            ))}
          </div>
          <div className="flex gap-1 rounded-md border border-border bg-card p-1">
            {(["all", "admin", "claim"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStream(s)}
                className={`rounded px-2 py-1 text-xs capitalize ${
                  stream === s
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
          <Button size="sm" variant="outline" onClick={exportJson} className="h-8 gap-1">
            <Download className="h-3.5 w-3.5" /> JSON
          </Button>
        </div>
      }
    >
      {loading ? (
        <Empty text="Loading logs..." />
      ) : filtered.length === 0 ? (
        <Empty text="No matching activity." />
      ) : (
        <div className="divide-y divide-border overflow-hidden rounded-md border border-border">
          {filtered.slice(0, 200).map((e) => {
            const isOpen = !!expanded[e.id];
            const hasMeta = e.metadata && Object.keys(e.metadata).length > 0;
            return (
              <div key={e.id} className="text-sm">
                <button
                  type="button"
                  onClick={() => (hasMeta || e.detail ? toggle(e.id) : undefined)}
                  className={`grid w-full items-start gap-2 px-3 py-2 text-left transition-colors md:grid-cols-[20px_96px_1fr_160px] ${
                    e.level === "error"
                      ? "bg-rose-500/5 hover:bg-rose-500/10"
                      : "hover:bg-accent/40"
                  }`}
                >
                  <div className="pt-0.5 text-muted-foreground">
                    {hasMeta || e.detail ? (
                      isOpen ? (
                        <ChevronDown className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5" />
                      )
                    ) : e.level === "error" ? (
                      <AlertTriangle className="h-3.5 w-3.5 text-rose-600 dark:text-rose-300" />
                    ) : null}
                  </div>
                  <div
                    className="pt-0.5 text-xs text-muted-foreground"
                    title={new Date(e.ts).toLocaleString()}
                  >
                    {relativeTime(e.ts)}
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span
                        className={`rounded-sm border px-1.5 py-0.5 text-[11px] font-medium ${actionTone(
                          e.action,
                          e.level,
                        )}`}
                      >
                        {e.action}
                      </span>
                      <span
                        className={`rounded-sm border px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${levelTone(
                          e.level,
                        )}`}
                      >
                        {e.level}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">{e.target}</span>
                    </div>
                    {e.detail && (
                      <div
                        className={`mt-1 line-clamp-2 text-xs ${
                          e.level === "error" ? "text-rose-200" : "text-muted-foreground/80"
                        }`}
                      >
                        {e.detail}
                      </div>
                    )}
                  </div>
                  <div className="truncate pt-0.5 text-right text-xs text-muted-foreground">
                    {e.actor}
                  </div>
                </button>
                {isOpen && (hasMeta || e.detail) && (
                  <div className="border-t border-border bg-background/40 px-3 py-2">
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        Payload
                      </span>
                      <button
                        type="button"
                        onClick={() => copy(e)}
                        className="flex items-center gap-1 rounded border border-border bg-card px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground"
                      >
                        <Copy className="h-3 w-3" /> Copy JSON
                      </button>
                    </div>
                    <pre className="max-h-80 overflow-auto rounded bg-black/40 p-2 text-[11px] leading-relaxed text-foreground/90">
                      {JSON.stringify(e.raw, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}
