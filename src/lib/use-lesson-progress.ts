import { useCallback, useEffect, useState } from "react";

const KEY = "fa:lesson-done";

// Local completion state for lessons (Editorial Experience Revamp Phase 6). Mirrors
// use-step-progress.ts's localStorage pattern but tracks one flat set of completed lesson slugs
// (no per-slug key) since /learn needs to read every lesson's status at once to badge its cards.
export function useLessonProgress() {
  const [completed, setCompleted] = useState<Set<string>>(new Set());

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setCompleted(new Set(JSON.parse(raw)));
    } catch {
      // ignore
    }
  }, []);

  const toggle = useCallback((slug: string) => {
    setCompleted((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      try {
        localStorage.setItem(KEY, JSON.stringify([...next]));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  const isDone = useCallback((slug: string) => completed.has(slug), [completed]);

  return { completed, toggle, isDone };
}
