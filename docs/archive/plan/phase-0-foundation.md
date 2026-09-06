# Phase 0 — Foundation: perf, cost, a11y, dead weight

**Depends on:** nothing · **Blocks:** everything · **Parallel-safe:** all four WPs are independent

Small, surgical, high-leverage. Do this first — WP0.1 dominates any later Core Web Vitals work, and
WP0.4 removes noise every later phase would otherwise wade through.

← [Master plan](README.md) · [Baseline](audit-baseline.md)

---

## WP0.1 — Kill the 4.16 MB eager diagram bundle

**Problem.** [src/diagrams/catalog.ts](../../../src/diagrams/catalog.ts) eagerly globs _both_ sidecars
and SVGs:

```ts
const sidecarModules = import.meta.glob<{ default: AuthoredDiagram }>(
  "../../content/diagrams/*.diagram.json",
  { eager: true },
);
const staticSvgModules = import.meta.glob<string>("../../content/diagrams/*.svg", {
  eager: true,
  query: "?raw",
  import: "default",
});
```

`ContentItemArticle` (a client component on the reader route) imports it, so **every article page
downloads all 95 SVGs (1.90 MB) + all 95 sidecars (2.07 MB) to display one diagram**. Built chunk:
3,839 KB.

**Fix.**

1. Drop `eager: true` from both globs; keep the glob patterns so slug resolution is unchanged.
2. Expose `async loadDiagram(slug)` and keep a **synchronous** `hasDiagram(slug)` built from
   `Object.keys(modules)` — the keys are static, so `isAuthored()` stays cheap and synchronous.
   This matters: `ContentItemArticle`'s `img` override picks the render path before any await.
3. Have `AuthoredSvg` / `InteractiveDiagram` await `loadDiagram` behind a Suspense boundary with a
   skeleton sized from the sidecar `viewBox` aspect ratio, so there is **no layout shift**.
4. Narrow `rehype-highlight` to the languages actually used — sql, python, kql, powershell, bash,
   json, yaml, tsx, tsql. Removes ~1.6 MB of `emacs-lisp`, `cpp`, `wolfram` grammars.

**Watch out.**

- `ReaderShell.tsx:88`'s `diagramCount` regex must keep matching `validate-content.mjs`'s
  `markdownDiagram` — a comment says so and nothing tests it. Extract a shared constant and add a test.
- SSR: the reader route is SSR'd. `ContentItemArticle` already memoizes figure indices because a
  naive counter produced figure-1 on server / figure-2 on client — **keep that memo**.
- Print/PDF ([export-pdf.ts](../../../src/lib/export-pdf.ts)) walks the article DOM; ensure diagrams
  resolve before print or printing loses them.

**Gate.**

```bash
npm run build     # assert no chunk > 1 MB (from 3,839 KB)
npm test && npm run typecheck
```

Manual: open an article with a diagram — renders, lightboxes, prints, no CLS.

---

## WP0.2 — Rate-limit and tier-gate `/api/chat`

**Problem.** [src/routes/api/chat.ts](../../../src/routes/api/chat.ts) has **no auth and no rate
limit**, and takes the model id from the request body:

```ts
const modelId = ADVISOR_MODEL_IDS.has(requestedModel) ? requestedModel : DEFAULT_ADVISOR_MODEL;
```

`ADVISOR_MODEL_IDS` includes `openai/gpt-5` (tier `expensive`). Anyone can drive `LOVABLE_API_KEY`
spend at the highest rate, unauthenticated.

**Fix.**

1. **Tier gate.** Anonymous callers may only select `tier: "cheap"` models
   ([advisor-models.ts](../../../src/lib/advisor-models.ts) already carries the tier). Authenticated
   callers get `moderate`; `expensive` needs an approved profile. Silently downgrade rather than
   erroring, so the UI stays simple.
2. **Rate limit.** Per-IP and per-session token buckets. Keep in-process to start (single Lovable
   host); if it must survive restarts, back it with a small Supabase table — **not** Redis.
3. Cap `messages` length and total input characters — the endpoint currently accepts an unbounded array.
4. Log rejections to `admin_audit_events` so abuse shows in Settings → Logs, matching how
   `idea.generation_failed` is already handled.

**Do not** put this behind full auth — a publicly usable Advisor is a product feature. The goal is
bounding cost, not gating access.

**Gate.** Unit tests for tier downgrade and the bucket. Manual: POST `model: "openai/gpt-5"` while
signed out → runs on a cheap model; hammer the endpoint → 429.

---

## WP0.3 — Design-system correctness

