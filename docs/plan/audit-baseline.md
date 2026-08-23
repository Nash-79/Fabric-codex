# Audit baseline — measured 2026-08-23

The "before" numbers. Every phase gate compares against this file. All figures were **measured**,
not taken from documentation. Re-run the commands in the right-hand column to reproduce.

## Content inventory

| Metric       | Value                      | How to reproduce                        |
| ------------ | -------------------------- | --------------------------------------- |
| Articles     | 41 (~110k words)           | `ls content/articles/*.json \| wc -l`   |
| Sources      | 140                        | `ls content/sources/*.json \| wc -l`    |
| Claims       | **1,351**                  | see depth script below                  |
| Designs      | 17                         | `ls content/designs/*.json \| wc -l`    |
| Lessons      | 15                         | `ls content/lessons/*.json \| wc -l`    |
| Topics       | 43 (9 roots + 34 children) | `grep -c '"slug"' content/topics.json`  |
| Capabilities | 21                         | `src/lib/capability-names.ts`           |
| Diagrams     | 95 SVG + 95 sidecars (1:1) | `npm run validate:diagrams`             |
| Migrations   | 47                         | `ls supabase/migrations/*.sql \| wc -l` |

## Claim depth distribution — the inverted pyramid (D5)

```
L1   101   ← thinnest tier is the beginner on-ramp
L2   409
L3   481
L4   275
L5    85
```

A "basic → expert" portal needs the opposite shape. **L1/L2 must grow fastest.**

```bash
node -e "
const fs=require('fs');const d='content/sources';let lv={},total=0;
for(const f of fs.readdirSync(d)){if(!f.endsWith('.json'))continue;
 const j=JSON.parse(fs.readFileSync(d+'/'+f,'utf8'));
 for(const c of (j.claims||[])){total++;lv['L'+(c.level??'?')]=(lv['L'+(c.level??'?')]||0)+1;}}
console.log(total, JSON.stringify(lv));"
```

## Source trust tiers

`T1=94 · T2=1 · T3=7 · T4=13 · T6=25`

**25 sources (18%) are T6 "unknown"** — an ungraded slice worth triaging.

## Claims per capability

```
spark 199 · warehouse 120 · lakehouse 108 · fabric-platform 103 · onelake 97
data-factory 81 · fabric-data-agent 80 · rti 78 · capacity 60 · direct-lake 51
semantic-model 49 · power-bi 47 · fabric-iq 40 · sql-database 40 · dataflow-gen2 38
mirroring 38 · eventhouse-kql 33 · purview 32 · graphql-api 21 · polaris 20
materialized-lake-views 16
```

## Lesson coverage — D2

**4 of 21 capabilities have lessons**: `spark`, `lakehouse`, `warehouse`, `fabric-iq`.

**17 have none**: `fabric-platform, onelake, polaris, direct-lake, semantic-model, power-bi,
data-factory, dataflow-gen2, rti, eventhouse-kql, sql-database, mirroring, fabric-data-agent,
graphql-api, purview, capacity, materialized-lake-views`.

Quality of the 15 that exist:

| Problem                   | Count                            |
| ------------------------- | -------------------------------- |
| Over the ~400-word budget | **15 of 15** (1,005–2,238 words) |
| Missing `summary`         | most                             |
| Zero diagrams             | **15 of 15**                     |
| `prerequisites: []`       | **15 of 15**                     |
| Has any `lesson_meta`     | **2 of 15**                      |

## Document structure defects — D5

| Metric                                     | Value                                         |
| ------------------------------------------ | --------------------------------------------- |
| Content validation warnings                | **140**                                       |
| Stray in-body H1s                          | **205 across 42 docs** (worst single doc: 33) |
| Heading-level skips                        | **33**                                        |
| Internals `*Coming soon*` placeholders     | **30 across 21 docs**                         |
| Workload-specific (not gaps, never queued) | 11                                            |
| Untracked / stale ledger lines             | 0 ✅                                          |

The ToC is derived client-side by regex over `##` headings
([ContentTocSidebar.tsx](../../src/components/ContentTocSidebar.tsx)), so stray H1s and level skips
**directly break navigation**.

```bash
npm run validate:content 2>&1 | grep -c "heading level skips"
node scripts/gaps.mjs
```

## Article word-count bifurcation

~20 deep articles (2,700–7,300 words) vs ~20 stubs (400–1,000 words). Deepest:
`fabric-data-agent` 7,277 · `spark` 6,756 · `onelake` 6,664 · `lakehouse` 5,478.
Thinnest: `architecture-implementation` 407 · `architecture-strategy` 408 · `data-modelling` 409.

## Performance baseline — the top defect

[src/diagrams/catalog.ts](../../src/diagrams/catalog.ts) uses `import.meta.glob(..., { eager: true })`
for **both** sidecars and SVGs, and is imported by `ContentItemArticle` (a client component on the
reader route).

| Payload                              | Size                      |
| ------------------------------------ | ------------------------- |
| All SVGs                             | 1,993,104 B (1.90 MB)     |
| All sidecars                         | 2,167,520 B (2.07 MB)     |
| **Eagerly bundled per article page** | **4.16 MB of raw source** |

Largest built chunks:

```
3839 KB  DiagramLightbox-*.js   ← the eager glob
 762 KB  emacs-lisp-*.js        ┐
 611 KB  cpp-*.js               ├ unused grammars (~1.6 MB)
 256 KB  wolfram-*.js           ┘
 647 KB  chunk-KEIR6QF5-*.js
 636 KB  export-pdf-*.js
 505 KB  advisor-*.js
 425 KB  cytoscape.esm-*.js
 253 KB  katex-*.js
```

