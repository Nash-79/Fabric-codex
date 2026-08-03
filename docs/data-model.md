# Data model & claim versioning

Read this before changing the Supabase schema (`supabase/migrations/*`) or the TanStack server
functions in `src/lib/*.server.ts` that read/write it. There is no live `backend/app/models.py`/
FastAPI schema anymore — `backend/` is retired local tooling, not the production data model.

## Storage: the unified Supabase schema

Postgres (Supabase) is the system of record, owned entirely by `supabase/migrations/*`. The
TanStack Start app (`src/`) reads it directly with the anon/publishable key (RLS grants public
`SELECT` on the KB surface) and writes through server functions in `src/lib/*.server.ts` using the
service-role client, gated by `requireAdmin(context)`. There is no separate backend process in
production.

**`content_items`** is the single unified table for articles, designs, and lessons — a `kind`
discriminator (`'article' | 'design' | 'lesson'`) replaces what used to be three separate tables
(`blogs`, `designs`, `lessons`). It was introduced by
`supabase/migrations/20260630120000_unify_content_items.sql` to fix two real problems: the old
per-table publish paths did a bare `upsert({onConflict:"slug"})` with no version increment and no
`supersedes_id` chain (silently overwriting the active row in place), and blogs/designs/lessons
were three disconnected verticals with inconsistent topic/capability linkage and versioning.

```
sources ──< claims                    content_items ──< content_item_sources >── sources
topics ──< content_items               topic_capabilities >── capabilities (registry spine)
claimevents (audit)                    queue_items (frontend → agent ingestion)
```

- **`content_items`** — one row per article/design/lesson version. Columns: `kind`, `slug`,
  `version`, `supersedes_id`, `active`, `status` (`draft | published | superseded | archived`),
  `topic_slug` (FK → `topics`), `capability_id` (FK → `capabilities`), `title`, `summary`,
  `body_md`, `depth_levels` (int array), `tags` (text array), `scenario` (design-only prose),
  `constraints` (jsonb), `presentation_profile` (jsonb — see below), `lesson_meta` (jsonb,
  lesson-only), `ready_to_share`, `validation_confidence`/`confidence`, `document` (jsonb audit
  snapshot), `content_hash`. A unique partial index,
  `content_items_one_active_slug ON content_items (kind, slug) WHERE active`, enforces at most one
  active row per `(kind, slug)` at the database level regardless of which code path writes.
- **`content_item_sources`** — the citation junction, replacing the old separate
  `blog_sources`/`design_sources` tables: `(content_item_id, label, source_id, position)`, where
  `label` is `S1`/`S2`/… and `position` orders the citation legend.
- **`presentation_profile`** / **`lesson_meta`** (added by
  `supabase/migrations/20260727120000_add_presentation_profile.sql`) — additive nullable jsonb
  columns. `presentation_profile.archetype` is constrained at the DB level too (a `CHECK` against
  the same six-value enum Zod enforces at write time — defense in depth against a future writer
  that bypasses the TypeScript schema). See `src/lib/content-presentation.ts` for the full typed
  contract (`presentationProfileSchema`/`lessonMetaSchema`) and `docs/extending.md` for how new
  content is authored against it.
- **`sources`** — one row per approved source, keyed by a unique `slug`. Drift updates the row
  **in place** (bump `version`, refresh `content_hash`); slug is UNIQUE, so there is no second
  source row — versioning happens at the claim level (below). Carries reader metadata (`summary`,
  `audience`, `why_it_matters`, `takeaways`) and the raw captured `document`.
- **`claims`** — one atomic, paraphrased, cited fact/pattern/anti-pattern/internal, tagged to a
  `capability_id` (FK → `capabilities`) and `depth`, pointing at its `source_id`. Versioned via a
  `supersedes_id` chain (unchanged by the `content_items` unification — this table was never part
  of the old blogs/designs split).
- **`capabilities` / `topic_capabilities`** — the registry spine; a topic's capability mapping is
  the `topic_capabilities` junction (a set, not ordered).
- **`topics`** — keyed by `slug` (text PK); adjacency via `parent_slug`. Not versioned.
- **`claimevents`** — append-only audit trail of human curation actions on claims.
- **`queue_items`** — work awaiting a local agent (`queued → claimed → ingested | failed
(→ queued via requeue)`, or `queued → dismissed`). `kind` is `source` (a URL to ingest, default),
  `diagram` (commission a diagram for `target_slug`), or `idea` (an article/lesson idea brief).
  `scheduled_at` (a future timestamp) hides an item until due.

**Legacy compatibility.** The unification migration renamed the old tables to `*_legacy` and
replaced their names with read-only views (`blogs`, `designs`, `lessons`, `blog_sources`,
`design_sources`) over `content_items`/`content_item_sources`, so any code path not yet updated in
that same change kept reading without breaking, while a write attempt against the old names now
fails loudly instead of silently bypassing `content_items`'s versioning. These views are a
transitional safety net, not a supported read path for new code — read `content_items` directly.

## The content_items version chain

`content_items` rows are **append-only within a `(kind, slug)` family**. The publish path
(`publishContentItem` in `src/lib/atlas-publish.services.server.ts`) never does a bare upsert:

