import * as React from "react";
import { WifiOff } from "lucide-react";

/**
 * Shown only while the browser reports no connection. Previously-visited
 * articles, diagrams and assets are served from the service worker cache,
 * so reading can continue — this just makes that state legible.
 */
export function OfflineIndicator() {
  const [offline, setOffline] = React.useState(false);

  React.useEffect(() => {
    const sync = () => setOffline(!navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  if (!offline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 top-0 z-[60] flex items-center justify-center gap-2 border-b border-amber-400/30 bg-amber-500/15 px-3 py-1.5 text-xs text-amber-200 backdrop-blur"
    >
      <WifiOff className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>You&rsquo;re offline — pages you&rsquo;ve already opened are still available.</span>
    </div>
  );
}
