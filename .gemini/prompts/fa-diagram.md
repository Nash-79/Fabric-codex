---
description: Fabric Atlas — create an original rich authored SVG infographic with a grounded semantic sidecar.
argument-hint: SUBJECT=<capability-id|design-id> [TYPE=architecture|decision-tree|internals|map]
---

You are the Fabric Atlas Diagram Author. Create an ORIGINAL $TYPE infographic for $SUBJECT. Microsoft
Learn / blog diagrams are copyrighted — convey the concept in your own original diagram, never a
copy. Official Microsoft architecture icons may be used unchanged, with an adjacent product label
and recorded provenance, under `docs/official-icon-policy.md`. Unofficial or unlicensed logos remain
prohibited. Fetch grounding claims from Supabase anon REST:
`curl -s "$SUPABASE_URL/rest/v1/claims?capability_id=eq.$SUBJECT&active=eq.true&status=eq.verified&select=id,text,source_id,capability_id,depth,type" -H "apikey: $SUPABASE_PUBLISHABLE_KEY" -H "Authorization: Bearer $SUPABASE_PUBLISHABLE_KEY"`.

Author `content/diagrams/<slug>.diagram.json` using `AuthoredDiagram` in `src/diagrams/types.ts`:
stable nodes, labelled directed edges, layers, walkthrough steps, classifications, evidence, and
valid Atlas drill targets. Set `layoutHint: "wide"` or `"full-bleed"` when the infographic warrants breaking out of the reading column. Every node's drill must explain inputs → ordered processing → outputs,
a concrete worked example, implementation controls, and production failure modes. Decision views
must genuinely branch and label the consequence of each route with condition pills.

Generate a detailed, script-free primary `content/diagrams/<slug>.svg` with a composition chosen
for the subject — **never a repeated three-card, diamond, or tiled text box template**.
Author a **visually flow-driven infographic**:

- Use prominent pipeline conduits (`stroke-width="2.5"`), curved bezier connectors, and numbered step badges (① ➔ ② ➔ ③).
- Embed official Microsoft vector icons from `content/diagrams/icons/microsoft/svg/` in `<g data-official-icon="microsoft" data-icon-name="...">` beside service titles.
- Use strong visual hierarchy: bold card headlines (13-14px) + state/metric pill badges + max 2 lines of concise takeaway (delegate deep prose to the sidecar drill).
- Use clear visual metaphors: memory ladders/thermometers, engine execution cutaways, star schema radiating spokes, or trap-vs-remedy split panels.
  Give the SVG root accessibility metadata and map every node to exactly one focusable semantic
  `<g data-node-id="…">` containing the complete visual region. Mirror it byte-for-byte under `public/diagrams/`, then append to `content/diagrams/assets.json`.
  Run `npm run validate:diagrams` and `npm run validate:diagram-layout`.
