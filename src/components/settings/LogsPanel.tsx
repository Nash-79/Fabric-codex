import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Empty, Panel } from "@/components/settings/shared";

type LogEntry = {
  id: string;
  ts: string;
  stream: "admin" | "claim";
  action: string;
  target: string;
  actor: string;
  detail?: string;
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

function actionTone(action: string) {
  if (/verif|approv|complet|publish|subscrib|active|created|promote/.test(action))
    return "border-emerald-400/30 bg-emerald-500/10 text-emerald-200";
  if (/reject|fail|suspend|delete|unsubscrib|revoke|dismiss|deprecat/.test(action))
    return "border-rose-400/30 bg-rose-500/10 text-rose-200";
  if (/pending|queue|paus|expire|review|commission|supersede/.test(action))
    return "border-amber-400/30 bg-amber-500/10 text-amber-200";
  return "border-border bg-card text-muted-foreground";
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
  const [q, setQ] = useState("");

  const entries: LogEntry[] = useMemo(() => {
    const a: LogEntry[] = (audit ?? []).map((e) => ({
      id: `a-${e.id}`,
      ts: e.created_at,
      stream: "admin",
      action: e.action,
      target: [e.target_type, e.target_id].filter(Boolean).join(":"),
      actor: e.actor_email ?? e.actor_id ?? "system",
    }));
    const c: LogEntry[] = (claimLog ?? []).map((e) => ({
      id: `c-${e.id}`,
      ts: e.actioned_at,
      stream: "claim",
      action: `claim.${e.action}`,
      target: `${e.capability_id} (${e.prev_status}→${e.new_status})`,
      actor: "curation",
      detail: e.text_snippet,
    }));
    return [...a, ...c].sort((x, y) => new Date(y.ts).getTime() - new Date(x.ts).getTime());
  }, [audit, claimLog]);

  const filtered = entries.filter((e) => {
    if (stream !== "all" && e.stream !== stream) return false;
    const term = q.trim().toLowerCase();
    if (
      term &&
      !`${e.action} ${e.target} ${e.actor} ${e.detail ?? ""}`.toLowerCase().includes(term)
    )
      return false;
    return true;
  });

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
            placeholder="Filter…"
            className="h-8 w-40 border-border bg-card text-foreground"
          />
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
        </div>
      }
    >
      {loading ? (
        <Empty text="Loading logs..." />
      ) : filtered.length === 0 ? (
        <Empty text="No matching activity." />
      ) : (
        <div className="divide-y divide-border rounded-md border border-border">
          {filtered.slice(0, 150).map((e) => (
            <div
              key={e.id}
              className="grid items-center gap-2 px-3 py-2 text-sm md:grid-cols-[96px_1fr_140px]"
            >
              <div
                className="text-xs text-muted-foreground"
                title={new Date(e.ts).toLocaleString()}
              >
                {relativeTime(e.ts)}
              </div>
              <div className="min-w-0">
                <span
                  className={`rounded-sm border px-1.5 py-0.5 text-[11px] font-medium ${actionTone(
                    e.action,
                  )}`}
                >
                  {e.action}
                </span>
                <span className="ml-2 text-muted-foreground">{e.target}</span>
                {e.detail && (
                  <div className="mt-0.5 truncate text-xs text-muted-foreground/80">{e.detail}</div>
                )}
              </div>
              <div className="truncate text-right text-xs text-muted-foreground">{e.actor}</div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
