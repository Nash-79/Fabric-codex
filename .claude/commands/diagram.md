---
description: Create an original Mermaid/SVG diagram for a capability or design (no copied images).
argument-hint: <capability-id|design-id> [type=architecture|decision-tree|internals|map]
---
Use the **diagram-author** subagent for: $ARGUMENTS. Fetch the relevant claims/design for
grounding, author an ORIGINAL diagram (Mermaid for flows/trees, SVG for infographics) — never a
copy of any source image, no third-party logos — save it under content/diagrams/, and register it
with POST http://localhost:8000/assets as a generated asset. Attach `claim_id` or `source_id`
when the diagram is grounded in a specific claim/source; otherwise attach the capability id. Note
which claims or source it visualises.
