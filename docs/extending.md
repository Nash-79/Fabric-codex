# Extending Fabric Codex

This is the map of every extension point. The golden rule first:

> **The capability registry is the spine.** Claims tag to capabilities, the learning
> portal is a view over capabilities, designs/architectures retrieve by capability, coverage is
> per capability. Anything you add should hang off it.

And the two non-negotiables: **nothing enters the knowledge base without a source, a
trust tier, and human approval**, and **all source text is fully paraphrased** (quotes
under 15 words, one per source, attributed — never copied tables or structure).

Fabric Codex is a TanStack Start app (`src/`) reading Supabase directly. There is no live FastAPI
backend or separate `frontend/` SPA — both were retired. Agents do all LLM work locally (your
subscription, not the metered API) and write only `content/*.json` + `content/diagrams/*` to git;
an admin publishes into Supabase via **Settings → Publish**, which is always the human step that
actually goes live. See `docs/data-model.md` for the schema and versioning model this section
assumes.

---

## 1. Add content (the most common extension)

Authoring is local (your IDE agents, your subscription); the server only stores and serves. The
flow:

```
/ingest <url-or-file> tier=<1-6>     # knowledge-curator writes content/sources/<slug>.json
Settings → Publish → Source          # admin pastes the file, server persists + verifies claims
```

For many sources at once, add them to `content/queue.md` (one `<url> tier=<n>` per line) and run
`/ingest-batch` — the curator processes the queue sequentially and moves done lines to the Done
section. Claims that near-duplicate an active claim from another source are stored as
`status=duplicate` (inactive) for human merge — see `docs/data-model.md`.

Or author the file by hand — the shape is one JSON file **per source**:

```json
{
  "url": "https://learn.microsoft.com/fabric/...",
  "title": "Page title",
  "tier": 1,
  "summary": "Original short summary for readers.",
  "audience": "Who should read this source.",
  "why_it_matters": "Why this source matters to Fabric architecture or operations.",
  "takeaways": ["A concise original takeaway."],
  "tags": ["MicrosoftFabric", "OneLake"],
  "claims": [
    {
      "capability_id": "onelake",
      "text": "One atomic fact in your own words.",
      "depth": 3,
      "type": "fact",
      "tags": ["OneLake"]
    }
  ]
}
```

Field rules:

| Field                                     | Rule                                                                                                                                                                  |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `capability_id`                           | should reference a real row in `capabilities` (see §2) — publishing auto-creates a bare placeholder row for an unknown id, so prefer registering the capability first |
| `depth`                                   | 1 conceptual · 2 practitioner · 3 architect · 4 performance · 5 internals                                                                                             |
| `type`                                    | `fact` \| `pattern` \| `antipattern` \| `internal`                                                                                                                    |
| `tier`                                    | 1 MS Learn · 2 Fabric blog · 3 MS GitHub/papers · 4 MVP/community · 5 vendor · 6 unknown                                                                              |
| `summary` / `audience` / `why_it_matters` | original reader metadata only; do not copy article prose                                                                                                              |
| `takeaways`                               | 3-5 original, concise takeaways; no copied bullets from the source                                                                                                    |

Re-publishing an existing source is safe — it's a drift check (versions changed claims, deprecates
removed ones, flags citing content items `needs_review`), not an overwrite. If claim texts are
unchanged but reader metadata changed, the active source metadata updates without creating new
claim versions. For ongoing drift, the **source-drift-analyst** agent (`/drift <source-key>`)
re-extracts a source, diffs claims, and reports what to supersede/deprecate.

## 2. Add a capability

The registry lives in a few explicit places:

1. **The `capabilities` Supabase table** — the actual registry row (`id`, `name`, `description`,
   `accent`, `maturity`). Publishing a claim tagged to an unknown `capability_id` auto-creates a
   bare placeholder row (`atlas-publish.services.server.ts`), but prefer registering it properly
   first so it has a real name/accent/description from the start.
2. **`src/lib/capability-names.ts` → `CAPABILITY_NAMES`** — the client-side display name + accent
   color mirror the UI reads for fast, no-fetch rendering; keep it in sync with the DB row.
3. **`.claude/agents/knowledge-curator.md`** and any other authoring agent's capability-id
   guidance — the id lists authoring agents are prompted with.
4. Optionally seed it: `/ingest <an official overview page> tier=1`, publish, verify.

## 3. Theme and visual changes

### Interactive diagram contract

