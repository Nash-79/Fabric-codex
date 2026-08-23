import { CheckCircle2, Circle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLessonProgress } from "@/lib/use-lesson-progress";
import { useProgressSync } from "@/lib/use-progress-sync";

export function MarkLessonCompleteButton({ slug }: { slug: string }) {
  const { isDone, toggle } = useLessonProgress();
  const { recordProgress } = useProgressSync();
  const done = isDone(slug);

  function handleToggle() {
    toggle(slug);
    // Only push a "completed" record when marking done — un-marking is a local-only undo (the
    // server never downgrades a completion, per upsertMyProgress's never-downgrade rule).
    if (!done) recordProgress("lesson", slug, { status: "completed", percent: 100 });
  }

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className="no-print h-10 border-border bg-card text-foreground"
      onClick={handleToggle}
      aria-pressed={done}
    >
      {done ? (
        <CheckCircle2 className="mr-2 h-4 w-4 text-teal-500" />
      ) : (
        <Circle className="mr-2 h-4 w-4" />
      )}
      {done ? "Completed" : "Mark complete"}
    </Button>
  );
}
