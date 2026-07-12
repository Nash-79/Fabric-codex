import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";
import { z } from "zod";

const ROOT = new URL("../../", import.meta.url).pathname.replace(/^\/(.:\/)/, "$1");
const CONTENT = join(ROOT, "content");

const sourceSchema = z.object({
  url: z.string().url(),
  title: z.string().min(1),
  tier: z.number().int().min(1).max(6),
  claims: z.array(
    z.object({
      capability_id: z.string().min(1),
      text: z.string().min(1),
      depth: z.number().int().min(1).max(5),
      type: z.enum([
        "fact",
        "pattern",
        "antipattern",
        "internal",
        "concept",
        "limitation",
        "gotcha",
      ]),
      tags: z.array(z.string()).optional(),
    }),
  ),
  tags: z.array(z.string()).default([]),
});

const contentSchema = z.object({
  slug: z.string().min(1),
  title: z.string().min(1),
  body_md: z.string().min(1),
  cited_source_keys: z.array(z.string().min(1)).min(1),
  topic_slug: z.string().optional(),
  tags: z.array(z.string()).default([]),
});

const topicSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  parent_slug: z.string().optional(),
  description: z.string(),
  capability_ids: z.array(z.string()),
});

const diagramSchema = z.object({
  kind: z.string().min(1),
  path: z.string().min(1),
  caption: z.string().min(1),
  capability_id: z.string().min(1),
  topic_slug: z.string().min(1),
  interaction_version: z.string().optional(),
  qa_status: z.enum(["draft", "passed", "failed"]).optional(),
});

function readJson(file, issues) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    issues.push({ severity: "critical", file, rule: "json", message: error.message });
    return null;
  }
}

function files(directory) {
  return readdirSync(directory)
    .filter((file) => file.endsWith(".json"))
    .map((file) => join(directory, file));
}

function parse(schema, value, file, issues) {
  const result = schema.safeParse(value);
  if (!result.success) {
    for (const issue of result.error.issues) {
      issues.push({
        severity: "critical",
        file,
        rule: "schema",
        message: `${issue.path.join(".") || "document"}: ${issue.message}`,
      });
    }
    return null;
  }
  return result.data;
}

function embeddedDiagrams(body) {
  return [...body.matchAll(/!\[[^\]]*\]\((?:\/content)?\/diagrams\/([^)\s]+)\)/g)].map(
    (match) => match[1],
  );
}

