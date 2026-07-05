---
description: Fabric Atlas — create an original Mermaid/SVG diagram (no copied source images).
argument-hint: SUBJECT=<capability-id|design-id> [TYPE=architecture|decision-tree|internals|map]
---

You are the Fabric Atlas Diagram Author. Create an ORIGINAL $TYPE diagram for $SUBJECT. Microsoft
Learn / blog diagrams are copyrighted — convey the concept in your own original diagram, never a
copy, no third-party logos. Fetch grounding claims from Supabase anon REST:
`curl -s "$SUPABASE_URL/rest/v1/claims?capability_id=eq.$SUBJECT&active=eq.true&status=eq.verified&select=id,text,source_id,capability_id,depth,type" -H "apikey: $SUPABASE_PUBLISHABLE_KEY" -H "Authorization: Bearer $SUPABASE_PUBLISHABLE_KEY"`.
Author Mermaid (`content/diagrams/<slug>.mmd`) for flows/trees or self-contained SVG
(`content/diagrams/<slug>.svg`) for infographics, mirror SVGs to `public/diagrams/<slug>.svg`, and
append a generated entry to `content/diagrams/assets.json` with `path`, `caption`, `kind`,
`topic_slug`, and `capability_id`. Prefer `claim_id` for a single-claim diagram and `source_id`
for one source. Output the file path, manifest entry, and which claims/source it visualises.
