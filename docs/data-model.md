# Data model & claim versioning

Read this before changing `backend/app/models.py`.

## Entities

```
Source ──< Claim >── (cited_by) ── Design ──< ValidationRun ──< Issue
```

- **Source** — one revision of an approved source. A source *family* shares a `source_key`
  (slug of the URL/title); each revision bumps `version` and only the newest is `active`.
  Sources also carry reader metadata: an original `summary`, intended `audience`,
  `why_it_matters`, and a short `takeaways` list. These fields make source cards readable;
  they are not copied article text.
- **Claim** — one atomic, paraphrased, cited fact/pattern/anti-pattern/internal, tagged to a
  capability and depth, pointing at the exact `Source` revision it came from.
- **Design** — a generated architecture, storing the cited source ids so drift can find it.
- **ValidationRun / Issue** — the result of one validation pass over a design.

## The claim version chain (the important part)

Claims are **append-only**. Text is never edited in place.

```
claim_key = "abc"              one claim "family" = one idea over time

 v1  status=superseded active=false  ── supersedes_id ──┐
 v2  status=superseded active=false  ── supersedes_id ──┤
 v3  status=verified   active=true   <───────────────────┘   (only one active per key)
```

State transitions:

| Event                               | What happens                                                        |
|-------------------------------------|---------------------------------------------------------------------|
| New claim ingested                  | v1, `status=pending`, `active=true`                                 |
| New claim near-duplicates an active claim from **another** source | stored `status=duplicate`, `active=false` — flagged for human merge/dismiss, excluded from retrieval and coverage |
| Human approves in Registry          | `status=verified` (`POST /claims/{id}/verify`; batch: `POST /claims/verify-bulk` with `source_id` or `claim_ids` — only active+pending claims flip, the rest are reported as skipped) |
| Source revised, claim text changed  | new version, `supersedes_id`→old, old `superseded`+`active=false`   |
| Source revised, claim gone          | old `deprecated` + `active=false`                                   |
| Source revised, claim same          | unchanged; repointed to the new `Source` revision for freshness     |

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
6. Any `Design` citing a source in this family → `status="needs_review"`.

The similarity thresholds (`SAME`, `CHANGED` in `services.py`) are the tuning knobs. They use
`difflib` for zero dependencies; for production matching, replace with embeddings + pgvector
so semantically-equal-but-reworded claims match reliably.

## The validation pass (services.validate_design)

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

| field | purpose |
|------|---------|
| `summary` | Original short explanation of what the source contributes. |
| `audience` | Who should read the source. |
| `why_it_matters` | Original note on why the source matters architecturally or operationally. |
| `takeaways_json` | JSON list of 3-5 original takeaways. |

These fields exist to make blogs/docs easier to inspect. They must remain paraphrased and
must not store copied article paragraphs, tables, or structure.

**Tags** are free-form topical hashtags stored as JSON on `Source`, `Claim`, and `Design`
(`tags_json`). They are discovery labels (e.g. `MicrosoftFabric`, `DataEngineering`, `PySpark`,
`Python`) and are orthogonal to the capability taxonomy. The leading `#` is normalised off on
ingest. Query with `GET /claims?tag=PySpark` and `GET /tags` (returns counts).

**Asset** rows attach images/diagrams to a source, claim, or design:

| kind | fields | rule |
|------|--------|------|
| `referenced` | `url`, `caption`, `attribution`, `license_note` | An external (e.g. blog/Learn) image. Stored by **reference with attribution only — never re-hosted**. The backend forces an attribution placeholder if one is missing. |
| `generated` | `path`, `caption`, `capability_id` | An **original** Mermaid/SVG diagram authored by the diagram-author agent and committed under `content/diagrams/`. |

Prefer `generated` originals over `referenced` copies. The platform produces vector
diagram-as-code (SVG/Mermaid), not raster art, and never embeds third-party logos/IP.

## Authoring vs API mode

In `LLM_MODE=local` (default) the agents supply pre-extracted `claims`, finished design
`output_md`, drift `claims`, and validation `issues`; the server stores them and runs only
deterministic validators. In `LLM_MODE=api` the server calls `llm.py` to do that work itself.
Either way the version chain, citation, and freshness logic below are unchanged.

## Local retrieval index (DuckDB)

`scripts/build_index.py --rebuild` builds a derived DuckDB index (`var/atlas_index.duckdb`,
gitignored) from the running backend: one denormalised claims+source table, a BM25 full-text
index over claim text, tags, source summaries, and takeaways, plus a coverage view. Use
`--search "<query>" [--capability id]`
for ranked retrieval — agents should prefer this over dumping `/claims` once the KB grows.
SQLite stays the system of record; the index is throwaway. If snapshot time-travel over the
claim store becomes useful, the same table can be managed as a DuckLake catalog
(`ATTACH 'ducklake:...'`) — revisit when the KB is large enough to care.

## Scaling to Postgres + pgvector

Set `DATABASE_URL` to Postgres. Add an `embedding vector(N)` column to `Claim`, populate it on
ingest, and replace the `difflib` matching in `detect_drift` and the claim retrieval in
`_grounding_context` with vector search. The rest of the model is unchanged — SQLModel handles
both backends.
