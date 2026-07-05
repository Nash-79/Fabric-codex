import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { RefreshCw, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Panel, Empty } from "@/components/settings/shared";
import { getSchemaHealthReport } from "@/lib/schema-health.functions";
import type { Check, CheckStatus } from "@/lib/schema-health.server";

const statusIcon: Record<CheckStatus, React.ReactNode> = {
  ok: <CheckCircle2 className="h-4 w-4 text-emerald-400" />,
  warn: <AlertTriangle className="h-4 w-4 text-amber-400" />,
  fail: <XCircle className="h-4 w-4 text-rose-400" />,
};

const statusChip: Record<CheckStatus, string> = {
  ok: "border-emerald-400/30 bg-emerald-500/10 text-emerald-200",
  warn: "border-amber-400/30 bg-amber-500/10 text-amber-200",
  fail: "border-rose-400/30 bg-rose-500/10 text-rose-200",
};

export function MigrationStatusPanel() {
  const fn = useServerFn(getSchemaHealthReport);
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["schema-health"],
    queryFn: () => fn(),
    refetchOnWindowFocus: false,
  });

  const report = q.data;
  const summary = report?.summary;

  return (
    <Panel
      title="Migration & Schema Health"
      action={
        <Button
          size="sm"
          variant="outline"
          className="h-8"
          onClick={() => qc.invalidateQueries({ queryKey: ["schema-health"] })}
          disabled={q.isFetching}
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${q.isFetching ? "animate-spin" : ""}`} />
          Re-run checks
        </Button>
      }
    >
      {q.isLoading ? (
        <Empty text="Running schema health checks..." />
      ) : q.error ? (
        <div className="rounded-md border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">
          {(q.error as Error).message}
        </div>
      ) : !report ? (
        <Empty text="No report available." />
      ) : (
        <div className="space-y-5">
          <div className="grid gap-3 md:grid-cols-4">
            <SummaryTile label="Passing" value={summary?.ok ?? 0} tone="ok" />
            <SummaryTile label="Warnings" value={summary?.warn ?? 0} tone="warn" />
            <SummaryTile label="Failures" value={summary?.fail ?? 0} tone="fail" />
            <div className="rounded-md border border-border bg-card p-3">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                Latest migration
              </div>
              <div className="mt-1 truncate font-mono text-xs text-foreground">
                {report.latestMigration?.version ?? "—"}
              </div>
              <div className="truncate text-xs text-muted-foreground">
                {report.latestMigration?.name ?? ""}
              </div>
            </div>
          </div>

          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Checks
            </h3>
            <div className="divide-y divide-border rounded-md border border-border">
              {report.checks.map((c: Check) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    {statusIcon[c.status]}
                    <span className="truncate">{c.label}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {c.detail && (
                      <span className="truncate text-xs text-muted-foreground">{c.detail}</span>
                    )}
                    <span
                      className={`rounded-sm border px-1.5 py-0.5 text-[10px] uppercase ${statusChip[c.status]}`}
                    >
                      {c.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Recent migrations (bundled)
            </h3>
            <div className="divide-y divide-border rounded-md border border-border">
              {report.recentMigrations.map((m) => (
                <div
                  key={m.version}
                  className="flex items-center justify-between gap-3 px-3 py-2 text-xs"
                >
                  <span className="font-mono text-muted-foreground">{m.version}</span>
                  <span className="truncate text-foreground">{m.name}</span>
                </div>
              ))}
            </div>
          </section>

          <div className="text-xs text-muted-foreground">
            Generated {new Date(report.generatedAt).toLocaleString()}
          </div>
        </div>
      )}
    </Panel>
  );
}

function SummaryTile({ label, value, tone }: { label: string; value: number; tone: CheckStatus }) {
  return (
    <div className={`rounded-md border p-3 ${statusChip[tone]}`}>
      <div className="text-xs uppercase tracking-wide opacity-80">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </div>
  );
}
