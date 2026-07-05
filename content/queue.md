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

## Done

# blog INDEX pages — curator picked substantive Fabric posts and

# ingested each post as its own source

https://bradcoles-dev.github.io/index.html#blog tier=4 -> content/sources/bradcoles-declarative-transformation.json, content/sources/bradcoles-fabric-mirroring-before-you-commit.json, content/sources/bradcoles-fabric-private-links.json
https://milescole.dev/categories/ tier=4 -> content/sources/milescole-deletion-vectors.json, content/sources/milescole-optimized-write-fabric.json, content/sources/milescole-table-compaction.json

# AI & APIs section leaf topics — ingested, awaiting Settings → Publish + Registry verify

https://learn.microsoft.com/en-us/fabric/data-science/concept-data-agent tier=1 -> content/sources/fabric-data-agent-concept.json
https://learn.microsoft.com/en-us/fabric/data-engineering/api-graphql-overview tier=1 -> content/sources/api-graphql-overview.json
https://learn.microsoft.com/en-us/fabric/fundamentals/fabric-iq-overview tier=1 -> content/sources/fabric-iq-overview.json # NOTE: URL moved to https://learn.microsoft.com/en-us/fabric/iq/overview — ingested from corrected URL
