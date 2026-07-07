Make articles feel like a proper blog: stable scrolling, resumable reading, richer typography, and a reliable PDF that keeps diagrams and layout.

## 1. Stop the "shaking" while scrolling

Root cause: diagram `<img>` tags in `DiagramLightbox` have no intrinsic width/height, and use `loading="lazy"`. As each image resolves, it pushes content down (CLS), which on mobile reads as jitter. The sticky progress bar + hover-scale on the button add to it.

- In `DiagramLightbox.tsx`: reserve space with `aspect-ratio` (probe natural size once via `onLoad`, cache in a small module map keyed by src), fall back to `aspect-[16/9]` until known. Remove hover transform on the outer button (keep only border/shadow color change) so the row doesn't wiggle when the cursor drifts.
- Switch `loading="lazy"` to `loading="eager"` for the first diagram, `lazy` for the rest, and add `decoding="async"` + `fetchpriority="high"` on the first.
- Ensure `figure` has a fixed `min-height` derived from aspect-ratio so mobile Safari doesn't reflow mid-scroll.

## 2. "Where did I leave off?" resume + progress

- New `useReadingProgress(slug)` hook: throttled scroll listener writes `{scrollY, pct, updatedAt}` to `localStorage` under `fa:read:<kind>:<slug>`.
- On mount of `blogs/$kind.$slug.tsx`, if a saved position exists and is >10% and <95%, show a small floating "Resume reading (42%)" pill bottom-right for ~6s; click restores scroll with smooth behavior. Dismisses on scroll.
- Add a persistent "last read" left-margin tick next to the nearest heading (thin teal bar) so users can visually spot where they stopped.
- Highlight the active ToC entry (IntersectionObserver on `h2/h3` ids) in `ContentTocSidebar` — confirms which section they're in.

## 3. Blog-grade typography & polish

- In `ContentItemArticle`: add a first-letter drop cap on the first paragraph (`prose` + a `.article-lede` class), tighten `prose-h2` rhythm, add a subtle section separator rule before each `h2`.
- Style figures: rounded card, soft gradient border, numbered caption ("Figure 1 — ...") auto-computed from order.
- Add "copy link" affordance on heading hover (anchor icon appears, click copies `#id` URL).
- Pull-quote styling for blockquotes that aren't `[!NOTE]` callouts.
- Mobile: increase base font to 17px, line-height 1.7; cap measure at 68ch.

## 4. Reliable PDF export

The current `window.print()` path loses diagrams on some browsers/mobile because remote SVGs may not finish loading before the print dialog opens, and the print stylesheet strips too aggressively.

Replace `PrintButton` with a real PDF pipeline:

- Add `jspdf` + `html2canvas-pro` (fork with oklch/modern-color support — our tokens use oklch).
- New `exportArticlePdf(articleEl, meta)`:
  1. Clone the article node offscreen at a fixed 800px width in a light theme wrapper (force `background:#fff; color:#000`; inline computed styles for prose).
  2. `await` all `<img>` `decode()` calls so SVGs are guaranteed present.
  3. Render with `html2canvas` at scale 2, `useCORS: true`, `backgroundColor: '#ffffff'`.
  4. Slice the canvas into A4 pages, add each to `jsPDF` with 15mm margins, page numbers, and a footer "Fabric Atlas · <title>".
  5. Prepend a title page (title, summary, tags, updated date, source count) and append a sources appendix rendered from `citations` (title, tier, URL) rather than relying on the sidebar.
  6. Save as `<slug>.pdf`.
- Keep the existing print stylesheet as a fallback (Ctrl+P still works), but the button now downloads a real PDF.
- Show a small progress toast during export (typically 2–4s).

## 5. Small interactive touches

- Reading-mode toggle in the article header: cycles `Comfort` (default) / `Compact` / `Focus` (hides side panels, widens measure). Persist per user.
- Estimated time per `## section` (compute from word count) rendered as a subtle chip next to each h2, so scanning "what's left" is easy.
- On mobile, collapse `## Internals` sub-sections behind a "Show" toggle so the article isn't a wall.

## Technical details

Files to change:
- `src/components/DiagramLightbox.tsx` — aspect ratio, no hover shake, decode hints.
- `src/components/ContentItemArticle.tsx` — drop cap, figure numbering, heading anchor copy, section time chips.
- `src/components/ContentTocSidebar.tsx` — IntersectionObserver active-section highlight.
- `src/components/PrintButton.tsx` — becomes `ExportPdfButton`, calls new util.
- `src/lib/export-pdf.ts` (new) — jsPDF + html2canvas-pro pipeline.
- `src/lib/use-reading-progress.ts` (new) — hook + resume pill component.
- `src/components/ReadingModeToggle.tsx` (new).
- `src/routes/blogs/$kind.$slug.tsx` — wire hook, toggle, resume pill; keep print CSS as fallback.
- `src/styles.css` — `.article-lede::first-letter`, figure/quote styles, reading-mode variants, keep existing `@media print` block.

New deps: `jspdf`, `html2canvas-pro`.

No backend, schema, or content-pipeline changes. Purely presentation.
