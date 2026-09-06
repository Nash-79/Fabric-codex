# Rich authored SVG infographic revamp

## Outcome

Articles, designs, and lessons render the original authored SVG as the primary diagram. The old
React node graph, caption-derived topology, generic stage-card infographic, and product-icon
inference layer have been retired. The Direct Lake diagrams define the visual bar: a complete
end-to-end story with architecture boundaries, explanatory panels, evidence markers, warnings,
and operational guidance in one readable figure.

The adjacent `.diagram.json` remains mandatory, but it is now the semantic and evidence contract
for the authored artwork rather than a geometry input. Each node maps exactly once to a focusable,
labelled SVG region through `data-node-id`. Hovering or focusing that region shows the node summary,
classification, and evidence; the article remains useful without JavaScript because the SVG itself
contains `<title>` and `<desc>` descriptions.

## Implemented reader contract

- `ContentItemArticle` resolves registered diagrams to their source-controlled SVG and sidecar.
- `DiagramLightbox` displays the same inline SVG in the article and zoomed view, retaining lazy
  mounting, pan, zoom, fullscreen, keyboard controls, captions, print, and image fallback.
- `AuthoredSvg` provides lightweight delegated hover/focus tooltips. It does not calculate layout,
  select graph paths, filter layers, or replace the author-designed composition.
- The source catalog contains only authored sidecars. There is no caption-synthesized fallback.
- SVG compositions remain original. They may combine original product-neutral glyphs with unchanged
  official Microsoft architecture icons under `docs/official-icon-policy.md`; unofficial icon
  bundles and runtime logo inference remain outside the renderer.

## Asset and publication contract

Every registered slug has three synchronized artifacts:

1. `content/diagrams/<slug>.svg` — primary rich infographic and print/no-JavaScript artifact.
2. `content/diagrams/<slug>.diagram.json` — evidence, classification, topology, tooltip, and drill
   metadata.
3. `public/diagrams/<slug>.svg` — byte-identical served mirror.

`npm run validate:diagrams` verifies safe SVG markup, `viewBox`, root accessibility metadata,
content/public equality, manifest hash, sidecar/revision parity, resolvable evidence keys, complete
drill controls and failure modes, labelled edges, decision branching, and one focusable SVG region
per sidecar node. An asset cannot move to `passed` while any node is mapped to an incidental SVG
element instead of a semantic `<g>` region.

## Authoring and QA

- Preserve information density: use lanes, boundaries, comparisons, internals cutaways, feedback
  paths, failure callouts, and “what to watch” guidance when the topic needs them.
- Do not force every subject into one layout. Architecture, flow, internals, and decision visuals
  should communicate differently.
- Every factual visual assertion cites a known source key. Patterns and inferences are labelled.
- Keep `qa_status: draft` until grounding, desktop/mobile rendering, keyboard focus, tooltip
  placement, dark-page contrast, lightbox behavior, print, and no-JavaScript fallback are reviewed.
- Run `npm run validate:diagrams`, `npm run validate:content`, `npm run typecheck`, `npm test`,
  `npm run lint`, and `npm run build` before marking a wave complete.

## Remaining editorial work

The renderer and all registered asset contracts are migrated. Older sidecars and thin template-era
SVGs still require capability-by-capability editorial review before their QA status can honestly
move from `draft` to `passed`; validation proves structural integrity, not visual or factual depth.

## July 2026 legacy-sidecar and layout pass

- All 32 legacy sidecars now use revision 3 semantics. The 22 revision-1 contracts were
  re-authored with grounded facts, honest pattern/inference labels, node-specific drill content,
  warnings, and meaningful topology; the ten grounded revision-2 contracts were reviewed and
  promoted without discarding their detail.
- `validate:diagram-layout` renders all registered SVGs in headless Chromium at 390px, 768px, and
  1280px. It rejects horizontal overflow, off-canvas text, unintended text collisions, malformed
  SVG roots, and empty interactive regions.
- The rendered audit exposed malformed Polaris roots plus real clipping/collision defects that the
  structural validator could not see. These are now part of the normal acceptance gate.
- Every registered diagram now maps nodes to complete semantic `<g>` regions. All 566 node targets
  cover their complete card, stage, question, warning, or operating panel; no text-only mappings
  remain.
- The first composition-redesign wave replaced all 12 repeated strategy templates: architecture
  strategy, data modelling, architecture implementation, event-driven, metadata-driven, and
  silver-layer modelling. Their 86 nodes now map to complete semantic visual groups. Sidecar
  revision alone is still not evidence that the remaining visuals meet the Direct Lake infographic
  standard.
- The cross-site migration then upgraded the remaining 66 SVGs without flattening their existing
  subject-specific compositions. All 78 content/public mirrors are synchronized, all registered
  diagrams are embedded by at least one article, design, or lesson, and the Medallion Lakehouse
  article now uses its dedicated architecture and decision pair.

No new article is required solely to close diagram coverage: every legacy asset is already embedded
in an article, design, or lesson. Prefer strengthening the existing topic before creating another
thin page. High-value future deep dives are Spark autoscaling/session internals, event-driven
orchestration, and multi-cloud data access; commission them only when enough distinct verified L4/L5
claims exist to support a genuinely separate article.
