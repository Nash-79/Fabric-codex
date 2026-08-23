import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listMyProgress } from "@/lib/atlas.functions";
import { useAuthSession } from "@/lib/use-auth-session";
import { useLessonProgress } from "@/lib/use-lesson-progress";

export type UnifiedProgressEntry = { status: "in_progress" | "completed"; percent: number };

/**
 * One progress signal for /learn regardless of sign-in state — reads user_progress when signed
 * in, falls back to the fa:lesson-done / fa:read:{kind}:{slug} localStorage keys when anonymous.
 * Does not itself write anything; use-progress-sync.ts's recordProgress() is still the write path.
 */
export function useUnifiedProgress() {
  const { isSignedIn, isResolved } = useAuthSession();
  const listFn = useServerFn(listMyProgress);
  const { completed: doneLessons } = useLessonProgress();

  const serverProgress = useQuery({
    queryKey: ["my-progress"],
    queryFn: () => listFn(),
    enabled: isResolved && isSignedIn,
    staleTime: 30 * 1000,
  });

  const progressByKey = useMemo(() => {
    const map = new Map<string, UnifiedProgressEntry>();

    if (isSignedIn && serverProgress.data) {
      for (const row of serverProgress.data) {
        map.set(`${row.content_kind}:${row.content_slug}`, {
          status: row.status,
          percent: row.percent,
        });
      }
      return map;
    }

    // Anonymous path: fa:lesson-done covers lessons; fa:read:{kind}:{slug} covers scroll-based
    // progress for any kind, scanned lazily here rather than duplicating collectLocalProgress's
    // full scan from use-progress-sync.ts (that one also handles the merge-on-sign-in write path;
    // this is read-only display state).
    for (const slug of doneLessons) {
      map.set(`lesson:${slug}`, { status: "completed", percent: 100 });
    }
    if (typeof localStorage !== "undefined") {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key?.startsWith("fa:read:")) continue;
        const [, , kind, ...slugParts] = key.split(":");
        const slug = slugParts.join(":");
        if (!kind || !slug) continue;
        try {
          const saved = JSON.parse(localStorage.getItem(key) ?? "null") as {
            pct: number;
          } | null;
          if (!saved) continue;
          const mapKey = `${kind}:${slug}`;
          if (map.has(mapKey)) continue; // fa:lesson-done already claimed this as completed
          const percent = Math.round(saved.pct);
          map.set(mapKey, { status: percent >= 95 ? "completed" : "in_progress", percent });
        } catch {
          // ignore malformed entry
        }
      }
    }
    return map;
  }, [isSignedIn, serverProgress.data, doneLessons]);

  return {
    progressByKey,
    isLoading: isSignedIn && serverProgress.isLoading,
  };
}
