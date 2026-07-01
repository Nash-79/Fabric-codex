import React from "react";
import { c } from "../theme.js";
import { Code } from "../components/ui.jsx";

export default function AuthorView() {
  const steps = [
    [
      "1 · Queue",
      "Sources tab → Add a source",
      "submit URLs from the UI — they land in the ingestion queue for the curator",
    ],
    [
      "2 · Ingest",
      "/ingest-batch (or /ingest <url> tier=1)",
      "knowledge-curator pulls the queue, extracts claims + tags + image refs → content/sources/*.json → POST /sources/ingest",
    ],
    [
      "3 · Diagram",
      "/diagram <capability-id>",
      "diagram-author draws an ORIGINAL Mermaid/SVG → content/diagrams/* → POST /assets",
    ],
    ["4 · Verify", "Registry tab → Verify", "human approval — pending claims become verified"],
    [
      "5 · Publish a topic",
      "/publish-topic <topic-slug>",
      "blog-author composes a cited article from verified claims; validation-reviewer checks it → Topics tab",
    ],
    [
      "6 · Design",
      "/design <scenario>",
      "solution-architect writes a cited architecture → content/designs/*.md → POST /designs",
    ],
    [
      "7 · Validate",
      "/validate <design-id>",
      "validation-reviewer reasons locally, posts issues; server adds citation + freshness → confidence",
    ],
    [
      "8 · Teach",
      "/lesson <capability> <level>",
      "learning-author writes a grounded lesson → content/lessons/*.md → Learn tab",
    ],
    [
      "9 · Maintain",
      "/drift <source-key>",
      "source-drift-analyst re-extracts, supersedes changed claims, flags affected designs and blogs",
    ],
  ];
  return (
    <div style={{ maxWidth: 760 }}>
      <p style={{ color: c.muted, fontSize: 13, lineHeight: 1.6 }}>
        Authoring happens in the IDE — the Claude Code / Codex agents are the LLM engine (your
        subscription, no metered API). This UI is the review-and-serve side. The full loop:
      </p>
      <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
        {steps.map(([t, cmd, desc]) => (
          <div
            key={t}
            style={{
              border: "1px solid " + c.line,
              borderRadius: 8,
              background: c.panel,
              padding: "10px 14px",
              display: "flex",
              gap: 14,
              alignItems: "baseline",
              flexWrap: "wrap",
              boxShadow: c.shadow,
            }}
          >
            <span style={{ fontWeight: 600, fontSize: 13, minWidth: 130 }}>{t}</span>
            <Code>{cmd}</Code>
            <span style={{ color: c.muted, fontSize: 12, flex: 1, minWidth: 220 }}>{desc}</span>
          </div>
        ))}
      </div>
      <p style={{ color: c.muted, fontSize: 13, lineHeight: 1.6, marginTop: 14 }}>
        Publish authored content to any server with{" "}
        <Code>python scripts/import_content.py --base &lt;url&gt;</Code>. To add capabilities,
        sources, themes, or new views, see <Code>docs/extending.md</Code> — it walks through every
        extension point. Workflow and VS Code setup live in <Code>docs/workflow.md</Code>.
      </p>
    </div>
  );
}
