# Phase 2 — Depth, order, and clarity

**Fixes:** D5 (inverted depth, broken structure), D2 (lesson coverage)
**Depends on:** WP2.3 needs WP1.1 for placement; WP2.1, WP2.2 are independent and parallel-safe

This phase is where the portal actually becomes "everything about MS Fabric, basic to expert."

← [Master plan](README.md) · [Baseline](audit-baseline.md)

---

## WP2.1 — Fix document structure (mechanical, high value)

**Problem.** `npm run validate:content` reports **140 warnings**, including **205 stray in-body H1s
across 42 docs** (one article has 33) and **33 heading-level skips**. The reading-view ToC is derived
client-side by regex over `##` headings
([ContentTocSidebar.tsx](../../src/components/ContentTocSidebar.tsx)), so this **directly breaks
navigation** — exactly the "clarity / digestibility" problem.

**Fix.** Demote stray `#` to the correct level and repair skips (`h1 → h3` becomes `h2 → h3`). This
is largely mechanical and scriptable, but **must not** disturb:
- The mandatory `## Internals` section and its three fixed sub-headings
  (`### Architecture & design`, `### How it works internally`, `### Performance characteristics`) —
  these are hard exact-match conventions, not schema fields.
- The two gap markers `*Coming soon*` and `*Workload-specific.*`, which
  [scripts/gaps.mjs](../../scripts/gaps.mjs) separates machine-readably.
- `[Sn]` citation references.

Run `node scripts/gaps.mjs` before and after — the 30/11/0/0 split must be identical.

**Add a CI gate** so it cannot regress: promote stray-H1 and heading-skip from warning to failure in
`validate-content.mjs` once the baseline is clean.

**Gate.** `npm run validate:content` → 0 stray H1s, 0 heading skips; total warnings materially below
140; `gaps.mjs` output unchanged.

---

## WP2.2 — Ingest `fabric_spark_toolkit`

**Confirmed first-party (user-authored).** Free to publish, including notebooks and SVGs.
**Add a LICENSE file** — its absence is the one genuine blocker.

51 files, ~7.4 MB. Verified original: only 6 `learn.microsoft.com` URLs corpus-wide, all inside
formal "References" sections. The 82 "Copyright" hits are false positives in bundled nbconvert CSS.

**Ingestion input.** Sources are queued either by URL (existing) or by **uploading an HTML file**
directly in Settings → Queue — added because not every toolkit/future document is hosted at a
fetchable URL. Upload writes to the public `source-uploads` Storage bucket (admin-write, public-read,
`.html`/`.htm` only, 10 MB cap — see `supabase/migrations/20260823180000_source_upload_storage.sql`)
and queues a normal `kind=source` item pointing at the resulting stable public URL, so
`/ingest-batch` and the knowledge-curator agent need no separate code path for uploaded vs.
URL-fetched sources.

**Ingestion order** (easiest → highest payoff):

1. `fabric_coding_standards.md` — **start here.** Already atomic, version-tagged
   (`3.5+`/`4.x only`/`differs`), BAD/GOOD paired. ~30 articles with near-zero rewriting; ideal
   pipeline shakedown.
2. `efficient_scaledown.html` — self-cited whitepaper, easiest to publish citation-compliant.
3. `runtime_2_0_guide.html` — densest diagrams (12 SVGs in 56 KB); its four workload archetypes are
   reusable as portal recipes.
4. `onelake_polaris_deepdives.html` — small but rare; Polaris internals are barely covered publicly.
5. `fabric_deepdives.html` — valuable, but its dbt/UDF/Data Agents/Fabric IQ sections are the
   **thinnest and fastest-aging** content in the kit.
6. `spark_internals.html` — decompose section by section into ~47 articles. Biggest job, biggest payoff.
7. The 13 notebooks as executable lessons.

**Preserve two properties verbatim — they map onto the Atlas model almost 1:1:**

- **Basis tags** `SPARK_DEFAULT` / `FABRIC_DOC` / `HEURISTIC` → claim `type` (fact vs inference).
  The author already did the classification that domain rule #5 demands. Do not re-derive it.
- **Finding codes** `L001…L021`, `N001…N005`, `S001…S005`, `P003…P015`, `M001` → stable claim keys
  cross-referencing standards ↔ analyzer ↔ notebooks.

**Handle on ingest:**
- **Exclude `nbhtml/`** (4.7 MB, 13 files, ~81% bundled third-party CSS). Removes 63% of the
  folder's bytes and all third-party licensing surface, with zero content loss — the `.ipynb`
  files already hold it.
- **Version-stamp time-sensitive claims.** Highest risk: the **ANSI × NEE fallback** claim, asserted
  in four places and exactly the kind of thing Microsoft fixes. Also Runtime 2.0 GA/LTS labels,
  liquid-clustering preview gating, and one January-2026 UI-location claim (UI claims rot fastest).
- **Triplicated heuristics** — the same formulas exist as `.py`, as inlined notebook cells, and as a
  JS port inside `spark_internals.html`. Pick the `.py` as canonical or inherit three-way drift.
- **Harvest but do not publish** the "Build Plan & Gap Analysis" doc hidden inside `docs.html` — it
  exists nowhere else and is a ready-made internal gap inventory.
- `README_index.md` is stale (claims 48 sections; there are 47; omits two files). **Trust
  `index.html`** as the manifest.
