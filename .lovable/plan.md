
## Goal
Make the home page feel alive and the whole app feel more modern and slick, without touching editorial/curation logic.

## 1. Home page (src/routes/index.tsx)

**Mixed-feed marquee (new)**
- New `src/components/UpdatesMarquee.tsx`: auto-scrolling horizontal strip just under the hero.
- Data: merge already-loaded `contentItems` (newest 8), `sources` (newest 6), and `roadmap_items` (newest 6 via a new lightweight `listRecentRoadmap` server fn) into one time-ordered feed with a type chip (Article / Source / Roadmap).
- CSS keyframe marquee (duplicated track for seamless loop), `pauses on hover/focus`, disabled under `prefers-reduced-motion`, arrow buttons for manual scroll fallback. Each item is a `<Link>` to its detail route.

**Clickable metric tiles**
- Convert the three `<Metric>` cards (Topics / Articles / Sources) into `<Link>` tiles pointing to `/topics`, `/blogs`, `/sources`.
- Add hover lift (`hover-scale`, ring accent), a small "View all →" affordance, and an `aria-label` describing the count + destination.
- Add a fourth tile for Roadmap (count of active roadmap_items) linking to `/roadmap`.

**Section polish**
- Tighten hero rhythm, add a subtle gradient token (`--gradient-hero`) behind the hero band.
- Featured card: add hover ring + arrow, keep existing layout.
- "Recently published" list: add timestamp ("2d ago") and kind chip.

## 2. App-wide modernization

**Code blocks with VS Code-style highlighting**
- Add `shiki` (works in Workers, pure JS, no Node deps) with a small wrapper `src/lib/highlight.ts` using `bundledLanguages` limited to the languages we actually render (ts, tsx, js, json, sql, python, bash, yaml, md).
- New `src/components/CodeBlock.tsx`: async-highlights on mount, renders theme `github-dark`/`github-light` matched to app theme, adds language badge + copy button, line numbers, wrap toggle.
- Wire into `ContentItemArticle.tsx` markdown renderer so all `pre > code` blocks in articles/lessons/designs use it. Inline `code` keeps current style.

**Slicker global polish (small, contained)**
- `src/styles.css`: add `--gradient-hero`, `--shadow-card-hover`, and a `.card-interactive` utility (border + hover ring + shadow transition). Apply to home cards, sibling nav, featured card.
- Add `animate-fade-in` to route root on `/` for first paint.
- Smooth scroll + underline-on-hover (`story-link`) for inline article links.

## 3. Server additions
- `listRecentRoadmap({ limit })` in `src/lib/atlas.functions.ts` (public read, uses existing `roadmap_items` RLS).
- Nothing else server-side.

## Out of scope
- Editorial pipeline, validation, publishing, RSS, security policies.
- Route restructure or new pages.

## Technical notes
- Marquee is CSS-only animation on a duplicated flex track; JS only for pause-on-hover state and reduced-motion detection.
- Shiki bundle stays small by importing only the needed languages from `shiki/langs` and two themes; highlight runs in an effect so SSR ships the raw `<pre>` fallback.
- All new tokens are semantic (added to `:root` and `.dark`); no hardcoded colors.
