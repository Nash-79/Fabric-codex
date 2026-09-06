# Gemini lane — article reading experience

**You own this lane outright.** Decompose it into tasks however you judge best, but stay inside
the files listed. Read `AGENTS.md` → "Coordination" first; claim files in `.agent-locks.md` before
you write code.

## Context

Fabric Codex is a **source-grounded** Microsoft Fabric knowledge platform: every factual claim
cites a source. That constrains UI decisions — **the interface must never invent data.** Where a
value is missing, omit the element rather than substituting a plausible-looking default. Task 6
below is a correctness bug for exactly this reason, not a cosmetic one.

The reader architecture (`ReaderShell` + archetype shells + interactive diagrams) is good. These
are targeted fixes, **not a rewrite**. Do not restructure components.

## Your files

`src/components/` reader components, `src/styles.css`, and the diagram SVGs in **both**
`content/diagrams/` and `public/diagrams/` (plus `content/diagrams/assets.json`, regenerated — see
the Task 5 note).

Out of lane — do not edit: `src/lib/ai-gateway.server.ts`, `vite.config.ts`, `wrangler.jsonc`,
`supabase/**`, `.github/**`, `src/components/SiteHeader.tsx`, `src/routes/index.tsx`.

## Tasks

Start with #1 — highest impact, fully isolated.

**#1–#8 are independent** and can be done in any order.
**#9 and #10 both edit the same `styles.css` rules — do them SEQUENTIALLY, never concurrently.**

| # | Problem | Files |
|---|---|---|
| 1 | **Light-mode callouts are invisible.** All 10 kinds in `calloutStyles` use `text-*-100` on a 10%-opacity tint — near-white on near-white. Theme defaults to `system`, so any light-mode OS hits this. Same bug in `fabric-theme.ts` tier/accent chips. | `Callout.tsx`, `lib/fabric-theme.ts` |
| 2 | **No table of contents at 768–1023px.** `MobileTocDrawer` hides at `md`; the sidebar appears at `lg`. Both are off in that band (iPad portrait, split-screen). Align them. | `MobileTocDrawer.tsx`, `readers/ReaderShell.tsx` |
| 3 | **`layoutHint: "wide"` overflows the viewport.** The negative-margin calc hardcodes the article column as `48rem`; below `lg` the column is narrower, so it overflows. Affects 21 of 103 diagrams. Make the calc track the real column width. | `DiagramLightbox.tsx` |
| 4 | **Diagram squeezed at 640–768px.** The detail sidebar is a fixed `22rem`, leaving the diagram ~264px — below `AuthoredSvg`'s own 280px usability threshold. Stack below instead of beside at that width. | `InteractiveDiagram.tsx` |
| 5 | **7 SVGs carry fixed `width`/`height`** alongside `viewBox`, defeating fluid scaling. Strip the fixed attributes, keep `viewBox`. **Read the Task 5 note below first — this one has a hash gate.** | `content/diagrams/*.svg` + `public/diagrams/*.svg` (both) |
| 6 | **Fabricated metadata.** `ContentHero` renders a hardcoded `"L1 · L5"` when `depth_levels` is empty, and `"0 sources"` when there are none (the action bar correctly hides at zero). Omit both rather than inventing. | `ContentHero.tsx` |
| 7 | **Citations unreachable on touch.** The `[Sn]` preview is a Radix `HoverCard` — hover-only, no tap path. | `ContentItemArticle.tsx` |
| 8 | **Mono font never loads.** The stack leads with `"Cascadia Code"`, which is not among the loaded Google Fonts, so Windows and macOS/Linux readers see different type. | `styles.css` |
| 9 | **Tables double-contained.** `MarkdownPanels` wraps every table AND `styles.css :where(table)` styles it — doubled borders/radius, nested scroll containers. The CSS zebra/`thead` rules are dead (killed by `not-prose`). | `MarkdownPanels.tsx`, `styles.css` |
| 10 | **Heading scale system is inert.** `prose-h2:text-2xl` (arbitrary-variant utility) beats `.article-body :where(h2)` (deliberately zero-specificity), so the fluid `--fa-h2` clamp and the `--fa-rhythm`/`--fa-density-scale` rhythm never apply. Drop the `prose-h2:`/`prose-h3:` utilities; let the token system own the scale. | `ContentItemArticle.tsx`, `styles.css` |

## Acceptance criteria

- **Verify in BOTH light and dark themes.** The theme toggle cycles system → light → dark.
- Check 390px (portrait + landscape), 768px, 1024px, 1440px. No horizontal page scroll at any width.
- Wide content (tables, code, diagrams) scrolls inside its own container, never the page body.
- Contrast meets WCAG AA.
- No visual regression to anything not named in your task.

## Before every PR

```bash
npm run typecheck && npm test && npm run lint
npm run validate:diagrams      # if you touched any diagram SVG
```

### Task 5 only — the diagram hash gate

Editing a diagram SVG is not a plain file edit. Two things will fail CI if you miss them:

1. **Each SVG exists twice** — `content/diagrams/<slug>.svg` (authoritative) and
   `public/diagrams/<slug>.svg` (the served mirror). They are currently byte-identical and
   **nothing syncs them automatically**; `validate:diagrams` only checks the mirror *exists*, not
   that it matches. Edit **both** copies identically.
2. **Every SVG has a registered `static_hash`** in `content/diagrams/assets.json`, checked byte-for-byte
   (`scripts/validate-diagrams.mjs:48`). Changing the bytes invalidates it. Do **not** hand-edit
   hashes — run:

   ```bash
   node scripts/update-static-hashes.mjs     # recomputes; prints each change
   npm run validate:diagrams                 # must pass before the PR
   ```

Include the regenerated `assets.json` in the same commit as the SVG edits.

Keep to 3–4 open PRs at a time; review is the bottleneck. State in each PR body what you changed,
what you verified, and at which widths/themes.
