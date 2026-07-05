import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MoveRight } from "lucide-react";
import { listRssSubscriptions } from "@/lib/settings.functions";
import { Empty, Panel } from "@/components/settings/shared";
import type { RssRow } from "@/components/settings/RssPanel";

// How a polled URL becomes a published article, at a glance: feeds → queue → approved
// sources → claims (pending → verified) → live articles. Counts come from the same CMS
// payload the other tabs use; clicking a stage jumps to the tab where that work happens.
export function PipelineOverviewPanel({
  data,
  loading,
  onNavigate,
}: {
  data: any;
  loading: boolean;
  onNavigate: (tab: string) => void;
}) {
  const listFn = useServerFn(listRssSubscriptions);
  const subs = useQuery({ queryKey: ["rss-subscriptions"], queryFn: () => listFn() });

  if (loading || subs.isLoading) {
    return (
      <Panel title="Pipeline overview">
        <Empty text="Loading pipeline..." />
      </Panel>
    );
  }

  const feeds = (subs.data?.subscriptions ?? []) as RssRow[];
  const activeFeeds = feeds.filter((f) => f.status === "active");
  const failingFeeds = feeds.filter((f) => (f.error_count ?? 0) > 0);
  const lastPolled =
    feeds
      .map((f) => f.last_polled_at)
      .filter((t): t is string => !!t)
      .sort()
      .pop() ?? null;

  const queue = (data?.queue ?? []).filter((q: any) => q.kind !== "diagram");
  const openQueue = queue.filter((q: any) => q.status === "queued" || q.status === "claimed");
  const failedQueue = queue.filter((q: any) => q.status === "failed");
  const ingested = queue.filter((q: any) => q.status === "ingested");

  const claims = data?.claims ?? [];
  const pendingClaims = claims.filter((c: any) => c.status === "pending" && c.active);
  const verifiedClaims = claims.filter((c: any) => c.status === "verified" && c.active);

  const published = (data?.contentItems ?? []).filter(
    (i: any) => i.kind === "article" && i.active && i.status === "published",
  );

  const stages: Array<{ tab: string; label: string; value: number; sub: string }> = [
    {
      tab: "rss",
      label: "Active feeds",
      value: activeFeeds.length,
      sub: lastPolled ? `polled ${new Date(lastPolled).toLocaleDateString()}` : "never polled",
    },
    {
      tab: "queue",
      label: "In queue",
      value: openQueue.length,
      sub: `${ingested.length} ingested · ${failedQueue.length} failed`,
    },
    {
      tab: "content",
      label: "Approved sources",
      value: (data?.sources ?? []).length,
      sub: "graded + deduped",
    },
    {
      tab: "claims",
      label: "Claims pending",
      value: pendingClaims.length,
      sub: `${verifiedClaims.length} verified`,
    },
    {
      tab: "blogs",
      label: "Articles live",
      value: published.length,
      sub: "published + active",
    },
  ];

  const attention: Array<{ tab: string; text: string }> = [
    ...failingFeeds.map((f) => ({
      tab: "rss",
      text: `Feed "${f.title || f.feed_url}" failing (${f.error_count}×): ${f.last_error || "unknown error"}`,
    })),
    ...(failedQueue.length
      ? [{ tab: "queue", text: `${failedQueue.length} queue item(s) failed ingestion` }]
      : []),
    ...(pendingClaims.length
      ? [{ tab: "claims", text: `${pendingClaims.length} claim(s) awaiting human verification` }]
      : []),
  ];

  return (
    <Panel title="Pipeline overview">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-stretch">
        {stages.map((stage, i) => (
          <div key={stage.tab} className="flex items-center gap-2 lg:flex-1">
            <button
              type="button"
              onClick={() => onNavigate(stage.tab)}
              className="w-full rounded-md border border-border bg-card p-3 text-left transition hover:border-teal-500/40 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                {stage.label}
              </div>
              <div className="mt-1 text-2xl font-semibold tabular-nums">{stage.value}</div>
              <div className="mt-0.5 text-[11px] text-muted-foreground">{stage.sub}</div>
            </button>
            {i < stages.length - 1 && (
              <MoveRight
                className="hidden h-4 w-4 shrink-0 text-muted-foreground lg:block"
                aria-hidden="true"
              />
            )}
          </div>
        ))}
      </div>

      <div className="mt-5">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Needs attention
        </div>
        {attention.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Nothing waiting — the pipeline is clear.
          </p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {attention.map((a) => (
              <li key={a.text}>
                <button
                  type="button"
                  onClick={() => onNavigate(a.tab)}
                  className="w-full rounded-md border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-left text-xs text-amber-800 transition hover:bg-amber-500/20 dark:text-amber-200"
                >
                  {a.text}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Panel>
  );
}
