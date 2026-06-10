---
description: Author a cited Fabric solution architecture from verified claims (local, no API).
argument-hint: <scenario description>
---
Use the **solution-architect** subagent to design for: $ARGUMENTS

Ask for any missing key constraints once, fetch verified claims from
http://localhost:8000/claims, write the architecture yourself with [Sn] citations to
content/designs/<slug>.md, optionally hand off to diagram-author for an original diagram, then
persist with POST http://localhost:8000/designs (output_md, cited_source_ids, tags, assets).
Label inference vs cited fact. Finish by suggesting `/validate <design-id>`.
