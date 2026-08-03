# Diagram visual QA rubric

Editorial Experience Revamp, Phase 5. A manual/editorial scoring checklist applied per diagram —
**not** an automated script. `npm run validate:diagrams` and `npm run validate:diagram-layout`
remain the only automated gates (structural/geometric/evidence-integrity checks); this rubric
covers what those scripts can't: whether a diagram actually _reads well_.

Score each axis **pass/fail**. A diagram **fails the rubric** if any axis fails; it **passes**
only if every axis passes. A numeric average isn't actionable the way a fail-per-axis list is —
don't average these.

## Axes

1. **Composition** — does the layout read top-to-bottom or left-to-right in a single coherent
   direction, or does the eye have to hunt?
2. **Label size** — are all text labels legible at 390px width specifically (the narrowest width
   `validate-diagram-layout.mjs` already audits for overlap/overflow — a diagram can pass that
   check and still fail this _subjective_ legibility axis).
3. **Alignment** — do nodes/edges look grid-aligned, or hand-placed/drifting? (Distinct from
   `validate-diagrams.mjs`'s "geometry is derived, not authored" rule — this axis is about the
   _result_ looking aligned, not just about not hand-authoring x/y.)
4. **Color-meaning consistency** — does color map consistently to classification/layer across the
   whole diagram, not one scheme in one corner and a different one elsewhere?
5. **Contrast** — sufficient text/background and line/background contrast in both light and dark
   mode.
6. **Edge clarity** — are edges/arrows traceable without crossing ambiguity; do labelled edges
   avoid overlapping other elements?
7. **Density** — is the diagram trying to show too much in too little space? (A proxy for: will
   this diagram survive being embedded at `standard` inline width, not just `wide`/`full-bleed`.)
8. **Small-screen readability** — a holistic pass at 390px width: does this diagram _communicate_,
   not just technically pass the layout script's overlap/overflow checks?
9. **Evidence-mapping clarity** — for `fact`-classified nodes, is it visually obvious which region
   the cited evidence belongs to? (A visual judgment, not a JSON-level check.)

## Process

1. Run `npm run validate:diagrams && npm run validate:diagram-layout` first — a diagram that fails
   either automated check needs a structural fix before a rubric pass is even meaningful.
2. Score all 9 axes pass/fail against the rendered SVG (at 390px width per axes 2/8, and in both
   themes per axis 5).
3. Any axis fail → diagram fails the rubric → flag for re-authoring.
4. Scoring the full 80-diagram catalog and re-authoring failures is content work, not part of this
   phase's code deliverable — deferred to a later catalog-migration phase. This phase's
   deliverable is the rubric itself plus a small pilot pass (recommended: 3-5 diagrams, including
   `direct-lake-internals` as the reference example used throughout Phase 5's planning) to prove
   the rubric produces sensible, actionable pass/fail calls.
