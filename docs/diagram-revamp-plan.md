# Diagram revamp — plan

## Problem

`src/diagrams/catalog.ts` never opens the SVG. It splits the asset **caption** into phrases and
treats each phrase as a node. Everything the user sees follows from that:

| Symptom | Cause |
| --- | --- |
| Messy layout, no topology | `x: 55 + column * 315` — a fixed 3-column grid for every diagram |
| Unnatural flow | Edges chain node 1→2→3 in caption order; `type` is computed then ignored |
| Shallow, textual drill-down | `DetailInfographic` = 3 bullet columns, fed by `topicExamples` keyed on **topic**, so every node in a topic drills into identical text |
| "Reverts back to original" | Drill state is local `detailNodeId`; any re-render snaps back |
| Nodes cite nothing | `sourceKeys: []` — violates the core "every claim cites a source" rule |

`.claude/agents/diagram-author.md` already **promises** a "typed interactive React/SVG definition"
with "stable id, classification, source keys" per node. Nothing ever writes it. This plan finishes
that job.

## Decisions (agreed)

- **Sidecar is the source of truth.** `content/diagrams/<slug>.diagram.json` holds the authored
  definition, next to the hand-drawn `.svg`, which stays the print/no-JS fallback.
- **Rebuild the layer, backfill Data Architecture first.** Other diagrams keep working via a
  fallback to today's caption synthesis until their sidecar is authored.

## Steps

1. **Types** (`src/diagrams/types.ts`) — split the contract in two: `AuthoredDiagram` (what the
   agent writes: no x/y — layout is derived) and `InteractiveDiagramDefinition` (what the renderer
   consumes: laid-out, with resolved coordinates). Nodes gain real `evidence`, `metrics`, and a
   structured `drill` block instead of six loose string arrays.
2. **Layout engine** (`src/diagrams/layout.ts`) — layered ranking by edge depth, ordering to cut
   crossings, content-sized boxes, orthogonal edge routing. Dispatch on `type`:
   `architecture` → layered lanes, `decision` → branching tree, `flow`/`internals` → path.
3. **Catalog** (`src/diagrams/catalog.ts`) — `import.meta.glob` the sidecars; run each through the
   layout engine. Keep the caption synthesiser strictly as the no-sidecar fallback.
4. **Renderer** (`src/components/InteractiveDiagram.tsx`) — routed edge paths with labels,
   evidence chips linking to sources, layer filters that actually re-layout.
5. **Drill-down** — real infographic (flow with quantities, evidence, annotated failure callouts),
   held in **URL state** (`?node=<id>`), which kills the revert bug and makes a node linkable.
6. **Backfill** — author sidecars for the `data-architecture` tree: `architecture-strategy`,
   `data-modelling`, `silver-layer-modelling`, `metadata-driven-architecture`,
   `event-driven-architecture`.
7. **Contract** — `diagram-author` emits the sidecar; `assets.json` publish + `validate:content`
   carry it. A `fact`-classified node with zero `evidence` fails validation.

## Found by running the app (not in the original plan)

Driving the real app in a browser surfaced three bugs that no test caught:

1. **Hydration was failing, so every diagram on every article was inert.** Markdown wraps a
   standalone image in a `<p>`, and we render images as a `<figure>` — invalid HTML, so React
   bailed out of hydration and no click handler was ever attached. Layer filters didn't toggle;
   nodes didn't select. Fixed by unwrapping image paragraphs to a `<div>` in
   `ContentItemArticle.tsx` (tested against the mdast node, not React children, because the
   children are our own custom renderers and never a literal `img`).
   **This predates the revamp** — the old renderer was equally dead, which is likely a large part
   of why the diagrams felt lifeless.
2. **Wide graphs collapsed to unreadable slivers.** A deep, narrow `architecture` graph laid out
   left-to-right became an ultra-wide strip; scaled to fit the article column, 190px nodes rendered
   at ~48px. Layout now picks orientation from the graph's actual shape (depth vs breadth), not
   just its declared `type`, and the SVG carries a `minWidth` so it scrolls rather than shrinks.
3. **`useDrillState` seeded state from `window.location` during first render**, diverging from the
   server's HTML. Now starts `null` and adopts the URL in an effect after mount.

## Status

- 10 authored sidecars; the remaining ~68 diagrams still use the caption-derived fallback and
  migrate incrementally. `npm run validate:diagrams` reports the split on every run.
- Verified in-browser on all five Data Architecture articles: node select → evidence panel, drill →
  infographic, and the drill survives re-render, deep-link reload, and browser Back.

## Known remaining issue

A **pre-existing, site-wide** hydration attribute mismatch still fires once per page — including on
`/` and `/registry`, which contain no diagrams (most likely the theme script stamping `data-theme`
before React hydrates). React recovers and the page is fully interactive. Out of scope here, but
worth a separate fix.

## Out of scope (flagged)

The Data Architecture **article bodies** are also template-generated
(`scripts/generate-data-architecture-seeds.mjs`). Better diagrams make that thin prose more
obvious. Separate pass.