- Notebooks were authored under Python 3.12.3 — matching *neither* Runtime 1.3 (3.11) nor 2.0
  (3.13). Worth flagging to learners as a portability caveat.

**Expected outcome.** Closes most of the **30 internals placeholders** and roughly triples L4/L5
coverage.

**Gate.** `npm run validate:content`; `node scripts/gaps.mjs` placeholder count materially down with
0 untracked and 0 stale; `python scripts/validate_migration.py` for KB invariants.

---

## WP2.3 — Author the beginner tier

**This is the gap nothing else fills.** Atlas has **L1 = 101 claims — its thinnest tier**. The
toolkit is top-heavy and has **no entry-level content anywhere**. So neither input solves the
on-ramp; it must be authored.

**Do this deliberately early.** A learning portal is judged on its on-ramp, and "basic → expert" is
the explicit goal.

**Scope.** L1/L2 lessons for the **17 capabilities with none**: `fabric-platform, onelake, polaris,
direct-lake, semantic-model, power-bi, data-factory, dataflow-gen2, rti, eventhouse-kql,
sql-database, mirroring, fabric-data-agent, graphql-api, purview, capacity,
materialized-lake-views`.

**Also fix the 15 that exist** — they are short articles, not lessons:

| Problem | Current |
|---|---|
| Over the ~400-word budget | 15 of 15 (1,005–2,238 words) |
| Zero diagrams | 15 of 15 |
| Missing `summary` | most |
| Uncited factual paragraphs | many |

**Rules.** Enforce the ~400-word budget. **Every lesson gets at least one diagram** (they currently
have none, while articles do). Every factual sentence cites `[Sn]`. Use the `learning-author` agent
— it exists and encodes these rules.

**Gate.** `npm run validate:content` → 0 lessons over budget, 0 missing summaries; every capability
has at least an L1 lesson; every lesson has ≥1 diagram.

---

## WP2.4 — Diagram QA + SVG harvest

**Two jobs.**

**a) Clear the QA backlog.** All 95 sidecars are `qaStatus: "draft"` — **zero approved** — despite
`content/diagrams/QA_RUBRIC.md` and a `diagram-reviewer` agent existing. Drive them through the
rubric to `approved`.

**b) Harvest the toolkit's 101 SVGs.** Original artwork, zero copyright exposure, text-based →
themeable and re-embeddable. This nearly triples the diagram library (95 → ~196).

Distribution: 74 in `spark_internals.html`, 12 in `runtime_2_0_guide.html`, 6 in
`fabric_deepdives.html`, 5 in `onelake_polaris_deepdives.html`, 4 in `efficient_scaledown.html`.
No Mermaid — all hand-drawn inline SVG.

**Extraction caveats.**
- They are **inline** and depend on the surrounding page's CSS classes. Extraction must inline
  computed styles or map classes to Atlas tokens, or they render unstyled.
- **Several are interactive JS widgets** (the plan explorer, memory-region bars, NEE fallback
  simulator, capacity planner). These **do not extract as static assets** — they should become
  portal-native React components or be dropped. Decide per-diagram; do not force them into the
  static contract.
- Each needs a `.diagram.json` sidecar meeting the full contract: labelled edges, evidence for
  `fact` nodes, node-specific drill metadata, and **exactly one focusable region per node anchored
  to its own shape's coordinates**.

> **Prerequisite — done.** A duplicate-region-geometry check already existed in
> `validate-diagrams.mjs` (added just before this phase started), but it was `rect`-only via a
> lazy forward regex — 3 of 713 existing nodes (non-rect shapes) silently escaped it, and any
> node using `circle`/`ellipse`/`path`/transform-positioned rects/text-only labels was
> unverifiable. Rewrote it depth-aware, scoped to each node's own `<g>`, covering all of those
> shape types. 713/713 nodes now checked, 0 false failures on the existing corpus, confirmed to
> still catch a real duplicate via a synthetic test. Ready for the harvest.

**Gate.** `npm run validate:diagrams && npm run validate:diagram-layout` green at the new count;
approved-vs-draft ratio rising; duplicate-geometry check active and passing.

---

## Phase 2 exit criteria

- [x] 0 stray H1s, 0 heading skips; CI gate prevents regression
- [x] Toolkit ingested (all 5 HTML docs + `spark_internals.html` decomposition + all 13 notebooks, 251 total claims); internals placeholders NOT yet down — that requires articles citing the new claims, tracked separately below. LICENSE decision: skipped per explicit user direction (files staged in-repo, so a LICENSE file was judged unnecessary)
- [x] Basis tags and finding codes preserved as claim types / keys where present in the source material (most toolkit HTML/notebooks did not use the SPARK_DEFAULT/FABRIC_DOC/HEURISTIC/finding-code convention outside `fabric_coding_standards.md`, where it was preserved)
- [x] `nbhtml/` excluded; time-sensitive claims flagged in each ingestion batch's report (not a separate version-stamp field — captured as claim text caveats and reported to the human)
- [x] All 21 capabilities have at least an L1 lesson (17 authored this batch + 4 pre-existing spark/lakehouse/warehouse/fabric-iq trios)
- [x] All 17 new lessons within budget (395-498 words, avg 469) with ≥1 diagram each. The 15 pre-existing lessons (from before WP2.3) still exceed the word budget — WP2.3's scope was the 17 missing capabilities, not a rewrite of the existing 15; that remains a separate follow-up if wanted
- [x] Duplicate-region-geometry check exists and passes
- [ ] Diagram QA backlog materially cleared
