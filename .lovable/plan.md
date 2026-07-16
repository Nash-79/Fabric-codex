## Problem

Today's PDF export rasterises the entire article into one giant canvas then slices it at fixed pixel heights (`src/lib/export-pdf.ts`). That's why the output looks messy:

- Slices cut through the middle of headings, figures, tables and diagrams → "half-formed" and overlapping elements.
- SVG diagrams are rendered at page-canvas scale (2×) not at their own native scale, so they're blurry and sometimes mis-sized.
- Interactive diagram chrome (tooltips, focus rings) can leak into the raster.
- No HTML export option exists.

## Fix

### 1. Rewrite `src/lib/export-pdf.ts` to be block-aware

Instead of one canvas → sliced, walk the top-level block children of the cloned article and render each block to its own image, then flow them onto A4 pages with real page-break rules.

- Build the offscreen printable clone as today, but widen to 820px, force `color-scheme: light`, neutralise CSS variables (`--background: #fff`, `--foreground: #111`), and strip `.no-print`, buttons, tooltips, focus rings, and the interactive diagram overlay layer (keep the inline `<svg>` only).
- For each direct child block (`h1..h4`, `p`, `ul/ol`, `pre`, `table`, `figure`, `.diagram-embed`, callouts):
  - Rasterise the block on its own with `html2canvas-pro` at `scale: 2`, except any block containing an `<svg>` uses `scale: 3` so diagrams stay crisp.
  - Convert to mm at the fixed content width; if the block fits in the remaining page space, place it there; otherwise start a new page.
  - If a single block is taller than a full page (long code block, tall diagram): for prose/code, re-render sliced *at safe line boundaries* by measuring line-height; for figures/diagrams, scale down proportionally to fit one page rather than splitting.
  - Keep headings glued to the next block (never leave an orphan heading at page bottom).
- Title page, sources appendix and footers stay, but the title page is drawn on page 1 (no blank leading page from the current `addPage()` loop).
- Cover page metadata unchanged.

### 2. Add HTML export

- New `src/lib/export-html.ts` exporting `exportArticleHtml(articleEl, meta)`.
  - Clone the article, strip `.no-print`/buttons/tooltips, inline all `<img>` as data URIs (fetch + FileReader), keep `<svg>` inline (already self-contained).
  - Snapshot the computed styles that matter (tokens for background, foreground, borders, code blocks, tables, callouts) into a single `<style>` block so the file renders standalone in any browser — no Tailwind runtime, no external CSS.
  - Wrap in a minimal HTML5 document with `<title>`, meta description, and a header card (title, summary, updated date, tags) and a sources appendix mirroring the PDF appendix.
  - `Blob` → `download` as `<slug>.html`.

### 3. UI: `src/components/PrintButton.tsx`

- Split into two buttons rendered side-by-side inside a small toolbar: **Download PDF** and **Download HTML**. Same styling as today, same `no-print` class, same `getMeta()` prop reused for both. Loading state per-button. Toast on success/failure; HTML export falls back to nothing (there's no browser equivalent to `window.print()` for HTML — just surface the error toast).
- Route file `src/routes/blogs/$kind.$slug.tsx` needs no API change; the existing `<PrintButton getMeta={...} />` call keeps working.

## Technical notes

- No new dependencies — `jspdf` and `html2canvas-pro` already installed.
- Everything stays client-side; no server function changes; no schema/migration changes.
- Pure presentation-layer change, scoped to `src/lib/export-pdf.ts`, new `src/lib/export-html.ts`, and `src/components/PrintButton.tsx`.

## Files touched

- `src/lib/export-pdf.ts` — rewrite to block-aware pagination.
- `src/lib/export-html.ts` — new, self-contained HTML snapshot exporter.
- `src/components/PrintButton.tsx` — add second button for HTML; keep PDF button behaviour and API.

## Verification

- Manual: open a diagram-heavy article (e.g. `direct-lake`), export PDF → confirm no diagram is split or overlapping, headings stay with following block, SVG diagrams are sharp; export HTML → open the downloaded file directly in a browser tab and confirm it renders standalone with diagrams and citations.
- `npm run build` for typecheck.