Registered diagrams render through the typed React/SVG catalog in `src/diagrams/`. Author stable
nodes and directed edges with layers, walkthrough steps, classifications, source keys, risks, and
valid Atlas drill targets — each diagram needs a matching `content/diagrams/<slug>.diagram.json`
semantic topology alongside its `.svg`. The SVG itself is a script-free print/no-JavaScript
fallback, not an executable asset; `src/components/InteractiveDiagram.tsx` +
`AuthoredSvg.tsx`/`DiagramDetailPanel.tsx` layer the click/tap/keyboard selection, walkthrough mode,
and evidence panel on top of it. Run `npm run validate:diagrams` and `npm run validate:content`
before publishing; a changed fallback hash or incomplete review clears ready-to-share status.

Tooltips must be supplemental: keyboard or touch selection opens the same persistent inspector.
Every hotspot must add evidence, explanation, navigation, or decision support.

### CSS design tokens

Theming lives in `src/styles.css` as CSS custom properties (`--color-*`, `--font-*`, `--radius-*`)
under `:root`/`.dark`, consumed by Tailwind's token classes — components never hardcode hex values.
`src/routes/__root.tsx` sets `data-theme` before first paint (no flash of the wrong theme).

Licensing note: Microsoft's official terms allow Fabric icons inside architecture diagrams,
training materials, slide decks, and documentation, but not as a third-party app's logo. Follow
`docs/official-icon-policy.md`: use the official asset unchanged, label it with the product/item
name, and record provenance. Fabric Codex's own mark (`FabricMark`) is an original drawn with the
brand palette, not an official icon.

### Add a new presentation archetype

The Editorial Experience Revamp added a small, constrained `presentation_profile` contract per
content item (`src/lib/content-presentation.ts`) — `archetype` is a closed enum
(`explainer`/`field-guide`/`tutorial`/`deep-dive`/`architecture`/`lesson`), never a freeform layout
string. To add a new archetype:

1. Add it to `PRESENTATION_ARCHETYPES` in `src/lib/content-presentation.ts`, and mirror the change
   in `scripts/lib/content-presentation.mjs` (the plain-JS copy the Node validator uses — no build
   step, can't import the TS module directly) and the DB `CHECK` constraint in
   `supabase/migrations/20260727120000_add_presentation_profile.sql`'s successor migration (never
   edit an already-applied migration file — add a new one).
2. Map it to a reader shell component in `src/components/readers/index.ts`'s `ARCHETYPE_SHELL`
   record — either point it at an existing shell (`EditorialReader`/`TutorialReader`/
   `ArchitectureReader`/`LessonReader`) if the new archetype just needs a different opening block
   on an otherwise-standard reader, or add a new shell component under `src/components/readers/`
   implementing the `ReaderComponent` contract (`src/components/readers/types.ts`) if it needs
   genuinely different structure.
3. Update `blog-author.md`/`solution-architect.md`/`learning-author.md`'s archetype guidance so
   authoring agents know when to choose it.

### Add a new Markdown teaching primitive

Phase 4 added a small set of typed callout markers (`[!STEP]`, `[!CHECKPOINT]`,
`[!PREREQUISITE]`, `[!RESULT]`, `[!TAKEAWAY]`, `[!DEFINITION]`, `[!TRY-IT]`, alongside the
pre-existing `[!NOTE]`/`[!TIP]`/`[!WARNING]`/`[!IMPORTANT]`/`[!INFERENCE]`/`[!QUOTE]`) rendered by
`src/components/Callout.tsx`. To add a new one:

1. Add the marker to `Callout.tsx`'s style/label table and its recognizing regex.
2. If the primitive needs multi-block grouping (like consecutive `[!STEP]` blocks collapsing into
   one connected step sequence), extend `src/components/ContentItemArticle.tsx`'s
   `wrapTeachingPrimitiveRuns()` — it regexes the raw markdown string into a wrapper `<div>` before
   `ReactMarkdown` parses it, since per-node component overrides have no sibling-awareness to group
   consecutive blocks themselves.
3. Update `blog-author.md`'s guidance and, if it's genuinely a new syntax shape, add an example to
   this doc.

## 4. Add a view (route)

TanStack Start's file-based routing: add a file under `src/routes/` (e.g. `src/routes/my-view.tsx`)
exporting a `Route` via `createFileRoute`. Add a link to it from `SiteHeader.tsx`'s nav and, if it
belongs on the home page's "what Fabric Codex offers" grid, `src/routes/index.tsx`'s `OFFERINGS`
array — but check first whether the new view would just duplicate an existing one-click nav
target (the home page grid was deliberately trimmed from 7 to 4 cards for exactly this reason).

