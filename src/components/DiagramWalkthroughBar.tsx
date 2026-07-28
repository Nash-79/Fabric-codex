import { ChevronLeft, ChevronRight, X } from "lucide-react";
import type { DiagramWalkthroughStep } from "@/diagrams/types";
import { Button } from "@/components/ui/button";

// Replaces the lightbox's caption bar while a guided walkthrough is active (mutually exclusive,
// same screen real estate). Keeps the walkthrough's own narrative voice (step.explanation) here,
// separate from the node's standing authored detail/whyItMatters shown in DiagramDetailPanel —
// the panel stays walkthrough-agnostic, only ever rendering "the selected node's data."
export function DiagramWalkthroughBar({
  step,
  index,
  total,
  onPrevious,
  onNext,
  onExit,
}: {
  step: DiagramWalkthroughStep;
  index: number;
  total: number;
  onPrevious: () => void;
  onNext: () => void;
  onExit: () => void;
}) {
  return (
    <div
      className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
      aria-live="polite"
    >
      <div className="pointer-events-auto max-w-3xl rounded-xl border border-border/60 bg-background/95 px-4 py-3 shadow-md backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <span className="mr-1.5 text-xs font-semibold uppercase tracking-wider text-teal-600 dark:text-teal-300">
              Step {index + 1} of {total}
            </span>
            <strong className="text-sm text-foreground">{step.title}</strong>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onExit}
            aria-label="Exit walkthrough"
            className="h-8 w-8 shrink-0 rounded-full text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{step.explanation}</p>
        <div className="mt-2 flex items-center justify-between gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onPrevious}
            disabled={index === 0}
            className="h-8 gap-1 text-xs"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Previous
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onNext}
            disabled={index === total - 1}
            className="h-8 gap-1 text-xs"
          >
            Next
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