function citedParagraphWarnings(body, file, issues) {
  const paragraphs = body.split(/\n{2,}/);
  for (const paragraph of paragraphs) {
    const text = paragraph.trim();
    if (
      !text ||
      /^([#>|`]|\*Coming soon|\*Inference|\*Example|\|)/i.test(text) ||
      /^[-*]\s/.test(text) ||
      /^\d+\.\s/.test(text) ||
      /\[S\d+\]/.test(text) ||
      text.length < 80
    ) {
      continue;
    }
    issues.push({
      severity: "warning",
      file,
      rule: "paragraph-grounding",
      message: `Factual-looking paragraph has no inline source or inference label: ${text.slice(0, 90)}…`,
    });
  }
}

export function validateRepository() {
  const issues = [];
  const topicsFile = join(CONTENT, "topics.json");
  const topicRows = readJson(topicsFile, issues) ?? [];
  const topics = new Map();
  for (const raw of topicRows) {
    const topic = parse(topicSchema, raw, topicsFile, issues);
    if (topic) topics.set(topic.slug, topic);
  }
  for (const topic of topics.values()) {
    if (topic.parent_slug && !topics.has(topic.parent_slug)) {
      issues.push({
        severity: "critical",
        file: topicsFile,
        rule: "topic-parent",
        message: `${topic.slug} references missing parent ${topic.parent_slug}`,
      });
    }
  }

  const sourceKeys = new Set();
  const capabilities = new Set();
  for (const file of files(join(CONTENT, "sources"))) {
    const raw = readJson(file, issues);
    if (!raw) continue;
    const source = parse(sourceSchema, raw, file, issues);
    if (!source) continue;
    sourceKeys.add(basename(file, ".json"));
    for (const claim of source.claims) capabilities.add(claim.capability_id);
  }

  const manifestFile = join(CONTENT, "diagrams", "assets.json");
  const rawManifest = readJson(manifestFile, issues) ?? [];
  const diagramPaths = new Set();
  const diagramSlugs = new Set();
  for (const raw of rawManifest) {
    const diagram = parse(diagramSchema, raw, manifestFile, issues);
    if (!diagram) continue;
    if (diagramPaths.has(diagram.path))
      issues.push({
        severity: "critical",
        file: manifestFile,
        rule: "diagram-duplicate",
        message: `Duplicate diagram path ${diagram.path}`,
      });
    diagramPaths.add(diagram.path);
    diagramSlugs.add(basename(diagram.path, ".svg"));
    if (!existsSync(join(ROOT, diagram.path)))
      issues.push({
        severity: "critical",
        file: manifestFile,
        rule: "diagram-file",
        message: `Missing ${diagram.path}`,
      });
    if (!topics.has(diagram.topic_slug))
      issues.push({
        severity: "critical",
        file: manifestFile,
        rule: "diagram-topic",
        message: `${diagram.path} references missing topic ${diagram.topic_slug}`,
      });
    if (!capabilities.has(diagram.capability_id))
      issues.push({
        severity: "critical",
        file: manifestFile,
        rule: "diagram-capability",
        message: `${diagram.path} references unknown capability ${diagram.capability_id}`,
      });
    if (diagram.qa_status === "failed")
      issues.push({
        severity: "critical",
        file: manifestFile,
        rule: "diagram-qa",
        message: `${diagram.path} has failed QA`,
      });
    if (!diagram.interaction_version || !diagram.qa_status)
      issues.push({
        severity: "warning",
        file: manifestFile,
        rule: "diagram-interaction",
        message: `${diagram.path} needs explicit interaction_version and qa_status`,
      });
  }

  const activeSlugs = new Set();
  for (const kind of ["articles", "designs", "lessons"]) {
    for (const file of files(join(CONTENT, kind))) {
      const raw = readJson(file, issues);
      if (!raw) continue;
      const content = parse(contentSchema, raw, file, issues);
      if (!content) continue;
      const identity = `${kind}:${content.slug}`;
      if (activeSlugs.has(identity))
        issues.push({ severity: "critical", file, rule: "slug", message: `Duplicate ${identity}` });
      activeSlugs.add(identity);
      if (content.topic_slug && !topics.has(content.topic_slug))
        issues.push({
          severity: "critical",
          file,
          rule: "content-topic",
          message: `Unknown topic ${content.topic_slug}`,
        });
      for (const key of content.cited_source_keys)
        if (!sourceKeys.has(key))
          issues.push({
            severity: "critical",
            file,
            rule: "source-key",
            message: `Unknown cited source ${key}`,
          });
      const refs = [...content.body_md.matchAll(/\[S(\d+)\]/g)].map((match) => Number(match[1]));
      for (const ref of refs)
        if (ref < 1 || ref > content.cited_source_keys.length)
          issues.push({
            severity: "critical",
            file,
            rule: "citation-range",
            message: `[S${ref}] exceeds ${content.cited_source_keys.length} cited sources`,
          });
      const diagrams = embeddedDiagrams(content.body_md);
      if (kind !== "lessons" && diagrams.length < 2)
        issues.push({
          severity: "critical",
          file,
          rule: "diagram-count",
          message: `${content.slug} embeds ${diagrams.length}; at least 2 required`,
        });
      for (const diagram of diagrams)
        if (!diagramSlugs.has(diagram.replace(/\.svg$/i, "")))
          issues.push({
            severity: "critical",
            file,
            rule: "diagram-registration",
            message: `Embedded diagram is not registered: ${diagram}`,
          });
      if (kind !== "lessons") {
        for (const heading of [
          "## Internals",
          "### Architecture & design",
          "### How it works internally",
          "### Performance characteristics",
        ])
          if (!content.body_md.includes(heading))
            issues.push({
              severity: "critical",
              file,
              rule: "internals",
              message: `Missing required heading: ${heading}`,
            });
      }
      citedParagraphWarnings(content.body_md, file, issues);
    }
  }
  return issues;
}

export function printIssues(issues) {
  for (const issue of issues)
    console.log(`${issue.severity.toUpperCase()} ${issue.rule} ${issue.file}: ${issue.message}`);
  const critical = issues.filter((issue) => issue.severity === "critical").length;
  const warnings = issues.filter((issue) => issue.severity === "warning").length;
  console.log(`Content validation: ${critical} critical, ${warnings} warning(s)`);
  return { critical, warnings };
}
