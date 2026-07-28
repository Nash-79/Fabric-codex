import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { z } from "zod";
import { collectInternalsGaps, internalsGapIssues } from "./lib/internals-gaps.mjs";
import { presentationProfileSchema, lessonMetaSchema } from "./lib/content-presentation.mjs";

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
const diagramSlugs = new Set(assets.map((asset) => basename(asset.path, ".svg")));
const markdownDiagram = /!\[[^\]]*\]\((?:\/content)?\/diagrams\/([^\)\s]+)\)/g;

// Editorial Experience Revamp Phase 1: exact content metrics so later phases can compare
// objectively, plus shape validation for the optional presentation_profile/lesson_meta fields.
const metrics = [];

// Editorial Experience Revamp Phase 4: mirrors src/lib/heading-utils.ts's slugifyHeading exactly
// (a trivial lowercase/hyphenate/trim chain — duplicated inline rather than a new scripts/lib
// mirror file, unlike content-presentation.mjs which centralizes real schemas/enums).
function slugifyHeading(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
// Mirrors heading-utils.ts's stripMarkdownInline exactly — also trivial, also inlined.
function stripMarkdownInline(text) {
  return text
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/(\*\*|__|\*|_|~~)/g, "")
    .trim();
}

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

    // --- Editorial Experience Revamp Phase 1: content metrics + presentation shape ---
    const wordCount = item.body_md.split(/\s+/).filter(Boolean).length;
    const h1Count = [...item.body_md.matchAll(/^# .+$/gm)].length;
    const sourceLegendCount = [...item.body_md.matchAll(/^##\s+Source Legend\s*$/gim)].length;
    if (h1Count > 1)
      warnings.push(
        `${path}: duplicate in-body H1 (${h1Count} found) — page hero already renders the title as H1`,
      );
    if (sourceLegendCount > 1)
      warnings.push(
        `${path}: duplicate Source Legend section (${sourceLegendCount} found) — the source rail already renders this automatically`,
      );
    if (dir === "content/lessons") {
      if (!item.lesson_meta?.summary && !item.summary)
        warnings.push(`${path}: lesson missing summary`);
      if (wordCount > 500)
        warnings.push(`${path}: lesson is ${wordCount} words against the ~400 word budget`);
    }
    if (dir === "content/designs" && !item.summary)
      warnings.push(`${path}: design missing summary`);

    if (item.presentation_profile) {
      const result = presentationProfileSchema.safeParse(item.presentation_profile);
      if (!result.success)
        failures.push(
          `${path}: invalid presentation_profile — ${result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
        );
      else if (result.data.featured_diagram && !diagramSlugs.has(result.data.featured_diagram))
        failures.push(
          `${path}: presentation_profile.featured_diagram '${result.data.featured_diagram}' is not a registered diagram`,
        );
    }
    if (dir === "content/lessons" && item.lesson_meta) {
      const result = lessonMetaSchema.safeParse(item.lesson_meta);
      if (!result.success)
        failures.push(
          `${path}: invalid lesson_meta — ${result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
        );
    }

    // --- Editorial Experience Revamp Phase 4: markdown teaching-primitive validation ---
    // a. Code-fence language tag enforcement — flag any opening fence with no language token.
    const fenceLines = [...item.body_md.matchAll(/^```(.*)$/gm)];
    let fenceOpen = false;
    let untaggedFences = 0;
    for (const fence of fenceLines) {
      if (!fenceOpen) {
        const rest = fence[1].trim();
        if (!rest.split(/\s+/)[0]) untaggedFences += 1;
      }
      fenceOpen = !fenceOpen;
    }
    if (untaggedFences)
      warnings.push(`${path}: ${untaggedFences} fenced code block(s) with no language tag`);

    // b. Heading hierarchy — warn on a level skip (e.g. h2 -> h4) in document order.
    const headingLines = [...item.body_md.matchAll(/^(#{1,6})\s+.+$/gm)];
    let previousLevel = 1; // the page's own H1 (rendered by the hero) is the implicit root.
    for (const heading of headingLines) {
      const level = heading[1].length;
      if (level > previousLevel + 1)
        warnings.push(
          `${path}: heading level skips from h${previousLevel} to h${level} ("${heading[0].slice(0, 60)}")`,
        );
      previousLevel = level;
    }

    // c. Unique anchor/slug enforcement — only ##/### are actually anchored/slugged at runtime
    // (matches useTocHeadings' own scope). A collision is a real broken-deep-link bug: failure.
    const anchoredHeadings = [...item.body_md.matchAll(/^(#{2,3})\s+(.+)$/gm)];
    const seenSlugs = new Map();
    for (const heading of anchoredHeadings) {
      const slug = slugifyHeading(stripMarkdownInline(heading[2].trim()));
      if (seenSlugs.has(slug))
        failures.push(
          `${path}: heading anchor collision "#${slug}" — "${seenSlugs.get(slug)}" and "${heading[2].trim()}" produce the same slug`,
        );
      else seenSlugs.set(slug, heading[2].trim());
    }

    // d. Image alt-text presence — empty alt is a real accessibility violation (failure);
    // a generic placeholder alt is a content-quality nit (warning).
    for (const image of item.body_md.matchAll(/!\[([^\]]*)\]\([^)\s]+\)/g)) {
      const alt = image[1].trim();
      if (!alt) failures.push(`${path}: image missing alt text — ${image[0].slice(0, 60)}`);
      else if (/^(image|diagram|screenshot|figure)\s*\d*$/i.test(alt))
        warnings.push(`${path}: image alt text is a generic placeholder — "${alt}"`);
    }

    metrics.push({
      path,
      kind: basename(dir),
      slug: item.slug,
      word_count: wordCount,
      h1_count: h1Count,
      source_legend_count: sourceLegendCount,
      diagram_count: diagrams.length,
      has_summary: Boolean(item.summary),
      has_presentation_profile: Boolean(item.presentation_profile),
      has_lesson_meta: dir === "content/lessons" ? Boolean(item.lesson_meta) : undefined,
    });
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

console.log(`\nContent metrics (${metrics.length} items):`);
console.table(metrics);
try {
  mkdirSync(join(root, "baseline"), { recursive: true });
  writeFileSync(join(root, "baseline/content-metrics.json"), JSON.stringify(metrics, null, 2));
} catch (error) {
  console.warn(`Could not write baseline/content-metrics.json: ${error.message}`);
}
