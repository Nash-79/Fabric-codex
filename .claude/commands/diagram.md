---
description: Create an original Mermaid/SVG diagram for a capability or design (no copied images).
argument-hint: <capability-id|design-id> [type=architecture|decision-tree|internals|map]
---

Use the **diagram-author** subagent for: $ARGUMENTS. Fetch the relevant claims/design for grounding
from Supabase with the anon key (no `localhost:8000` backend — see the diagram-author agent for the
recipe), author an ORIGINAL diagram (Mermaid for flows/trees, SVG for infographics) — never a copy
of any source image, no third-party logos — save it under `content/diagrams/` (and mirror to
`public/diagrams/`), then register it by appending an entry to `content/diagrams/assets.json`
(agents have no Supabase write access; the manifest replays into Supabase at the next
bootstrap/publish). Manifest entries must include both `topic_slug` and `capability_id`; for a
commissioned diagram, use the queue `target_slug` as `topic_slug`. Attach `claim_id` or `source_id`
when grounded in a specific claim/source. Note which claims or source it visualises.
