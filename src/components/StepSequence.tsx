import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { useStepProgress } from "@/lib/use-step-progress";

// Renders a run of consecutive `> [!STEP]` blockquotes as connected, auto-numbered, anchorable
// cards with optional local completion state — Editorial Experience Revamp Phase 4. Grouping
// happens by wrapping the run in <div data-step-sequence> before ReactMarkdown parses the body
// (see ContentItemArticle.tsx); this component just lays out the already-rendered step children.
export function StepSequence({
  children,
  sectionSlug,
  kind,
  slug,
}: {
  children: ReactNode;
  sectionSlug: string;
  kind?: string;
  slug?: string;
}) {
  const steps = Array.isArray(children) ? children : [children];
  const { completed, toggle } = useStepProgress(kind ?? "unknown", slug ?? "unknown");
  const canTrack = Boolean(kind && slug);

  return (
    <ol className="not-prose my-6 space-y-0">
      {steps.map((step, index) => {
        const n = index + 1;
        const stepId = `step-${sectionSlug}-${n}`;
        const isDone = completed.has(stepId);
        const isLast = index === steps.length - 1;
        return (
          <li key={stepId} id={stepId} className="relative flex gap-4 pb-6">
            {!isLast && (
              <div
                className="absolute left-[15px] top-8 bottom-0 w-px bg-border"
                aria-hidden="true"
              />
            )}
            <button
              type="button"
              onClick={canTrack ? () => toggle(stepId) : undefined}
              disabled={!canTrack}
              aria-label={isDone ? `Step ${n} completed` : `Mark step ${n} complete`}
              aria-pressed={isDone}
              className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-semibold transition ${
                isDone
                  ? "border-teal-500 bg-teal-500 text-white"
                  : "border-border bg-card text-muted-foreground"
              } ${canTrack ? "cursor-pointer hover:border-teal-500/60" : "cursor-default"}`}
            >
              {isDone ? <Check className="h-4 w-4" /> : n}
            </button>
            <div className="min-w-0 flex-1 pt-0.5">{step}</div>
          </li>
        );
      })}
    </ol>
  );
}
