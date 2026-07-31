// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/tanstack/vite";
import { VitePWA } from "vite-plugin-pwa";

// @lovable.dev/mcp-js 0.20.0 compares Windows-resolved child paths with a
// forward-slash project root during its containment check. The generated MCP
// routes are committed already, so disabling only that code-generating plugin
// on Windows restores local dev/build without removing the MCP routes.
const mcpPlugins = process.platform === "win32" ? [] : [mcpPlugin()];

// App-shell service worker. Registration is owned solely by src/lib/register-sw.ts
// (injectRegister: null), which refuses to register in dev/preview/iframe contexts.
const pwaPlugin = VitePWA({
  registerType: "autoUpdate",
  injectRegister: null,
  filename: "sw.js",
  // Multi-environment (client + nitro server) build: pin the plugin to the
  // client output, otherwise it globs `dist/` and precaches server bundles too.
  outDir: "dist/client",
  devOptions: { enabled: false },
  // public/manifest.webmanifest is hand-maintained — don't emit a second one.
  manifest: false,
  workbox: {
    globPatterns: ["**/*.{js,css,woff,woff2}"],
    // The diagram lightbox chunk (Mermaid + Shiki) exceeds Workbox's 2 MiB default.
    maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
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

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    plugins: [...mcpPlugins, ...(process.env.NODE_ENV === "production" ? [pwaPlugin] : [])],
  },
});
