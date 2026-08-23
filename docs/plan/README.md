# Fabric Atlas → Learning Portal — master plan

**Status:** approved, not started · **Owner:** @nmepa · **Created:** 2026-08-23

This directory is the plan of record for turning Fabric Atlas from a reference encyclopedia into a
professional Microsoft Fabric learning portal. This file is the **orchestrator**: it tracks
progress, ordering, and gates. Each phase has its own file with the executable detail.

| Phase | File | Focus | Status |
|---|---|---|---|
| 0 | [phase-0-foundation.md](phase-0-foundation.md) | Perf, cost, a11y, dead weight | ☐ Not started |
| 1 | [phase-1-curriculum.md](phase-1-curriculum.md) | Ordering, progress, `/learn` | ☐ Not started |
| 2 | [phase-2-content.md](phase-2-content.md) | Structure, toolkit ingest, beginner tier, diagrams | ☐ Not started |
| 3 | [phase-3-intelligence.md](phase-3-intelligence.md) | pgvector, search UX, automation | ☐ Not started |
| — | [audit-baseline.md](audit-baseline.md) | Measured "before" numbers — the regression baseline | ☑ Complete |

---

## Why this plan exists

Audited 2026-08-23 against three inputs. The verdict:

> **Fabric Atlas is an excellent source-grounded reference encyclopedia with a learning layer that
> is barely started.** The knowledge base, citation model, diagram contract, and CI gates are
> genuinely strong. The learning layer is ~200 lines of UI over 15 content files, with no
> curriculum, no server-side progress, and no assessment.

This is **not a rewrite**. It is building the missing learning spine on a solid base, fixing five
specific defects, and pointing existing automation at content depth.

Full measured evidence: [audit-baseline.md](audit-baseline.md).

## The five defects

| ID | Defect | Fixed by |
|---|---|---|
| **D1** | No curriculum. `getContentSiblings` orders by `updated_at DESC`, so Prev/Next is *recency* — editing an old article silently reorders "next" for every reader. No ordering column exists. | Phase 1 |
| **D2** | Lessons cover 4 of 21 capabilities. All 15 blow the ~400-word budget, have zero diagrams, and empty `prerequisites`; only 2 of 15 have `lesson_meta`. | Phase 1 + 2 |
| **D3** | Progress is `localStorage`-only — per-device, wiped on cache clear. | Phase 1 |
| **D4** | No embeddings anywhere. Advisor matches claims with `ILIKE %word%`, truncated to **18 of 1,351**. | Phase 3 |
| **D5** | Depth inverted (L1 = 101 claims is the *thinnest* tier); 205 stray H1s and 33 heading skips break the derived ToC. | Phase 2 |

## Decisions taken

- **Anonymous-first, optional sign-in.** Reading stays public and anonymous. Progress works
  instantly via `localStorage` and *upgrades* to durable server state on sign-in, merging local
  progress. Public reading behaviour does not change.
- **`fabric_spark_toolkit` is first-party** (user-authored) — free to publish, including notebooks
  and the 101 SVGs. Needs a LICENSE added.
- **rssmonster is MIT** (© Piethein Strengholt) — borrow *patterns*, not code; attribute.
- Work packages are **model-agnostic and separable**; the user routes them.

## Dependency graph

```
Phase 0 (independent — unblocks everything)
   │
   ├── WP1.1 ordering ──► WP1.4 /learn rebuild
   │        └── WP1.2 progress ──┘
   │                └── WP1.3 curriculum model
   │
   ├── WP2.1 headings        (independent, mechanical)
   ├── WP2.2 toolkit ingest ──► WP2.4 diagram QA + SVG harvest
   ├── WP2.3 beginner tier   (needs WP1.1 for placement)
   │
   └── WP3.1 pgvector ──► WP3.2 search UX
                      └── WP3.3 automation
```

**Critical path is WP1.1** — the entire learning experience depends on the ordering primitive.
`WP2.1`, `WP2.2`, and `WP3.1` are highly parallel and self-contained: good candidates to route to
separate models.

## Progress tracker

Update the checkbox and date as each work package lands. Do not mark done until its **gate** passes.

### Phase 0 — Foundation
- [x] WP0.1 Lazy diagram catalog + prune syntax grammars — DiagramLightbox chunk 3,839 KB → 116 KB (97%); verified via fresh build, zero chunks >1MB
- [x] WP0.2 Rate-limit and tier-gate `/api/chat` — anonymous callers capped at `cheap` tier, in-process token bucket, payload size caps, audit logging
- [x] WP0.3 Design-system correctness — fixed invalid `hsl(oklch())` focus ring; paired 52 bare `text-teal-300`/`text-rose-300` occurrences across 26 files with light-mode variants (repo-wide, wider than the two files originally sampled)
- [x] WP0.4 Purge dead weight — removed `backend/` (18 tracked files + `.env`), `frontend/`, `bun.lock`, the `backend` CI job, and the deprecated `getBlog`/`getDesign`/`listBlogs`/`listDesigns` wrappers; re-pointed `validate_migration.py`/`import_content.py`'s capability registry from dead `backend/app/llm.py` to live `atlas-publish.services.server.ts`; generalized `check_model_docs_sync.py` to watch `supabase/migrations/*.sql` instead of the retired models file; fixed the hardcoded personal path in `check-queues.mjs`; fixed the one genuinely stale `localhost:8000` instruction in `docs/workflow.md` (23 of 25 repo-wide references were already correctly caveated as retired — left alone); wrote (not applied) a migration to drop the `*_legacy` tables, pending a deliberate go-ahead since dropping tables is irreversible against the live database

