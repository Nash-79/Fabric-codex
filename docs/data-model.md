# Data model & claim versioning

Read this before changing `backend/app/models.py`.

## Storage: the unified Supabase schema

The schema is **owned by the Supabase migrations** (`supabase/migrations/*`) — plural tables
(`sources`, `claims`, `blogs`, `topics`, `designs`, `queue_items`, …), **uuid** primary keys,
real foreign keys, junction tables, a `capabilities` registry table, and Postgres array
columns. The SQLModel classes in `models.py` **map onto** that schema (`__tablename__`,
portable array/uuid column types that fall back to JSON/text on the SQLite test DB); they do
not own it. The FastAPI backend connects as the Supabase service role and owns all writes; the
TanStack frontend reads the same tables directly (RLS grants anon/authenticated SELECT).

## Entities

```
sources ──< claims >── design_sources ── designs ──< validation_runs ──< issues
       └─────────────── blog_sources ──── blogs ────< validation_runs (target_kind="blog")
topics ──< blogs        topic_capabilities >── capabilities (registry spine)
claimevents (audit)     queue_items (frontend → agent ingestion)
```

- **sources** — one row per approved source, keyed by a unique `slug`. Drift updates the row
  **in place** (bump `version`, refresh `content_hash`) — slug is UNIQUE, so there is no second
  source row; versioning happens at the claim level (below). Carries reader metadata
  (`summary`, `audience`, `why_it_matters`, `takeaways`) and the raw captured `document` (below).
- **claims** — one atomic, paraphrased, cited fact/pattern/anti-pattern/internal, tagged to a
  `capability_id` (FK to `capabilities`) and `depth`, pointing at its `source_id`. Versioned
  via a `supersedes_id` chain; `active` flags the current version.
- **capabilities / topic_capabilities** — the registry is a real table now (FK target);
  a topic's capability mapping is the `topic_capabilities` junction (a set, not ordered).
- **designs / design_sources**, **blogs / blog_sources** — citations are junction rows
  (`label` = `S1`,`S2`…, `position` orders them) rather than a JSON id list. Drift finds a
  citing design/blog by querying the junction for the changed source.
- **validation_runs / issues** — one validation pass over a design **or** a blog
  (`target_kind` + `target_id`). Blog score lands in `blogs.validation_confidence`, design
  score in `designs.confidence`.
- **topics** — keyed by `slug` (text PK); adjacency via `parent_slug`. Not versioned.
- **blogs** — a cited long-form article per topic (`topic_slug`). Versioned via `supersedes_id`
  - `active` (republishing supersedes the prior version; the prior row's slug is suffixed
    `@vN` to free the UNIQUE slug). Stricter than designs: every cited source must back ≥1
    verified active claim.
- **claimevents** — append-only audit trail of human curation actions on claims.
- **queue_items** — work awaiting a local agent. State machine:
  `queued → claimed → ingested | failed (→ queued via requeue)`, or `queued → dismissed`.
  `kind` is `source` (a URL to ingest, default) or `diagram` (commission a diagram for
  `target_slug`); `scheduled_at` (a future timestamp) hides an item until it is due, which is how
  Settings → Diagrams commissions diagrams "at intervals". User intent, not knowledge — not
  git-tracked.

## The claim version chain (the important part)

Claims are **append-only**. Text is never edited in place. Identity is the **supersedes_id
chain** (no `claim_key` family column):

```
 v1  status=superseded active=false  <── supersedes_id ── v2
 v2  status=superseded active=false  <── supersedes_id ── v3
 v3  status=verified   active=true                       (only one active claim per chain)
```

State transitions:

| Event                                                             | What happens                                                                                                                                                                          |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| New claim ingested                                                | v1, `status=pending`, `active=true`                                                                                                                                                   |
| New claim near-duplicates an active claim from **another** source | stored `status=duplicate`, `active=false` — flagged for human merge/dismiss, excluded from retrieval and coverage                                                                     |
| Human approves in Registry                                        | `status=verified` (`POST /claims/{id}/verify`; batch: `POST /claims/verify-bulk` with `source_id` or `claim_ids` — only active+pending claims flip, the rest are reported as skipped) |
| Source revised, claim text changed                                | new version, `supersedes_id`→old, old `superseded`+`active=false`                                                                                                                     |
| Source revised, claim gone                                        | old `deprecated` + `active=false`                                                                                                                                                     |
| Source revised, claim same                                        | unchanged; repointed to the new `Source` revision for freshness                                                                                                                       |

