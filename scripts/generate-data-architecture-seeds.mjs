import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

const topics = [
  {
    slug: "architecture-strategy",
    title: "Fabric Data Architecture Strategy",
    cap: "fabric-platform",
    sources: [
      "fabric-platform-overview",
      "onelake-overview",
      "governance-compliance-overview",
      "capacity-throttling",
    ],
    stages: [
      "Business outcomes and domain boundaries",
      "Fabric workload and OneLake placement",
      "Governance, capacity, and delivery roadmap",
    ],
    decision: [
      "Is the workload analytical?",
      "Can data remain in OneLake?",
      "Choose governed Fabric workload boundary",
    ],
    example:
      "Finance delivers daily positions first, proves governance and operations, then adds intraday risk on the same owned boundary.",
    controls: [
      "Named data-product owner",
      "Capacity and recovery objective",
      "Recorded architecture decisions",
    ],
    risks: [
      "Platform without a business outcome",
      "Shared workspace without ownership",
      "Unmeasured capacity demand",
    ],
  },
  {
    slug: "data-modelling",
    title: "Data Modelling in Microsoft Fabric",
    cap: "warehouse",
    sources: [
      "lakehouse-overview",
      "warehouse-overview",
      "semantic-model-understand",
      "direct-lake-develop",
    ],
    stages: [
      "Conceptual business model",
      "Lakehouse or Warehouse physical model",
      "Semantic model and consumption contract",
    ],
    decision: [
      "Define grain and history",
      "Choose dimensional, vault, or canonical form",
      "Publish governed semantic model",
    ],
    example:
      "Order-line facts join conformed customer and product dimensions; governed revenue measures preserve the declared grain.",
    controls: ["Grain and key tests", "History rule validation", "Certified measure ownership"],
    risks: ["Mixed grain", "Hidden history logic", "Measures duplicated per report"],
  },
  {
    slug: "silver-layer-modelling",
    title: "Silver Layer Modelling Techniques in Fabric",
    cap: "lakehouse",
    sources: [
      "lakehouse-overview",
      "delta-lake-storage-internals",
      "delta-optimization-and-v-order",
      "spark-sql-fabric",
    ],
    stages: [
      "Validate and standardize bronze records",
      "Conform keys, history, and canonical entities",
      "Publish reusable Delta silver tables",
    ],
    decision: [
      "Does the source carry reliable keys?",
      "Is change history required?",
      "Select deduplication and SCD strategy",
    ],
    example:
      "Customer CDC is ordered, deduplicated, and merged into SCD2 silver while invalid records enter a replayable quarantine.",
    controls: ["Deterministic merge key", "Late-arrival policy", "Schema-evolution contract"],
    risks: ["Unordered latest-row logic", "Gold aggregates in silver", "Quarantine without replay"],
  },
  {
    slug: "metadata-driven-architecture",
    title: "Metadata-Driven Frameworks in Microsoft Fabric",
    cap: "data-factory",
    sources: [
      "data-factory-overview",
      "pipeline-runs",
      "lakehouse-overview",
      "governance-compliance-overview",
    ],
    stages: [
      "Versioned metadata contract",
      "Reusable pipeline and notebook executors",
      "Run-state, quality, and lineage telemetry",
    ],
    decision: [
      "Is behavior configuration or code?",
      "Can retries be idempotent?",
      "Promote a versioned execution contract",
    ],
    example:
      "An Orders metadata row selects connector, target, watermark, merge notebook, retry policy, and quality rules without cloning a pipeline.",
    controls: ["Schema-validated metadata", "Versioned promotion", "Secret references only"],
    risks: ["Untyped metadata language", "Mid-run configuration change", "Non-idempotent retry"],
  },
  {
    slug: "event-driven-architecture",
    title: "Event-Driven Frameworks in Microsoft Fabric",
    cap: "rti",
    sources: [
      "rti-overview",
      "eventhouse-overview",
      "fabric-blog-activator-copy-job",
      "pipeline-runs",
    ],
    stages: [
      "Events enter Eventstream",
      "Hot path evaluates and acts",
      "Durable path lands for replay and analytics",
    ],
    decision: [
      "Is latency event-scale or batch-scale?",
      "Must events be replayed?",
      "Choose streaming, trigger, or scheduled execution",
    ],
    example:
      "order.created drives a hot alert and a durable replay path; an idempotency key prevents duplicate downstream loads.",
    controls: ["Event identity", "Replay procedure", "Event-time policy"],
    risks: ["Notification treated as state", "No duplicate strategy", "Trigger storm"],
  },
  {
    slug: "architecture-implementation",
    title: "Implementing a Fabric Data Architecture",
    cap: "fabric-platform",
    sources: [
      "fabric-platform-overview",
      "onelake-overview",
      "data-factory-overview",
      "warehouse-overview",
    ],
    stages: [
      "Foundation and guardrails",
      "Thin vertical product slice",
      "Scale-out, operations, and optimization",
    ],
    decision: [
      "Are identity and environments ready?",
      "Can the slice prove end-to-end value?",
      "Scale only after operational acceptance",
    ],
    example:
      "A sales slice proves one source, silver model, gold fact, certified report, deployment, rollback, monitoring, and support end to end.",
    controls: [
      "Automated contract tests",
      "Environment configuration",
      "Release and rollback evidence",
    ],
    risks: [
      "Framework before product",
      "Manual production configuration",
      "No operational acceptance",
    ],
  },
];

