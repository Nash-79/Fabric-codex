## Performance review — what's slow and why

I audited the router, loaders, server functions, home page, and article route. The app is generally healthy (SSR + TanStack Query with a 5-minute `staleTime`, `scrollRestoration`, siblings prefetched), but there are a few concrete bottlenecks that account for most of the "long time to load" and "slow switching" feel.

### Findings

1. **Home page fetches 7 datasets serially-in-parallel before first paint.** `src/routes/index.tsx` `ensureQueryData`s topics, sources, capabilities, claim counts, diagrams, *all* content items, and roadmap — all blocking the render. `listContentItems({})` with no filter pulls every article/design/lesson row (with `presentation_profile` JSON) just to compute a count and a 5-item list.
2. **`listContentItems` is called with `select("*")`-adjacent wide columns** and no pagination. On the home page and topic pages, only `id/kind/slug/title/summary/updated_at` are actually read — the extra JSON columns bloat the SSR payload and slow hydration.
3. **No HTTP caching on public server functions.** `listTopics`, `listCapabilities`, `listSources`, `listRoadmapItems`, `listDiagrams`, `listContentItems` are pure public reads but return no `Cache-Control`, so every SSR hit and every client navigation re-queries Supabase.
4. **Article route blocks on siblings.** `/blogs/$kind/$slug` awaits `getContentItem` + `topicsQO` + `getContentSiblings` together. Siblings are a "nice to have" for prev/next — they don't need to block first paint.
5. **`ContentItemArticle` (579 lines, ships shiki/markdown/mermaid stack) is bundled into every route that imports it.** No `React.lazy` for the heavy renderers (mermaid, shiki highlighter, PDF export in `export-pdf.ts` with jspdf+html2canvas-pro). PDF export code is loaded eagerly with the article even though it's only used on click.
6. **`UpdatesMarquee` animates on the home hero even when scrolled off-screen** and receives full article/source/roadmap arrays.
7. **Router `defaultPreloadStaleTime: 60 * 1000`** but no `defaultPreload: "intent"` — hover-preload is off, so switching pages always waits for a fresh RPC round-trip.
8. **No DB indexes verified** for `content_items(status, active, updated_at desc)` used by every list query, or `content_item_sources(content_item_id, position)`.

### Plan (grouped by impact)

**A. Cut home-page time-to-interactive**
- Split home loader: `ensureQueryData` only for topics + capabilities + claim counts (spine). `prefetchQuery` (unawaited) for sources, diagrams, roadmap, content items so they stream in.
- Add a paginated variant: `listContentItems({ limit: 20 })` for the home feed; keep the full list only where it's actually needed (blogs index).
- Trim `listContentItems` default `select` to the fields the list views use; drop `presentation_profile`/`lesson_meta` from the list payload and add a separate `listFeaturedContentItems` for the featured card.

**B. Faster navigation between pages**
- Enable `defaultPreload: "intent"` in `src/router.tsx` so hovering a link prefetches loader data.
- Move `siblingsQO` out of the blocking `Promise.all` in `/blogs/$kind/$slug` (prefetch, don't await); render sibling nav with its own `Suspense` fallback so the article body paints immediately.

**C. Smaller article bundle**
- `React.lazy` for `AdvisorMermaidBlock`, `CodeBlock` (shiki), and the PDF/HTML export triggers inside `ContentItemArticle.tsx` / `PrintButton.tsx`. Wrap in `Suspense` with a lightweight placeholder.
- Dynamic-import `jspdf` and `html2canvas-pro` inside the click handler in `src/lib/export-pdf.ts` (not at module top), so no reader pays for the PDF pipeline until they use it.

**D. Cache public reads at the edge**
- Add `Cache-Control: public, s-maxage=60, stale-while-revalidate=600` (via `setResponseHeaders` inside each handler) to `listTopics`, `listCapabilities`, `listSources`, `listRoadmapItems`, `listDiagrams`, `listClaimCountsByCapability`, and the default `listContentItems` shape. Keep authenticated/admin reads untouched.

**E. DB indexes (one migration)**
- `create index if not exists content_items_published_updated_idx on content_items (status, active, updated_at desc) where status='published' and active=true;`
- `create index if not exists content_item_sources_item_pos_idx on content_item_sources (content_item_id, position);`
- Verify existing indexes on `topics(parent_slug, sort_order)` and `content_items(topic_slug)` / `(capability_id)`; add any that are missing.

**F. Small polish**
- Pause `UpdatesMarquee` animation via `IntersectionObserver` when off-screen.
- Add `loading="lazy"` + `decoding="async"` + fixed `width`/`height` to the home featured diagram `<img>` and capability preview `<img>` to remove residual CLS.

### Verification

- Playwright: cold-load `/`, `/blogs`, and one long article (`/blogs/article/spark-sql-expert`); record `performance.timing` (TTFB, DCL, LCP) before/after.
- Bundle: run `vite build` and diff the article chunk size before/after lazy splits.
- Network: confirm `Cache-Control` headers on the six public server functions.
- Supabase: `explain analyze` the two indexed queries.

### Out of scope (call out, don't do)

- No visual redesign, no copy changes, no auth/RLS changes.
- Won't touch generated Supabase clients or `src/routeTree.gen.ts`.
- PDF/HTML output shape unchanged — only *when* the code loads changes.

Approve and I'll implement A–F in that order, verifying after each group.
