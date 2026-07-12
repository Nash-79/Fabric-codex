import { readFileSync, readdirSync } from "node:fs";
import { basename, join, resolve } from "node:path";

export const CANONICAL_SUBHEADINGS = [
  "Architecture & design",
  "How it works internally",
  "Performance characteristics",
];

const QUEUE_LINE =
  /^#\s*internals gap:\s*(?<slug>[a-z0-9-]+)\s*\/\s*(?<heads>.+?)\s*[—–-]\s*NEEDS SOURCE:/u;

function canonicalise(label) {
  const wanted = label
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\band\b/g, "&");
  return CANONICAL_SUBHEADINGS.find((name) => name.toLowerCase() === wanted) ?? null;
}

export function parseQueueGapLines(queueText) {
  const queued = [];
  const unparseable = [];
  queueText.split(/\r?\n/).forEach((raw, index) => {
    const line = raw.trim();
    if (!/^#\s*internals gap:/i.test(line)) return;
    const match = QUEUE_LINE.exec(line);
    if (!match) {
      unparseable.push({ lineNumber: index + 1, raw: line });
      return;
    }
    const { slug, heads } = match.groups;
    const labels = /all sub-headings/i.test(heads)
      ? [...CANONICAL_SUBHEADINGS]
      : heads.split("+").map((part) => canonicalise(part));
    for (const subheading of labels) {
      if (!subheading) {
        unparseable.push({ lineNumber: index + 1, raw: line });
        continue;
      }
      queued.push({ slug, subheading, lineNumber: index + 1, raw: line });
    }
  });
  return { queued, unparseable };
}

function subheadingSections(body) {
  const lines = body.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === "## Internals");
  if (start === -1) return { hasInternals: false, sections: new Map() };
  const sections = new Map();
  let current = null;
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (/^##\s/.test(line) && !/^###/.test(line)) break;
    const heading = /^###\s+(.*)$/.exec(line);
    if (heading) {
      current = canonicalise(heading[1]);
      if (current && !sections.has(current)) sections.set(current, []);
      continue;
    }
    if (current && sections.has(current)) sections.get(current).push(line);
  }
  return {
    hasInternals: true,
    sections: new Map([...sections].map(([name, body]) => [name, body.join("\n")])),
  };
}

function jsonFiles(directory) {
  try {
    return readdirSync(directory)
      .filter((name) => name.endsWith(".json"))
      .map((name) => join(directory, name));
  } catch {
    return [];
  }
}

/**
 * Derive the internals-gap inventory from the files. Truth = the marker in the
 * document body; ledger = `# internals gap:` lines in content/queue.md.
 *
 * Two markers, machine-separable:
 *   `*Coming soon*`        — a real gap; must have a queue line.
 *   `*Workload-specific*`  — not a gap; a pattern doc with no universal number; never queued.
 */
export function collectInternalsGaps(root = resolve(import.meta.dirname, "../..")) {
  const placeholders = [];
  const workloadSpecific = [];
  const parseErrors = [];

  for (const kind of ["articles", "designs"]) {
    for (const file of jsonFiles(join(root, "content", kind))) {
      let doc;
      try {
        doc = JSON.parse(readFileSync(file, "utf8"));
      } catch (error) {
        parseErrors.push({ file: relative(root, file), message: error.message });
        continue;
      }
      if (!doc?.body_md || !doc?.slug) continue;
      const { sections } = subheadingSections(doc.body_md);
      for (const subheading of CANONICAL_SUBHEADINGS) {
        const text = sections.get(subheading);
        if (text === undefined) continue;
        if (/\*Coming soon/.test(text) || /\bComing soon\b/.test(text)) {
          placeholders.push({
            file: relative(root, file),
            kind,
            slug: doc.slug,
            subheading,
            trackedAssertion: /Tracked in\s+`?content\/queue\.md`?/.test(text),
          });
        } else if (/\*Workload-specific/.test(text)) {
          workloadSpecific.push({ file: relative(root, file), kind, slug: doc.slug, subheading });
        }
      }
    }
  }

  let queued = [];
  let unparseable = [];
  try {
    ({ queued, unparseable } = parseQueueGapLines(
      readFileSync(join(root, "content", "queue.md"), "utf8"),
    ));
  } catch {
    // No queue file: every placeholder is untracked; nothing can be stale.
  }

  const queuedKeys = new Set(queued.map((entry) => `${entry.slug}/${entry.subheading}`));
  const placeholderKeys = new Set(placeholders.map((gap) => `${gap.slug}/${gap.subheading}`));
  const untracked = placeholders.filter((gap) => !queuedKeys.has(`${gap.slug}/${gap.subheading}`));
  const stale = queued.filter((entry) => !placeholderKeys.has(`${entry.slug}/${entry.subheading}`));

  const byDoc = {};
  for (const gap of placeholders) {
    byDoc[gap.slug] ??= { file: gap.file, kind: gap.kind, gaps: [] };
    byDoc[gap.slug].gaps.push({
      subheading: gap.subheading,
      queued: queuedKeys.has(`${gap.slug}/${gap.subheading}`),
      trackedAssertion: gap.trackedAssertion,
    });
  }

  return {
    placeholders,
    queued,
    unparseable,
    untracked,
    stale,
    workloadSpecific,
    byDoc,
    parseErrors,
  };
}

function relative(root, file) {
  return file.startsWith(root) ? file.slice(root.length + 1).replace(/\\/g, "/") : file;
}

/**
 * Guard rules in the repo's {severity, file, rule, message} shape:
 *   critical — a placeholder whose prose asserts it is tracked but has no queue
 *              line (a provable lie in published prose), and any queue line with
 *              no corresponding placeholder (stale).
 *   warning  — an honest untracked placeholder. Honest gaps never block a merge.
 */
export function internalsGapIssues(gaps) {
  const issues = [];
  for (const gap of gaps.untracked) {
    issues.push({
      severity: gap.trackedAssertion ? "critical" : "warning",
      file: gap.file,
      rule: gap.trackedAssertion ? "internals-gap-false-assertion" : "internals-gap-untracked",
      message: gap.trackedAssertion
        ? `${gap.slug} / ${gap.subheading}: prose claims "Tracked in content/queue.md" but no matching queue line exists`
        : `${gap.slug} / ${gap.subheading}: *Coming soon* placeholder has no "# internals gap:" line in content/queue.md`,
    });
  }
  for (const entry of gaps.stale) {
    issues.push({
      severity: "critical",
      file: "content/queue.md",
      rule: "internals-gap-stale",
      message: `line ${entry.lineNumber}: queued gap ${entry.slug} / ${entry.subheading} has no matching *Coming soon* placeholder — the gap is closed; delete or narrow the line`,
    });
  }
  for (const entry of gaps.unparseable) {
    issues.push({
      severity: "warning",
      file: "content/queue.md",
      rule: "internals-gap-unparseable",
      message: `line ${entry.lineNumber}: internals-gap line does not match "# internals gap: <slug> / <sub-heading> — NEEDS SOURCE: …"`,
    });
  }
  for (const error of gaps.parseErrors) {
    issues.push({
      severity: "warning",
      file: error.file,
      rule: "internals-gap-parse",
      message: error.message,
    });
  }
  return issues;
}
