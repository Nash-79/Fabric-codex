---
description: Create an original Mermaid/SVG diagram for a capability or design (no copied images).
argument-hint: <capability-id|design-id> [type=architecture|decision-tree|internals|map]
---
Use the **diagram-author** subagent for: $ARGUMENTS. Fetch the relevant claims/design for
grounding, author an ORIGINAL diagram (Mermaid for flows/trees, SVG for infographics) — never a
copy of any source image, no third-party logos — save it under content/diagrams/, and register it
with POST http://localhost:8000/assets as a generated asset. Note which claims it visualises.