1. **The broken focus ring (a11y defect).** `styles.css:502-505` composes `hsl(var(--background))`
   and `hsl(var(--ring, …))`, but every token is **oklch**. `hsl(oklch(0.2 0 0))` is invalid CSS, so
   the global `:focus-visible` box-shadow **silently does nothing**. Use the oklch properties
   directly. Verify by tabbing through `/`, `/topics`, `/learn`, and an article.

2. **Token drift.** [src/lib/fabric-theme.ts](../../../src/lib/fabric-theme.ts) hardcodes dark-only
   classes (`text-teal-300`, `bg-teal-500/10`, `border-teal-400/40`) beside the real token system.
   Replace with semantic tokens. `accentClasses` is the main offender; `tierMeta` is second.

3. **Light-mode contrast.** `text-teal-300` with no `dark:` variant on light backgrounds:
   `index.tsx:211,347,415`, `learn.tsx:87`, plus `topics/*` and `search.tsx`. Fixed by (2).

4. **Radius scale.** One rule — suggest `rounded-lg` cards, `rounded-md` controls, `rounded-2xl`
   for hero/section surfaces.

5. Delete the stale `styles.css:254` comment referencing the removed `frontend/src/theme.js`.

**Guard against regression.** Port rssmonster's `check-hard-coded-colors.js` build gate (MIT —
attribute): fails the build on raw palette classes and CSS named colors outside the token layer,
with a baseline file for known exceptions. This is what would have prevented the drift. Wire into
`npm run build` and `ci.yml`.

**Gate.** `npm run lint && npm run build`; color gate passes; manual light **and** dark pass over
`/`, `/learn`, `/topics`, an article, `/advisor`.

---

## WP0.4 — Purge dead weight

**Remove.**

- `backend/` — retired FastAPI app (18 tracked Python files) **and** `backend/.env`.
  Also delete the `backend` job from [quality-gate.yml](../../../.github/workflows/quality-gate.yml) —
  you currently pay CI on every PR to lint a dead app.
- `frontend/` — 0 tracked files.
- `bun.lock` (477 KB) — stale; CI uses npm.
- `getBlog` / `getDesign` / `listBlogs` / `listDesigns` in
  [atlas.functions.ts](../../../src/lib/atlas.functions.ts) — pre-unification duplicates. Grep callers first.
- `*_legacy` tables and compat views — **only after** a repo-wide grep confirms zero reads. The
  unification migration's own comment asks for exactly this follow-up.

**Keep.** `langgraph/` is documented as an intentional unwired reference scaffold — leave it, or
confirm with the owner first.

**Fix.** `scripts/check-queues.mjs:5-7` hardcodes
`C:\Users\nmepa\.claude\plans\review-app-how-much-purrfect-nest.md` — a personal path to an
unrelated project. Default to repo-relative or drop the default.

**Doc drift — scope precisely.** 25 files reference `localhost:8000`, but **23 already say it is
retired**. Only **[docs/workflow.md:104](../../../docs/workflow.md#L104)** is genuinely stale (a live
`import_content.py --base http://localhost:8000` instruction). Fix that one.
**Do not sweep all 25** — that strips accurate "this is retired" guidance out of agent contracts.

**Correction to note.** Committed `.env` files are **not** a live-secret leak: root `.env` is
intentional (public `VITE_SUPABASE_*` build values, per `.gitignore:11`), and `backend/.env` has an
empty `ANTHROPIC_API_KEY` and a `localhost` `DATABASE_URL`. **No key rotation required** — deleting
`backend/` handles it.

**Gate.** `npm run typecheck && npm run lint && npm test && npm run build` pass; CI green without
the backend job; `validate:content` and `validate:diagrams` unchanged.

---

## Phase 0 exit criteria

- [x] No built chunk exceeds 1 MB (from 3,839 KB) — verified 2026-08-24: zero client chunks >1MB
- [x] Anonymous `/api/chat` cannot select `moderate`/`expensive`; rate limit returns 429 — `resolveAllowedModel` downgrades with a `model_tier_downgraded` audit event; 429 + `Retry-After` on limit
- [x] `:focus-visible` ring visibly renders in both themes — no `hsl(oklch(...))` remains in `src/`
- [ ] Color gate active in CI
- [x] `backend/`, `frontend/`, `bun.lock` gone; CI green without the backend job — `bun.lock` was still tracked (a second competing lockfile alongside `package-lock.json`); untracked + gitignored 2026-08-24. `backend/` is untracked local leftovers only
- [ ] `docs/workflow.md:104` corrected
- [x] Full gate suite green — typecheck, lint (0 errors), 141/141 tests, content/diagram/link validators, build
