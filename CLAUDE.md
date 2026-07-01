# Fabric Atlas — Claude Code project memory

A governed, source-grounded knowledge and architecture platform for Microsoft Fabric.
It ingests **approved** sources into a versioned, source-graded knowledge base of atomic
**claims**, each tagged to a Fabric **capability** and a **depth level**, then uses that
knowledge to generate **cited** solution architectures and **tiered learning** content,
and **validates** every output against the claims it cites.

## The one idea everything hangs on

The **capability registry is the spine.** Ingestion tags claims to capabilities; the
learning portal is a view over capabilities; architecture generation retrieves by
capability; coverage gaps are visible per capability and depth. Build around it.

## Deliberate non-goals (read before "improving" the design)

- **No agent mesh.** Do not build 40 microservice "agents". An agent here is _retrieval
  scoped to capabilities + a focused prompt_, nothing more. One generation model with good
  retrieval and one validation pass delivers ~90% of the value. Add a new agent only when a
  concrete need forces it.
- **No mega-prompt.** Keep each agent narrow and single-purpose.
- **No unverified knowledge.** Nothing enters the knowledge base without a source, a trust
  tier, and human approval.

## Repo layout

```
backend/            Local/legacy FastAPI + SQLModel mapping onto the unified Supabase schema
                    (plural tables, uuid PKs). Useful for authoring/import workflows; not the
                    Lovable production host.
  app/models.py     maps to capabilities/topics/topic_capabilities/sources/claims/claimevents/
                    blogs/blog_sources/designs/design_sources/validation_runs/issues/
                    queue_items/assets. Versioning = slug + supersedes_id chains.
  app/services.py   ingestion, versioning/supersede, generation, validation, drift,
                    queue, topics, blogs
  app/routers.py    REST API
  app/search.py     Postgres per-table GIN tsvector search (LIKE fallback on SQLite test DB)
  app/llm.py        Anthropic wrapper + structured-output helpers (graceful w/o key)
supabase/migrations/  the canonical KB schema (Lovable-owned) + the backend-unify migration
src/                Lovable-hosted TanStack Start app — reads Supabase directly and exposes
                    production server functions/API routes.
frontend/           Legacy React + Vite SPA retained for reference/local comparison only; do
                    not treat it as the production deployment path.
.claude/agents/     Subagents (curator, architect, validator, drift, learning, coverage,
                    diagram, advisor, blog-author, content-orchestrator, docs-author)
.claude/commands/   Slash commands that drive the agents
content/            Git-tracked authored content: sources/, diagrams/, designs/, lessons/,
                    blogs/, help/, topics.json (seed tree), queue.md (offline queue)
docs/data-model.md  How claim versioning and supersede work — read before touching models
docs/extending.md   Extension points: content, capabilities, theme tokens, views, agents
```

## Build-time authoring vs run-time serving (the operating model)

LLM work happens on your **laptop**, done by the Claude Code / Codex agents on your subscription —
**not** by the server, and **not** via the metered API. The server stores and serves pre-built
content and runs only deterministic checks. Set `LLM_MODE` in `backend/.env`:

- `local` (default) — agents extract/generate/diagram and POST structured data. Server needs no key.
- `api` — server calls the Anthropic API on the fly via `llm.py` (original v0.1 behaviour).

Authoring flow (git is the source of truth):

```
agent reads source ─▶ writes content/sources/<slug>.json  (claims + tags + image refs)
agent draws diagram ─▶ writes content/diagrams/<slug>.svg|.mmd  (original, never copied)
agent designs       ─▶ writes content/designs/<slug>.md
        │  git commit
        ▼
publish ─▶ python scripts/import_content.py --base <server>   (replays files into the API)
        ▼
server serves the knowledge base; deterministic citation/freshness/versioning run server-side
```

## Tags and images

- **Tags** are free-form topical hashtags on sources/claims/designs (e.g. MicrosoftFabric,
  DataEngineering, PySpark, Python). They are discovery labels, independent of the capability
  taxonomy. Query with `GET /claims?tag=PySpark` and `GET /tags`.
- **Images** are `Asset`s of two kinds. `referenced` = an external source image, stored as
  URL + caption + **attribution** only, never re-hosted (copyright). `generated` = an **original**
  Mermaid/SVG diagram authored by the diagram-author agent, stored in `content/diagrams/`. Prefer
  generated originals over referenced copies. Claude makes vector diagrams, not raster art.

## Running the backend

```bash
cd backend
python -m venv .venv && . .venv/Scripts/activate   # Windows; use bin/activate on *nix
pip install -r requirements.txt
cp .env.example .env        # set DATABASE_URL to your Supabase Postgres URL
uvicorn app.main:app --reload
# docs at http://localhost:8000/docs
```

**Postgres (Supabase) is the store.** The canonical schema is the Supabase migration
`supabase/migrations/*_fabric_atlas_kb.sql` (apply with `supabase db push` or run the SQL);
set `DATABASE_URL` to the Supabase pooler URL with the `+psycopg` driver when running the local
FastAPI tooling. In Lovable production, `src/` uses TanStack server functions plus the Supabase
service role for admin mutations and validation. SQLite is retired (the only remaining use is the
in-memory test DB). Full-text search uses Supabase/Postgres `tsvector` indexes through the
`search_atlas` RPC.

