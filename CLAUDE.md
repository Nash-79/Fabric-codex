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
docs/knowledge-gaps.md  The gap-tracking model: truth/ledger/view layers, the two markers,
                    what CI fails vs warns on — the inventory itself is `node scripts/gaps.mjs`
docs/dependencies.md  Credits, the watched-dependency freshness check, and the local
                    test-then-commit upgrade gate (no Dependabot/Renovate)
```

## Build-time authoring vs run-time serving (the operating model)

LLM work happens on your **laptop**, done by the Claude Code / Codex agents on your subscription —
**not** by the server, and **not** via the metered API. The server stores and serves pre-built
content and runs only deterministic checks. Set `LLM_MODE` in `backend/.env`:

- `local` (default) — agents extract/generate/diagram and POST structured data. Server needs no key.
- `api` — server calls the Anthropic API on the fly via `llm.py` (original v0.1 behaviour).

Authoring flow (git is the source of truth). The `localhost:8000` FastAPI backend is retired;
agents read Supabase keylessly (anon key) and write only to git — publishing itself requires the
sealed service-role key, so it is always a human step in the Lovable app's Settings → Publish tab:

Run `node scripts/check-queues.mjs --brief` at session start or before orchestration. It reads the
public `queue_public` and `rss_status_public` views, prints queue/feed/content gaps, and continues
quietly if local env vars, the public views, or the external planning file are missing.

When a watcher shows **blocked** in Settings → Watchers (some publishers, e.g. the Khoros-hosted
`community.fabric.microsoft.com`, challenge all datacenter traffic), run
`node scripts/poll-watchers.mjs` locally: it polls those feeds from the laptop with an honest
client identity — no header spoofing, no challenge solving — and appends new posts to
`content/queue.md` for the usual review + `/ingest-batch` flow. No DB writes.

**Feed parsing is Feedsmith-backed and lives in exactly one place: `src/lib/feed-parse.ts`.**
Never hand-roll a regex feed parser — that module replaced four drifting copies of one. It must
keep returning `[]` (never throwing) for non-feed input, because the watcher discovery ladder
parses HTML pages speculatively and relies on an empty result to fall through. `scripts/
poll-watchers.mjs` imports that same `.ts` module directly via Node's native type stripping
(needs Node >= 22.18), so there is no second copy to keep in sync. Sitemaps are not feeds and
keep their own regex parser.

```
agent reads source ─▶ writes content/sources/<slug>.json  (claims + tags + image refs)
agent draws diagram ─▶ writes content/diagrams/<slug>.svg|.mmd  (original, never copied)
agent designs       ─▶ writes content/articles|designs/<slug>.json
        │  git commit + push to main (deploy picks up the new content/ files)
        ▼
