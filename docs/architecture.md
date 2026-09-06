# Architecture

How the system is shaped, and why. For schema detail see [data-model.md](data-model.md); for the
authoring loop see [workflow.md](workflow.md).

## The one idea

**The capability registry is the spine.** Every claim is tagged to a Fabric capability and a depth
level (L1 conceptual → L5 internals). Ingestion tags to it, the reader is a view over it, retrieval
is scoped by it, and coverage gaps are measured per capability and depth.

Take that away and this is a CMS with citations. Keep it and the same 21 capability nodes answer
"what do we know", "what should this article cover", "what is missing", and "what should the
advisor retrieve" — without a separate taxonomy for each question.

## Runtime shape

```
┌─ Cloudflare Worker (fabric-codex) ──────────────────────────┐
│                                                             │
│  TanStack Start SSR      reader · advisor · admin           │
│  Server functions        RLS-bypassing admin writes         │
│  env.ASSETS              830 static files (not Worker size) │
│  env.AI                  Workers AI, 10k neurons/day free   │
│                                                             │
└───────────────┬─────────────────────────────────────────────┘
                │
    ┌───────────▼──────────────┐        ┌────────────────────┐
    │ Supabase (Postgres)      │        │ OpenRouter         │
    │  · pgvector embeddings   │        │  free-tier models, │
    │  · tsvector full text    │        │  live catalogue    │
    │  · RLS on every table    │        └────────────────────┘
    │  · Google OAuth          │
    └──────────────────────────┘
```

**Postgres, not D1.** Deliberate, and revisited at the Cloudflare migration. The app depends on
pgvector (`match_claims_hybrid` RRF), `tsvector` GIN search (`search_atlas`), PL/pgSQL, and RLS
across 56 migrations. D1 is SQLite and has none of those, and Supabase Auth has no Cloudflare
equivalent — so moving would mean rewriting the data *and* auth layers plus every
`supabase.from(...)` call. Keeping Postgres retains all of it while still using Cloudflare for
hosting, Workers AI, and static assets.

## Build-time authoring, run-time serving

This is the operating model everything else follows from.

**LLM work happens on your laptop**, done by IDE coding agents on your subscription — not by the
server, not through a metered API. Agents read approved sources, extract cited claims, author
diagrams and articles, and write them to `content/` as git-tracked files. The deployed app stores,
serves, and runs *deterministic* checks: citation coverage, freshness, version integrity, diagram
presence.

```
agent reads source ─▶ content/sources/<slug>.json   claims + tags + attributions
agent draws        ─▶ content/diagrams/<slug>.svg   original, never copied
agent authors      ─▶ content/articles/<slug>.json
        │
        │  git commit + push
        ▼
Settings → Publish  ── human-gated; needs the service-role key, so it is never automatic
        ▼
Supabase ─▶ Worker serves it
```

Two consequences worth stating plainly:

- **Agents read the database with the anon key and write only to git.** They cannot publish.
  Publishing requires the sealed service-role key, which lives in Worker secrets and the admin UI.
- **A generation failure never reaches readers.** Bad output is a file in a branch, not a row in
  the database.

The one deliberate exception is admin-triggered **article-idea generation**, which runs server-side
through the configured provider chain.

## The AI provider chain

Nothing about model selection is hardcoded, and that is a scar rather than a preference.

Every `:free` OpenRouter model id this codebase once shipped had been **withdrawn** by the time
anyone noticed — four of five gone, leaving only the *paid* fallback resolving, so any generation
reaching fallback quietly cost money. Nothing surfaced it until a request failed.

So the catalogue is fetched live and an admin orders the chain:

```
Settings → API Keys → Refresh models
      │  fetches OpenRouter /models + the Workers AI catalogue
      ▼
admin orders entries      [{provider, model_id}, …]
      ▼
runWithChain()  ── first entry that answers serves; advances on
                   429 / 5xx / 404 / 402 / network, and on a 400
                   naming a withdrawn model. Stops immediately on a
                   real client error, which retrying would only hide.
```

Free models are listed by default; paid ones need an explicit opt-in and appear cheapest-first, so
the chain has a reliable floor when the free tier rotates again. A configured entry that leaves the
catalogue is badged **unavailable** — the check that would have caught the original situation.

Both consumers — the advisor and idea generation — share one walker. They did not before, and the
consequence was idea generation bypassing the zero-cost guardrail entirely.

## Content model

| Concept | Rule |
|---|---|
| **Claim** | Atomic fact + citation + capability + depth + trust tier. Never edited in place. |
| **Version chain** | A change creates a new row whose `supersedes_id` points back; the old is marked superseded and inactive. |
| **Content item** | Article, design or lesson. One `content_items` table, `kind` distinguishes them. |
| **Diagram** | Original SVG plus a `.diagram.json` semantic sidecar, hash-registered in `assets.json`. |

`content_items` is one table with a `kind` column, which is why `/blogs`, `/designs` and `/learn`
collapsed into a single Knowledge Hub with chips — they were three views of one query.

## Validation

Two layers, deliberately separated.

**Agent-side (judgement):** `validation-reviewer` reads a generated document and challenges its
grounding, coverage and anti-patterns. It never rewrites what it reviews.

**Server-side (deterministic):** citation coverage, source freshness, version integrity, and
embedded-diagram existence. A missing embedded diagram is *critical* — an article cannot reach
`ready_to_share` with one.

CI runs the mechanical half on every PR: `typecheck`, `test`, `lint`, `validate:content`,
`validate:diagrams`, `validate:diagram-layout` (headless Chrome at three widths),
`validate:links`, `verify:schema`.

## Security posture

- **RLS on every table.** Anon reads only what is published.
- **The service-role key bypasses RLS**, so it exists only as a Worker secret. Agents never hold it.
- **Private workflow state is token-protected.** `queue_items` and the watcher tables were
  deliberately closed to anon; local tooling reads a sanitized snapshot from
  `GET /api/public/hooks/poll-feeds` with a bearer token. A tool that cannot reach it reports
  *unavailable* rather than treating private state as empty.
- **Rate limiting is durable.** Per-isolate counters cannot bound a shared budget on Workers, so
  the cap lives in Postgres and increments atomically. It fails *open* — a limiter that takes chat
  down when the database hiccups is worse than one that briefly over-admits.
- **Outbound crawlers identify honestly.** One `FABRIC_ATLAS_APP_URL` drives every User-Agent, so a
  publisher can always find out who is polling them.

## Deliberate non-goals

- **No agent mesh.** An agent here is retrieval scoped to capabilities plus a focused prompt. One
  generation model with good retrieval and one validation pass delivers most of the value.
- **No mega-prompt.** Each agent stays narrow and single-purpose.
- **No unverified knowledge.** Nothing enters the knowledge base without a source, a trust tier,
  and human approval.
