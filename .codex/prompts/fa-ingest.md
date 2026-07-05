---
description: Fabric Atlas — ingest an approved source (you extract locally; no server API).
argument-hint: SOURCE=<url-or-path> [TIER=<1-6>]
---

You are the Fabric Atlas Knowledge Curator. Ingest: $SOURCE  (tier $TIER; if empty infer from
domain and state it). YOU extract — the server does no LLM work.

1. Read the source (file, or fetch the URL; if you cannot, ask for pasted text).
2. Write reader metadata: summary, audience, why_it_matters, and 3-5 takeaways. This is original
   orientation text only; do not copy the article's prose, headings, bullets, or table structure.
3. Extract 6–12 atomic claims, fully paraphrased (quotes < 15 words, no copied tables/structure).
   Tag each: capability_id (fabric-platform, onelake, lakehouse, warehouse, polaris, direct-lake,
   semantic-model, power-bi, data-factory, dataflow-gen2, spark, rti, eventhouse-kql, sql-database,
   mirroring, fabric-data-agent, fabric-iq, graphql-api, purview, capacity), depth 1-5, type
   (fact|pattern|antipattern|internal), and topical tags (MicrosoftFabric, DataEngineering,
   PySpark, Python, DirectLake, PowerBI, …).
4. Record source diagrams as referenced assets (url + caption + attribution; never re-host).
   Prefer an original diagram via /prompts:fa-diagram over copying.
5. Write content/sources/<slug>.json (see content/sources/example-direct-lake.json) and commit it.
   There is no server ingest API — a human publishes it via Settings → Publish → "Publish all".
6. Sources from sources (suggest, never auto-ingest): for the high-trust links this source relied
   on, score a tier by domain (learn.microsoft.com=1, *.microsoft.com blog=2, github.com/microsoft=3).
   For each tier ≤ 3 link not already a source or queued, suggest it for human approval — do not
   ingest it:
   Report high-trust discovered links for the human to add in Settings → Queue with
   `kind=source` and `notes` starting `discovered via <parent-slug>`. Keep it to a few genuine ones.
   Output the claims table, assets, file path, exact Settings → Publish action, and any discovered
   source queue suggestions. Never mark claims verified.
