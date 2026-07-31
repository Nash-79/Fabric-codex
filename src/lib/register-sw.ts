// Single, guarded registrar for the generated app-shell service worker (/sw.js).
//
// Service workers are browser-held state: a worker registered inside the Lovable
// editor preview (or in dev) can keep serving stale HTML and deleted chunks long
// after the code changed. So registration is refused — and any existing
// registration actively removed — in every non-production/preview context, plus
// via an explicit `?sw=off` kill switch.

const SW_URL = "/sw.js";

function isRefusedContext(): boolean {
  if (typeof window === "undefined") return true;
  if (!import.meta.env.PROD) return true;

  // Inside an iframe → Lovable preview surface.
  try {
    if (window.self !== window.top) return true;
  } catch {
    return true;
  }

  const { hostname, search } = window.location;
  if (new URLSearchParams(search).has("sw")) {
    if (new URLSearchParams(search).get("sw") === "off") return true;
  }
  if (hostname.startsWith("id-preview--") || hostname.startsWith("preview--")) return true;
  const previewHosts = ["lovableproject.com", "lovableproject-dev.com", "beta.lovable.dev"];
  if (previewHosts.some((h) => hostname === h || hostname.endsWith(`.${h}`))) return true;

  return false;
}

async function unregisterAppWorker() {
  if (!("serviceWorker" in navigator)) return;
  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.allSettled(
      registrations
        .filter((r) => {
          const url = r.active?.scriptURL ?? r.waiting?.scriptURL ?? r.installing?.scriptURL ?? "";
          return url.endsWith(SW_URL);
        })
        .map((r) => r.unregister()),
    );
  } catch {
    /* nothing actionable — never break the page over SW cleanup */
  }
}

export function registerServiceWorker() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

  if (isRefusedContext()) {
    void unregisterAppWorker();
    return;
  }

  void navigator.serviceWorker.register(SW_URL, { scope: "/" }).catch(() => {
    /* registration failures are non-fatal: the app works fine online */
  });
}
