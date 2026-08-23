# Diagram visual QA rubric

Editorial Experience Revamp, Phase 5. A manual/editorial scoring checklist applied per diagram —
**not** an automated script. `npm run validate:diagrams` and `npm run validate:diagram-layout`
remain the only automated gates (structural/geometric/evidence-integrity checks); this rubric
covers what those scripts can't: whether a diagram actually _reads well_.

Score each axis **pass/fail**. A diagram **fails the rubric** if any axis fails; it **passes**
only if every axis passes. A numeric average isn't actionable the way a fail-per-axis list is —
don't average these.

## Axes

1. **Composition & Flow** — does the diagram feature a clear, flow-driven visual direction (pipelines, decision forks, state ladders, layered stacks) rather than a static grid of tiled text boxes? Does the eye naturally follow the architectural journey?
2. **Visual Metaphors & Iconography** — does the artwork leverage appropriate visual metaphors (e.g. stage conduits, memory thermometers, cutaway execution layers, outcome badges) and official Microsoft Fabric icons where relevant?
3. **Information Budget & Hierarchy** — do cards feature strong headline/badge hierarchy with concise takeaways (max 2-3 lines of text) rather than walls of 9px prose? Are deep details properly delegated to the semantic sidecar?
4. **Label size & Legibility** — are all text labels legible at 390px width specifically (the narrowest width audited for overlap/overflow)?
5. **Alignment & Spacing** — do nodes/edges look harmoniously aligned with intentional breathing room, avoiding cluttered wireframe boxes?
6. **Color-meaning consistency** — does color map consistently to domain classification and layer across the entire diagram (e.g. OneLake teal, Spark purple, Warehouse blue, Power BI gold, Warnings red)?
7. **Contrast** — sufficient text/background and line/background contrast in both light and dark mode.
8. **Edge & Conduit clarity** — are data pipelines, decision branches, and fallback paths prominently styled, traceable without crossing ambiguity, and clearly labelled?
9. **Density & Layout Hint** — does the diagram fit its canvas cleanly, with complex infographics properly opting into `layoutHint: "wide"` or `"full-bleed"`?
10. **Evidence-mapping clarity** — for `fact`-classified nodes, is it visually obvious which region the cited evidence belongs to?

## Process

1. Run `npm run validate:diagrams && npm run validate:diagram-layout` first — a diagram that fails
   either automated check needs a structural fix before a rubric pass is even meaningful.
2. Score all 10 axes pass/fail against the rendered SVG (at 390px width per axes 4/8, and in both
   themes per axis 7).
3. Any axis fail (including failing the "not a tiled text grid" rule) → diagram fails the rubric → flag for re-authoring.
