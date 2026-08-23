import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { CheckCircle2, Circle, Lock } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { KindBadge } from "@/components/KindBadge";
import { listLearningPaths, type LearningPath, type LearningPathItem } from "@/lib/atlas.functions";
import { useUnifiedProgress, type UnifiedProgressEntry } from "@/lib/use-unified-progress";
import { itemKey, isItemDone, findResumeItem, isPositionLocked } from "@/lib/learning-path-ui";

const learningPathsQO = queryOptions({
  queryKey: ["learning-paths"],
  queryFn: () => listLearningPaths(),
  staleTime: 5 * 60 * 1000,
});

export const Route = createFileRoute("/learn")({
  head: () => ({
    meta: [
      { title: "Learn — Fabric Atlas" },
      {
        name: "description",
        content:
          "Guided learning paths through Microsoft Fabric, grounded in cited claims — ordered so each step builds on the last.",
      },
      { property: "og:title", content: "Learn — Fabric Atlas" },
      {
        property: "og:description",
        content: "Guided, ordered Microsoft Fabric learning paths grounded in cited claims.",
      },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(learningPathsQO),
  errorComponent: ({ error, reset }) => (
    <div className="min-h-screen bg-background p-10 text-foreground">
      <SiteHeader />
      <p className="mt-6 text-rose-600 dark:text-rose-300">
        Could not load learning paths. {error.message}
      </p>
      <button className="mt-3 underline" onClick={reset}>
        Retry
      </button>
    </div>
  ),
  component: LearnPage,
});

function PathProgressRing({ done, total }: { done: number; total: number }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const size = 40;
  const stroke = 4;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - pct / 100);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          className="stroke-border"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="stroke-teal-500 transition-[stroke-dashoffset] duration-500"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold text-foreground">
        {pct}%
      </span>
    </div>
  );
}

function PathCard({
  path,
  progressByKey,
}: {
  path: LearningPath;
  progressByKey: Map<string, UnifiedProgressEntry>;
}) {
  const doneCount = path.items.filter((item) =>
    isItemDone(progressByKey.get(itemKey(item))),
  ).length;
  const resumeItem = findResumeItem(path.items, progressByKey);
  const allDone = path.items.length > 0 && doneCount === path.items.length;

  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">{path.title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{path.description}</p>
          {path.audience && (
            <p className="mt-1 text-xs text-muted-foreground">
              <span className="font-medium">For:</span> {path.audience}
            </p>
          )}
        </div>
        <PathProgressRing done={doneCount} total={path.items.length} />
      </div>

      {resumeItem && (
        <Link
          to="/blogs/$kind/$slug"
          params={{ kind: resumeItem.content_kind, slug: resumeItem.content_slug }}
          search={{ from: "learn", path: path.slug }}
          className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition hover:opacity-90"
        >
          {allDone ? "Review this path" : doneCount > 0 ? "Resume" : "Start this path"} →
        </Link>
      )}

      <ol className="mt-4 space-y-1.5 border-l border-border pl-4">
        {path.items.map((item, index) => {
          const entry = progressByKey.get(itemKey(item));
          const done = isItemDone(entry);
          const locked = isPositionLocked(path.items, index, progressByKey);
          const meta = item.lesson_meta;
          const unmetPrereqs = (item.prerequisite_ids ?? []).filter((prereqSlug) => {
            const prereqItem = path.items.find((i) => i.content_slug === prereqSlug);
            return prereqItem ? !isItemDone(progressByKey.get(itemKey(prereqItem))) : false;
          });

          return (
            <li key={itemKey(item)} className="relative -ml-[21px] pl-[21px]">
              <span
                className={`absolute left-0 top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full ${
                  done ? "bg-teal-500" : "border-2 border-border bg-background"
                }`}
                aria-hidden
              />
              <Link
                to="/blogs/$kind/$slug"
                params={{ kind: item.content_kind, slug: item.content_slug }}
                search={{ from: "learn", path: path.slug }}
                className="group flex flex-col gap-0.5 rounded-md px-2 py-1.5 transition hover:bg-accent"
              >
                <div className="flex items-center gap-2">
                  {done ? (
                    <CheckCircle2
                      className="h-3.5 w-3.5 shrink-0 text-teal-500"
                      aria-label="Completed"
                    />
                  ) : locked ? (
                    <Lock
                      className="h-3 w-3 shrink-0 text-muted-foreground"
                      aria-label="Not started yet"
                    />
                  ) : (
                    <Circle className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  )}
                  <span className="text-sm font-medium text-foreground group-hover:text-teal-600 dark:group-hover:text-teal-300">
                    {item.title}
                  </span>
                  <KindBadge kind={item.content_kind} />
                  {item.optional && (
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      optional
                    </span>
                  )}
                </div>
                {meta?.estimated_minutes && (
                  <span className="pl-5 text-xs text-muted-foreground">
                    ~{meta.estimated_minutes} min
                    {meta.completion_outcome && ` · ${meta.completion_outcome}`}
                  </span>
                )}
                {unmetPrereqs.length > 0 && !done && (
                  <span className="pl-5 text-xs text-amber-600 dark:text-amber-400">
                    Best after: {unmetPrereqs.join(", ")}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function LearnPage() {
  const { data: paths } = useSuspenseQuery(learningPathsQO);
  const { progressByKey } = useUnifiedProgress();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-6 py-10">
        <div className="text-xs font-medium uppercase tracking-[0.18em] text-teal-700/80 dark:text-teal-300/80">
          Paths
        </div>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Learn Microsoft Fabric</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Ordered, guided paths — each step builds on the last, and every claim is grounded in cited
          sources. Looking for architecture patterns instead?{" "}
          <Link to="/designs" className="text-teal-600 hover:underline dark:text-teal-300">
            Browse the architecture gallery →
          </Link>
        </p>

        <div className="mt-8 space-y-6">
          {paths.length === 0 && (
            <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              No learning paths published yet.
            </div>
          )}
          {paths.map((path) => (
            <PathCard key={path.slug} path={path} progressByKey={progressByKey} />
          ))}
        </div>
      </main>
    </div>
  );
}