const esc = (value) =>
  value.replace(/[&<>]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[char]);

function textLines(value, x, max = 58, limit = 3) {
  const words = value.split(/\s+/),
    lines = [];
  let line = "";
  for (const word of words) {
    if (`${line} ${word}`.trim().length > max && line) {
      lines.push(line);
      line = word;
    } else line = `${line} ${word}`.trim();
  }
  if (line) lines.push(line);
  return lines
    .slice(0, limit)
    .map((item, index) => `<tspan x="${x}" dy="${index ? 19 : 0}">${esc(item)}</tspan>`)
    .join("");
}

function diagramSvg(title, subtitle, nodes, decision = false, topic) {
  const boxes = nodes
    .map((node, index) => {
      const x = 80 + index * 350;
      const y = decision && index === 1 ? 300 : 220;
      const shape =
        decision && index < 2
          ? `<path d="M ${x + 130} ${y - 50} L ${x + 260} ${y + 20} L ${x + 130} ${y + 90} L ${x} ${y + 20} Z" fill="#EAF7F2" stroke="#117865" stroke-width="3"/>`
          : `<rect x="${x}" y="${y - 50}" width="260" height="140" rx="20" fill="#EAF7F2" stroke="#117865" stroke-width="3"/>`;
      const words = node.split(/\s+/);
      const lines = [];
      let line = "";
      for (const word of words) {
        if (`${line} ${word}`.trim().length > 24 && line) {
          lines.push(line);
          line = word;
        } else line = `${line} ${word}`.trim();
      }
      if (line) lines.push(line);
      const tspans = lines
        .slice(0, 4)
        .map(
          (value, lineIndex) =>
            `<tspan x="${x + 150}" dy="${lineIndex ? 22 : 0}">${esc(value)}</tspan>`,
        )
        .join("");
      return `${shape}<circle cx="${x + 28}" cy="${y - 22}" r="16" fill="#117865"/><text x="${x + 28}" y="${y - 17}" text-anchor="middle" fill="white" font-size="13" font-weight="700">${index + 1}</text><text x="${x + 150}" y="${y + 2}" text-anchor="middle" fill="#063D3B" font-size="17" font-weight="600">${tspans}</text>`;
    })
    .join("\n");
  const arrows = nodes
    .slice(1)
    .map((_, index) => {
      const fromX = 340 + index * 350;
      const toX = 430 + index * 350;
      const fromY = decision && index === 0 ? 240 : 240;
      const toY = decision && index === 0 ? 320 : 240;
      return `<path d="M ${fromX} ${fromY} C ${fromX + 35} ${fromY}, ${toX - 35} ${toY}, ${toX} ${toY}" fill="none" stroke="#2AAC94" stroke-width="4" marker-end="url(#arrow)"/>`;
    })
    .join("\n");
  const controls = topic.controls
    .map(
      (item, index) =>
        `<text x="82" y="${695 + index * 24}" fill="#285943" font-size="14">✓ ${esc(item)}</text>`,
    )
    .join("");
  const risks = topic.risks
    .map(
      (item, index) =>
        `<text x="640" y="${695 + index * 24}" fill="#7A4B00" font-size="14">⚠ ${esc(item)}</text>`,
    )
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1180 900" font-family="Segoe UI,Arial,sans-serif"><title>${esc(title)}</title><desc>${esc(subtitle)}. Includes an end-to-end path, worked example, controls, and failure modes.</desc><defs><linearGradient id="head" x1="0" x2="1"><stop stop-color="#063D3B"/><stop offset="1" stop-color="#117865"/></linearGradient><marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto"><path d="M0,0 L0,6 L9,3 z" fill="#2AAC94"/></marker></defs><rect width="1180" height="900" fill="#FAF9F8"/><rect width="1180" height="118" fill="url(#head)"/><text x="52" y="54" fill="white" font-size="28" font-weight="700">${esc(title)}</text><text x="52" y="84" fill="#CFF3E9" font-size="15">${esc(subtitle)}</text><text x="52" y="154" fill="#605E5C" font-size="13" letter-spacing="2">${decision ? "DECISION PATH" : "END-TO-END ARCHITECTURE"}</text>${arrows}${boxes}<rect x="52" y="485" width="1076" height="118" rx="16" fill="#E8F6F1" stroke="#2AAC94" stroke-width="2"/><text x="76" y="515" fill="#117865" font-size="12" font-weight="700" letter-spacing="1.4">WORKED EXAMPLE</text><text x="76" y="547" fill="#063D3B" font-size="15">${textLines(topic.example, 76)}</text><rect x="52" y="630" width="516" height="145" rx="16" fill="#EDF8F1" stroke="#6BBF8A"/><text x="78" y="662" fill="#176B3A" font-size="13" font-weight="700" letter-spacing="1.3">IMPLEMENTATION CONTROLS</text>${controls}<rect x="612" y="630" width="516" height="145" rx="16" fill="#FFF7E6" stroke="#D6A84B"/><text x="638" y="662" fill="#7A4B00" font-size="13" font-weight="700" letter-spacing="1.3">FAILURE MODES</text>${risks}<rect x="52" y="800" width="1076" height="54" rx="13" fill="#F0F5F3" stroke="#B8D8CE"/><text x="590" y="832" text-anchor="middle" fill="#063D3B" font-size="14">In Atlas: select a choice → inspect evidence → drill into inputs, processing, outputs, example, controls, and risks.</text><text x="1128" y="882" text-anchor="end" fill="#605E5C" font-size="10">Fabric Atlas original · Microsoft Fabric implementation guidance</text></svg>\n`;
}

