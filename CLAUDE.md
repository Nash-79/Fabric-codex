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

- **No agent mesh.** Do not build 40 microservice "agents". An agent here is *retrieval
  scoped to capabilities + a focused prompt*, nothing more. One generation model with good
  retrieval and one validation pass delivers ~90% of the value. Add a new agent only when a
  concrete need forces it.
- **No mega-prompt.** Keep each agent narrow and single-purpose.
- **No unverified knowledge.** Nothing enters the knowledge base without a source, a trust
  tier, and human approval.

## Repo layout

```
backend/            FastAPI + SQLModel. Claim versioning + validation pass live here.
  app/models.py     Source, Claim (version chain), Design, ValidationRun, Issue
  app/services.py   ingestion, versioning/supersede, generation, validation, drift
  app/routers.py    REST API
  app/llm.py        Anthropic wrapper + structured-output helpers (graceful w/o key)
frontend/           React app (evolve the fabric-atlas.jsx prototype to call the API)
.claude/agents/     Subagents (curator, architect, validator, drift, learning, coverage)
.claude/commands/   Slash commands that drive the agents
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
cp .env.example .env        # LLM_MODE=local by default — no key needed
uvicorn app.main:app --reload
# docs at http://localhost:8000/docs
```

SQLite by default (`fabric_atlas.db`). For scale, set `DATABASE_URL` to Postgres and add
pgvector for semantic retrieval — see docs/data-model.md.

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
  extracted claims, and original summaries — not copied text.

## Agent roster (in .claude/agents/)

- **knowledge-curator** — turns an approved source into structured, cited claims.
- **solution-architect** — designs a cited architecture from verified claims only.
- **validation-reviewer** — runs the validation pass over a design; returns issues + confidence.
- **source-drift-analyst** — re-ingests a source, diffs claims, flags affected designs.
- **learning-author** — writes tiered lessons grounded only in approved claims.
- **coverage-auditor** — finds capabilities/depths the knowledge base is missing.
- **diagram-author** — creates original Mermaid/SVG diagrams (never copies source images).

Prefer explicit invocation, e.g. `Use the knowledge-curator subagent on docs/sources/direct-lake.md`.

## Conventions

- Python: type hints, `ruff`/`black` clean, no bare excepts. Tests in `backend/tests`.
- API calls from agents go through the local backend (`http://localhost:8000`) via curl, not
  direct DB writes — the backend owns versioning and validation invariants.
- When you change `models.py`, update `docs/data-model.md` in the same commit.
