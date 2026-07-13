---
description: Create an original rich authored SVG infographic with a grounded semantic sidecar.
argument-hint: <capability-id|design-id> [type=architecture|decision-tree|internals|map]
---

Use the **diagram-author** subagent for: $ARGUMENTS. Fetch the relevant claims/design for grounding
from Supabase with the anon key (no `localhost:8000` backend — see the diagram-author agent for the
recipe), author an ORIGINAL `.diagram.json` topology with labelled edges, evidence, layers,
walkthrough, and drill targets. Every node must carry specific inputs, processing, outputs, an
example, controls, and failure modes. Generate the detailed script-free primary SVG under
`content/diagrams/`, map every node to a focusable `data-node-id` region, mirror it byte-for-byte to
`public/diagrams/`, then
register it by appending an entry to `content/diagrams/assets.json`
(agents have no Supabase write access; the manifest replays into Supabase at the next
bootstrap/publish). Manifest entries must include both `topic_slug` and `capability_id`; for a
commissioned diagram, use the queue `target_slug` as `topic_slug`. Attach `claim_id` or `source_id`
when grounded in a specific claim/source. Run `npm run validate:diagrams`; no caption-derived
fallback is acceptable. Note which claims or source it visualises.