**Local migration / re-import (re-runnable):**

```bash
python scripts/migrate_to_supabase.py --base http://localhost:8000   # replay content/ + rebuild search
python scripts/replay_verified_status.py                            # ONCE: restore curation status from old SQLite
python scripts/validate_migration.py                                # assert KB invariants (also runs at end of /ingest-batch)
```

**Advisor chat:** `POST /advisor/chat` is key-optional. With `LLM_MODE=api` + a key it
returns a server-generated, cited answer. In local mode or without a key it returns a clear
fallback plus the scoped claim context, citation legend, and advisor system prompt; use the
`/advise` skill or a client-side generator to produce the answer from that returned context.

## Core domain rules (enforce these in code and in every agent)

1. **Every factual claim cites a source.** No source, no claim.
2. **Claims are versioned, never edited in place.** A change creates a new version with
   `supersedes_id` pointing back; the old version is marked `superseded` and `active=False`.
3. **Trust tiers** (1 best → 6 worst): 1 Microsoft Learn, 2 Fabric product blog,
   3 MS GitHub samples, 4 MVP/community, 5 vendor, 6 unknown.
4. **Depth levels:** L1 conceptual, L2 practitioner, L3 architect, L4 performance, L5 internals.
   Learning maps: Beginner=L1-L2, Intermediate=L3, Expert=L4-L5.
5. **Distinguish verified fact from inference.** Generated text must label its own inferences.
6. **Never invent product limits, quotas, or roadmap claims.**

## Copyright guardrails (non-negotiable)

- Paraphrase sources fully in your own words. Any unavoidable quote stays **under 15 words**,
  one short quote per source max, attributed.
- Never reproduce article paragraphs, tables, or structure verbatim. Store links, metadata,
  extracted claims, original summaries, audience notes, why-it-matters notes, and takeaways —
  not copied text.

## Agent roster (in .claude/agents/)

- **knowledge-curator** — turns an approved source into structured, cited claims.
- **solution-architect** — designs a cited architecture from verified claims only.
- **validation-reviewer** — runs the validation pass over a design; returns issues + confidence.
- **source-drift-analyst** — re-ingests a source, diffs claims, flags affected designs.
- **learning-author** — writes tiered lessons grounded only in approved claims.
- **coverage-auditor** — finds capabilities/depths the knowledge base is missing.
- **diagram-author** — creates original Mermaid/SVG diagrams (never copies source images).
- **fabric-advisor** — expert Q&A grounded only in KB claims, cited; refuses where the KB is silent.
- **blog-author** — composes the cited portal article for a topic from VERIFIED claims only;
  refuses thin coverage, labels inference, commissions original diagrams.
- **content-orchestrator** — reads queue, RSS poll state, pending/duplicate claims, topic/blog
  coverage, diagrams, and local drafts; dedupes and returns a ranked human-gated workplan.
- **docs-author** — self-documentation: keeps content/help/\*.md matching the actual code;
  never documents features that don't exist.

Prefer explicit invocation, e.g. `Use the knowledge-curator subagent on docs/sources/direct-lake.md`.
`/orchestrate-content [focus]` gives the cross-queue editorial plan; `/publish-topic <slug>`
chains agents for one topic: coverage check → human verify gate → diagram → article → validation
→ docs sync. URLs submitted via the frontend land in the server's ingestion queue; `/ingest-batch`
reads it, with content/queue.md as the offline fallback.

**Diagram coverage is enforced, not optional** (mirror these in `AGENTS.md` for Codex):

- `/publish-topic` commissions **≥2** original diagrams before the blog-author runs — an
  architecture diagram and a decision/internals diagram.
- The blog-author embeds **every** commissioned diagram, not just the first.
- Every embedded `content/diagrams/*` path must exist on disk before the article is published.
  The validation pass treats a missing embedded diagram as a **critical** issue, so the
  article cannot reach `ready_to_share` until it is fixed.

**Diagram commission queue (Settings → Diagrams).** Admins can commission more diagrams per topic
at chosen intervals from the Settings UI. This reuses the `queue_items` lifecycle with
`kind='diagram'`, `target_slug`, and `scheduled_at` (a future timestamp hides the item until it is
due). The server only schedules — `/commission-diagrams` drains the due queue with the
**diagram-author**, which authors an original SVG, mirrors it to `public/diagrams/`, and registers
it as a generated asset (flipping the topic from _gap_ to _covered_ in the coverage table).

## Conventions

- Python: type hints, `ruff`/`black` clean, no bare excepts. Tests in `backend/tests`.
- API calls from agents go through the local backend (`http://localhost:8000`) via curl, not
  direct DB writes — the backend owns versioning and validation invariants.
- When you change `models.py`, update `docs/data-model.md` in the same commit.
- When a content-type or endpoint rename lands (e.g. blog→article), grep
  `.claude/agents/`, `.claude/commands/`, `AGENTS.md`, and `docs/*.md` for the old term in the
  same change — don't defer prompt/doc updates to a follow-up, or agent instructions silently
  drift out of sync with what they actually query.
