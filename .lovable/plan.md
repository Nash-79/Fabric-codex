## Goals

Ship four follow-ups to the article reading experience:

1. Cross-article prev/next navigation between sibling articles
2. Floating mobile TOC drawer
3. Reading-progress + PDF export polish
4. Lazy-render diagrams (viewport / lightbox only)

## 1. Cross-article prev/next

- Add a small server function `getArticleSiblings({ slug })` in `src/lib/articles.functions.ts` (or nearest existing article module) that reads `content_items` where `kind='article'` and `status='published'`, ordered by `published_at desc, slug` (stable), and returns `{ prev: {slug,title} | null, next: {slug,title} | null }` for the given slug. Publishable anon client; no auth.
- Wire into the article route loader via `queryClient.ensureQueryData` alongside the existing article query so it prefetches during navigation.
- Render a `<nav aria-label="Article navigation">` footer block at the end of the article with two `<Link>` cards (Prev / Next) using `to="/articles/$slug"` + `params`. Keyboard: extend the existing `J`/`K` shortcut set with `[` / `]` for prev/next article (only when not typing in an input).
- Skip if the article isn't in the published list (fallback: both null → hide block).

## 2. Floating mobile TOC drawer

- Reuse the existing `ContentTocSidebar` data (headings + figures) inside a shadcn `Sheet` (right side).
- Add a floating action button (bottom-right, `md:hidden`) labeled "Contents" with a list icon; opens the sheet. Includes safe-area padding for iOS.
- Sheet content: same section list + figure list, active-section highlight, click closes the sheet and scroll-jumps to the target.
- Desktop unchanged (sidebar still visible from `md:` up).

## 3. Reading-progress + PDF export tweaks

- Reading progress: pin the existing bar under the header on mobile (currently can get clipped); use `position: sticky` with `top: var(--header-height)`, and animate width with `transition-transform` + `translateX` for smoother 60fps updates. Add `aria-hidden`.
- PDF export: in the print stylesheet (`src/styles.css` `@media print`), hide the TOC sidebar, FAB, prev/next nav, and lightbox controls; force diagrams to render inline at full width; add `@page { margin: 18mm 14mm; }` and a first-page header with article title + source URL via a `.print-header` block rendered only when printing.

## 4. Lazy-render diagrams

- Wrap each figure in a `LazyDiagram` component that renders a lightweight placeholder (title + skeleton at the image's known aspect ratio, `content-visibility: auto` + `contain-intrinsic-size`) until either:
  - the figure enters the viewport (`IntersectionObserver`, rootMargin `400px 0px`), or
  - the user opens the lightbox for that figure (force-load).
- Once loaded, decode the image with `decoding="async"` `loading="lazy"` `fetchpriority="low"` and keep it mounted.
- Preserve existing `id="figure-N"` anchors on the placeholder so TOC jumps still work before load.
- No changes to the lightbox internals; it continues to receive the same src.

## Technical notes

- New files: `src/lib/articles.functions.ts` (or extend existing article fns), `src/components/MobileTocDrawer.tsx`, `src/components/LazyDiagram.tsx`, `src/components/ArticleSiblingsNav.tsx`.
- Edits: article route loader + page component, `ContentItemArticle.tsx` (use `LazyDiagram`), `ContentTocSidebar.tsx` (extract shared list into subcomponent for reuse in drawer), `src/styles.css` (print + progress bar).
- No schema changes. No new secrets. Type-check with `tsgo` after each file group.

## Out of scope

- Cross-topic navigation (only same published list order).
- Re-designing the article layout beyond adding the FAB.
- Changing which diagrams are commissioned or their storage.
