import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteHeader } from "@/components/SiteHeader";

// The admin dashboard that used to live here duplicated Settings (same server functions,
// second copy of the KPI/queue/audit views). Settings is the one admin surface now; this
// page is the public explanation of how authoring works.
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

function Code({ children }: { children: React.ReactNode }) {
  return <code className="font-mono text-teal-700 dark:text-teal-300">{children}</code>;
}

function AuthorPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-6 py-10">
        <div className="text-xs font-medium uppercase tracking-[0.18em] text-teal-600/90 dark:text-teal-300/80">
          Workflow
        </div>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Authoring the atlas</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Authoring is <strong className="text-foreground">local-first</strong>. LLM work runs in
          the IDE on your subscription via Claude Code / Codex agents — not on the server. Admins
          manage the pipeline in{" "}
          <Link to="/settings" className="text-teal-700 hover:underline dark:text-teal-300">
            Settings
          </Link>
          .
        </p>

        <section className="mt-8 space-y-4 text-sm leading-relaxed text-muted-foreground">
          <h2 className="text-lg font-semibold text-foreground">Flow</h2>
          <ol className="list-decimal space-y-2 pl-5">
            <li>
              An agent reads an approved source and writes{" "}
              <Code>content/sources/&lt;slug&gt;.json</Code> with atomic, cited claims.
            </li>
            <li>
              The diagram-author writes original Mermaid/SVG to <Code>content/diagrams/</Code>.
              Source images are referenced, never re-hosted.
            </li>
            <li>
              The solution-architect writes <Code>content/designs/&lt;slug&gt;.json</Code> from
              verified claims only.
            </li>
            <li>
              Commit and push the files, then publish in the app:{" "}
              <strong className="text-foreground">Settings → Publish → "Publish all"</strong>{" "}
              (sources → diagrams → articles/designs, versioned, one click).
            </li>
            <li>
              The server runs deterministic validation: citation, freshness, versioning, diagram
              coverage.
            </li>
            <li>
              After UI or workflow changes, refresh Help with Claude <Code>/docs-sync</Code> or
              Codex <Code>/prompts:fa-docs-sync</Code>.
            </li>
          </ol>

          <h2 className="mt-6 text-lg font-semibold text-foreground">Domain rules</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>Every factual claim cites a source. No source, no claim.</li>
            <li>
              Claims are append-only and versioned (<Code>supersedes_id</Code>).
            </li>
            <li>
              Trust tiers, best→worst: T1 Microsoft Learn · T2 Fabric blog · T3 MS GitHub samples ·
              T4 MVP · T5 vendor · T6 unknown.
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
            <Link to="/settings" className="text-teal-700 hover:underline dark:text-teal-300">
              Settings → Queue
            </Link>
            . Submissions land in the curator's queue (<Code>kind=source</Code>) and are extracted
            into cited claims by <Code>/ingest-batch</Code> before anything enters the atlas.
          </p>

          <h2 className="mt-6 text-lg font-semibold text-foreground">Admin and docs upkeep</h2>
          <p>
            Admins use{" "}
            <Link to="/settings" className="text-teal-700 hover:underline dark:text-teal-300">
              Settings
            </Link>{" "}
            to manage users, queue items, content metadata, claim moderation, article versions, RSS
            feeds, publishing, and audit logs. The Help section is generated from the current code
            and prompt files; keep it current with the documentation generator whenever those
            workflows change.
          </p>
        </section>
      </main>
    </div>
  );
}
