---
description: Ingest an approved Fabric source into the knowledge base (local extraction, no API).
argument-hint: <url-or-file-path> [tier=<1-6>]
---
Use the **knowledge-curator** subagent to ingest: $ARGUMENTS

You extract the claims yourself locally (no server-side API). Read the source, produce 6–12 atomic
paraphrased claims tagged with capability_id, depth (1–5), type, and topical hashtags
(e.g. MicrosoftFabric, DataEngineering, PySpark, Python). Record any source diagrams as
`referenced` assets (URL + caption + attribution — never re-host); prefer commissioning an
original diagram from diagram-author instead. Write content/sources/<slug>.json, then
`curl -s -X POST http://localhost:8000/sources/ingest --data @content/sources/<slug>.json`.
Show the claims table, the assets, the file path, and the backend counts. Do not mark verified.
