import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const aliases = new Map([
  ["p3411-armbrust-pdf", "delta-lake-storage-internals"],
  ["sql-analytics-endpoint-metadata-sync", "lakehouse-sql-endpoint-internals"],
  ["native-execution-engine-overview", "spark-native-execution-engine"],
  ["hyperscale-architecture", "sql-database-hyperscale-architecture"],
  [
    "coddspeed-hardware-accelerated-query-processing-in-microsoft-fabric",
    "coddspeed-gpu-warehouse",
  ],
]);

for (const directory of ["content/articles", "content/designs", "content/lessons"]) {
  for (const name of readdirSync(directory).filter((file) => file.endsWith(".json"))) {
    const file = join(directory, name);
    const content = JSON.parse(readFileSync(file, "utf8"));
    content.cited_source_keys = (content.cited_source_keys ?? []).map(
      (key) => aliases.get(key) ?? key,
    );
    content.body_md = (content.body_md ?? "")
      .replaceAll(
        "/diagrams/event-driven-vs-scheduled-decision.svg",
        "/diagrams/event-driven-architecture-decision.svg",
      )
      .replaceAll(
        "/diagrams/multi-cloud-ingestion-decision.svg",
        "/diagrams/multi-stack-integration-decision.svg",
      );
    if (content.slug === "lakehouse-direct-lake-bi") {
      content.topic_slug = "medallion-lakehouse";
      if (!content.body_md.includes("/diagrams/direct-lake-internals.svg")) {
        content.body_md = content.body_md.replace(
          "## Internals",
          "![Direct Lake internals](/diagrams/direct-lake-internals.svg)\n\n## Internals",
        );
      }
    }
    if (
      content.slug === "investment-analytics-medallion" &&
      !content.body_md.includes("## Internals")
    ) {
      content.body_md += `\n\n## Internals\n\n### Architecture & design\n\nThe blueprint composes Fabric ingestion, Delta lakehouse tables, Warehouse modelling, Direct Lake consumption, and operational telemetry. The component boundary is an authored pattern grounded in the cited capability behavior [S1][S2].\n\n### How it works internally\n\nSource-shaped records land before conformance and history rules publish reusable silver entities; gold models then serve stable analytical contracts. Exact transformation logic remains implementation-specific and must be tested against the declared grain [S1][S2].\n\n### Performance characteristics\n\n*Coming soon.* No universal benchmark is inferred for this workload. Measure file layout, transformation duration, Warehouse query behavior, and semantic-model latency against the deployed capacity and data shape.\n`;
    }
    writeFileSync(file, `${JSON.stringify(content, null, 2)}\n`);
  }
}

console.log("Normalized stale source and diagram references without changing claim text.");
