import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import { toast } from "sonner";
import { contentVersionQO, invalidateContentQueries } from "@/lib/content-version";

/**
 * Watches the server-side content stamp and drops stale content caches when it moves.
 *
 * Article bodies are cached for 30 minutes so Prev/Next feels instant; this is what keeps
 * that from ever serving content the publisher has since replaced. Readers mid-article get
 * a non-blocking "updated" toast rather than having the body swapped under their scroll.
 */
export function useContentVersionWatcher() {
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { data } = useQuery({
    ...contentVersionQO,
    // Slow background heartbeat; paused automatically while the tab is hidden.
    refetchInterval: 5 * 60_000,
    refetchIntervalInBackground: false,
  });
  const stamp = data?.ok ? data.stamp : "";
  const seen = useRef<string | null>(null);
  const path = useRef(pathname);
  path.current = pathname;

  useEffect(() => {
    if (!stamp) return;
    if (seen.current === null) {
      seen.current = stamp;
      return;
    }
    if (seen.current === stamp) return;
    seen.current = stamp;
    invalidateContentQueries(queryClient);
    if (/^\/blogs\/[^/]+\/[^/]+/.test(path.current)) {
      toast("This content was updated", {
        description: "Reload to see the latest version.",
        action: { label: "Reload", onClick: () => window.location.reload() },
        duration: 12_000,
      });
    }
  }, [stamp, queryClient]);
}
