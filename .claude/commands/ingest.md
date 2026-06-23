---
description: Ingest an approved Fabric source into the knowledge base (local extraction, no API).
argument-hint: <url-or-file-path> [tier=<1-6>]
---
Use the **knowledge-curator** subagent to ingest: $ARGUMENTS

You extract the claims yourself locally (no server-side API). Read the source, produce original
reader metadata (`summary`, `audience`, `why_it_matters`, 3-5 `takeaways`), then produce 6–12
atomic paraphrased claims tagged with capability_id, depth (1–5), type, and topical hashtags
(e.g. MicrosoftFabric, DataEngineering, PySpark, Python). Record any source diagrams as
`referenced` assets (URL + caption + attribution — never re-host); prefer commissioning an
original diagram from diagram-author instead. Write `content/sources/<slug>.json` (metadata +
`claims` array). There is no `localhost:8000` backend and agents can't write to Supabase, so
**publishing is a human step**: tell the user to open **Settings → Publish → Source (+ claims)**
and paste the file — the server inserts the claims as **pending**. Show the claims table, the
assets, the file path, and the publish instruction. Do not mark verified (that's the human review
step in Settings → Claims).