function body(topic) {
  const arch = `${topic.slug}-architecture.svg`;
  const decision = `${topic.slug}-decision.svg`;
  return `## Purpose and Fabric boundary\n\n${topic.title} treats architecture as an explicit set of Fabric workload, storage, governance, and operating decisions. Fabric brings multiple analytical workloads together over OneLake, while each workload retains its own execution responsibilities [S1][S2].\n\n![${topic.title} architecture](/diagrams/${arch})\n\n## Architecture and data flow\n\nThe recommended flow is **${topic.stages.join(" → ")}**. This is an authored Fabric pattern: validate it against workload-specific constraints, and use the cited product behavior as the factual boundary [S1][S2].\n\n## Decision framework\n\nUse the decision path below to make the boundary visible rather than hiding it in implementation code. Decisions that are not established by a Fabric source are labelled as pattern guidance [S1][S3].\n\n![${topic.title} decision framework](/diagrams/${decision})\n\n## Worked implementation example\n\nStart with one bounded data product. Record its owners, source contract, target Fabric items, quality rules, security boundary, recovery objective, and observable completion signal. Implement the thinnest end-to-end slice before generalising the framework; this sequencing is pattern guidance, not a Fabric product guarantee [S1][S4].\n\n## Governance, security, and operations\n\nApply workspace and item access deliberately, retain source-to-output lineage, and separate configuration from secrets. Monitor run state and capacity behavior at the same boundary used for ownership; exact controls depend on the selected Fabric workloads [S3][S4].\n\n## Failure modes and anti-patterns\n\nAvoid framework-first delivery, hidden grain or history rules, non-idempotent retries, and diagrams that imply guarantees absent from cited sources. Treat preview behavior, limits, and performance figures as source-sensitive and revalidate them during drift review [S1][S4].\n\n## Internals\n\n### Architecture & design\n\nThe design composes existing Fabric capabilities rather than introducing a separate execution service. Topic-to-capability mappings keep retrieval and validation anchored to the registry [S1][S2].\n\n### How it works internally\n\nThe implementation passes versioned data and metadata contracts between the selected Fabric items. Product-specific execution details remain in the capability articles; this topic explains their architectural composition [S1][S2].\n\n### Performance characteristics\n\n*Workload-specific.* Performance must be established from workload-specific L4 evidence and measured against the actual capacity, data shape, concurrency, and freshness objective. No universal throughput or latency number is inferred here [S4].\n\n## Source legend\n\n| # | Source key | Tier |\n|---|---|---|\n${topic.sources.map((source, index) => `| S${index + 1} | ${source} | See source record |`).join("\n")}\n`;
}

