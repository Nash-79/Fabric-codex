import { useCallback, useEffect, useState } from "react";

const key = (kind: string, slug: string) => `fa:steps:${kind}:${slug}`;

// Local completion state for authored step sequences (Editorial Experience Revamp Phase 4).
// Mirrors use-reading-progress.ts's localStorage pattern — no throttling needed here since writes
// are click-driven (toggling one step), not scroll-driven.
export function useStepProgress(kind: string, slug: string) {
  const [completed, setCompleted] = useState<Set<string>>(new Set());

  useEffect(() => {
    try {
      const raw = localStorage.getItem(key(kind, slug));
      if (raw) setCompleted(new Set(JSON.parse(raw)));
    } catch {
      // ignore
    }
  }, [kind, slug]);

  const toggle = useCallback(
    (stepId: string) => {
      setCompleted((prev) => {
        const next = new Set(prev);
        if (next.has(stepId)) next.delete(stepId);
        else next.add(stepId);
        try {
          localStorage.setItem(key(kind, slug), JSON.stringify([...next]));
        } catch {
          // ignore
        }
        return next;
      });
    },
    [kind, slug],
  );

  return { completed, toggle };
}
