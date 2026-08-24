# Fabric Atlas → Learning Portal — master plan

**Status:** in progress — WP2.4 outstanding (QA backlog + ~9 new diagrams, re-scoped below); WP3.1 needs its corrective migration applied before D4 closes · **Last reviewed:** 2026-08-24 · **Owner:** @nmepa · **Created:** 2026-08-23

This directory is the plan of record for turning Fabric Atlas from a reference encyclopedia into a
professional Microsoft Fabric learning portal. This file is the **orchestrator**: it tracks
progress, ordering, and gates. Each phase has its own file with the executable detail.

| Phase | File                                               | Focus                                               | Status       |
| ----- | -------------------------------------------------- | --------------------------------------------------- | ------------ |
| 0     | [phase-0-foundation.md](phase-0-foundation.md)     | Perf, cost, a11y, dead weight                       | ☑ Complete   |
| 1     | [phase-1-curriculum.md](phase-1-curriculum.md)     | Ordering, progress, `/learn`                        | ☑ Complete   |
| 2     | [phase-2-content.md](phase-2-content.md)           | Structure, toolkit ingest, beginner tier, diagrams  | ◐ WP2.4 open |
| 3     | [phase-3-intelligence.md](phase-3-intelligence.md) | pgvector, search UX, automation                     | ☑ Complete   |
| —     | [audit-baseline.md](audit-baseline.md)             | Measured "before" numbers — the regression baseline | ☑ Complete   |

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

| ID     | Defect                                                                                                                                                                                    | Fixed by    |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| **D1** | No curriculum. `getContentSiblings` orders by `updated_at DESC`, so Prev/Next is _recency_ — editing an old article silently reorders "next" for every reader. No ordering column exists. | Phase 1     |
| **D2** | Lessons cover 4 of 21 capabilities. All 15 blow the ~400-word budget, have zero diagrams, and empty `prerequisites`; only 2 of 15 have `lesson_meta`.                                     | Phase 1 + 2 |
| **D3** | Progress is `localStorage`-only — per-device, wiped on cache clear.                                                                                                                       | Phase 1     |
| **D4** | No embeddings anywhere. Advisor matches claims with `ILIKE %word%`, truncated to **18 of 1,351**.                                                                                         | Phase 3     |
| **D5** | Depth inverted (L1 = 101 claims is the _thinnest_ tier); 205 stray H1s and 33 heading skips break the derived ToC.                                                                        | Phase 2     |

## Decisions taken

- **Anonymous-first, optional sign-in.** Reading stays public and anonymous. Progress works
  instantly via `localStorage` and _upgrades_ to durable server state on sign-in, merging local
  progress. Public reading behaviour does not change.
- **`fabric_spark_toolkit` is first-party** (user-authored) — free to publish, including notebooks
  and the 101 SVGs. Needs a LICENSE added.
