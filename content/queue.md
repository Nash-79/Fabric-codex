# Ingestion queue

One source per line: `<url> tier=<1-6>` (tier optional — the curator infers it from the
domain if omitted). Lines starting with `#` are comments. Run `/ingest-batch` to process;
processed lines are moved to the Done section below with the resulting content file.

## Queued

# internals gap: direct-lake / Performance characteristics — NEEDS SOURCE: a Microsoft engineering blog, VLDB/conference talk, or internals deep-dive publishing measured Direct Lake benchmark numbers (cold-vs-hot query latency, transcoding throughput) tier=1

# internals gap: data-factory / Performance characteristics — NEEDS SOURCE: a Microsoft engineering blog or benchmark documenting Copy activity/ITO throughput numbers at scale (e.g. MB/s or rows/sec by ITO preset), or a documented complexity/scaling analysis for pipeline orchestration under load tier=1

# internals gap: mirroring / Performance characteristics — NEEDS SOURCE: a Microsoft engineering blog, conference talk, or internals deep-dive documenting Fabric Mirroring replication engine throughput limits, concurrent-table scaling behavior, or benchmark numbers beyond the single as-little-as-15-seconds latency figure tier=1

# internals gap: eventhouse-kql / How it works internally — NEEDS SOURCE: a Kusto/Azure Data Explorer engineering blog or the Kusto white paper documenting KQL query-execution engine internals (columnar operator execution against the hot cache, indexing structures, update-policy/materialized-view transform pipeline) tier=1

# internals gap: sql-database / Performance characteristics — NEEDS SOURCE: a Microsoft engineering blog or benchmark publishing measured throughput/latency numbers for the SQL database-to-OneLake replication path (replication lag under write load, Parquet conversion throughput) beyond the qualitative near-real-time characterization tier=1

# internals gap: capacity / Performance characteristics — NEEDS SOURCE: a Microsoft engineering blog or internals deep-dive publishing measured throttling/smoothing benchmark numbers (e.g. observed burndown rates under sustained load, or empirical CU-to-latency curves by SKU) tier=1

# internals gap: spark / Performance characteristics — NEEDS SOURCE: a Microsoft engineering blog or benchmark publishing measured Fabric Spark executor-scaling throughput curves or shuffle I/O performance against OneLake at scale, beyond the existing Native Execution Engine TPC-DS benchmark figures tier=1

# internals gap: rti / How it works internally — NEEDS SOURCE: an Azure/Fabric engineering blog or the Kusto (Azure Data Explorer) whitepaper documenting Eventstreams operator-pipeline execution (streaming operator scheduling, checkpointing, delivery-semantics guarantees) and how Activator evaluates threshold/pattern/KQL conditions against a live stream tier=1

# internals gap: rti / Performance characteristics — NEEDS SOURCE: a Microsoft engineering blog or benchmark publishing measured Eventstream throughput (events/sec by source type, end-to-end ingestion-to-Activator latency) or Activator rule-evaluation latency at scale tier=1

# internals gap: semantic-model / Performance characteristics — NEEDS SOURCE: a Microsoft engineering blog or benchmark publishing measured VertiPaq query-latency numbers by segment size, on-demand-load column-paging throughput, or eviction/reload timing curves for large-format semantic models tier=1

# internals gap: power-bi / Performance characteristics — NEEDS SOURCE: a Microsoft engineering blog or benchmark publishing measured VertiPaq query-latency numbers by segment size, Direct Lake cold-vs-hot query latency figures, or on-demand-load column-paging throughput numbers for large-format semantic models tier=1

# internals gap: dataflow-gen2 / all sub-headings — NEEDS SOURCE: a Microsoft engineering blog or deep-dive on Dataflow Gen2 mashup-engine execution, staging/fast-copy internals, or measured refresh throughput tier=1

# internals gap: fabric-overview / all sub-headings — NEEDS SOURCE: a Microsoft engineering blog or conference talk on Fabric control-plane/workspace architecture internals beyond the L1-L2 overview docs tier=1

# internals gap: governance / all sub-headings — NEEDS SOURCE: a Microsoft engineering blog or deep-dive on Purview policy-evaluation/lineage-scanning internals in Fabric tier=1

# internals gap: lakehouse-direct-lake-bi / all sub-headings — NEEDS SOURCE: covered largely by existing direct-lake claims; design predates the Internals convention and needs a grounded rewrite of its Internals section from direct-lake L4/L5 claims tier=1

# internals gap: data-mesh-domains / How it works internally + Performance characteristics — NEEDS SOURCE: Microsoft documentation or engineering blog on domain/workspace metadata internals, cross-domain shortcut resolution, or capacity-isolation behavior at scale tier=1

# internals gap: multi-stack-integration / Performance characteristics — NEEDS SOURCE: a Microsoft engineering blog or benchmark on multi-cloud shortcut read latency/egress behavior (S3/GCS shortcut throughput, cache hit behavior) tier=1

# internals gap: streaming-analytics-pattern / How it works internally — NEEDS SOURCE: same gap as rti internals above — Eventstream operator pipeline, checkpointing, and Activator evaluation internals; resolves the streaming-analytics-pattern design placeholder too tier=1

