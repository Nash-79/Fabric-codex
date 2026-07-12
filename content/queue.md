# Ingestion queue

One source per line: `<url> tier=<1-6>` (tier optional — the curator infers it from the
domain if omitted). Lines starting with `#` are comments. Run `/ingest-batch` to process;
processed lines are moved to the Done section below with the resulting content file.

## Queued

# internals gap: direct-lake / Performance characteristics — NEEDS SOURCE: a Microsoft engineering blog, VLDB/conference talk, or internals deep-dive publishing measured Direct Lake benchmark numbers (cold-vs-hot query latency, transcoding throughput) tier=1

# internals gap: data-factory / Performance characteristics — NEEDS SOURCE: a Microsoft engineering blog or benchmark documenting Copy activity/ITO throughput numbers at scale (e.g. MB/s or rows/sec by ITO preset), or a documented complexity/scaling analysis for pipeline orchestration under load tier=1

# internals gap: mirroring / Performance characteristics — NEEDS SOURCE: a Microsoft engineering blog, conference talk, or internals deep-dive documenting Fabric Mirroring replication engine throughput limits, concurrent-table scaling behavior, or benchmark numbers beyond the single as-little-as-15-seconds latency figure tier=1

# internals gap: sql-database / Performance characteristics — NEEDS SOURCE: a Microsoft engineering blog or benchmark publishing measured throughput/latency numbers for the SQL database-to-OneLake replication path (replication lag under write load, Parquet conversion throughput) beyond the qualitative near-real-time characterization tier=1

# internals gap: capacity / Performance characteristics — NEEDS SOURCE: a Microsoft engineering blog or internals deep-dive publishing measured throttling/smoothing benchmark numbers (e.g. observed burndown rates under sustained load, or empirical CU-to-latency curves by SKU) tier=1

# internals gap: spark / Performance characteristics — NEEDS SOURCE: a Microsoft engineering blog or benchmark publishing measured Fabric Spark executor-scaling throughput curves or shuffle I/O performance against OneLake at scale, beyond the existing Native Execution Engine TPC-DS benchmark figures tier=1

# internals gap: rti / How it works internally — NEEDS SOURCE: an Azure/Fabric engineering blog or the Kusto (Azure Data Explorer) whitepaper documenting Eventstreams operator-pipeline execution (streaming operator scheduling, checkpointing, delivery-semantics guarantees) and how Activator evaluates threshold/pattern/KQL conditions against a live stream tier=1

# internals gap: rti / Performance characteristics — NEEDS SOURCE: a Microsoft engineering blog or benchmark publishing measured Eventstream throughput (events/sec by source type, end-to-end ingestion-to-Activator latency) or Activator rule-evaluation latency at scale tier=1

# internals gap: semantic-model / Performance characteristics — NEEDS SOURCE: a Microsoft engineering blog or benchmark publishing measured VertiPaq query-latency numbers by segment size, on-demand-load column-paging throughput, or eviction/reload timing curves for large-format semantic models tier=1

# internals gap: power-bi / Performance characteristics — NEEDS SOURCE: a Microsoft engineering blog or benchmark publishing measured VertiPaq query-latency numbers by segment size, Direct Lake cold-vs-hot query latency figures, or on-demand-load column-paging throughput numbers for large-format semantic models tier=1

# internals gap: fabric-overview / all sub-headings — NEEDS SOURCE: a Microsoft engineering blog or conference talk on Fabric control-plane/workspace architecture internals beyond the L1-L2 overview docs tier=1

# internals gap: governance / all sub-headings — NEEDS SOURCE: a Microsoft engineering blog or deep-dive on Purview policy-evaluation/lineage-scanning internals in Fabric tier=1

# internals gap: lakehouse-direct-lake-bi / all sub-headings — NEEDS SOURCE: covered largely by existing direct-lake claims; design predates the Internals convention and needs a grounded rewrite of its Internals section from direct-lake L4/L5 claims tier=1

# internals gap: data-mesh-domains / How it works internally + Performance characteristics — NEEDS SOURCE: Microsoft documentation or engineering blog on domain/workspace metadata internals, cross-domain shortcut resolution, or capacity-isolation behavior at scale tier=1

# internals gap: multi-stack-integration / Performance characteristics — NEEDS SOURCE: a Microsoft engineering blog or benchmark on multi-cloud shortcut read latency/egress behavior (S3/GCS shortcut throughput, cache hit behavior) tier=1

# internals gap: streaming-analytics-pattern / How it works internally + Performance characteristics — NEEDS SOURCE: same gap as rti internals above — Eventstream operator pipeline, checkpointing, and Activator evaluation internals, plus measured Eventstream throughput/end-to-end latency benchmarks; resolves the streaming-analytics-pattern design placeholders too tier=1

# internals gap: fabric-iq / Performance characteristics — NEEDS SOURCE: a Microsoft engineering blog covering Fabric IQ ontology query performance, NL2Ontology latency characteristics, graph-refresh throughput at scale, or measured benchmark numbers for the operations agent 5-minute polling cadence under high-cardinality Eventhouse tables tier=1

