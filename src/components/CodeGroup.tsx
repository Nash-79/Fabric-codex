import { useState, type ReactNode } from "react";

// Renders a run of consecutive fenced code blocks as a connected group — Editorial Experience
// Revamp Phase 4. Grouping happens by wrapping the run in <div data-code-group> before
// ReactMarkdown parses the body (see ContentItemArticle.tsx), which also computes each block's
// title/output-association metadata from the raw markdown (the same "regex the string, let
// rehypeRaw carry it through" pattern already used for citations/figures) since introspecting
// already-rendered <CodeBlock> children for their meta strings would require re-parsing anyway.
export function CodeGroup({
  children,
  titles,
  outputIndex,
}: {
  children: ReactNode;
  titles: Array<string | undefined>;
  outputIndex?: number;
}) {
  const blocks = Array.isArray(children) ? children : [children];
  const [activeTab, setActiveTab] = useState(0);

  // A block explicitly tagged data-output is rendered subordinate to its paired input block,
  // always shown beneath it — not as a peer tab.
  if (outputIndex !== undefined && blocks.length === 2) {
    const inputIndex = outputIndex === 0 ? 1 : 0;
    return (
      <div className="not-prose my-6">
        <div>{blocks[inputIndex]}</div>
        <div className="mt-1">
          <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Expected output
          </div>
          {blocks[outputIndex]}
        </div>
      </div>
    );
  }

  // Exactly two blocks with distinct titles: treat as a before/after pair — stacked with a
  // divider label on narrow viewports, side-by-side on wide ones.
  if (blocks.length === 2) {
    return (
      <div className="not-prose my-6 grid gap-4 lg:grid-cols-2">
        {blocks.map((block, i) => (
          <div key={i}>
            {titles[i] && (
              <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {titles[i]}
              </div>
            )}
            {block}
          </div>
        ))}
      </div>
    );
  }

  // 3+ blocks: a tab strip switching between file panels, each tab labeled from its title.
  return (
    <div className="not-prose my-6">
      <div className="flex flex-wrap gap-1 border-b border-border">
        {blocks.map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setActiveTab(i)}
            className={`rounded-t-md px-3 py-1.5 text-xs font-medium transition ${
              activeTab === i
                ? "border border-b-0 border-border bg-card text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {titles[i] ?? `File ${i + 1}`}
          </button>
        ))}
      </div>
      <div>{blocks[activeTab]}</div>
    </div>
  );
}
