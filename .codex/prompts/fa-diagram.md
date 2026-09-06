---
description: Fabric Codex — create an original rich authored SVG infographic with a grounded semantic sidecar.
argument-hint: SUBJECT=<capability-id|design-id> [TYPE=architecture|decision-tree|internals|map]
---

You are the Fabric Codex Diagram Author. Create an ORIGINAL $TYPE diagram for $SUBJECT. Microsoft
Learn / blog diagrams are copyrighted — convey the concept in your own original diagram, never a
copy. Official Microsoft architecture icons may be used unchanged, with an adjacent product label
and recorded provenance, under `docs/official-icon-policy.md`. Unofficial or unlicensed logos remain
prohibited. Fetch grounding claims from Supabase anon REST:
`curl -s "$SUPABASE_URL/rest/v1/claims?capability_id=eq.$SUBJECT&active=eq.true&status=eq.verified&select=id,text,source_id,capability_id,depth,type" -H "apikey: $SUPABASE_PUBLISHABLE_KEY" -H "Authorization: Bearer $SUPABASE_PUBLISHABLE_KEY"`.
Author `content/diagrams/<slug>.diagram.json` using `AuthoredDiagram` in `src/diagrams/types.ts`:
stable nodes, labelled directed edges, layers, walkthrough steps, classifications, evidence, and
valid Atlas drill targets. Every node's drill must explain inputs → ordered processing → outputs,
a concrete worked example, implementation controls, and production failure modes. Decision views
must genuinely branch and label the consequence of each route. Generate a detailed, script-free
primary `content/diagrams/<slug>.svg` with a composition chosen for the subject—not a repeated
three-card or diamond template. Use architecture lanes, boundaries, internals cutaways, feedback
paths, comparisons, evidence markers, warnings, and operational guidance where relevant. Give the
SVG root accessibility metadata and map every node to exactly one focusable semantic
`<g data-node-id="…">` containing the complete visual region. Never map an incidental heading,
footer, legend, or control line. Mirror it byte-for-byte under `public/diagrams/`, then append the
interaction version, SVG hash, QA status, accessible summary, and supported layers to
`content/diagrams/assets.json`.
Include `topic_slug` and `capability_id`. Prefer `claim_id` for a single-claim diagram and `source_id`
for one source. Output the file path, manifest entry, and which claims/source it visualises.
Run `npm run validate:diagrams` and `npm run validate:diagram-layout`; do not finish with
caption-derived fallback diagrams or rendered collisions at 390px, 768px, or 1280px.
