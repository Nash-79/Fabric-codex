// Editorial Experience Revamp, Phase 4: parses a fenced code block's meta string (the text after
// the language tag on the opening fence line, e.g. ```ts title="direct_lake.py" {2,4-6}). This is
// exposed by react-markdown's plugin chain today as node.data.meta on the hast <code> element —
// no new dependency needed (mdast-util-to-hast's code handler sets it; applyData never touches
// .data; hast-util-to-jsx-runtime forwards the full node when passNode is on, which react-markdown
// hardcodes). Matches the Docusaurus/Nextra convention so authors already familiar with it aren't
// learning something bespoke.

export type CodeMeta = { title?: string; highlightLines: Set<number> };

export function parseCodeMeta(meta: string | undefined | null): CodeMeta {
  if (!meta) return { highlightLines: new Set() };

  const titleMatch = meta.match(/title="([^"]*)"/);
  const title = titleMatch ? titleMatch[1] : undefined;

  // Permissive outer match — any braced content — so a malformed fragment inside (e.g. stray
  // letters) doesn't fail the whole match; invalid fragments are simply skipped below.
  const rangeMatch = meta.match(/\{([^}]*)\}/);
  const highlightLines = new Set<number>();
  if (rangeMatch) {
    for (const part of rangeMatch[1].split(",")) {
      const trimmed = part.trim();
      if (!trimmed || !/^\d+(-\d+)?$/.test(trimmed)) continue;
      const rangeParts = trimmed.split("-").map((n) => Number.parseInt(n, 10));
      if (rangeParts.length === 2) {
        const [start, end] = rangeParts;
        for (let line = start; line <= end; line += 1) highlightLines.add(line);
      } else {
        highlightLines.add(rangeParts[0]);
      }
    }
  }

  return { title, highlightLines };
}

// A code block is treated as an "expected output" pairing target when its meta string carries
// this marker (e.g. ```text data-output).
export function isOutputBlock(meta: string | undefined | null): boolean {
  return Boolean(meta?.includes("data-output"));
}
