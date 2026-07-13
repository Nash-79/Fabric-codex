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
- SVGs use original, product-neutral glyphs; no external icon package or third-party logo bundle is
  part of the renderer.

## Asset and publication contract

Every registered slug has three synchronized artifacts:

1. `content/diagrams/<slug>.svg` — primary rich infographic and print/no-JavaScript artifact.
2. `content/diagrams/<slug>.diagram.json` — evidence, classification, topology, tooltip, and drill
   metadata.
3. `public/diagrams/<slug>.svg` — byte-identical served mirror.

`npm run validate:diagrams` verifies safe SVG markup, `viewBox`, root accessibility metadata,
content/public equality, manifest hash, sidecar structure, evidence on facts, labelled edges,
decision branching, and one focusable SVG region per sidecar node.

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