Only **active** claims can be verified — verifying a superseded/deprecated row is rejected
(HTTP 409). Duplicates are queried with `GET /claims?include_inactive=true&status=duplicate`.

`GET /claims/{claim_key}/history` returns the full chain, ordered by version — that is your
audit trail and rollback surface.

## Drift detection (services.detect_drift)

1. New content arrives for an existing `source_key`.
2. If the fingerprint is unchanged, no-op. For structured payloads the fingerprint hashes
   the **sorted claim texts** (`_source_fingerprint`), so reordering claims in a content
   file or editing tags/depth does not register as drift — only text changes do. Replaying a
   source with unchanged claims but new reader metadata updates the active source metadata in
   place; it does not create a claim version.
   The payload is validated **before** any write; a drift call with no claims fails
   cleanly without rolling the source forward. New `tags`, reader metadata, and `assets` in
   the payload are carried onto the new source revision.
3. Otherwise roll the source family forward to a new active `version`.
4. Re-extract claims; for each, find the best match among current active claims **of the same
   capability** by text similarity:
   - `>= 0.85` → **unchanged** (repointed to new source revision)
   - `0.55–0.85` → **changed** → supersede
   - no good match → **added** (new family, pending)
5. Old active claims with no match → **removed** → deprecated.
6. Any `Design` **or active `Blog`** citing a source in this family → `status="needs_review"`
   (returned as `affected_designs` / `affected_blogs`). This is the guardrail that keeps
   published articles from silently outliving the sources behind them.

The similarity thresholds (`SAME`, `CHANGED` in `services.py`) are the tuning knobs. They use
`difflib` for zero dependencies; for production matching, replace with embeddings + pgvector
so semantically-equal-but-reworded claims match reliably.

## Raw captured document (audit/diff) and the one-active guardrail

Each `sources` / `blogs` / `designs` row carries a `document` **jsonb** column holding the full
captured JSON exactly as imported (claims + diagram refs + cited keys), plus a `content_hash`.
Git remains the versioned document of record; `document` is an **in-DB audit/diff snapshot** so a
row can be compared against what was last imported without checking out the repo. The importer
(`import_content.py`) passes the file JSON through as `document`; the backend persists it in
`ingest_source` / `detect_drift` / `create_blog` / `create_design`. `content_hash` makes a re-import
of an identical document a cheap no-op (designs short-circuit on it; sources/claims already did).

**Guardrail (hybrid DB logic):** versioning still lives in `services.py`, but a partial unique
index `blogs_one_active_slug ON blogs(slug) WHERE active` makes it impossible to leave two active
rows sharing a slug regardless of writer. Sources are one-row-per-slug (UNIQUE) and designs update
in place (UNIQUE slug, no supersedes chain), so neither needs an extra partial index. See
`supabase/migrations/*_content_documents_and_guards.sql`.

Designs are **idempotent by slug + content_hash**: re-importing an unchanged design is a no-op; a
changed body updates the row in place and refreshes its `design_sources` citation legend. Unlike
blogs, designs do **not** keep a supersedes chain — the slug is the single identity.

## The validation pass (services.validate_design / services.validate_blog)

Both wrap the same `_validate_document` core; blogs add one extra deterministic check —
every embedded `![](/content/diagrams/...)` image must exist on disk (warning if missing).

Deterministic validators run with no API key:

- **citation** — every `[Sn]` resolves to a real source; warns if a fact-bearing design cites nothing.
- **freshness** — flags cited sources that are superseded, and notes superseded/deprecated claims.

LLM validators run when `ANTHROPIC_API_KEY` is set:

- **grounding** — a statement doesn't follow from (or contradicts) a provided claim.
- **coverage** — a capability the scenario clearly needs is missing.
- **antipattern** — a known Fabric bad practice is present.

`confidence = 1 − Σ severity_weight` (critical 0.4, warning 0.15, info 0.0), floored at 0. A
critical issue sets the design to `needs_review` and `ready_to_share=false`.

