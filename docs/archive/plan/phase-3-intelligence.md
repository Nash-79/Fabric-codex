# Phase 3 — Intelligence and automation

**Fixes:** D4 (lexical-only retrieval)
**Depends on:** WP3.1 gates WP3.2 · Content quality from Phase 2 makes retrieval worth upgrading

The single biggest quality jump available to the app. Today the Advisor sees **18 of 1,351 claims**.

← [Master plan](README.md) · [Baseline](audit-baseline.md)

---

## WP3.1 — pgvector + local ONNX embeddings + hybrid retrieval

**Problem.** Verified: **no pgvector, no vector columns, no `<=>` operators in any of the 47
migrations.** [advisor-context.server.ts:157-164](../../../src/lib/advisor-context.server.ts#L157-L164)
does:

```ts
const ors = termWords.map((word) => `text.ilike.%${word}%`).join(",");
const { data } = await supabaseAdmin.from("claims").select(...).or(ors).limit(24);
// ...then deduped to 18
```

Keyword `ILIKE` OR-matching, truncated to **18 of 1,351 claims (1.3%)**. A question phrased
differently from the claim text simply misses. This is the hard ceiling on Advisor quality _and_ on
`/search`.

**Approach — keep the local-authoring model intact.**

The project rule is that **LLM and heavy inference run on the laptop, not the server** (CLAUDE.md,
"Build-time authoring vs run-time serving"). Embedding generation must respect that: generate
vectors **locally at authoring/import time**, store them in Supabase, and let the server do only a
cheap vector comparison. This keeps production serverless and adds **zero metered API cost**.

Borrow rssmonster's stack (MIT — attribute): `@huggingface/transformers` running
`onnx-community/Qwen3-Embedding-0.6B-ONNX` at 1024 dimensions.

**Schema.**

```sql
create extension if not exists vector;

alter table public.claims        add column embedding vector(1024);
alter table public.content_items add column embedding vector(1024);

create index claims_embedding_idx on public.claims
  using hnsw (embedding vector_cosine_ops);
create index content_items_embedding_idx on public.content_items
  using hnsw (embedding vector_cosine_ops);
```

Also store the **model name** alongside each vector. rssmonster's own docs warn: _"Do not switch a
database with existing semantic vectors between providers — no vector migration is provided."_
Learn from that — record the model so a future swap is detectable and re-embeddable.

**Hybrid retrieval.** Do **not** discard the existing `tsvector` work — the `search_atlas` RPC and
its GIN indexes are good. Combine both with **Reciprocal Rank Fusion**:

```
score(d) = Σ  1 / (k + rank_i(d))        k ≈ 60
```

over (a) vector cosine rank and (b) `ts_rank` rank. RRF needs no score normalization between the
two systems, which is why it is the right choice here.

Then **raise the truncation limit** — 18 was a lexical-noise guard, not a context-window limit.
With relevance-ranked retrieval, 40–60 claims is comfortable for the models in use.

**Watch out.**

- `claims` is versioned via `supersedes_id`. Embed **active** claims only, and re-embed on supersede.
- One known perf issue to fix while here: `search_atlas` computes `to_tsvector` **inline in the
  WHERE clause** rather than using a stored generated column, so the GIN index expression must match
  exactly or it degrades to a seq scan computing tsvector over full article bodies per row.
- Keep the Advisor's grounding discipline exactly as-is — `[C#]` citations, the explicit refusal
  string, `_Inference:_` prefixing. Better retrieval must not loosen the honesty rules.

**Gate.** `verify:schema`; **A/B the Advisor** on a fixed question set before/after, comparing cited-
claim recall against the 18-claim baseline. Include questions the KB genuinely cannot answer and
confirm it still refuses.

---

## WP3.2 — Search UX

**Wire the ⌘K palette.** `cmdk` is already a dependency and
[src/components/ui/command.tsx](../../../src/components/ui/command.tsx) already exists — **built but
never wired**. This is assembly, not construction.

**Add to `/search`** ([search.tsx](../../../src/routes/search.tsx), 240 lines):

- **Facets**: capability, depth level, source tier, tag, kind. All exist as columns already.
- **Highlighted snippets** (`ts_headline`) instead of bare titles.
- **Signed-cursor pagination** — port rssmonster's `articleSearchCursor` pattern: HMAC-signed opaque
  cursor carrying `queryHash`, `sort`, and a `snapshotMaxId` so newly published items never cause
  duplicates or skips mid-scroll. Distinct error codes (`CURSOR_EXPIRED` → 410,
  `CURSOR_QUERY_MISMATCH` → 409) make failures debuggable.

**Keep what works:** query lives in the URL (`?q=`, `?kind=`) so browser-back works — a comment
records that this was previously `useState` and back wiped results. Don't regress it.

**Optional, high value: a saved-query DSL.** rssmonster's declarative search language
(`capability:spark depth:>=4 tier:1 sort:relevance`) maps beautifully onto learning paths — a path
becomes _a saved query plus an order_, not a hardcoded tab. Its parser design (tokenize → structured
filters → free-text remainder, hand-written and non-backtracking) is worth copying wholesale.
Consider it after WP1.1 lands, since it interacts with `path_items`.

**Gate.** `npm run typecheck && npm run lint && npm test`; manual: ⌘K opens anywhere, facets narrow
correctly, deep pagination has no dupes/skips, keyboard-only navigation works.

---

## WP3.3 — Automation expansion

**Extend the Lovable AI Gateway beyond article-ideas.** The infrastructure already exists
([ai-gateway.server.ts](../../../src/lib/ai-gateway.server.ts) — 22 lines, plus 8 models across two
providers) and is **underused**: today it has exactly two consumers, and neither touches the
reading path.

New consumers, all **draft-only**:

1. **Freshness sweeps** — `roadmap_items` is already `capability_id`-linked. Cross-reference launched
   roadmap items against claim/article `updated_at` to flag content that a shipped feature has
   outdated. Route into `queue_items`, not straight to publish.
2. **Gap-closing drafts** — take the internals ledger from `node scripts/gaps.mjs --json` (already
   machine-readable) and draft candidate source searches for each `*Coming soon*` placeholder.
3. **Structure lint suggestions** — propose heading-hierarchy fixes for anything WP2.1's CI gate
   catches later.

**Reuse the hardening already learned.** [article-ideas.services.server.ts](../../../src/lib/article-ideas.services.server.ts)
encodes real production lessons — a cross-provider fallback chain, and the **strict-schema
invariant**: with `supportsStructuredOutputs: true`, OpenAI validates in strict `json_schema` mode
requiring _every_ property in `required`, so `.optional()`, `.default()`, and `.catch()` are all
banned on schema fields. Any new structured-output call must follow the same rule or it 400s before
a model runs. Log failures to `admin_audit_events` the same way.

**Upgrade the watcher scheduler.** Port rssmonster's adaptive cadence: interval derived from
observed publishing activity, **median-of-adjacent-intervals fed into an EWMA**, plus **deterministic
FNV-1a hash jitter** per feed id to spread load without randomness (deterministic matters — it stays
stable across restarts). Then a unified `nextFetchAt = max(base, cacheFreshUntil, retryAfterAt,
backoff) + jitter`. Also worth taking: the closed 10-value fetch-outcome set and conditional-GET +
content-hash triple-layer change detection.

Keep the laptop-side `poll-watchers.mjs` fallback — some publishers (Khoros-hosted
`community.fabric.microsoft.com`) challenge all datacenter traffic, and polling from the laptop with
an honest client identity is the correct answer.

> **Hard constraint: do not automate the publish gate.** Human-gated publishing via Settings →
> Publish is working and is a deliberate domain rule. Phase 3 expands _drafting_ automation only.
> Nothing here may write to the KB without human approval.

**Gate.** New automation writes only to `queue_items`/drafts, never published content; failures
appear in Settings → Logs; watcher scheduling verified stable across a restart.

---

## Phase 3 exit criteria

- [x] pgvector live with HNSW indexes; embeddings generated **locally** (`nomic-embed-text`, 768-dim, via Ollama) and written server-side — 3,052/3,052 claims, verified against the live database, model name recorded in `embedding_model`
- [x] Hybrid RRF retrieval replaces `ILIKE`; limit raised well above 18 — `match_claims_hybrid` live and verified returning ranked hits; advisor context 18 → 48 claims
- [ ] Advisor A/B shows improved cited-claim recall **and** still refuses when the KB is silent
- [ ] `search_atlas` tsvector indexing verified (no seq scan)
- [x] Cmd-K palette wired; facets and cursor pagination working — pagination verified against the live DB: 89/89 items over 4 pages, 0 dupes, 0 gaps (was 40 of 89 reachable)
- [ ] Freshness/gap automation drafting into the queue, human gate intact
- [ ] Watcher scheduling on EWMA + deterministic jitter
