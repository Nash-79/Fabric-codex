import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MoveRight } from "lucide-react";
import { getSuggestedActions, listSourceWatchers } from "@/lib/settings.functions";
import { Empty, Panel } from "@/components/settings/shared";
import type { WatcherRow } from "@/components/settings/WatchersPanel";

// How a discovered URL becomes governed knowledge and then reusable content. Counts come from
// the same CMS payload the other tabs use; clicking a stage jumps to the relevant human gate.
export function PipelineOverviewPanel({
  data,
  loading,
  onNavigate,
}: {
  data: any;
  loading: boolean;
  onNavigate: (tab: string) => void;
}) {
  const listFn = useServerFn(listSourceWatchers);
  const suggestedFn = useServerFn(getSuggestedActions);
  const subs = useQuery({ queryKey: ["source-watchers"], queryFn: () => listFn() });
  const suggested = useQuery({
    queryKey: ["suggested-actions"],
    queryFn: () => suggestedFn(),
  });

  if (loading || subs.isLoading) {
    return (
      <Panel title="Pipeline overview">
        <Empty text="Loading pipeline..." />
      </Panel>
    );
  }

  const feeds = (subs.data?.watchers ?? []) as WatcherRow[];
  const activeFeeds = feeds.filter((f) => f.status === "active");
  const failingFeeds = feeds.filter((f) => (f.error_count ?? 0) > 0);
  const lastPolled =
    feeds
      .map((f) => f.last_attempt_at)
      .filter((t): t is string => !!t)
      .sort()
      .pop() ?? null;

  // Ideas (kind='idea') are pre-editorial candidates, not ingestion/commission work — exclude
  // them from these pipeline counts the same way diagrams are excluded, or a freshly generated,
  // still-unreviewed idea inflates "open work" and a later-approved one falsely reads as an
  // "ingested source" once marked written.
  const queue = (data?.queue ?? []).filter((q: any) => q.kind !== "diagram" && q.kind !== "idea");
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
      label: "Active watchers",
      value: activeFeeds.length,
      sub: lastPolled ? `polled ${new Date(lastPolled).toLocaleDateString()}` : "never polled",
    },
    {
      tab: "queue",
      label: "Open work",
      value: openQueue.length,
      sub: `${ingested.length} ingested · ${failedQueue.length} failed`,
    },
    {
      tab: "content",
      label: "Published sources",
      value: (data?.sources ?? []).length,
      sub: "source JSON imported",
    },
    {
      tab: "claims",
      label: "Claims review",
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
      text: `Watcher "${f.title || f.url}" failing (${f.error_count}×): ${f.last_error || "unknown error"}`,
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
      <p className="mb-4 text-sm text-muted-foreground">
        Reserving a queue item only assigns the work. Claims appear after a local agent extracts the
        source and you publish its JSON; verification is the human gate before that knowledge can
        augment articles or ground architecture designs.
      </p>
      <div className="mb-4 flex flex-col gap-3 rounded-md border border-teal-500/30 bg-teal-500/10 p-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-sm font-medium text-foreground">Run the journey as one job</div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            The orchestrator drains queued sources, asks one evidence-based question round about
            articles and architecture, pauses for source publication and claim verification, then
            resumes generation and prepares one final Publish all release.
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigator.clipboard?.writeText("/prompts:fa-orchestrate EXECUTE=true")}
          className="shrink-0 rounded border border-teal-500/30 bg-background px-3 py-2 font-mono text-xs text-teal-700 hover:bg-accent dark:text-teal-200"
        >
          /prompts:fa-orchestrate EXECUTE=true
        </button>
      </div>
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
          Full operator sequence
        </div>
        <ol className="mt-2 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          {[
            {
              title: "1. Discover and reserve",
              body: "A watcher or admin queues a URL. Reserve it to signal that a local ingestion run owns it; this does not create knowledge claims.",
              tab: "queue",
              action: "Open Queue",
            },
            {
              title: "2. Extract locally",
              body: "Run /prompts:fa-ingest (or /ingest-batch). Review the paraphrased, cited claims written to content/sources/<slug>.json.",
              tab: "queue",
              action: "Review source work",
            },
            {
              title: "3. Publish and link",
              body: "Publish Source (+ claims). Pending claims are inserted with the source; then complete the queue item by selecting that result source.",
              tab: "publish",
              action: "Open Publish",
            },
            {
              title: "4. Verify",
              body: "Review pending claims for accuracy, capability, depth, and source trust. Only verified active claims can ground downstream content.",
              tab: "claims",
              action: "Review Claims",
            },
          ].map((step) => (
            <li key={step.title} className="rounded-md border border-border bg-card p-3">
              <div className="text-sm font-medium text-foreground">{step.title}</div>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{step.body}</p>
              <button
                type="button"
                onClick={() => onNavigate(step.tab)}
                className="mt-2 text-xs font-medium text-teal-700 hover:underline dark:text-teal-200"
              >
                {step.action}
              </button>
            </li>
          ))}
        </ol>
      </div>

      <div className="mt-5">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Reuse verified source knowledge
        </div>
        <div className="mt-2 grid gap-2 lg:grid-cols-3">
          {[
            {
              title: "Create or augment an article",
              body: "Run the blog prompt. It creates an article only when one is missing; otherwise it enriches the active article when the source adds verified depth, coverage, diagrams, or drift corrections.",
              command: "/prompts:fa-blog TOPIC=<topic-slug>",
              tab: "blogs",
            },
            {
              title: "Create a solution architecture",
              body: "Run the design prompt with the workload scenario, volume, latency, and existing estate. Publish the result as Design, then validate it before sharing.",
              command: '/prompts:fa-design SCENARIO="<problem>"',
              tab: "content",
            },
            {
              title: "Add a data architecture pattern",
              body: "When a reusable data pattern is missing, use a pattern-focused scenario and tag the design DataArchitecture and ArchitecturePattern. Designs are the governed home for both pattern and solution architectures.",
              command: '/prompts:fa-design SCENARIO="Reusable <pattern> data architecture pattern"',
              tab: "content",
            },
          ].map((route) => (
            <div key={route.title} className="rounded-md border border-border bg-card p-3">
              <button
                type="button"
                onClick={() => onNavigate(route.tab)}
                className="text-left text-sm font-medium text-foreground hover:underline"
              >
                {route.title}
              </button>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{route.body}</p>
              <button
                type="button"
                onClick={() => navigator.clipboard?.writeText(route.command)}
                className="mt-2 max-w-full truncate rounded border border-border bg-background px-2 py-1 font-mono text-xs text-teal-700 hover:bg-accent dark:text-teal-200"
                title={`Copy ${route.command}`}
              >
                {route.command}
              </button>
            </div>
          ))}
        </div>
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

      <div className="mt-5">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Suggested next actions
        </div>
        {suggested.isLoading ? (
          <p className="mt-2 text-sm text-muted-foreground">Ranking actions…</p>
        ) : !(suggested.data as any[])?.length ? (
          <p className="mt-2 text-sm text-muted-foreground">No suggested actions.</p>
        ) : (
          <div className="mt-2 space-y-2">
            {((suggested.data ?? []) as Array<any>).map((action) => (
              <div
                key={action.id}
                className="flex flex-col gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm md:flex-row md:items-center md:justify-between"
              >
                <button
                  type="button"
                  onClick={() => onNavigate(action.tab)}
                  className="min-w-0 text-left"
                >
                  <div className="truncate font-medium text-foreground">{action.label}</div>
                  <div className="truncate text-xs text-muted-foreground">{action.detail}</div>
                </button>
                {action.command && (
                  <button
                    type="button"
                    onClick={() => navigator.clipboard?.writeText(action.command)}
                    className="shrink-0 rounded border border-border bg-background px-2 py-1 font-mono text-xs text-teal-700 hover:bg-accent dark:text-teal-200"
                  >
                    {action.command}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </Panel>
  );
}
