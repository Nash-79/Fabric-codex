import { queryOptions, type QueryClient } from "@tanstack/react-query";
import { getContentVersion } from "@/lib/atlas.functions";

export const CONTENT_VERSION_KEY = ["content-version"] as const;

/** Cached briefly and refetched on focus/reconnect — this is the invalidation heartbeat. */
export const contentVersionQO = queryOptions({
  queryKey: CONTENT_VERSION_KEY,
  queryFn: () => getContentVersion(),
  staleTime: 60_000,
  gcTime: 5 * 60_000,
  refetchOnWindowFocus: true,
  refetchOnReconnect: true,
});

/** Query key families that hold reader-facing content and must drop on a new stamp. */
export const CONTENT_QUERY_FAMILIES = [
  "content-item",
  "content-items",
  "content-siblings",
  "home-content-items",
  "home-topics",
  "home-sources",
  "home-capabilities",
  "home-claim-counts",
  "home-diagrams",
  "home-roadmap",
  "topics",
  "topic",
  "sources",
  "diagram-coverage",
] as const;

/** Read the current stamp without subscribing — used to scope query keys in loaders. */
export function currentStamp(queryClient: QueryClient): string {
  const data = queryClient.getQueryData<{ stamp: string }>(CONTENT_VERSION_KEY);
  return data?.stamp || "0";
}

export function invalidateContentQueries(queryClient: QueryClient) {
  for (const family of CONTENT_QUERY_FAMILIES) {
    void queryClient.invalidateQueries({ queryKey: [family] });
  }
}

/** Bump after a publish: refetch the stamp, then drop every content cache. */
export async function refreshContentVersion(queryClient: QueryClient) {
  await queryClient.invalidateQueries({ queryKey: CONTENT_VERSION_KEY });
  invalidateContentQueries(queryClient);
}
