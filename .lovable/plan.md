## Goal

Repeat visits to Fabric Atlas load from cache, and previously-read articles/diagrams stay readable without a connection — without ever breaking the Lovable preview or serving stale HTML.

## What gets built

**1. Generated service worker (`vite-plugin-pwa`, `generateSW`)**
- Add `vite-plugin-pwa` and wire it in `vite.config.ts` via `vite.plugins` (alongside the existing MCP plugin).
- `registerType: "autoUpdate"`, filename `/sw.js`, `devOptions.enabled: false`, `injectRegister: null` (our wrapper is the only registrar).
- Existing `public/manifest.webmanifest` and icons stay as-is; the plugin will not replace them.

**2. Caching strategy**
| Content | Strategy |
| --- | --- |
| HTML navigations (`/`, `/blogs/...`) | `NetworkFirst` with a short timeout, so fresh content wins but offline falls back to cache |
| Built JS/CSS/font assets (hashed, same-origin) | `CacheFirst` |
| `/diagrams/*.svg` and images | `StaleWhileRevalidate`, capped entry count + 30-day expiry |
| Supabase/API requests, `/api/*`, `/.mcp*`, `/~oauth`, `/dev/*` | excluded — never cached |

Navigation fallback excludes `/~oauth`, `/api/`, `/.mcp`, `/.well-known`.

**3. Guarded registration wrapper (`src/lib/register-sw.ts`)**
Registration is refused (and any existing `/sw.js` registration unregistered) when any of:
- not `import.meta.env.PROD`
- running inside an iframe
- hostname starts `id-preview--` / `preview--`
- hostname is/ends with `lovableproject.com`, `lovableproject-dev.com`, `beta.lovable.dev`
- URL contains `?sw=off` (kill switch)

Called once from `src/routes/__root.tsx` inside an effect.

**4. Offline affordance**
A small offline indicator in the header area when `navigator.onLine` is false, noting that already-visited articles remain available. No layout or content restructuring.

## Notes

- Offline behaviour only applies to the **published** site (`fabric-atlas.lovable.app`); it is intentionally disabled in the Lovable editor preview and dev.
- Article HTML is `NetworkFirst`, never cache-first, so publishing new content never strands readers on an old version.
- No changes to data fetching, TanStack Query caching, PDF/HTML export, or the KB/publish pipeline.