# ---- Suggested sources discovered during 2026-07-05 ingestion (human approval needed — add via Settings → Queue, kind=source) ----
# discovered via fabric-jumpstart-catalog: https://github.com/microsoft/fabric-jumpstart tier=3 (backing repo: install mechanics, Core/Community standards)
# discovered via fabric-jumpstart-catalog: https://community.fabric.microsoft.com/t5/Fabric-Updates-Blog/Empowering-admins-and-developers-with-a-Fabric-platform-ready/ba-p/5172252 tier=2 (official Jumpstart launch announcement)
# discovered via fabric-jumpstart-catalog: https://microsoft.github.io/fabric-cicd/latest/ tier=3 (fabric-cicd deployment engine docs)
# discovered via fabricdataagent-community-hub: https://learn.microsoft.com/en-us/fabric/data-science/data-agent-configuration-best-practices tier=1 (official configuration best practices)
# discovered via fabricdataagent-community-hub: https://learn.microsoft.com/en-us/fabric/data-science/data-agent-mcp-server tier=1 (Data Agent MCP server)
# discovered via fabricdataagent-community-hub: https://community.fabric.microsoft.com/t5/Fabric-Updates-Blog/Data-Agent-Now-Supports-Eventhouse-Functions-Materialized-Views/ba-p/5181801 tier=2 (Eventhouse UDF/MV/shortcut support announcement)
# discovered via fabricdataagent-community-hub: https://community.fabric.microsoft.com/t5/IQ-Community-Blog/Fabric-Data-Agents-The-Shift-from-Querying-Data-to-Reasoning/ba-p/5139442 tier=2 (IQ community blog: querying → reasoning)
# discovered via fabricdataagent-community-hub: https://microsoftlearning.github.io/mslearn-fabric/Instructions/Labs/22d-copilot-fabric-data-agents.html tier=3 (official hands-on lab)
# discovered via fabricdataagent-community-hub: https://github.com/microsoft/fabric-samples/tree/main/docs-samples/data-science/data-agent-sdk tier=3 (official SDK sample notebooks)
# discovered via fabric-data-agent-create: https://learn.microsoft.com/en-us/fabric/security/workspace-outbound-access-protection-data-agent tier=1 (outbound access protection for data agents)
# discovered via fabric-data-agent-create: https://learn.microsoft.com/en-us/fabric/data-science/data-agent-tenant-settings tier=1 (data agent tenant settings)
# discovered via fabric-data-agent-evaluation: https://learn.microsoft.com/en-us/fabric/data-science/fabric-data-agent-sdk tier=1 (Python SDK reference)
# discovered via fabric-data-agent-create: https://learn.microsoft.com/en-us/fabric/governance/external-data-sharing-overview tier=1 (external data sharing overview)

# ---- Source tracking (2026-07-05) ----
# fabricdataagent.com has NO RSS feed. Track it two ways:
# 1. RSS: add https://github.com/pawarbi/fabric-data-agent-website/commits/main.atom (tier 4, tags FabricDataAgent,Community)
#    in Settings → RSS Feeds — the site is open source, so every content update is a commit on that feed.
# 2. Drift: the site publishes https://fabricdataagent.com/llms-full.txt (full-content dump; source of
#    fabricdataagent-community-hub). Re-run `/drift fabricdataagent-community-hub` periodically (e.g. monthly)
#    to diff its claims. Jumpstart catalog: `/drift fabric-jumpstart-catalog` on the same cadence.

## Done

# blog INDEX pages — curator picked substantive Fabric posts and

# ingested each post as its own source

https://bradcoles-dev.github.io/index.html#blog tier=4 -> content/sources/bradcoles-declarative-transformation.json, content/sources/bradcoles-fabric-mirroring-before-you-commit.json, content/sources/bradcoles-fabric-private-links.json
https://milescole.dev/categories/ tier=4 -> content/sources/milescole-deletion-vectors.json, content/sources/milescole-optimized-write-fabric.json, content/sources/milescole-table-compaction.json

# AI & APIs section leaf topics — ingested, awaiting Settings → Publish + Registry verify

https://learn.microsoft.com/en-us/fabric/data-science/concept-data-agent tier=1 -> content/sources/fabric-data-agent-concept.json
https://learn.microsoft.com/en-us/fabric/data-engineering/api-graphql-overview tier=1 -> content/sources/api-graphql-overview.json
https://learn.microsoft.com/en-us/fabric/fundamentals/fabric-iq-overview tier=1 -> content/sources/fabric-iq-overview.json # NOTE: URL moved to https://learn.microsoft.com/en-us/fabric/iq/overview — ingested from corrected URL

# 2026-07-05 batch — Jumpstart + Fabric Data Agent expansion, awaiting Settings → Publish + Registry verify

https://jumpstart.fabric.microsoft.com/catalog tier=1 -> content/sources/fabric-jumpstart-catalog.json
https://fabricdataagent.com/ tier=4 -> content/sources/fabricdataagent-community-hub.json # extracted from /llms-full.txt
https://learn.microsoft.com/en-us/fabric/data-science/how-to-create-data-agent tier=1 -> content/sources/fabric-data-agent-create.json
https://learn.microsoft.com/en-us/fabric/data-science/evaluate-data-agent tier=1 -> content/sources/fabric-data-agent-evaluation.json
https://learn.microsoft.com/en-us/fabric/data-science/data-agent-configurations tier=1 -> content/sources/fabric-data-agent-configuration.json
