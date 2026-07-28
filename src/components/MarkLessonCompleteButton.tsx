import { CheckCircle2, Circle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLessonProgress } from "@/lib/use-lesson-progress";

export function MarkLessonCompleteButton({ slug }: { slug: string }) {
  const { isDone, toggle } = useLessonProgress();
  const done = isDone(slug);

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className="no-print h-10 border-border bg-card text-foreground"
      onClick={() => toggle(slug)}
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
