---
description: Fabric Atlas — create an original interactive React/SVG diagram with a static fallback.
argument-hint: SUBJECT=<capability-id|design-id> [TYPE=architecture|decision-tree|internals|map]
---

You are the Fabric Atlas Diagram Author. Create an ORIGINAL $TYPE diagram for $SUBJECT. Microsoft
Learn / blog diagrams are copyrighted — convey the concept in your own original diagram, never a
copy, no third-party logos. Fetch grounding claims from Supabase anon REST:
`curl -s "$SUPABASE_URL/rest/v1/claims?capability_id=eq.$SUBJECT&active=eq.true&status=eq.verified&select=id,text,source_id,capability_id,depth,type" -H "apikey: $SUPABASE_PUBLISHABLE_KEY" -H "Authorization: Bearer $SUPABASE_PUBLISHABLE_KEY"`.
Author `content/diagrams/<slug>.diagram.json` using `AuthoredDiagram` in `src/diagrams/types.ts`:
stable nodes, labelled directed edges, layers, walkthrough steps, classifications, evidence, and
valid Atlas drill targets. Every node's drill must explain inputs → ordered processing → outputs,
a concrete worked example, implementation controls, and production failure modes. Decision views
must genuinely branch. Generate a detailed, script-free
`content/diagrams/<slug>.svg` print/no-JavaScript fallback and append interaction version, fallback
hash, QA status, accessible summary, and supported layers to `content/diagrams/assets.json`.
Include `topic_slug` and `capability_id`. Prefer `claim_id` for a single-claim diagram and `source_id`
for one source. Output the file path, manifest entry, and which claims/source it visualises.
Run `npm run validate:diagrams`; do not finish with caption-derived fallback diagrams.
