## Goal
Make it easy to move around long articles (prev/next section + diagram navigator), harden a11y on the diagram lightbox controls/captions, and make touch pinch/swipe feel native inside the lightbox.

## 1. Mini TOC with section + diagram jump (`src/components/ContentTocSidebar.tsx`)

Extend the existing sidebar to a "reading navigator" that lists both `##` headings and every diagram figure, and adds prev/next section arrows.

- Extend `useTocHeadings` output to also return a **`Figure N — caption`** entry per diagram (derive by scanning `bodyMd` for image references, in document order). Each figure gets an id assigned to the `<figure>` in `DiagramLightbox` (`figure-1`, `figure-2`, …) via a small `figureIndexContext` so the sidebar anchor targets exist.
- Entries render with an icon prefix (heading = `Hash`, figure = `Image` from lucide) and stay keyboard-focusable.
- Sidebar header adds a "Prev section / Next section" arrow pair that scrolls to the previous/next active anchor. Buttons have `aria-label="Previous section"`/`"Next section"` and disable at bounds. Also wired to keyboard shortcuts `J` (next) and `K` (previous), gated by `!e.target instanceof HTMLInputElement`.
- Uses `scrollIntoView({ behavior: "smooth", block: "start" })`, respecting `prefers-reduced-motion` (falls back to `auto`).
- Active detection already exists; extend to also mark the currently-visible figure.
- Nav is wrapped in `<nav aria-label="Article contents">`.

## 2. Figure ids in the article (`src/components/ContentItemArticle.tsx`, `src/components/DiagramLightbox.tsx`)

- Introduce a simple counter context (`FigureCounterProvider`) placed in `ContentItemArticle`; each `DiagramLightbox` reads its 1-based index and applies `id={"figure-" + index}` on the wrapping `<figure>`. This gives the TOC and prev/next stable anchor targets and preserves the existing CSS `counter-increment: article-figure` numbering.

## 3. Accessibility for the lightbox (`src/components/DiagramLightbox.tsx`)

Controls:
- Toolbar becomes `<div role="toolbar" aria-label="Diagram zoom controls" aria-orientation="horizontal">`.
- All icon buttons already have `aria-label` — keep them; add `aria-pressed` on the fullscreen toggle to reflect state.
- The live zoom percentage stays `aria-live="polite"` but with `aria-atomic="true"` and a hidden verbose label ("Zoom level 120 percent"). The visible "120%" text remains for sighted users.
- On dialog open, focus lands on the "Reset zoom" button (via `onOpenAutoFocus` already implemented — point it at a ref).
- On dialog close, focus returns to the figure trigger button (Radix handles this by default; ensure the trigger button gets the ref).
- Keyboard shortcuts get announced via a visually-hidden helper region ("Keyboard shortcuts: plus and minus to zoom, zero to reset, F for full-screen, Escape to close").

Captions & screen readers:
- Inline `<figure>` uses `aria-labelledby` pointing at the caption `<figcaption id="fig-N-caption">` so AT reads it with the image. Fallback to `aria-label={alt}` when no caption is present.
- Inside the lightbox, the image gets `aria-describedby` referencing a visually-hidden `<p>` that contains the full caption + alt, ensuring screen-reader access even when the visible caption bar is styled decoratively. The DialogTitle stays `sr-only` but now includes "Diagram: <alt>" for a clearer landmark.
- The pan/scroll hint chip gets `role="note"` and `aria-hidden="true"` (redundant with the announced shortcut list).

## 4. Touch pinch + swipe pan (`src/components/DiagramLightbox.tsx`)

`react-zoom-pan-pinch` already supports pinch and pan; make it feel right on mobile:

- Pass `pinch={{ step: 5, disabled: false }}` and `panning={{ velocityDisabled: false, disabled: false, allowLeftClickPan: true, allowMiddleClickPan: false, allowRightClickPan: false }}`.
- Enable inertia/velocity for post-swipe glide (`velocityAnimation: { sensitivity: 1, animationTime: 300 }`).
- Add double-tap to zoom in (already `doubleClick: { mode: "zoomIn", step: 0.7 }`) — mobile-friendly.
- Set `touch-action: none` on the transform wrapper so the browser doesn't hijack pinch as page zoom.
- Add a `data-touch-fullscreen` class that removes body scroll while the lightbox is open (already handled by Radix Dialog on desktop but reinforce with `overscroll-behavior: contain` on the lightbox root to stop the pull-to-refresh gesture eating swipes).
- Keep pointer-event drag on desktop (mouse) and touch panning on phones — the library already routes both; the fix is just enabling the settings above and adding `touch-action`.
- Two-finger swipe when zoomed remains pan; single-finger pan enabled whenever `scale > 1`; when `scale === 1`, a horizontal swipe closes the lightbox (mobile UX affordance). Implement via a small `onPanning` handler that, when scale ≈ 1 and horizontal delta > 80px, calls `onClose()`.

## 5. Files touched

- `src/components/ContentTocSidebar.tsx` — figures in list, prev/next controls, keyboard shortcuts.
- `src/components/ContentItemArticle.tsx` — `FigureCounterProvider` wrap; pass caption + alt through.
- `src/components/DiagramLightbox.tsx` — figure id from context, a11y roles/labels/live regions, `aria-labelledby`, touch tuning, swipe-to-close, sr-only shortcut helper.
- (No route file, no data-layer changes — `##` headings + figures are derived client-side from `body_md`.)

## Out of scope
- Cross-article prev/next (going from one blog to another) — the current route doesn't preload siblings and that would require a new server query. Can be a follow-up.
- Reordering the layout / adding a floating mobile TOC drawer.
- Changes to reading-progress or PDF export.