mkdirSync("content/articles", { recursive: true });
mkdirSync("content/designs", { recursive: true });
mkdirSync("content/diagrams", { recursive: true });
const manifest = JSON.parse(readFileSync("content/diagrams/assets.json", "utf8"));
for (const topic of topics) {
  const article = {
    topic_slug: topic.slug,
    slug: topic.slug,
    title: topic.title,
    summary: `Fabric-focused guidance for ${topic.title.toLowerCase()}, with implementation and decision views.`,
    body_md: body(topic),
    cited_source_keys: topic.sources,
    tags: ["MicrosoftFabric", "DataArchitecture", topic.slug.replace(/-/g, "")],
    depth_levels: [2, 3, 4],
  };
  writeFileSync(`content/articles/${topic.slug}.json`, `${JSON.stringify(article, null, 2)}\n`);
  const designBody = body(topic)
    .replace("## Purpose and Fabric boundary", "## Recommended architecture")
    .replace("## Worked implementation example", "## Data flow and implementation");
  const design = {
    slug: `${topic.slug}-blueprint`,
    title: `${topic.title}: implementation blueprint`,
    scenario: `Implement ${topic.title.toLowerCase()} for a governed Fabric data product.`,
    body_md: designBody,
    topic_slug: topic.slug,
    tags: article.tags.concat(["ArchitecturePattern"]),
    cited_source_keys: topic.sources,
  };
  writeFileSync(
    `content/designs/${topic.slug}-blueprint.json`,
    `${JSON.stringify(design, null, 2)}\n`,
  );
  const diagrams = [
    {
      suffix: "architecture",
      caption: `${topic.title} architecture — ${topic.stages.join(", ")}`,
      nodes: topic.stages,
      decision: false,
    },
    {
      suffix: "decision",
      caption: `${topic.title} decision path — ${topic.decision.join(", ")}`,
      nodes: topic.decision,
      decision: true,
    },
  ];
  for (const item of diagrams) {
    const slug = `${topic.slug}-${item.suffix}`;
    const path = `content/diagrams/${slug}.svg`;
    writeFileSync(path, diagramSvg(topic.title, item.caption, item.nodes, item.decision, topic));
    if (!manifest.some((entry) => entry.path === path))
      manifest.push({
        kind: "generated",
        path,
        caption: `Original interactive diagram: ${item.caption}`,
        capability_id: topic.cap,
        topic_slug: topic.slug,
        interaction_version: "1",
        qa_status: "draft",
      });
  }
}
const normalizedManifest = manifest.map((entry) => {
  const svg = readFileSync(entry.path);
  return {
    ...entry,
    interaction_version: entry.interaction_version ?? "1",
    static_hash: createHash("sha256").update(svg).digest("hex"),
    qa_status: entry.qa_status ?? "draft",
    accessible_summary: entry.accessible_summary ?? entry.caption,
    supported_layers:
      entry.supported_layers ??
      [
        "data",
        /spark|warehouse|sql|polaris|direct-lake/.test(entry.capability_id) && "compute",
        /factory|rti|eventhouse/.test(entry.capability_id) && "orchestration",
        /purview/.test(entry.capability_id) && "governance",
      ].filter(Boolean),
  };
});
writeFileSync("content/diagrams/assets.json", `${JSON.stringify(normalizedManifest, null, 2)}\n`);
console.log(
  `Generated ${topics.length} articles, ${topics.length} designs, and ${topics.length * 2} diagrams.`,
);
