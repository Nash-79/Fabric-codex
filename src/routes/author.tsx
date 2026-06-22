import { createFileRoute } from "@tanstack/react-router";
import { SiteHeader } from "@/components/SiteHeader";

export const Route = createFileRoute("/author")({
  head: () => ({
    meta: [
      { title: "Author — Fabric Atlas" },
      {
        name: "description",
        content:
          "How authoring works in the Fabric Atlas: local agents extract cited claims and publish to the atlas.",
      },
      { property: "og:title", content: "Author — Fabric Atlas" },
      {
        property: "og:description",
        content: "Local-first, git-tracked, cited authoring workflow for the Fabric Atlas.",
      },
    ],
  }),
  component: AuthorPage,
});

function AuthorPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-6 py-10">
        <div className="text-xs font-medium uppercase tracking-[0.18em] text-teal-300/80">
          Workflow
        </div>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Authoring the atlas</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Authoring is <strong>local-first</strong>. LLM work runs in the IDE on your subscription
          via Claude Code / Codex agents — not on the server. The atlas serves pre-built, cited
          content.
        </p>

        <section className="mt-8 space-y-4 text-sm leading-relaxed text-muted-foreground">
          <h2 className="text-lg font-semibold text-foreground">Flow</h2>
          <ol className="list-decimal space-y-2 pl-5">
            <li>
              An agent reads an approved source and writes{" "}
              <code className="text-teal-300">content/sources/&lt;slug&gt;.json</code> with atomic,
              cited claims.
            </li>
            <li>
              The diagram-author writes original Mermaid/SVG to{" "}
              <code className="text-teal-300">content/diagrams/</code>. Source images are
              referenced, never re-hosted.
            </li>
            <li>
              The solution-architect writes{" "}
              <code className="text-teal-300">content/designs/&lt;slug&gt;.md</code> from verified
              claims only.
            </li>
            <li>
              Commit the files. Publish with{" "}
              <code className="text-teal-300">python scripts/import_content.py</code>.
            </li>
            <li>
              The server runs deterministic validation: citation, freshness, versioning, diagram
              coverage.
            </li>
            <li>
              After UI or workflow changes, refresh Help with Claude{" "}
              <code className="text-teal-300">/docs-sync</code> or Codex{" "}
              <code className="text-teal-300">/prompts:fa-docs-sync</code>.
            </li>
          </ol>

          <h2 className="mt-6 text-lg font-semibold text-foreground">Domain rules</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>Every factual claim cites a source. No source, no claim.</li>
            <li>
              Claims are append-only and versioned (
              <code className="text-teal-300">supersedes_id</code>).
            </li>
            <li>
              Trust tiers, best→worst: T1 Microsoft Learn · T2 Fabric blog · T3 MS GitHub · T4 MVP ·
              T5 vendor · T6 unknown.
            </li>
            <li>
              Depth levels: L1 conceptual · L2 practitioner · L3 architect · L4 performance · L5
              internals.
            </li>
            <li>
              Label inference vs verified fact. Never invent product limits, quotas, or roadmap
              claims.
            </li>
            <li>Paraphrase fully; quotes &lt; 15 words, attributed.</li>
          </ul>

          <h2 className="mt-6 text-lg font-semibold text-foreground">Submit a source</h2>
          <p>
            Admins queue a source URL from{" "}
            <a href="/settings" className="text-teal-300 hover:underline">
              Settings → Queue
            </a>
            . Submissions land in the curator's queue (<code>kind=source</code>) and are extracted
            into cited claims by <code>/ingest-batch</code> before anything enters the atlas.
          </p>

          <h2 className="mt-6 text-lg font-semibold text-foreground">Admin and docs upkeep</h2>
          <p>
            Admins use{" "}
            <a href="/settings" className="text-teal-300 hover:underline">
              Settings
            </a>{" "}
            to manage users, queue items, content metadata, claim moderation, blog versions, and
            audit logs. The Help section is generated from the current code and prompt files; keep
            it current with the documentation generator whenever those workflows change.
          </p>
        </section>
      </main>
    </div>
  );
}
