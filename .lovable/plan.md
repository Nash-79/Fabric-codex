## Goal
Make in-article diagrams feel interactive and inspectable, and lift article pages toward a real editorial/magazine feel with stronger responsive typography and contrast.

## 1. Diagram interactivity (`src/components/DiagramLightbox.tsx`)

Inline figure (in-flow):
- Keep aspect-ratio reservation (no scroll shake).
- Add a small persistent hint chip: `⤢ Zoom · drag to pan` (visible on touch, fades on desktop hover-out).
- Add a caption bar under the image with auto figure number ("Figure N") + optional descriptive caption, using semantic `<figcaption>`. Numbers come from `ContentItemArticle` counter (already numbered), we just render richer markup.
- Long captions become expandable ("Show more") past 2 lines on mobile.

Lightbox (open state):
- Replace bare `TransformWrapper` with one exposing controls via its `{ zoomIn, zoomOut, resetTransform, centerView }` render prop.
- Top-right toolbar: Zoom In, Zoom Out, Reset (100%), Fullscreen toggle, Close. Buttons use `Button` variant `ghost` with visible focus ring and 44px hit target for touch.
- Live zoom % readout ("120%") in the toolbar.
- Fullscreen: uses the Fullscreen API on the DialogContent element; on unsupported browsers, falls back to a CSS "cover viewport" mode (fixed inset-0, z-100).
- Pinch-to-zoom + wheel zoom already provided by lib; enable `wheel: { step: 0.15 }`, `pinch: { step: 5 }`, `doubleClick: { mode: "zoomIn", step: 0.7 }`.
- Keyboard: `+` / `-` zoom, `0` reset, `f` fullscreen, `Esc` closes (Dialog default).
- Caption bar at bottom of lightbox now shows Figure N + caption + alt as accessible description; scroll if long.
- Focus trap and initial focus land on the Reset button; announce open via `aria-label` on Dialog.

No new deps; `react-zoom-pan-pinch` already installed.

## 2. Article typography & layout (`src/components/ContentItemArticle.tsx`, `src/styles.css`)

Responsive type scale (fluid, using `clamp()` tokens defined in `styles.css`):
- Body: `clamp(1rem, 0.95rem + 0.3vw, 1.1875rem)` at line-height 1.7, max measure `68ch` (was ~65).
- H1: `clamp(2rem, 1.6rem + 2.4vw, 3.25rem)`, tracking `-0.02em`.
- H2: `clamp(1.5rem, 1.25rem + 1.2vw, 2.125rem)` with a thin teal rule above and generous top margin for section rhythm.
- H3: `clamp(1.15rem, 1.05rem + 0.4vw, 1.35rem)`, uppercase-eyebrow variant on `## Internals` sub-headings.
- Small caps + tracked labels for figure numbers and pull-quote attributions.

Contrast & color:
- Bump muted-foreground token to reach WCAG AA on card/background (verify in both light/dark — adjust in `:root` and `.dark` blocks in `src/styles.css`).
- Links: underline with `text-underline-offset: 4px`, teal on hover with 3px offset; visited state differentiated in dark mode.
- Inline `code` gets a subtle border + tinted bg, monospace with `font-variant-ligatures: none`.
- Blockquotes become pull-quotes with a large opening glyph, italic serif display font already loaded via root `<link>`; left teal accent bar 3px.

Magazine layout:
- Wrap article in a 12-col grid on `lg:`: main column `col-span-8`, right rail `col-span-3 col-start-10` reserved for `ContentTocSidebar` and metadata card. Below `lg` collapses to single column.
- Add a compact "article meta strip" at top: reading time, updated date, capability chips, source-tier dots. Sticky on scroll on desktop only.
- Lead paragraph: kept drop cap, but now also `font-medium` + slightly larger to signal lede.
- Section dividers (`<hr>`) render as a centered ornament (3 dots).
- Figures span slightly past the text column on `xl:` (`xl:-mx-8`) for a real magazine feel; captions stay text-column width.
- Tables get horizontal scroll wrapper + zebra rows, sticky header.

Motion:
- `prefers-reduced-motion`: disable hover transforms and the lightbox open animation.

## 3. Files touched

- `src/components/DiagramLightbox.tsx` — controls toolbar, fullscreen, keyboard, richer caption.
- `src/components/ContentItemArticle.tsx` — meta strip, grid wrapper, figure numbering markup, pull-quote/hr styling hooks.
- `src/styles.css` — fluid type tokens, prose overrides, blockquote/hr/code/table styles, contrast token bumps.
- (No changes to routes, data model, PDF export, or MCP.)

## Out of scope
- No changes to backend, claims schema, PDF export pipeline, or reading-progress hook.
- No new npm dependencies.
