import { useContentVersionWatcher } from "@/hooks/useContentVersionWatcher";

/** Renders nothing; exists so the watcher hook runs inside the QueryClientProvider. */
export function ContentVersionWatcher() {
  useContentVersionWatcher();
  return null;
}