## 5. Add a server function

Server-side logic lives in `src/lib/*.server.ts`, called from routes via TanStack's
`createServerFn`. Public reads use the anon/publishable Supabase key (RLS allows public `SELECT`);
admin writes (publish, verify, edit) use the service-role client and are gated by
`requireAdmin(context)`. Keep this split — never grant broader Supabase permissions to public reads
than the RLS policies already allow.

## 6. Add an agent or skill

Agents are markdown prompts in `.claude/agents/`, wired to slash commands in `.claude/commands/`.
Before adding one, re-read the non-goals in `CLAUDE.md`: an agent here is _retrieval scoped to
capabilities + a focused prompt_ — no agent mesh, no mega-prompt. Add a new agent only when a
concrete need forces it; copy the structure of an existing one (inputs → method → hard rules →
output).

Agents read the KB directly from Supabase with the anon key and write only `content/*.json` +
`content/diagrams/*` to git — never direct DB writes. Publishing (which owns versioning and
validation invariants) always happens in the app's Settings → Publish tab, run by a human.

## 7. Diagrams

Always **original** artwork, authored by the diagram-author agent (or by hand): an SVG into
`content/diagrams/<slug>.svg` plus its `content/diagrams/<slug>.diagram.json` semantic topology
(nodes with evidence, drill inputs/processing/outputs, a worked example, controls, failure modes).
Registered via the `content/diagrams/assets.json` manifest, replayed on publish. Never copy or
re-host a source image — reference it with attribution instead. An article/design can additionally
promote one of its embedded diagrams to a hero slot via `presentation_profile.featured_diagram`
(a bare slug) — see `docs/data-model.md`.

## 8. Lessons

Verify claims first (lessons may only use approved claims), then `/lesson <capability>
<beginner|intermediate|expert>` writes `content/lessons/<slug>.json`. Levels map to depths:
Beginner=L1–L2, Intermediate=L3, Expert=L4–L5. Lessons carry `lesson_meta` (summary, level,
estimated minutes, objectives, prerequisites, completion outcome) — see
`src/lib/content-presentation.ts`. `/learn` groups by tier from `depth_levels`.

## 9. Publish content

**Settings → Publish** is the only path into production Supabase — paste a single
`content/*.json` file, or use **Publish all** to republish everything changed since its last
publish (sources → diagrams → articles/designs/lessons, in that order). This is a deliberate human
step; there is no CI-triggered auto-publish.

For a one-off local re-import against a Supabase instance directly (bypassing the app UI —
useful for bulk backfills or environment bootstrapping), `scripts/migrate_to_supabase.py` and
`scripts/validate_migration.py` remain available as re-runnable local tools; they are not wired
into any CI workflow.

## 10. Ask the advisor

`/advise <question>` runs the **fabric-advisor** agent: an expert Q&A view over the same knowledge
base. It retrieves claims scoped to the capabilities the question touches, answers with `[Sn]`
citations and a source legend, labels its own reasoning _(inference)_, and — when the KB has no
coverage — says so and recommends what to `/ingest` instead of guessing.

The same grounded answer is available as `POST /advisor/chat` (a TanStack server function calling
the Lovable AI Gateway), used by the in-app Advisor chat UI.

## 11. Keeping content fresh

`/drift <source-key>` (the **source-drift-analyst** agent) re-extracts a source, diffs claims, and
reports which to supersede/deprecate and which content items citing that source need re-review —
an admin actions the actual supersede/deprecate/`needs_review` writes. Run it when Microsoft
updates a doc, or on a schedule. The **coverage-auditor** agent (`what are we missing?`) reports
capability × depth gaps — thin L4/L5 coverage is the usual finding, tracked via `node scripts/gaps.mjs`.

## 12. Search

`search_atlas`, a Postgres RPC (`supabase/migrations/20260630120000_unify_content_items.sql`),
queries `content_items`, `claims`, `sources`, and `topics` via `websearch_to_tsquery`, ranked by
`ts_rank`. `content_items` carries its own GIN index over `title || summary || body_md`. The
`/search` route additionally offers a default listing (not text search) for the empty-query case,
since a blank query returns no results from `search_atlas`.

Upgrade path for semantic search: enable `pgvector`, add an `embedding vector(N)` column to
`claims`, compute embeddings at publish time, and rank by vector distance instead of/alongside
`ts_rank`.