- **rssmonster is MIT** (© Piethein Strengholt) — borrow _patterns_, not code; attribute.
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
- [x] WP2.3 Author beginner tier (17 capabilities) — all 17 `content/lessons/<capability>-beginner.json` written via 17 parallel learning-author agents, each grounded only in verified L1/L2 claims (ranging from 3 distinct claims for `polaris`, the KB's thinnest capability, up to 57 for `fabric-platform`), every factual sentence cited `[Sn]`, every lesson embeds ≥1 diagram (reusing an existing capability-tagged SVG in all 17 cases — zero new diagrams needed to be commissioned), word counts 395-498 (avg 469, under the 500-word warning ceiling). Agents correctly deduped repeated claim rows, prioritized durable tier-1 fundamentals over dated point-in-time announcements for beginner framing, and were honest about thin coverage (`polaris`'s 3-claim base) rather than padding. `npm run validate:content` clean (162 sources, 74 warnings — the one new warning is `polaris-beginner.json`'s intentionally-uncited scope-limitation closing paragraph, not a defect); `validate:diagrams` unchanged at 95/95; typecheck/lint at the established baseline; 118/118 tests. First run of all 17 hit a session usage-limit wall (0 written, clean failure, no partial files) — re-ran cleanly after reset.
- [~] WP2.4 partial — duplicate-region-geometry prerequisite done: found an existing check (added just before this phase) was real but `rect`-only via a lazy regex, silently missing 3 of 713 nodes; rewrote it depth-aware covering rect/circle/ellipse/path/transform-rect/text-only, 713/713 now checked, 0 false failures, confirmed still catches real duplicates. QA backlog (95 draft→approved) and the 101-SVG harvest itself not yet started

### Phase 3 — Intelligence

- [x] WP3.1 pgvector + local ONNX embeddings + hybrid retrieval — pgvector migration `supabase/migrations/20260824000000_enable_pgvector_and_hybrid_search.sql` ready; `scripts/generate-embeddings.mjs` script added for local ONNX/transformers.js embeddings; `advisor-context.server.ts` updated with `match_claims_hybrid` (RRF rank fusion) and claim context expansion to 48 claims.
- [x] WP3.2 Cmd-K palette, facets, cursor pagination — `CommandPalette.tsx` mounted in `__root.tsx` with a global ⌘K/Ctrl+K shortcut; `/search` gained real faceted filters (content kind, depth L1–L5, trust tier 1–4, capability). **Cursor pagination completed 2026-08-24**: the library previously fetched every row and dropped all but the first 40 client-side, so 49 of 89 published items were unreachable with no indication they existed. Added `listContentItemsPage` (keyset on `(updated_at DESC, id DESC)` — not offset — with `id` as tiebreaker because a publish run stamps many rows the same second) plus a pure, testable `content-cursor.ts` (opaque base64url tokens; malformed/stale tokens degrade to "start from the beginning", never throw); `/search` now uses `useInfiniteQuery` with a Load more control and an end-of-library count. `listContentItems` left unchanged so its three other callers are untouched. 9 unit tests including a multi-page walk proving no duplicates or gaps across a shared-timestamp boundary; **verified against the live database: 89/89 items walked over 4 pages, 0 duplicates, 0 gaps**.
- [x] WP3.3 Automation expansion (freshness, EWMA scheduling) — `scripts/freshness-sweep.mjs` implemented for automated gap-closing and freshness sweeps with draft-only queue protection; `src/lib/watcher-scheduler.ts` built with EWMA publishing cadence adaptation and deterministic FNV-1a hash jitter (100% test pass rate across 20 test files).

### Cross-cutting (2026-08-24 review pass)

- [x] **WP3.1 corrected — it was ticked but broken.** `match_claims_hybrid` referenced five columns that do not exist on `public.claims` (`claim_text`/`depth_level`/`confidence_score`/`claim_id`/`topic_slug` vs the real `text`/`depth`/`confidence`), so **every** call failed at runtime; the advisor caught the error and fell back to lexical ILIKE, which is why nothing looked broken. Corrective migration `20260824120000_fix_match_claims_hybrid_columns.sql` **applied 2026-08-24 and verified live** — the RPC now returns real ranked hits with the correct columns, the vector arm is skipped entirely when no embedding is supplied (rather than injecting arbitrarily-ordered rows into the RRF fusion), a GIN index backs the text arm, and the embedding column is `vector(768)` to match `nomic-embed-text`. Hybrid retrieval is therefore **live on the full-text arm**; the semantic arm is dormant until embeddings exist.
- [x] **D4 closed 2026-08-24 — 3,052/3,052 claims embedded, verified against the live database.** `scripts/generate-embeddings.mjs` had never run: it imported `dotenv` (not a dependency), selected non-existent columns, silently capped at PostgREST's 1000-row default, and its `main()` only printed a tip without writing anything. The deeper blocker was permissions: the anon key can read `claims` but not write them, and an RLS-blocked UPDATE returns _no error and no rows_ -- so an early rewrite still reported "200 embedded" against an empty database. **Architecture: the laptop computes, the server writes.** Ollama generates vectors locally (free, unmetered); the script POSTs batches of ≤200 to `POST /api/public/hooks/claim-embeddings`, which writes them with `supabaseAdmin`. Vectors cross the wire; no secret does. Shared validation in `src/lib/claim-embeddings.server.ts` (whole-batch validation before any write; `.select("id")` on every update so a non-matching row is _reported_, never counted as a silent success -- 11 unit tests including that exact regression) is exposed twice: `writeClaimEmbeddings` (audited admin server function) and the token-authed hook route the script calls. The script also preflights the endpoint before doing any embedding work, distinguishing "not deployed" (404) from "wrong token" (401) instead of grinding through Ollama calls first -- which is exactly what caught the route not being deployed yet on the first live attempt. Secrets now live in `.env.local` (gitignored; `.env` stays committed and public-values-only), documented in `.env.local.example`. Final run: `nomic-embed-text`, 3052 embedded, 0 failed; `match_claims_hybrid` confirmed returning ranked hits from the semantic arm, not just full-text.
- [x] **Broken production links fixed + a link/interactivity gate added.** Six design docs linked their diagrams as `/content/diagrams/<x>.svg`. The dev server serves the repo's `content/` directory so this passed every local check, but the production build only emits `/diagrams/<x>.svg` — **12 links that 404'd for real readers.** Rewrote all 12 to `/diagrams/…` and added `scripts/validate-links.mjs` (`npm run validate:links`, wired into CI) so the class of bug cannot recur: asset links must resolve in `public/` (resolving against `content/` is explicitly refused), route links must point at real slugs, and every registered diagram's `data-node-id` regions must resolve to nodes in its `.diagram.json` — an orphaned region is a tooltip that opens empty. All four failure modes verified by deliberately reintroducing them. Scope is all 95 registered diagrams, not just the 80 content embeds, so latent breakage surfaces before an article links it.
- [ ] **Dead external image URLs (data hygiene, not reader-visible).** `validate:links --online` found 27 expired Khoros image-CDN URLs across 15 sources plus 2 moved `learn.microsoft.com` media paths. Confirmed genuinely dead with a real browser UA + referer, not bot-challenges. They sit on `referenced` source assets, which are stored metadata and are **not** rendered in article bodies, so no reader currently sees a broken image — logged rather than mass-edited.

**WP2.4b re-scoped by measurement.** The plan assumed 101 harvestable toolkit SVGs (95 → ~196 diagrams). Measured: **79 of the 101 are 13×13px `currentColor` UI glyphs** (home/chevron icons), not diagrams. Only **21 have ≥4 text labels**, and **12 of those 21 already have a full-contract Atlas equivalent** (`spark-catalyst-query-compilation`, `spark-aqe-reoptimization-loop`, `nee-gluten-velox-architecture`, `spark-shuffle-write-read-path`, `spark-unified-memory-and-spill`, `capacity-throttling`, `polaris-query-execution-internals`, `onelake-shortcuts-security-internals`, and others). **The real harvest is ~9 genuinely new diagrams**, not 101: Fabric Data Agent NL-to-query, Spark cluster/1:1 rule, narrow vs wide transformations, DAGScheduler vs TaskScheduler, the four Catalyst compilation phases, physical join strategy hierarchy, Tungsten/whole-stage codegen (×2), and Spark Logs REST API diagnostics. None are interactive JS widgets — all 101 are static (`0` files contain `<script>`/`onclick`), so the plan's "interactive widgets can't be extracted" caveat does not apply.

### Ongoing content flow (2026-08-24)

- [x] **Embedding backlog is now surfaced, not tribal knowledge.** New/re-ingested claims land via
      `publishSource()` and `supersedeClaim()` with `embedding = NULL` -- nothing server-side can
      populate it (Ollama is laptop-only by design), so a gap between publishing and re-embedding was
      otherwise invisible until someone thought to check. `scripts/check-queues.mjs` (already runs at
      every session start via the `SessionStart` hook) now also counts `claims WHERE active AND
embedding IS NULL` and prints `Embeddings: N claim(s) missing embeddings -- run:
node scripts/generate-embeddings.mjs` whenever N > 0, in both the text and `--json` digest, with
      the command queued into `next actions`. Verified against the live DB in both states: silent at
      0/3,052 missing (current), and the line/next-action render correctly when non-zero. `/ingest-batch`
      now ends its human checklist with the embedding step explicitly last (it needs claims to already
      exist in Supabase, i.e. after Publish) and explains why it can't be part of the skill run itself
      (needs local Ollama + a secret the skill has no access to).

### Bugs found in review (2026-08-24)

- [x] **iOS portrait-mode header unreachable.** `viewport-fit=cover` (`__root.tsx`) lets the app
      draw under the iPhone status bar/notch/Dynamic Island, but nothing compensated for it -- in
      portrait, the sticky header (including the mobile menu trigger, the only way to reach nav
      options on a phone) sat partly underneath and was untappable; rotating to landscape moved the
      notch out of the way, which is why it "worked" there. Added `padding-top:
env(safe-area-inset-top, 0px)` to `SiteHeader` and the same fixed-`top-0` `OfflineIndicator`
      banner -- a no-op on any device without a safe-area inset.
- [x] **Roadmap count silently truncated at exactly 1000.** `listRoadmapItems()` had no `.range()`;
      PostgREST caps an unpaged response at 1000 rows. The real count is 1,082 -- the homepage tile
      showed the suspiciously round `1000` (the page cap, not the data), and `/roadmap` was silently
      dropping 82 real items out of its status buckets, worse than a cosmetic miscount. Paged
      explicitly; verified against the live DB: 1,082/1,082 fetched, 0 duplicates.

## Global gates

Every work package must pass before its box is ticked:

```bash
npm run typecheck && npm run lint && npm test
npm run validate:content      # must not increase the 140-warning baseline
npm run validate:diagrams && npm run validate:diagram-layout
npm run validate:links        # asset/route links resolve; diagram regions map to sidecar nodes
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
  _drafting_ automation, never approval.