Design status reflects how much was actually checked: a run with only the deterministic
validators (no agent issues, no API) sets `checked`; a run that included a
grounding/coverage/antipattern review — agent-supplied issues (an explicit empty list
counts) or the API reviewers — sets `validated`. `ready_to_share` is true only for a full
pass with no critical issues.

`POST /designs` requires `cited_source_ids` — the agent that authored the design owns the
`[Sn]` → source mapping; the server never re-derives it (a re-derived mapping built from a
different claim ordering silently mis-attributes citations). Unknown source ids are rejected.

## Tags and assets (v0.2)

**Source reader metadata** is stored on `Source`:

| field            | purpose                                                                   |
| ---------------- | ------------------------------------------------------------------------- |
| `summary`        | Original short explanation of what the source contributes.                |
| `audience`       | Who should read the source.                                               |
| `why_it_matters` | Original note on why the source matters architecturally or operationally. |
| `takeaways_json` | JSON list of 3-5 original takeaways.                                      |

These fields exist to make blogs/docs easier to inspect. They must remain paraphrased and
must not store copied article paragraphs, tables, or structure.

**Tags** are free-form topical hashtags stored as JSON on `Source`, `Claim`, and `Design`
(`tags_json`). They are discovery labels (e.g. `MicrosoftFabric`, `DataEngineering`, `PySpark`,
`Python`) and are orthogonal to the capability taxonomy. The leading `#` is normalised off on
ingest. Query with `GET /claims?tag=PySpark` and `GET /tags` (returns counts).

**Asset** rows attach images/diagrams to a source, claim, or design:

| kind         | fields                                          | rule                                                                                                                                                                   |
| ------------ | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `referenced` | `url`, `caption`, `attribution`, `license_note` | An external (e.g. blog/Learn) image. Stored by **reference with attribution only — never re-hosted**. The backend forces an attribution placeholder if one is missing. |
| `generated`  | `path`, `caption`, `capability_id`              | An **original** Mermaid/SVG diagram authored by the diagram-author agent and committed under `content/diagrams/`.                                                      |

Assets can attach to a source, claim, design, or (v0.4) blog via `blog_id`. Blog bodies embed
only `generated` originals — referenced screenshots stay on source cards with attribution.

Prefer `generated` originals over `referenced` copies. The platform produces vector
diagram-as-code (SVG/Mermaid), not raster art, and never embeds third-party logos/IP.

## Authoring vs API mode

In `LLM_MODE=local` (default) the agents supply pre-extracted `claims`, finished design
`output_md`, drift `claims`, and validation `issues`; the server stores them and runs only
deterministic validators. In `LLM_MODE=api` the server calls `llm.py` to do that work itself.
Either way the version chain, citation, and freshness logic below are unchanged.

## Storage: Supabase Postgres

Postgres (Supabase) is the system of record. The schema is the migration
`supabase/migrations/*_fabric_atlas_kb.sql`, which mirrors `models.py` one-to-one (text PKs,
`*_json` columns as TEXT) so SQLModel runs against it with no model changes. The backend
connects as the service role and owns every write; RLS grants `anon`/`authenticated` read-only
SELECT on the public KB surface (source, claim, asset, topic, blog, search_doc). Apply the
migration with `supabase db push`, then replay git content with
`scripts/migrate_to_supabase.py` and assert invariants with `scripts/validate_migration.py`.

## Full-text search (Postgres tsvector)

`search.py` maintains a unified `search_doc(kind, ref_id, title, body, tags, tsv)` table with a
generated `tsvector` column and a GIN index. Queries use `websearch_to_tsquery` ranked by
`ts_rank`, with `ts_headline` snippets; results are hydrated from the live tables so inactive
versions never surface. `POST /search/rebuild` repopulates it from scratch. (The SQLite test DB
has no `search_doc`; it falls back to a live LIKE scan.)

## Future: pgvector semantic retrieval

Enable the `pgvector` extension, add an `embedding vector(N)` column to `Claim`, populate it on
ingest, and replace the `difflib` matching in `detect_drift` and the claim retrieval in
`_grounding_context`/`_advisor_context` with vector search. The rest of the model is unchanged.
