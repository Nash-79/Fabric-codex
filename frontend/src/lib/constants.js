import { c } from "../theme.js";

export const CAPABILITIES = [
  { id: "fabric-platform", name: "Microsoft Fabric", area: "Platform" },
  { id: "onelake", name: "OneLake", area: "Storage" },
  { id: "lakehouse", name: "Lakehouse", area: "Storage" },
  { id: "warehouse", name: "Warehouse", area: "Warehouse" },
  { id: "polaris", name: "Polaris / SQL Engine", area: "Warehouse" },
  { id: "direct-lake", name: "Direct Lake", area: "BI & Semantic" },
  { id: "semantic-model", name: "Semantic Model", area: "BI & Semantic" },
  { id: "power-bi", name: "Power BI", area: "BI & Semantic" },
  { id: "data-factory", name: "Data Factory", area: "Integration" },
  { id: "dataflow-gen2", name: "Dataflow Gen2", area: "Integration" },
  { id: "spark", name: "Spark / Data Engineering", area: "Engineering" },
  { id: "rti", name: "Real-Time Intelligence", area: "Real-Time" },
  { id: "eventhouse-kql", name: "Eventhouse / KQL", area: "Real-Time" },
  { id: "sql-database", name: "SQL Database in Fabric", area: "Databases" },
  { id: "mirroring", name: "Mirroring", area: "Databases" },
  { id: "fabric-data-agent", name: "Fabric Data Agent", area: "AI & Agents" },
  { id: "fabric-iq", name: "Fabric IQ / Ontology", area: "AI & Agents" },
  { id: "graphql-api", name: "API for GraphQL", area: "APIs" },
  { id: "purview", name: "Governance / Purview", area: "Governance" },
  { id: "capacity", name: "Capacity & Cost", area: "Platform Ops" },
];

export const DEPTHS = [
  { n: 1, short: "L1", label: "Conceptual" },
  { n: 2, short: "L2", label: "Practitioner" },
  { n: 3, short: "L3", label: "Architect" },
  { n: 4, short: "L4", label: "Performance" },
  { n: 5, short: "L5", label: "Internals" },
];

export const TIER_COLORS = {
  1: c.tier1,
  2: c.tier2,
  3: c.tier3,
  4: c.tier4,
  5: c.tier5,
  6: c.tier6,
};
export const TIER_LABELS = {
  1: "Microsoft Learn",
  2: "Fabric product blog",
  3: "Microsoft GitHub / papers",
  4: "MVP / community",
  5: "Vendor",
  6: "Unknown",
};
export const SEV_COLORS = { critical: c.red, warning: c.amber, info: c.muted };
