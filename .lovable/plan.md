## Problem

Articles and prev/next data are cached aggressively for instant navigation (30-minute `staleTime`, 60-minute `gcTime` in `src/routes/blogs/$kind.$slug.tsx`), plus a service-worker page cache and TanStack Router preloading. Verified in code: nothing currently invalidates those caches when content is published. So after a publish, a reader with an open tab (or a tab restored from bfcache) can keep seeing an old body, an old prev/next order, or a diagram that has since been replaced, for up to 30 minutes — and the publishing admin sees it too, since `PublishPanel` runs its mutations without any `invalidateQueries`.

## Approach: one cheap version stamp, everything keys off it

Add a single server-side "content version" — the newest `updated_at` across published content plus a row count — and use it as the invalidation signal everywhere. Cheap to compute, no new table, no polling of full article payloads.

1. **`getContentVersion` server function** (`src/lib/atlas.functions.ts`): returns `{ stamp }` built from `max(updated_at)` and `count` over `content_items` (published/active) and `diagrams`. Two indexed aggregate queries, no body columns.

2. **Client version watcher** (`src/lib/content-version.ts` + a hook mounted in `__root.tsx`): queries `getContentVersion` with a short `staleTime` (~60s), refetching on window focus, on regaining connectivity, and on a slow interval while the tab is visible. When the stamp differs from the last-seen one, it invalidates the content query families — `content-item`, `content-siblings`, `content-items`, `home-content-items`, `topics`, `home-*`, `diagram-*` — so the next render refetches. This is the piece that makes stale data self-heal without shortening `staleTime` and losing the instant-navigation win.

3. **Version-scoped query keys for article data**: append the stamp to `content-item` / `content-siblings` keys so a new stamp produces a genuinely new cache entry rather than relying only on invalidation, and old entries age out via `gcTime`. The route loader reads the stamp from the query client (falling back to `"0"` during SSR/prerender, which stays correct because the watcher reconciles on hydration).

4. **Immediate invalidation on publish**: `PublishPanel` publish / publish-all mutations invalidate the content families and refetch the stamp on success, so the admin who just published sees the new content instantly instead of waiting for the watcher tick.

5. **Service-worker page cache**: on a controller change / new SW activation, delete the `fa-pages` runtime cache from `src/lib/register-sw.ts`, so a deploy can't serve a stale prerendered article shell. The `NetworkFirst` handler already prefers the network, so this only affects the offline-fallback copy.

6. **A "new version available" nudge**: when the watcher detects a change while the reader is on an article, show a small non-blocking toast ("This article was updated — Reload") rather than swapping the body under the reader's cursor mid-scroll, which would break reading-position restore. Background list/home data refreshes silently.

## Technical notes

- No schema change. The stamp is derived, so it also covers content published via `scripts/import_content.py` or any out-of-band write, not just in-app publishes.
- Falls back safely: if `getContentVersion` errors (bundled-content fallback path, offline), the watcher keeps the last known stamp and changes nothing — caching behaves exactly as it does today.
- Tests: unit-test stamp derivation and the "stamp changed → these key families are invalidated" mapping.

## Out of scope

Server-side HTTP caching headers/ETags for SSR documents, and changing the 30-minute `staleTime` itself.
