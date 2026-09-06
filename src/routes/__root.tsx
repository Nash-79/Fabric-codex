import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import { Toaster } from "@/components/ui/sonner";
import appCss from "../styles.css?url";
import { OfflineIndicator } from "@/components/OfflineIndicator";
import { useProgressSync } from "@/lib/use-progress-sync";
import { ContentVersionWatcher } from "@/components/ContentVersionWatcher";
import { CommandPalette } from "@/components/CommandPalette";

// iOS launch (splash) image link entries. iOS Safari picks the matching file
// via `media` — CSS-pixel dimensions + device-pixel-ratio + orientation.
// Set is emitted by scripts/generate-splash (see public/splash/).
const APPLE_SPLASH: Array<{
  w: number;
  h: number;
  dw: number;
  dh: number;
  dpr: number;
  o: "portrait" | "landscape";
}> = [
  { w: 2048, h: 2732, dw: 1024, dh: 1366, dpr: 2, o: "portrait" },
  { w: 2732, h: 2048, dw: 1024, dh: 1366, dpr: 2, o: "landscape" },
  { w: 1668, h: 2388, dw: 834, dh: 1194, dpr: 2, o: "portrait" },
  { w: 2388, h: 1668, dw: 834, dh: 1194, dpr: 2, o: "landscape" },
  { w: 1640, h: 2360, dw: 820, dh: 1180, dpr: 2, o: "portrait" },
  { w: 2360, h: 1640, dw: 820, dh: 1180, dpr: 2, o: "landscape" },
  { w: 1620, h: 2160, dw: 810, dh: 1080, dpr: 2, o: "portrait" },
  { w: 2160, h: 1620, dw: 810, dh: 1080, dpr: 2, o: "landscape" },
  { w: 1536, h: 2048, dw: 768, dh: 1024, dpr: 2, o: "portrait" },
  { w: 2048, h: 1536, dw: 768, dh: 1024, dpr: 2, o: "landscape" },
  { w: 1284, h: 2778, dw: 428, dh: 926, dpr: 3, o: "portrait" },
  { w: 2778, h: 1284, dw: 428, dh: 926, dpr: 3, o: "landscape" },
  { w: 1170, h: 2532, dw: 390, dh: 844, dpr: 3, o: "portrait" },
  { w: 2532, h: 1170, dw: 390, dh: 844, dpr: 3, o: "landscape" },
  { w: 1125, h: 2436, dw: 375, dh: 812, dpr: 3, o: "portrait" },
  { w: 2436, h: 1125, dw: 375, dh: 812, dpr: 3, o: "landscape" },
  { w: 1242, h: 2688, dw: 414, dh: 896, dpr: 3, o: "portrait" },
  { w: 2688, h: 1242, dw: 414, dh: 896, dpr: 3, o: "landscape" },
  { w: 828, h: 1792, dw: 414, dh: 896, dpr: 2, o: "portrait" },
  { w: 1792, h: 828, dw: 414, dh: 896, dpr: 2, o: "landscape" },
  { w: 750, h: 1334, dw: 375, dh: 667, dpr: 2, o: "portrait" },
  { w: 1334, h: 750, dw: 375, dh: 667, dpr: 2, o: "landscape" },
];
const appleSplashLinks = APPLE_SPLASH.map(({ w, h, dw, dh, dpr, o }) => ({
  rel: "apple-touch-startup-image",
  href: `/splash/apple-splash-${w}x${h}.png`,
  media: `screen and (device-width: ${dw}px) and (device-height: ${dh}px) and (-webkit-device-pixel-ratio: ${dpr}) and (orientation: ${o})`,
}));

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function SupabaseEnvErrorView({ missing }: { missing: string[] }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-xl rounded-xl border border-border bg-card p-8 shadow-sm">
        <div className="mb-2 inline-block rounded bg-amber-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
          Backend not configured
        </div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Authentication can't start
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This deployment is missing required backend environment variables, so sign-in can't load.
        </p>

        <div className="mt-4 rounded-lg border border-amber-300/60 bg-amber-50 p-3 dark:border-amber-900/60 dark:bg-amber-950/30">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-amber-800 dark:text-amber-200">
            Missing variable{missing.length > 1 ? "s" : ""}
          </div>
          <ul className="mt-1 list-disc pl-5 text-sm text-amber-900 dark:text-amber-100">
            {missing.map((v) => (
              <li key={v}>
                <code className="rounded bg-black/10 px-1.5 py-0.5 text-[12.5px] dark:bg-white/10">
                  {v}
                </code>
              </li>
            ))}
          </ul>
        </div>

        <ol className="mt-4 list-decimal space-y-1 pl-5 text-sm text-foreground/90">
          <li>
            In the Lovable editor, open <strong>Cloud</strong> and confirm the backend is connected.
          </li>
          <li>
            Click <strong>Publish &rarr; Update</strong> to rebuild with the latest variables.
          </li>
          <li>Wait ~1 minute for the deploy, then hard-refresh this page (Ctrl/Cmd+Shift+R).</li>
        </ol>

        <p className="mt-4 text-xs text-muted-foreground">
          The variables exist in the project, but the currently published bundle was built before
          they were available. Re-publishing inlines them into the new client bundle.
        </p>

        <div className="mt-6 flex flex-wrap gap-2">
          <button
            onClick={() => location.reload()}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

function detectSupabaseEnv(error: Error): string[] | null {
  if (!/Missing Supabase environment variable/i.test(error.message)) return null;
  const after = error.message.split(":")[1] ?? "";
  const missing = after
    .split(/[,.]/)[0]
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^[A-Z_]+$/.test(s));
  return missing.length ? missing : ["SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY"];
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  const supaMissing = detectSupabaseEnv(error);

  if (supaMissing) return <SupabaseEnvErrorView missing={supaMissing} />;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

const description =
  "Source-grounded Microsoft Fabric knowledge and architecture guidance with cited claims, diagrams, and validation.";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1, viewport-fit=cover",
      },
      { title: "Fabric Atlas" },
      {
        name: "description",
        content: description,
      },
      { name: "author", content: "Fabric Atlas" },
      { property: "og:title", content: "Fabric Atlas" },
      {
        property: "og:description",
        content: description,
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "Fabric Atlas" },
      {
        name: "twitter:description",
        content: description,
      },
      { name: "theme-color", media: "(prefers-color-scheme: light)", content: "#faf9f8" },
      { name: "theme-color", media: "(prefers-color-scheme: dark)", content: "#323232" },
      { name: "application-name", content: "Fabric Atlas" },
      { name: "apple-mobile-web-app-title", content: "Fabric Atlas" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "default" },
      { name: "mobile-web-app-capable", content: "yes" },
    ],

    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;600&family=Source+Serif+4:ital,opsz,wght@0,8..60,200..900;1,8..60,200..900&display=swap",
      },
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", type: "image/png", sizes: "192x192", href: "/icon-192.png" },
      { rel: "icon", type: "image/png", sizes: "512x512", href: "/icon-512.png" },
      { rel: "apple-touch-icon", sizes: "180x180", href: "/apple-touch-icon.png" },
      { rel: "manifest", href: "/manifest.webmanifest" },
      // iOS launch (splash) images — one per supported device/orientation.
      // Each media query pins the file to that device's CSS-pixel size + DPR.
      ...appleSplashLinks,
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var s=localStorage.getItem('fa.theme')||localStorage.getItem('fa-theme')||'system';var d=s==='dark'||(s!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);document.documentElement.dataset.theme=d?'dark':'light';document.documentElement.dataset.themeChoice=s;}catch(e){document.documentElement.dataset.theme='light'}",
          }}
        />

        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();
  // Drives the merge-on-sign-in + offline-queue-flush machinery (D3, WP1.2) for the whole app.
  // Mounted once here so it runs regardless of which page loaded first; leaf components (e.g.
  // MarkLessonCompleteButton) call their own useProgressSync() for recordProgress() — cheap to
  // re-invoke since the merge is stamp-guarded and the effects are idempotent.
  useProgressSync();

  // Register the app-shell service worker once. The wrapper itself refuses to
  // register (and cleans up) in dev, iframes, and Lovable preview hosts.
  useEffect(() => {
    void import("../lib/register-sw").then((m) => m.registerServiceWorker());
  }, []);

  useEffect(() => {
    let cancelled = false;
    // Async import so the tracker + observers never enter the SSR graph.
    void import("../lib/perf-tracker").then((m) => {
      if (cancelled) return;
      m.installPerfTracker();
      // Route load timings via router lifecycle.
      const starts = new Map<string, number>();
      const unsubStart = router.subscribe("onBeforeNavigate", (e) => {
        starts.set(e.toLocation.href, performance.now());
      });
      const unsubEnd = router.subscribe("onResolved", (e) => {
        const t0 = starts.get(e.toLocation.href);
        if (t0 !== undefined) {
          starts.delete(e.toLocation.href);
          m.recordPerf({
            kind: "route",
            name: e.toLocation.pathname,
            ms: Math.round(performance.now() - t0),
          });
        }
      });
      (window as any).__faPerfCleanup = () => {
        unsubStart();
        unsubEnd();
      };
    });
    return () => {
      cancelled = true;
      (window as any).__faPerfCleanup?.();
    };
  }, [router]);

  return (
    <QueryClientProvider client={queryClient}>
      {/* Stale-content guard: drops cached articles/prev-next when the server stamp moves.
          Must live *inside* the provider — it uses the query client. */}
      <ContentVersionWatcher />
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <OfflineIndicator />
      <CommandPalette />
      <Outlet />
      <Toaster />
    </QueryClientProvider>
  );
}
