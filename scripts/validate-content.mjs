import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { z } from "zod";
import { collectInternalsGaps, internalsGapIssues } from "./lib/internals-gaps.mjs";

const root = resolve(import.meta.dirname, "..");
const read = (path) => JSON.parse(readFileSync(join(root, path), "utf8"));
const jsonFiles = (dir) => readdirSync(join(root, dir)).filter((name) => name.endsWith(".json"));
const sourceSchema = z
  .object({
    url: z.string().url(),
    title: z.string().min(1),
    tier: z.number().int().min(1).max(6),
    claims: z
      .array(
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
        }),
      )
      .default([]),
  })
  .passthrough();
const contentSchema = z
  .object({
    slug: z.string().min(1),
    title: z.string().min(1),
    body_md: z.string().min(1),
    cited_source_keys: z.array(z.string().min(1)).min(1),
  })
  .passthrough();
const failures = [],
  warnings = [];
const parsed = (path, schema) => {
  try {
    return schema.parse(read(path));
  } catch (error) {
    failures.push(
      `${path}: ${error instanceof SyntaxError ? error.message : error.issues?.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") || error}`,
    );
    return null;
  }
};
const topics =
  parsed(
    "content/topics.json",
    z.array(
      z
        .object({
          slug: z.string(),
          parent_slug: z.string().optional(),
          capability_ids: z.array(z.string()).default([]),
        })
        .passthrough(),
    ),
  ) || [];
const topicIds = new Set(topics.map((topic) => topic.slug));
for (const topic of topics)
  if (topic.parent_slug && !topicIds.has(topic.parent_slug))
    failures.push(`content/topics.json: ${topic.slug} has unknown parent ${topic.parent_slug}`);
const sources = new Map();
for (const name of jsonFiles("content/sources")) {
  const item = parsed(`content/sources/${name}`, sourceSchema);
  if (item) sources.set(basename(name, ".json"), item);
}
const assets =
  parsed(
    "content/diagrams/assets.json",
    z.array(
      z
        .object({
          path: z.string(),
          topic_slug: z.string().optional(),
          capability_id: z.string().optional(),
        })
        .passthrough(),
    ),
  ) || [];
const assetFiles = new Set(assets.map((asset) => basename(asset.path)));
const markdownDiagram = /!\[[^\]]*\]\((?:\/content)?\/diagrams\/([^\)\s]+)\)/g;

for (const dir of ["content/articles", "content/designs", "content/lessons"])
  for (const name of jsonFiles(dir)) {
    const path = `${dir}/${name}`,
      item = parsed(path, contentSchema);
    if (!item) continue;
    if (item.topic_slug && !topicIds.has(item.topic_slug))
      failures.push(`${path}: unknown topic_slug ${item.topic_slug}`);
    item.cited_source_keys.forEach((key, index) => {
      if (!sources.has(key))
        failures.push(`${path}: S${index + 1} references missing source ${key}`);
    });
    const refs = [...item.body_md.matchAll(/\[S(\d+)\]/g)].map((match) => Number(match[1]));
    if (!refs.length) failures.push(`${path}: body has no inline citations`);
    for (const ref of refs)
      if (ref < 1 || ref > item.cited_source_keys.length)
        failures.push(
          `${path}: citation S${ref} is outside the ${item.cited_source_keys.length}-source legend`,
        );
    const diagrams = [...item.body_md.matchAll(markdownDiagram)].map((match) => match[1]);
    if (dir !== "content/lessons" && diagrams.length < 2)
      failures.push(`${path}: requires at least two embedded diagrams; found ${diagrams.length}`);
    for (const diagram of diagrams) {
      if (!assetFiles.has(diagram)) failures.push(`${path}: diagram ${diagram} is not registered`);
      if (!existsSync(join(root, "content/diagrams", diagram)))
        failures.push(`${path}: diagram ${diagram} is missing`);
    }
    if (dir !== "content/lessons")
      for (const heading of [
        "## Internals",
        "### Architecture & design",
        "### How it works internally",
        "### Performance characteristics",
      ])
        if (!item.body_md.includes(heading)) failures.push(`${path}: missing ${heading}`);
    const prose = item.body_md
      .split(/\n{2,}/)
      .filter(
        (block) =>
          block.length > 120 &&
          !/^(#|!\[|```|\||>|\*Inference|\*Coming soon|[-*]\s)/.test(block.trim()),
      );
    const uncited = prose.filter(
      (block) =>
        !/\[S\d+\]/.test(block) && !/\b(inference|illustrative|example|assumption)\b/i.test(block),
    );
    if (uncited.length)
      warnings.push(
        `${path}: ${uncited.length} long factual-looking paragraph(s) need citation review`,
      );
  }
for (const issue of internalsGapIssues(collectInternalsGaps(root)))
  (issue.severity === "critical" ? failures : warnings).push(`${issue.file}: ${issue.message}`);
if (warnings.length)
  console.warn(`Content validation warnings (${warnings.length}):\n- ${warnings.join("\n- ")}`);
if (failures.length) {
  console.error(`Content validation failed (${failures.length}):\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(
  `Content validation passed: ${sources.size} sources, ${topics.length} topics, ${assets.length} diagrams.`,
);
