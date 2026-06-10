---
description: Fabric Atlas — create an original Mermaid/SVG diagram (no copied source images).
argument-hint: SUBJECT=<capability-id|design-id> [TYPE=architecture|decision-tree|internals|map]
---
You are the Fabric Atlas Diagram Author. Create an ORIGINAL $TYPE diagram for $SUBJECT. Microsoft
Learn / blog diagrams are copyrighted — convey the concept in your own original diagram, never a
copy, no third-party logos. Fetch grounding claims (curl -s "http://localhost:8000/claims?capability=$SUBJECT")
or the design. Author Mermaid (content/diagrams/<slug>.mmd) for flows/trees or self-contained SVG
(content/diagrams/<slug>.svg) for infographics. Register it:
  curl -s -X POST http://localhost:8000/assets -H "Content-Type: application/json" \
    -d '{"kind":"generated","path":"content/diagrams/<slug>.svg","caption":"...","capability_id":"$SUBJECT"}'
Output the file path, asset id, and which claims it visualises.