```
v1  active=false  status=superseded  slug="onelake@v1"   <── supersedes_id ── v2
v2  active=false  status=superseded  slug="onelake@v2"   <── supersedes_id ── v3
v3  active=true   status=published   slug="onelake"                          (current)
```

On publish: find the current active `(kind, slug)` row (if any), archive it (rename its `slug` to
`{slug}@v{version}`, set `active=false`, `status="superseded"`), then insert a new row with
`version = prior.version + 1`, `supersedes_id = prior.id`, `active=true`,
`status="published"` — there is no separate review/promotion UI, so **Settings → Publish** going
live _is_ the publish action. A malformed `presentation_profile`/`lesson_meta` hard-fails the
publish (`presentationProfileSchema.parse(...)`/`lessonMetaSchema.parse(...)`) rather than being
silently dropped or coerced — same "refuse rather than degrade" posture as the citation checks,
which also hard-fail if `cited_source_keys` doesn't resolve against approved sources.

## The claims version chain

Claims are **append-only** too, via the same `supersedes_id` shape, independent of the
`content_items` versioning above (`supersedeClaim` in `src/lib/atlas-admin.services.server.ts`):

```
v1  status=superseded active=false  <── supersedes_id ── v2
v2  status=verified   active=true                        (only one active claim per chain)
```

State transitions:

| Event                              | What happens                                                                                 |
| ---------------------------------- | -------------------------------------------------------------------------------------------- |
| New claim ingested                 | v1, `status=pending`, `active=true`                                                          |
| Human approves in the Registry     | `status=verified`                                                                            |
| Source revised, claim text changed | new version inserted, `supersedes_id` → old; old row set `status=superseded`, `active=false` |
| Source revised, claim gone         | old row set `status=deprecated`, `active=false`                                              |

Only active claims can be superseded. Every claim event (supersede, verify) is written to
`claimevents` as an append-only audit trail.

## Drift detection is agent-driven, not an automated endpoint

There is no automated drift-detection server endpoint. The **source-drift-analyst** subagent
(`.claude/agents/source-drift-analyst.md`) re-ingests a source, re-extracts claims locally,
diffs them against the source's current active claims from Supabase (classifying each as
added/changed/removed/unchanged), and finds every design/article citing that source via
`content_item_sources`. It writes the re-extracted claims to `content/sources/<slug>.json` for an
admin to publish (**Settings → Publish → Source**) and calls out exactly which claims to
supersede/deprecate and which content items to re-validate — the actual supersede/deprecate
writes and `needs_review` flagging are admin/server actions the agent recommends but does not
perform itself.

## The validation pass

The **validation-reviewer** subagent (`.claude/agents/validation-reviewer.md`) does the reasoning
work locally — grounding, coverage, antipattern, Internals-structure, and (since the Editorial
Experience Revamp) `presentation_profile`/`featured_diagram` integrity — and reports an issue list;
it has no Supabase write access. An admin then runs the deterministic **validate** action
(`validateContentItem` in `src/lib/atlas-admin.services.server.ts`) from **Settings → Publish**,
which checks:

- every cited source resolves (a document with zero `content_item_sources` rows is a **critical**
  issue),
- every embedded `![...](/diagrams/...)` (or legacy `/content/diagrams/...`) path resolves to a
  registered `diagrams` row (also **critical** if missing).

Confidence is a simple three-tier score, not a weighted sum: `0.35` if any critical issue exists,
`0.75` if there are non-critical issues, `0.95` if there are none. The run is recorded in
`validation_runs` (`target_kind`/`target_id`, generalized across all three content kinds) with its
`issues` rows, and `content_items.validation_confidence`/`confidence` is updated. `ready_to_share`
is always set to `false` by this deterministic pass alone — a full pass with no critical issues
(deterministic checks plus the subagent's own reasoned review) is what a human treats as ready,
not a database flag flipped automatically.

## Tags and assets

**Tags** are free-form topical hashtags on `content_items.tags` (and `sources`/`claims`) — discovery
labels (e.g. `MicrosoftFabric`, `DataEngineering`, `PySpark`) orthogonal to the capability taxonomy.

**Diagrams** are rows in the `diagrams` table (registered via `content/diagrams/assets.json` at
publish time), each an **original** SVG/Mermaid asset authored by the diagram-author subagent and
committed under `content/diagrams/`. A content item embeds a diagram inline in `body_md` via
`![caption](/diagrams/<slug>.svg)`, and may additionally promote one to its hero slot via
`presentation_profile.featured_diagram` (a bare slug, validated at publish time and by
`validation-reviewer` for existence). Never re-host an external source's image — reference it with
attribution only, and prefer an original generated diagram over a referenced copy in every case.

## Full-text search

`search_atlas` (a Postgres RPC defined in the same unification migration) queries `content_items`,
`claims`, `sources`, and `topics` via `websearch_to_tsquery`, ranked by `ts_rank`, unioned across
all four kinds and returned as `{kind, rank, payload}` rows. `content_items` also carries its own
GIN index (`content_items_search_idx`) over `title || summary || body_md` to back this directly —
there is no separate `search_doc` mirror table.