# internals gap: graphql-api / How it works internally + Performance characteristics — NEEDS SOURCE: a Microsoft engineering blog or architecture deep-dive on how Fabric GraphQL resolvers translate a fan-out query into SQL analytics endpoint calls (pushdown behavior, join strategy, query planning), plus measured query latency/resolver overhead versus direct SQL at scale tier=1

# internals gap: fabric-data-agent / Performance characteristics — NEEDS SOURCE: a Microsoft engineering blog or benchmark publishing verified latency/throughput numbers for data agent query execution, generation time by generator type, or capacity consumption under concurrent agent load tier=1

# internals gap: multi-cloud-data-architecture / Performance characteristics — NEEDS SOURCE: a Microsoft engineering blog or benchmark on cross-cloud shortcut read latency, egress behavior, and cache-hit characteristics (S3/GCS shortcut throughput) for the multi-cloud pattern tier=1

# internals gap: event-driven-orchestration / How it works internally + Performance characteristics — NEEDS SOURCE: same gap as rti internals above — Eventstream operator pipeline, checkpointing, and Activator condition-evaluation internals, plus measured event-trigger-to-pipeline-start latency for event-driven orchestration tier=1

# internals gap: investment-analytics-medallion / Performance characteristics — NEEDS SOURCE: a Microsoft engineering blog or benchmark with measured medallion-pipeline numbers applicable to this workload (Spark transformation duration by data shape, Warehouse query latency, Direct Lake/semantic-model refresh figures) tier=1

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