Actual sample languages are SQL / Python / KQL / PowerShell — the emacs-lisp, cpp, and wolfram
grammars serve nothing.

## Retrieval baseline — D4

**No pgvector, no vector columns, no `<=>` operators in any of the 47 migrations.** Verified:

```bash
grep -rniE "pgvector|extension.*vector|vector\([0-9]+\)|<=>" supabase/migrations/*.sql
# → no output
```

[advisor-context.server.ts:157-164](../../src/lib/advisor-context.server.ts#L157-L164) matches
claims with `.or("text.ilike.%word%,…").limit(24)`, deduped to **18 of 1,351 claims (1.3%)**.
That is the hard ceiling on Advisor answer quality.

`cmdk` is installed and `src/components/ui/command.tsx` exists — **built but never wired** to a
⌘K palette.

## Diagram QA

95 sidecars, **all `qaStatus: "draft"` — zero approved**, despite `QA_RUBRIC.md` and a
`diagram-reviewer` agent existing.

Validation currently passing:

```
Diagram validation passed: 95 registered diagrams, 95 with authored evidence sidecars,
0 missing sidecars; 713/713 node regions use semantic groups.
Diagram layout validation passed: 95 SVGs at 390px, 768px, 1280px with no text collisions or overflow.
```

> **Update (WP2.4, 2026-08-23):** a duplicate-region-geometry check now exists in
> `validate-diagrams.mjs`, added in the commit immediately preceding this phase's work. Verified
> it and found it real but incomplete — `rect`-only, via a lazy forward regex that could in
> principle match a _different_ node's rect. Confirmed 3 of 713 existing nodes (non-rect shapes)
> silently escaped it. Rewrote it depth-aware and scoped to each node's own `<g>`, covering rect,
> circle, ellipse, path, transform-positioned rect, and text-only nodes — 713/713 nodes now
> checked, 0 false failures. `CLAUDE.md:250-251`'s claim is accurate as of this fix.

## Security & cost

- **`/api/chat` has no auth and no rate limit**, and the model id is caller-supplied from a list
  including `openai/gpt-5`. Real cost-abuse vector. → WP0.2
- **Committed `.env` files are NOT a live-secret leak.** Root `.env` is intentional (public
  `VITE_SUPABASE_*` build values, documented at `.gitignore:11`). `backend/.env` has an **empty**
  `ANTHROPIC_API_KEY` and a `localhost` `DATABASE_URL`. **No rotation needed** — just delete it
  with the dead backend.

## Dead weight

| Item                                            | Status                                                                 |
| ----------------------------------------------- | ---------------------------------------------------------------------- |
| `backend/`                                      | Retired FastAPI app; still linted by `quality-gate.yml` on every PR    |
| `frontend/`                                     | 0 tracked files                                                        |
| `langgraph/`                                    | 4 tracked files, no integration point in `src/`                        |
| `*_legacy` tables + views                       | Survive; migration comment says drop after a grep confirms zero reads  |
| `bun.lock` (477 KB)                             | Stale — CI uses npm                                                    |
| `getBlog`/`getDesign`/`listBlogs`/`listDesigns` | Pre-unification duplicates of `getContentItem`/`listContentItems`      |
| `scripts/check-queues.mjs:5-7`                  | Hardcodes a personal absolute path to an unrelated project's plan file |

### Agent instruction drift — scoped accurately

25 references to `localhost:8000` exist across `.claude/`, `.codex/`, and `docs/`. **23 are already
correctly caveated** ("the `localhost:8000` backend is retired…"). Only **one is genuinely stale**:

- [docs/workflow.md:104](../../docs/workflow.md#L104) — still gives a live
  `python scripts/import_content.py --base http://localhost:8000` instruction.

Do **not** sweep all 25; that would strip accurate "this is retired" guidance from agent contracts.

## Design system

Real oklch token system in [src/styles.css](../../src/styles.css) (1,009 lines) with full
light/dark parity and sophisticated `--surface-*` compound tokens. Defects beside it:

| Defect                                                                                                                                                                             | Location                                |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| **Invalid focus ring** — `hsl(var(--ring))` applied to **oklch** tokens, so `hsl(oklch(…))` is invalid and the global `:focus-visible` box-shadow **silently fails** (a11y defect) | `styles.css:502-505`                    |
| Hardcoded dark-only classes (`text-teal-300`, `bg-teal-500/10`) bypassing `--primary`                                                                                              | `src/lib/fabric-theme.ts` + routes      |
| `text-teal-300` with no `dark:` variant on light backgrounds — low contrast                                                                                                        | `index.tsx:211,347,415`, `learn.tsx:87` |
| Radius drift: `rounded-md` / `rounded-xl` / `rounded-2xl`, no rule                                                                                                                 | multiple                                |
| Comment references `frontend/src/theme.js`, which no longer exists                                                                                                                 | `styles.css:254`                        |

## What is genuinely strong (protect this)

- Zero `TODO`/`FIXME`/`HACK` in `src/`. Comments explain _why_ and cite the motivating bug.
- RLS is consistent and correct: public tables `SELECT USING (true)` with no authenticated-write
  policy; all writes route through server functions gated by `requireAdmin()`.
- CI gate (typecheck → content → diagrams → layout → lint → test → build → schema) is stronger than
  most production apps.
- The reader: ToC + scroll-spy, citation drawer, interactive diagrams, resume-reading, `[`/`]`
  sibling nav, print/PDF, offline/PWA, per-heading feedback.
- An MCP server, multi-model Advisor, perf tracker at `/dev/perf`, real auth.
