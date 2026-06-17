export const CAPABILITY_NAMES: Record<
  string,
  { name: string; accent: string; description: string }
> = {
  "fabric-platform": {
    name: "Fabric Platform",
    accent: "indigo",
    description: "Tenant, workspace, workload, and platform-level Fabric concepts.",
  },
  capacity: {
    name: "Capacity & Cost",
    accent: "amber",
    description: "Capacity units, bursting, throttling, memory, and sizing trade-offs.",
  },
  purview: {
    name: "Governance & Purview",
    accent: "violet",
    description: "Governance controls, endorsement, sensitivity, and estate oversight.",
  },
  onelake: {
    name: "OneLake",
    accent: "teal",
    description: "Tenant-wide logical lake storage and shortcuts.",
  },
  lakehouse: {
    name: "Lakehouse",
    accent: "teal",
    description: "Delta tables and files for data engineering over OneLake.",
  },
  mirroring: {
    name: "Mirroring",
    accent: "teal",
    description: "Near-real-time database replication into OneLake.",
  },
  spark: {
    name: "Spark",
    accent: "rose",
    description: "Notebooks, Spark jobs, pools, and Delta engineering workloads.",
  },
  "data-factory": {
    name: "Data Factory",
    accent: "rose",
    description: "Pipelines, copy activity, orchestration, and movement patterns.",
  },
  "dataflow-gen2": {
    name: "Dataflow Gen2",
    accent: "rose",
    description: "Low-code Power Query transformation into Fabric destinations.",
  },
  warehouse: {
    name: "Warehouse",
    accent: "yellow",
    description: "T-SQL warehouse behavior, caching, statistics, and performance.",
  },
  polaris: {
    name: "Polaris SQL Engine",
    accent: "yellow",
    description: "Distributed SQL query execution internals.",
  },
  "sql-database": {
    name: "SQL Database in Fabric",
    accent: "yellow",
    description: "Operational SQL in Fabric with analytics replication.",
  },
  "direct-lake": {
    name: "Direct Lake",
    accent: "indigo",
    description: "Power BI semantic models reading Delta tables from OneLake.",
  },
  "semantic-model": {
    name: "Semantic Model",
    accent: "indigo",
    description: "Power BI model storage modes, modelling, and serving behavior.",
  },
  "power-bi": {
    name: "Power BI",
    accent: "indigo",
    description: "Reports, apps, and governed consumption experiences.",
  },
  rti: {
    name: "Real-Time Intelligence",
    accent: "rose",
    description: "Eventstreams, real-time hub, and streaming analytics.",
  },
  "eventhouse-kql": {
    name: "Eventhouse / KQL",
    accent: "rose",
    description: "KQL databases and telemetry analytics.",
  },
  "fabric-data-agent": {
    name: "Fabric Data Agent",
    accent: "violet",
    description: "Conversational data experiences grounded in Fabric items.",
  },
  "fabric-iq": {
    name: "Fabric IQ",
    accent: "violet",
    description: "Business ontology and meaning layer for Fabric data.",
  },
  "graphql-api": {
    name: "GraphQL API",
    accent: "violet",
    description: "Programmatic GraphQL access to Fabric data.",
  },
};