# ---- Suggested sources discovered during 2026-07-11 batch ingestion (77 queue items → 57 new source files; human approval needed — add via Settings → Queue, kind=source) ----
# Highest value first. Deduped across 20 curator runs; links already present as sources or queue items were dropped.
# discovered via ultimateinfoguide-rayfin-apps-guide + fabric-blog-rayfin-ama: https://learn.microsoft.com/en-us/fabric/apps/overview tier=1 (Fabric Apps/Rayfin official docs — NEW product surface with thin tier-1 coverage; surfaced independently by two curators)
# discovered via lakehouse-sql-endpoint-internals re-ingest: https://learn.microsoft.com/en-us/fabric/data-engineering/sql-analytics-endpoint-performance tier=1 (HIGH PRIORITY — the sync-latency/small-file/partition facts REMOVED from the metadata-sync page moved here; recaptures 5 dropped claims)
# discovered via fabric-blog-oap-rti: https://learn.microsoft.com/en-us/fabric/security/workspace-outbound-access-protection-overview tier=1 (OAP canonical doc behind both OAP blog posts)
# discovered via fabric-blog-runtime-release-channels: https://learn.microsoft.com/fabric/data-engineering/release-channels tier=1 (canonical release-channels doc behind the announcement)
# discovered via fabric-blog-synapse-migration-cli: https://learn.microsoft.com/fabric/fundamentals/skills-for-fabric-overview tier=1 (Skills for Fabric concept doc; also -install and -discover pages + github.com/microsoft/skills-for-fabric tier=3)
# discovered via warehouse-performance-guidelines re-ingest: https://learn.microsoft.com/en-us/fabric/data-warehouse/statistics tier=1, /transactions tier=1, /clone-table tier=1, /data-clustering tier=1, /query-insights tier=1 (new perf-guidelines subtopics)
# discovered via warehouse-overview re-ingest: https://learn.microsoft.com/en-us/fabric/fundamentals/decision-guide-lakehouse-warehouse tier=1 (also cited by ultimateinfoguide-lakehouse-vs-warehouse), /fabric/data-warehouse/migration-assistant tier=1
# discovered via fabric-blog-data-protection-ai-ready: https://learn.microsoft.com/fabric/governance/information-protection tier=1, /fabric/governance/protection-policies-overview tier=1, /purview/dlp-powerbi-get-started tier=1, /purview/data-security-posture-management-learn-about tier=1 (Purview/governance depth pack)
# discovered via ultimateinfoguide-operations-agent: https://learn.microsoft.com/en-us/fabric/real-time-intelligence/operations-agent tier=1 + /operations-agent-limitations tier=1 (tier-1 grounding to supersede the tier-6 Operations Agent claims)
# discovered via fabric-blog-spark-failure-diagnosis: https://learn.microsoft.com/fabric/data-engineering/spark-monitoring-overview tier=1, /spark-monitoring-best-practices tier=1, https://github.com/microsoft/skills-for-fabric tier=3
# discovered via fabric-blog-spark-efficient-scaledown: https://learn.microsoft.com/fabric/data-engineering/efficient-scaledown-remote-shuffle-manager tier=1
# discovered via spark-compute-pools re-ingest: https://learn.microsoft.com/en-us/fabric/data-engineering/custom-live-pools-overview tier=1
# discovered via fabric-blog-item-recovery: https://learn.microsoft.com/fabric/admin/retention-recovery tier=1
# discovered via fabric-blog-lakehouse-table-health: https://learn.microsoft.com/sql/relational-databases/system-stored-procedures/sp-get-table-health-metrics-transact-sql tier=1
# discovered via fabric-blog-df-multicloud-patterns: https://learn.microsoft.com/fabric/data-factory/activity-overview tier=1, /connector-overview tier=1
# discovered via sql-database-fabric-overview re-ingest: https://learn.microsoft.com/en-us/fabric/database/sql/use-case-ai-application tier=1, /use-case-translytical-applications tier=1, /fabric/mirroring/azure-sql-database tier=1
# discovered via sql-database-hyperscale-architecture re-ingest: https://learn.microsoft.com/en-us/azure/azure-sql/database/service-tier-hyperscale-replicas tier=1, /read-scale-out tier=1
# discovered via fabric-blog-billing-planning: https://community.fabric.microsoft.com/t5/Fabric-Updates-Blog/Introducing-Planning-in-Microsoft-Fabric-IQ-From-historical-data/ba-p/5172232 tier=2 (deeper Fabric IQ Planning concept post)
# discovered via fabric-blog-sql-2026-roundup: full-collation ba-p/5172032 tier=2, migration-assistant ba-p/5172048 tier=2, https://devblogs.microsoft.com/azure-sql/introducing-sql-mcp-server/ tier=2
# discovered via ultimateinfoguide-fabric-iq-deep-dive: https://learn.microsoft.com/en-us/fabric/iq/rules-in-ontology tier=1
# discovered via ultimateinfoguide-data-agent-tutorial: https://learn.microsoft.com/en-us/azure/foundry/agents/how-to/tools/fabric tier=1 (Foundry data-agent tool), Service-Principal-Support ba-p/5181634 tier=2
# discovered via ultimateinfoguide-governance-tutorial: https://learn.microsoft.com/en-us/fabric/governance/onelake-catalog-overview tier=1, /onelake-catalog-govern tier=1, /microsoft-purview-fabric tier=1, govern-tab security-insights blog post tier=2
# discovered via ultimateinfoguide-mirroring-tutorial: https://learn.microsoft.com/en-us/fabric/mirroring/open-mirroring-partners-ecosystem tier=1, /mirroring/monitor tier=1, extended-capabilities-in-mirroring blog tier=2
# discovered via ultimateinfoguide-capacity-optimization: https://learn.microsoft.com/en-us/fabric/enterprise/optimize-capacity tier=1, /metrics-app tier=1, /plan-capacity tier=1, /fabric/data-engineering/autoscale-billing-for-spark-overview tier=1
# discovered via ultimateinfoguide-onelake-shortcut-403-fix: https://learn.microsoft.com/en-us/fabric/onelake/onelake-shortcut-security tier=1, workspace-identity-authentication blog tier=2
# discovered via ultimateinfoguide-pbir-format: https://learn.microsoft.com/en-us/power-bi/developer/embedded/projects-enhanced-report-format tier=1, /developer/projects/projects-overview tier=1
# discovered via ultimateinfoguide-power-bi posts: https://learn.microsoft.com/en-us/power-bi/create-reports/copilot-introduction tier=1, /copilot-prepare-data-ai tier=1, /natural-language/q-and-a-intro tier=1 (Q&A deprecation Dec 2026)
# discovered via ultimateinfoguide-fabric-vs-synapse: https://learn.microsoft.com/en-us/fabric/data-engineering/comparison-between-fabric-and-azure-synapse-spark tier=1, /fabric/data-warehouse/data-types tier=1
# discovered via fabric-blog-oap-event-flows: https://learn.microsoft.com/en-us/fabric/real-time-hub/fabric-events-overview tier=1, /fabric-events-paused-state tier=1, /private-links-real-time-events tier=1
# discovered via ultimateinfoguide-eventstream-tutorial: https://learn.microsoft.com/en-us/fabric/real-time-intelligence/event-streams/overview tier=1
# discovered via fabricdataagent-community-hub re-ingest: https://github.com/microsoft/fabric_data_agent_client tier=3, https://github.com/microsoft/Data-and-Agent-Governance-and-Security-Accelerator tier=3
# discovered via fabric-blog-rayfin-ama: introducing-rayfin ba-p/5191676 tier=1, https://github.com/microsoft/rayfin tier=3
# discovered via ultimateinfoguide-production-stability: https://learn.microsoft.com/en-us/fabric/onelake/security/data-access-control-model tier=1, /fabric/onelake/onelake-storage-tiers tier=1

# ---- Data-hygiene note (2026-07-11) ----
# Supabase has the CoddSpeed SIGMOD paper as a source under TWO slugs: coddspeed-gpu-warehouse and
# coddspeed-hardware-accelerated-query-processing-in-microsoft-fabric. Admin should review and retire one.

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