publish ─▶ Settings → Publish → "Publish all"  (republishes everything changed since its last
            publish, sources → diagrams → articles/designs/lessons, one click — or paste a single
            content/*.json for one file before the next deploy)
        ▼
server serves the knowledge base; deterministic citation/freshness/versioning run server-side
```

`content/diagrams/assets.json` entries register by upsert-on-slug — replacing a diagram is just
overwriting its `.svg`/`.mmd` file with the same filename and re-running Publish (all or that one
diagram entry); no separate "delete then re-add" step exists or is needed.

### Article idea generation (Settings → Article Ideas)

The one deliberate exception to "server only runs deterministic checks": an admin-triggered
**Auto-generate** (all signals) or **Generate from prompt** (admin-supplied topic/direction, still
grounding-checked) button fuses the Fabric roadmap (`roadmap_items`), coverage gaps (same scoring
`coverage-auditor` uses), the editorial backlog (`queue_items`, `content_feedback`), and stale
articles into candidate ideas via the **Lovable AI Gateway** (`src/lib/ai-gateway.server.ts`,
`LOVABLE_API_KEY` — the same bundled-credit gateway `/advisor/chat` uses), never the metered
Anthropic API. Each idea targets either an **article** (`/blog`/`/publish-topic` pipeline — no
length cap, mandatory diagrams+worked example) or a **lesson** (`/lesson` pipeline — hard
<400-word cap, capability+level, no diagrams), and carries a length hint and, for articles, content
guidance for blog-author's own diagram pair (never a diagram count/kind override). Ideas are stored
as `queue_items(kind='idea')` rows — no new table — with the full brief JSON-encoded in `notes`.
Approving an idea (`src/lib/article-ideas.functions.ts`) just flips its status to `claimed`; a
human runs `/publish-topic <slug> --idea <id>`, `/blog <slug> --idea <id>`, or
`/lesson <capability> <level> --idea <id>` locally, which fetches the idea and folds its rationale/
length/diagram guidance into the authoring agent's brief automatically (the `--idea` flag is
optional on all three commands — omitting it works exactly as before). The `<id>` is the idea's
`queue_items` row id, surfaced (with a copyable ready-to-paste command) in the expanded idea row —
`ArticleIdeasPanel` is the only place it is shown. An idea's brief can be **amended** any time
before the article is authored — in `queued`, `claimed`, or `failed` state — via `updateArticleIdea`
(edits `title`/`target_slug`/`angle`/`rationale`/length/diagram-guidance/level, merged over `notes`,
preserving the signal grounding ids; logged as `idea.amended`). A `dismissed` idea can be **revived**
back to `queued` (the shared `mutateQueueItem` `requeue` transition now allows `dismissed → queued`
for every queue kind) so it can be amended and re-approved. Once authored (`ingested`) the brief is
frozen. Generation is resilient: it tries the requested/default
model, then falls back across providers (Gemini flash-lite → OpenAI gpt-5-mini) so one flaky model
or provider outage does not zero out a run; the model actually used is surfaced in the success toast
and logged (`idea.generation_fallback_used`). A follow-up generation also feeds the prior round's
dismissed/kept ideas back to the model as context, so it stops repeating rejected ideas and sharpens
kept ones. Every generation failure (schema mismatch or otherwise, now including the full
`APICallError` `status_code`/`response_body` and the per-model attempt chain) and every case where
the grounding cross-check drops model output is logged to `admin_audit_events`
(`idea.generation_failed`, `idea.generation_filtered`), visible in Settings → Logs.

**Idea-schema invariant (do not regress):** `supportsStructuredOutputs: true` on the gateway makes
schema-capable models (OpenAI) validate in **strict `json_schema` mode**, which requires _every_
property to appear in the JSON Schema's `required` array. In the AI SDK's zod3→JSON-Schema
conversion, `.optional()`, `.default(...)`, **and** `.catch(...)` all drop a key from `required` —
so **none of them may be used on any field of `ideaSchema`**. Express "empty for this content kind"
as `.nullable()` (e.g. `capability_level` is null for articles) or a required-but-possibly-empty
array/string, and tell the model in `.describe()` to emit the empty value (`""` / `[]`) rather than
omit the key. Adding a field with `.optional()`/`.default()` reintroduces a hard OpenAI 400 that
kills the whole request before any model runs. See `src/lib/article-ideas.services.server.ts` for
the signal-fusion + generation logic and `src/components/settings/ArticleIdeasPanel.tsx` for the
admin UI.

## Tags and images

- **Tags** are free-form topical hashtags on sources/claims/designs (e.g. MicrosoftFabric,
  DataEngineering, PySpark, Python). They are discovery labels, independent of the capability
  taxonomy. Query with `GET /claims?tag=PySpark` and `GET /tags`.
- **Images** are `Asset`s of two kinds. `referenced` = an external source image, stored as
  URL + caption + **attribution** only, never re-hosted (copyright). `generated` = an **original**
  Mermaid/SVG diagram authored by the diagram-author agent, stored in `content/diagrams/`. Prefer
  generated originals over referenced copies. Claude makes vector diagrams, not raster art.
  Generated diagrams may include official Microsoft architecture icons under Microsoft's
  diagram/documentation terms, provided they are obtained from an official collection, used
  unchanged with an adjacent product label, and tracked as required by
  `docs/official-icon-policy.md`. Never use a Microsoft icon as the Fabric Atlas brand or to
  represent a non-Microsoft product; unofficial and unlicensed logos remain prohibited.

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

- Generated diagrams use the rich authored SVG contract: the original script-free SVG is the
  primary article, print, and no-JavaScript artifact, with keyboard-focusable regions and
  sidecar-backed evidence tooltips. Its hash must match the registered revision.
- Each diagram requires a matching `.diagram.json` semantic topology: labelled edges, evidence for
  fact nodes, node-specific drill metadata covering inputs, processing, outputs, a worked example,
  controls, and failure modes, and exactly one focusable SVG region per node. Caption-derived
  fallback diagrams are not publishable.

- `/publish-topic` commissions **≥2** original diagrams before the blog-author runs — an
  architecture diagram and a decision/internals diagram.
- The blog-author embeds **every** commissioned diagram, not just the first.
- Every embedded `content/diagrams/*` path must exist on disk before the article is published.
  The validation pass treats a missing embedded diagram as a **critical** issue, so the
  article cannot reach `ready_to_share` until it is fixed.

**Diagram commission queue (Settings → Diagrams).** Admins can commission more diagrams per topic
at chosen intervals from the Settings UI. This reuses the queue lifecycle exposed locally through
`queue_public`, with `kind='diagram'`, `target_slug`, and `scheduled_at` (a future timestamp hides
the item until it is due). The server only schedules — `/commission-diagrams` drains the due queue with the
**diagram-author**, which authors an original SVG, mirrors it to `public/diagrams/`, and registers
it as a generated asset (flipping the topic from _gap_ to _covered_ in the coverage table).

**Every article carries a mandatory `## Internals` section — never omitted, only placeholdered.**
Body content is a single markdown blob (`content_items.body_md`); the reading-view ToC is derived
client-side by regex over `##` headings (`src/components/ContentTocSidebar.tsx`), so the
heading text below is a hard, exact-match convention, not a schema field:

- Fixed sub-headings, in order: `### Architecture & design`, `### How it works internally`,
  `### Performance characteristics`. The blog-author (`.claude/agents/blog-author.md`) writes all
  three every time.
- Grounded where verified L4/L5 claims exist (engine internals, execution/query paths, benchmarks —
  Polaris, Spark, SQL engine, OneLake, Direct Lake, NDP/GPU-accelerated query processing, etc. are
  the expected home for this depth). Otherwise a labeled placeholder — never a silently omitted
  section and never invented detail. Two markers, machine-separable (see `docs/knowledge-gaps.md`):
  `*Coming soon*` = a real gap a source could close; `*Workload-specific.*` = a pattern doc that
  truthfully has no universal number — not a gap, never queued.
- Every `*Coming soon*` placeholder gets a matching `# internals gap: <slug> / <sub-heading> — ...`
  line in `content/queue.md` so it routes into ingestion, not just a dangling TODO in prose.
  `npm run validate:content` enforces this via `scripts/lib/internals-gaps.mjs`: a false
  "Tracked in `content/queue.md`" assertion or a stale queue line **fails CI**; an honest untracked
  placeholder only warns. The derived inventory is `node scripts/gaps.mjs` (or `/gaps`) — never a
  hand-written gap document.
- **Non-blocking.** `validation-reviewer` flags a missing section/sub-heading as a warning and an
  untracked placeholder as a warning (a false "Tracked in" assertion as critical), but a placeholder
  itself never blocks `ready_to_share` — thin L4/L5 coverage should not gate publishing good L1–L3
  content.
- `coverage-auditor` reads `node scripts/gaps.mjs --json` (not a literal grep) and reports real
  placeholders as a ranked depth gap, same track as any other L4/L5 gap.
- `fabric-advisor` checks an article's `## Internals` before answering "how does X work
  internally" questions, and says explicitly when it's pointing at a placeholder rather than
  answering from grounded depth.

## Conventions

- Python: type hints, `ruff`/`black` clean, no bare excepts. Tests in `backend/tests`.
- Agents read the KB directly from Supabase with the anon key (public RLS) and write only
  content/\*.json + content/diagrams/\* to git — never direct DB writes. Publishing happens in
  the Lovable app (Settings → Publish), whose server functions own the versioning and
  validation invariants.
- When you change `models.py`, update `docs/data-model.md` in the same commit.
- When a content-type or endpoint rename lands (e.g. blog→article), grep
  `.claude/agents/`, `.claude/commands/`, `AGENTS.md`, and `docs/*.md` for the old term in the
  same change — don't defer prompt/doc updates to a follow-up, or agent instructions silently
  drift out of sync with what they actually query.

## Optional: model-tier registry, Copilot chatmodes, LangGraph scaffold

Not part of the default workflow above — skip unless you're touching one of these directly.
Every agent's frontmatter carries an `x-ucp-tier` field (reasoning / code / standard / fast /
diagram); `.ucp/models.yaml` + `scripts/sync_models.py` resolve that to a concrete model per
provider and rewrite `model:` frontmatter across `.claude/agents/*.md` and
`.github/chatmodes/*.chatmode.md`, so a new model release is a one-file edit, not fifteen.
`.github/chatmodes/*.chatmode.md` are thin GitHub Copilot pointers back to the matching
`.claude/agents/*.md` contract, not a second copy of it. `langgraph/` is an **unwired**
reference scaffold for a possible future headless/scheduled content pipeline — see
`langgraph/README.md`; nothing in the app, backend, or CI calls it today. This does not change
the "single-model + retrieval, no agent mesh" scope discipline above — it's optional
infrastructure sitting alongside the existing subagent workflow, not a replacement for it.
