
## Goal

Make Fabric Atlas feel first-class on phones and iPads: a real mobile navigation, auto-hiding chrome, collapsible sections, and layouts that reflow instead of clipping. Keep the current desktop design intact — this is a responsive + polish pass, not a redesign.

## Scope (frontend/presentation only)

Backend, data, server functions, and routes are not touched.

## 1. Site header — real mobile nav

`src/components/SiteHeader.tsx` today hides the whole nav below `md:` and shows nothing in its place, and stuffs Help / Favorites / Settings / Sign-in on one row that overflows on phones.

- Add a hamburger button visible below `md:` that opens a `Sheet` (shadcn) sliding in from the right.
- Inside the sheet: Primary links, then Knowledge group, then Build group (same items as the desktop dropdowns), plus Advisor / Help / Favorites / Settings / Sign in-out at the bottom. Each item is a large 44px touch target.
- Auto-hide behavior: header stays sticky, but adds a subtle `translate-y-[-100%]` when scrolling down past 80px and returns on scroll up (small `useScrollDirection` hook). Disabled at `md:` and above.
- Tighten header spacing on small screens (`h-14` stays, gaps `gap-2`, hide the tagline earlier).
- Close sheet on route change.

## 2. Responsive layout fixes across pages

Repeated pattern issues to fix:

- Home (`src/routes/index.tsx`): hero grid `lg:grid-cols-[360px_1fr]` — add `md:` intermediate; the nested `lg:grid-cols-[1fr_280px]` collapses to one column on tablet. Claim workbench filter row wraps but the search input is fixed `w-44`; make it `w-full sm:w-44`. Wrap the two selects + input in a `flex-wrap` container that becomes full-width on mobile.
- Blog reader (`src/routes/blogs/$kind.$slug.tsx`): TOC + citations sidebars are hidden below `lg:` which is correct, but the top action bar (Sources / Print) needs `flex-wrap` and the article max width tightened for readability on phones (`prose-sm sm:prose-base`).
- Registry / Sources / Topics / Search / Designs / Learn / Help / Author: audit each for tables and side-by-side grids; convert any `grid-cols-N` without a `sm:`/`md:` breakpoint to stack on mobile. Add horizontal scroll wrappers (`overflow-x-auto`) around genuine tables.
- Apply the responsive-header rule from guidelines: any header row with icon + long title + widget uses `grid grid-cols-[minmax(0,1fr)_auto] sm:flex`, add `min-w-0` and `truncate` to titles, `shrink-0` on icons.

## 3. Collapsible sections & polish

- Home: wrap the "Capability map" grid in a `Collapsible` (shadcn) that starts collapsed on mobile with the selected capability summary always visible — expand to browse.
- Blog reader: on mobile, add a floating "On this page" button that opens a bottom `Sheet` with the TOC (reusing existing `useTocHeadings`). Same pattern for Sources.
- Advisor page: composer sticks to bottom on mobile with safe-area padding (`pb-[env(safe-area-inset-bottom)]`), messages list scrolls above it.
- Add `scroll-mt-20` to headings so anchor jumps clear the sticky header.
- Increase tap targets: nav links min-height 44px on mobile; select/inputs `h-10` on mobile.

## 4. Cosmetic polish (tokens only, no color changes)

- Consistent card treatment: unify `rounded-md border border-border bg-card` on landing cards with a subtle `shadow-sm hover:shadow-md transition-shadow` and `hover:-translate-y-0.5` on interactive cards.
- Add `animate-fade-in` to main content on route mount for smoother transitions.
- Refine focus rings using existing tokens (`focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`) on all buttons and links in the header/nav.
- Use `tabular-nums` on numeric metric tiles for cleaner alignment.

## 5. Small hook + utilities

Add:
- `src/hooks/use-scroll-direction.ts` — returns `"up" | "down"` with a threshold.
- Reuse existing `src/hooks/use-mobile.tsx`.

No new dependencies (`sheet`, `collapsible` are already in shadcn `src/components/ui/`).

## Verification

- Run Playwright headless at three viewports (390×844 iPhone, 820×1180 iPad, 1440×900 desktop) against `/`, `/topics`, `/registry`, `/blogs`, one blog article, `/advisor`, `/settings` (signed-out redirect). Screenshot each; confirm no horizontal scroll, header hamburger works, sheets open, TOC accessible on mobile.
- Sanity-check the build output for the changed routes.

## Out of scope

- Any backend, database, migration, auth, or server-function change.
- Redesigning color palette or typography.
- Rebuilding routes / navigation IA.
