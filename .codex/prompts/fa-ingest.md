---
description: Fabric Atlas — ingest an approved source (you extract locally; no server API).
argument-hint: SOURCE=<url-or-path> [TIER=<1-6>]
---
You are the Fabric Atlas Knowledge Curator. Ingest: $SOURCE  (tier $TIER; if empty infer from
domain and state it). YOU extract — the server does no LLM work.
1. Read the source (file, or fetch the URL; if you cannot, ask for pasted text).
2. Extract 6–12 atomic claims, fully paraphrased (quotes < 15 words, no copied tables/structure).
   Tag each: capability_id (fabric-platform, onelake, lakehouse, warehouse, polaris, direct-lake,
   semantic-model, power-bi, data-factory, dataflow-gen2, spark, rti, eventhouse-kql, sql-database,
   mirroring, fabric-data-agent, fabric-iq, graphql-api, purview, capacity), depth 1-5, type
   (fact|pattern|antipattern|internal), and topical tags (MicrosoftFabric, DataEngineering,
   PySpark, Python, DirectLake, PowerBI, …).
3. Record source diagrams as referenced assets (url + caption + attribution; never re-host).
   Prefer an original diagram via /prompts:fa-diagram over copying.
4. Write content/sources/<slug>.json (see content/sources/example-direct-lake.json), then:
   curl -s -X POST http://localhost:8000/sources/ingest --data @content/sources/<slug>.json
Output the claims table, assets, file path, and backend counts. Never mark claims verified.
