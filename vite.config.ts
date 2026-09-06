import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { VitePWA } from "vite-plugin-pwa";
import { loadEnv } from "vite";
import { fileURLToPath } from "node:url";

// Hand-rolled replacement for @lovable.dev/vite-tanstack-config.
//
// That package composed the plugins below and is the last hard Lovable build dependency. It is
// replicated rather than approximated -- plugin ORDER matters (tailwind before tanstackStart
// before nitro before react), and so do the dedupe list and the import.meta.env define pass.
// Everything here was read off the package's own dist/index.js so behaviour matches:
//
//   plugins:      tailwindcss -> tsConfigPaths -> tanstackStart -> nitro (build only) -> viteReact
//   resolve:      "@" -> ./src, and a dedupe list that keeps React/TanStack single-instance
//   optimizeDeps: React entrypoints pre-bundled
//   css:          lightningcss transformer
//   define:       every VITE_* var inlined as import.meta.env.X
//   server:       host "::", port 8080
//
// Deliberately NOT carried over: the Lovable sandbox branches (dev-server bridge, HMR gate,
// asset proxy, build diagnostics, the dist/ output override). Those only activated inside
// Lovable's own environment. Nitro's default output (.output/) is what wrangler.jsonc expects.

const projectRoot = fileURLToPath(new URL(".", import.meta.url));

// App-shell service worker. Registration is owned solely by src/lib/register-sw.ts
// (injectRegister: null), which refuses to register in dev/preview/iframe contexts.
const pwaPlugin = VitePWA({
  registerType: "autoUpdate",
  injectRegister: null,
  filename: "sw.js",
  // Multi-environment (client + nitro server) build: pin the plugin to the client output,
  // otherwise it globs the whole build dir and precaches server bundles too.
  //
  // This is `.output/public`, NOT `dist/client`. `dist/` was the Lovable sandbox's output
  // override; outside that sandbox nitro emits to `.output/`, so a `dist/client` target wrote
  // sw.js somewhere the deployed Worker never serves -- a silently missing service worker.
  outDir: ".output/public",
  devOptions: { enabled: false },
  // public/manifest.webmanifest is hand-maintained — don't emit a second one.
  manifest: false,
  workbox: {
    // Keep the precache small (CSS + fonts + icons). JS chunks are large and
    // route-specific, so they are cached on demand by the CacheFirst rule below.
    globPatterns: ["**/*.{css,woff,woff2}", "icon-*.png", "manifest.webmanifest"],
    maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
    navigateFallback: "/",
    navigateFallbackDenylist: [
      /^\/api\//,
      /^\/~oauth/,
      /^\/\.mcp/,
      /^\/\.well-known/,
      /^\/dev\//,
      /^\/sw\.js$/,
    ],
    cleanupOutdatedCaches: true,
    clientsClaim: true,
    skipWaiting: true,
    runtimeCaching: [
      {
        // HTML documents: always try the network first so freshly published
        // articles win; fall back to cache only when the network is unavailable.
        urlPattern: ({ request, url }: any) =>
          request.mode === "navigate" &&
          url.origin === self.location.origin &&
          !url.pathname.startsWith("/api/") &&
          !url.pathname.startsWith("/~oauth") &&
          !url.pathname.startsWith("/.mcp") &&
          !url.pathname.startsWith("/dev/"),
        handler: "NetworkFirst",
        options: {
          cacheName: "fa-pages",
          networkTimeoutSeconds: 4,
          expiration: { maxEntries: 80, maxAgeSeconds: 60 * 60 * 24 * 14 },
          cacheableResponse: { statuses: [200] },
        },
      },
      {
        // Hashed build assets are immutable.
        urlPattern: ({ url, request }: any) =>
          url.origin === self.location.origin &&
          /^\/(_build|assets)\//.test(url.pathname) &&
          ["script", "style", "font"].includes(request.destination),
        handler: "CacheFirst",
        options: {
          cacheName: "fa-assets",
          expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 60 },
          cacheableResponse: { statuses: [0, 200] },
        },
      },
      {
        // Diagrams + images: instant from cache, refreshed in the background.
        urlPattern: ({ url, request }: any) =>
          url.origin === self.location.origin &&
          (request.destination === "image" || url.pathname.startsWith("/diagrams/")),
        handler: "StaleWhileRevalidate",
        options: {
          cacheName: "fa-media",
          expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
          cacheableResponse: { statuses: [0, 200] },
        },
      },
      {
        urlPattern: ({ url }: any) =>
          url.origin === "https://fonts.googleapis.com" ||
          url.origin === "https://fonts.gstatic.com",
        handler: "StaleWhileRevalidate",
        options: {
          cacheName: "fa-fonts",
          expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
          cacheableResponse: { statuses: [0, 200] },
        },
      },
    ],
  },
});

export default defineConfig(({ mode, command }) => {
  // Inline VITE_* at build time. TanStack Start reads these in code that runs on both sides,
  // and the Worker has no import.meta.env of its own, so they must be baked in.
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const define = Object.fromEntries(
    Object.entries(env).map(([key, value]) => [`import.meta.env.${key}`, JSON.stringify(value)]),
  );

  return {
    define,
    css: { transformer: "lightningcss" },
    resolve: {
      alias: { "@": `${projectRoot}src` },
      // Two copies of React (or of the query client) break hooks and cache identity at runtime.
      dedupe: [
        "react",
        "react-dom",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
        "@tanstack/react-query",
        "@tanstack/query-core",
      ],
    },
    optimizeDeps: {
      include: [
        "react",
        "react-dom",
        "react-dom/client",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
      ],
    },
    server: { host: "::", port: 8080 },
    plugins: [
      tailwindcss(),
      tsConfigPaths({ projects: ["./tsconfig.json"] }),
      tanstackStart({
        // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
        server: { entry: "server" },
        // Keep server-only modules out of the client graph, and fail the build rather than warn.
        importProtection: {
          behavior: "error",
          client: { files: ["**/server/**"], specifiers: ["server-only"] },
        },
      }),
      // Nitro is a build-time concern only; running it in `serve` breaks the dev server.
      ...(command === "build" ? [nitro({ preset: "cloudflare-module" })] : []),
      viteReact(),
      ...(mode === "production" ? [pwaPlugin] : []),
    ],
  };
});