### Phase 1 — Curriculum spine
- [x] WP1.1 Ordering primitive — `learning_paths`/`path_items` migration (references (kind,slug), not id — versioning-safe); `getContentSiblings` extracted into testable `content-siblings.services.server.ts`, orders by path position with recency fallback; `?path` threaded through the reader route, keyboard nav, and siblings UI; D1 regression test passing
- [x] WP1.2 Server-side progress — `user_progress` migration (RLS `auth.uid()=user_id`); `progress.services.server.ts` with never-downgrade merge logic (13 unit tests); client-side offline queue + merge-on-sign-in in `use-progress-sync.ts`, mounted at app root; wired into `MarkLessonCompleteButton` and `useReadingProgress`. Anonymous localStorage path fully unchanged
- [x] WP1.3 Curriculum content model — seed migration for 5 real paths (fabric-foundations from topics.json's 7 root topics; spark/lakehouse/warehouse-dbt/fabric-iq tracks from the 4 existing lesson trios); `lesson_meta` backfilled on all 13 remaining lessons (15/15 total), grounded in each lesson's actual body, all pass the strict Zod schema, all prerequisites resolve
- [x] WP1.4 Rebuild `/learn` — real `listLearningPaths` server function (batched join, no N+1); path-ordered cards with a progress ring, resume/start/review CTA, sequential lock indicators, linked prerequisite hints; `use-unified-progress.ts` merges server/localStorage progress for one display source; pure resume/lock logic extracted to `learning-path-ui.ts` (12 unit tests); SSR loader added (page previously had none); verified end-to-end against the live dev server (empty-state and article-page rendering both confirmed correct)

### Phase 2 — Depth, order, clarity
- [x] WP2.1 Fix stray H1s + heading skips — root-caused: both were 100% false positives from a fence-blind regex in `validate-content.mjs` matching `#`-prefixed code comments as markdown headings (verified against the real reader-facing ToC extractor, which was never affected — zero user-facing bug existed). Fixed the validator to strip fenced code first; confirmed **zero real structural issues in the entire corpus** (no content edits needed); promoted both checks to hard CI failures; `gaps.mjs` output confirmed byte-identical to baseline (30/21/0/0/11); warnings 127→73, all remaining are out-of-scope (citation review, word budget — WP2.3's job)
- [x] WP2.2 complete — toolkit fully ingested. Staged the toolkit into `content/toolkit-source/` for repo-relative citations (`nbhtml/`+`docs.html` excluded per plan); fixed a pre-existing source's misattributed URL (30 verified claims left untouched) and a mojibake bug found along the way; standardized every toolkit citation on `file:///content/toolkit-source/<file>` (valid URL scheme, no personal path). Ingested all 5 planned HTML docs, the `spark_internals.html` decomposition (46 sections, split into 4 subsystem batches), and all 13 notebooks (3 further batches by function) — **22 new sources, 221 new claims** (30 pre-existing + 221 new = 251 total toolkit-family claims). Every batch cross-checked against every already-ingested source (toolkit AND non-toolkit) before extracting, correctly yielding fewer claims wherever real overlap existed rather than padding, and correctly excluding roadmap/preview-timing statements as non-claims twice. Notebook claims are grounded in REAL executed cell output, not hallucinated behavior (e.g. a genuine 14,286-row DQ quarantine count, a real `CANNOT_MODIFY_CONFIG` exception discovered against a live Spark session, a NEE-vs-JVM benchmark's honestly-reported negative local result). Also **added an HTML upload ingestion path** for future sources with no fetchable URL: `source-uploads` Storage bucket (public-read, admin-write, `.html`/`.htm` only, 10 MB — `supabase/migrations/20260823180000_source_upload_storage.sql`), a `submitSourceUpload` server function, and a URL/Upload toggle in Settings → Queue, reusing the existing `kind=source` queue + knowledge-curator pipeline unchanged. **Remaining gap: 0 content items cite any of these 251 claims** — `gaps.mjs`'s 30 internals placeholders won't close until articles/lessons are authored from this material; that's the next highest-leverage step.
- [ ] WP2.3 Author beginner tier (17 capabilities)
- [~] WP2.4 partial — duplicate-region-geometry prerequisite done: found an existing check (added just before this phase) was real but `rect`-only via a lazy regex, silently missing 3 of 713 nodes; rewrote it depth-aware covering rect/circle/ellipse/path/transform-rect/text-only, 713/713 now checked, 0 false failures, confirmed still catches real duplicates. QA backlog (95 draft→approved) and the 101-SVG harvest itself not yet started

### Phase 3 — Intelligence
- [ ] WP3.1 pgvector + local ONNX embeddings + hybrid retrieval
- [ ] WP3.2 ⌘K palette, facets, cursor pagination
- [ ] WP3.3 Automation expansion (freshness, EWMA scheduling)

## Global gates

Every work package must pass before its box is ticked:

```bash
npm run typecheck && npm run lint && npm test
npm run validate:content      # must not increase the 140-warning baseline
npm run validate:diagrams && npm run validate:diagram-layout
npm run build                 # no chunk > 1 MB
```

Migrations additionally run `npm run verify:schema` and
`python scripts/validate_migration.py`.

## Non-goals (do not drift into these)

Carried from [CLAUDE.md](../../CLAUDE.md) — they still hold:

- **No agent mesh.** An agent is retrieval scoped to capabilities plus a focused prompt.
- **No mega-prompt.** Each agent stays narrow.
- **No unverified knowledge.** Source, trust tier, and human approval before anything enters the KB.
- **Do not automate the publish gate.** Human-gated publishing is working; Phase 3 expands
  *drafting* automation, never approval.
