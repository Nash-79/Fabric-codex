export interface ReferenceDoc {
  slug: string;
  title: string;
  subtitle: string;
  summary: string;
  staticPath: string;
  capabilities: string[];
  readingTimeMinutes: number;
  svgCount: number;
  sectionsCount: number;
  highlightPoints: string[];
  isInteractive?: boolean;
  version?: number;
  contentHash?: string;
}

export const REFERENCE_DOCS: ReferenceDoc[] = [
  {
    slug: "spark-internals",
    title: "Fabric Spark Engine Internals",
    subtitle: "Execution Model, Catalyst, Tungsten, AQE, NEE, Memory & Capacity Diagnostics",
    summary:
      "Comprehensive deep dive into the Apache Spark engine in Microsoft Fabric. Traces the full query execution pipeline, memory allocator boundaries, native execution engine fallbacks, and SKU throttling mechanics.",
    staticPath: "/toolkit-source/spark_internals.html",
    capabilities: ["spark", "capacity"],
    readingTimeMinutes: 45,
    svgCount: 74,
    sectionsCount: 47,
    isInteractive: true,
    version: 1,
    highlightPoints: [
      "AQE runtime plan adaptation & shuffle partition coalesce",
      "Native Execution Engine (NEE) C++ vectorization boundary & fallback matrix",
      "Unified Memory Manager: Execution vs Storage vs Off-Heap allocations",
      "Capacity throttling: burst debt curves and interactive diagnostic tooling",
    ],
  },
  {
    slug: "efficient-scaledown",
    title: "Efficient Scaledown & Remote Shuffle Manager",
    subtitle: "RSM, Shuffle Migration, Decommission Lifecycle & Enterprise Guidance",
    summary:
      "Practitioner architectural whitepaper tracing Remote Shuffle Manager (RSM), shuffle data lifecycle across node decommissions, and dynamic scale-down optimization in Fabric Spark.",
    staticPath: "/toolkit-source/efficient_scaledown.html",
    capabilities: ["spark", "fabric-platform"],
    readingTimeMinutes: 20,
    svgCount: 4,
    sectionsCount: 14,
    highlightPoints: [
      "SPARK-20624 decommission lifecycle & BlockManager block migration",
      "SortShuffleManager vs Remote Shuffle Manager storage topology",
      "ShuffleDataIO abstractions and AQE shuffle write interactions",
      "Cost-optimized autoscaling recipes with zero shuffle loss",
    ],
  },
  {
    slug: "runtime-2-0-guide",
    title: "Fabric Runtime 2.0 Deep Dive",
    subtitle: "Apache Spark 4.1, Delta 4.2 & Migration Architecture",
    summary:
      "Detailed migration and architecture guide for Fabric Runtime 2.0. Analyzes the Spark 4.x ANSI mode default, Native Execution Engine behavior, %%configure precedence, and production recipes.",
    staticPath: "/toolkit-source/runtime_2_0_guide.html",
    capabilities: ["spark", "lakehouse"],
    readingTimeMinutes: 18,
    svgCount: 12,
    sectionsCount: 12,
    highlightPoints: [
      "Spark 4.1 ANSI mode default × NEE fallback interaction matrix",
      "V-Order optimization decision tree and write latency tradeoffs",
      "%%configure scope necessity across notebook vs pipeline execution",
      "Four enterprise configuration recipes across Runtime 1.1 to 2.0",
    ],
  },
  {
    slug: "onelake-polaris-deepdives",
    title: "OneLake Storage, Polaris & Direct Lake",
    subtitle: "Shortcut Resolution, Distributed SQL Compilation & Direct Lake Guardrails",
    summary:
      "Architectural deep dive covering OneLake hierarchical storage, shortcut identity resolution, Polaris distributed SQL compilation, and Direct Lake memory paging.",
    staticPath: "/toolkit-source/onelake_polaris_deepdives.html",
    capabilities: ["onelake", "polaris", "direct-lake", "sql-database"],
    readingTimeMinutes: 16,
    svgCount: 5,
    sectionsCount: 8,
    highlightPoints: [
      "OneLake shortcut identity resolution & delegation flow",
      "Polaris distributed SQL compilation pipeline: frontend to execution",
      "Direct Lake file fragmentation diagnostics and memory guardrails",
      "Fabric SQL Database shadow-replica querying pattern",
    ],
  },
  {
    slug: "fabric-deepdives",
    title: "Fabric Deep Dives — SQL, Functions & dbt",
    subtitle: "Spark View Types, Fabric User Data Functions & dbt-on-Fabric",
    summary:
      "Synthesized practitioner guide covering Spark view and function types with executed test suites, User Data Functions (UDFs), Fabric SQL Database access paths, and dbt adapter topologies.",
    staticPath: "/toolkit-source/fabric_deepdives.html",
    capabilities: ["sql-database", "spark", "fabric-data-agent"],
    readingTimeMinutes: 22,
    svgCount: 6,
    sectionsCount: 10,
    highlightPoints: [
      "Executed VERIFIED / FALSIFIED matrix of Spark view & function types",
      "Native Execution Engine do's and don'ts practice sheet",
      "Three distinct Fabric SQL Database notebook access paths",
      "Two-adapter dbt-on-Fabric architecture (dbt-fabric vs dbt-synapse)",
    ],
  },
];

export function getReferenceDocBySlug(slug: string): ReferenceDoc | undefined {
  return REFERENCE_DOCS.find((d) => d.slug === slug || d.staticPath.includes(slug));
}
