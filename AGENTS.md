# AGENTS.md — Fabric Atlas

Instructions for any coding agent (Codex, and compatible tools) working in this repo.
Claude Code reads `CLAUDE.md`; this file is the equivalent for Codex and is committed so the
whole team shares it. Keep the two in sync on domain rules.

## What this project is

A governed, source-grounded knowledge + architecture platform for Microsoft Fabric. Approved
sources become versioned, source-graded **claims** (each tagged to a **capability** and a
**depth level**); claims feed **cited** architecture generation, **tiered learning**, and a
**validation pass**. The **capability registry is the architectural spine** — build around it.

## Working agreements

- Run `pytest` in `backend/` after changing Python; do not commit failing tests.
- Format with `black` and lint with `ruff` before proposing a diff.
- Ask before adding a new production dependency.
- Never write to the database directly to mutate claims — go through `app/services.py` so
  versioning and validation invariants hold.
- When you touch `app/models.py`, update `docs/data-model.md` in the same change.

## Domain rules (must hold in all generated code and output)

1. Every factual claim cites a source. No source → no claim.
2. Claims are append-only and versioned. A change = new version with `supersedes_id`; old
   version becomes `status="superseded"`, `active=False`. Never edit a claim's text in place.
3. Trust tiers, best→worst: 1 Microsoft Learn, 2 Fabric blog, 3 MS GitHub, 4 MVP/community,
   5 vendor, 6 unknown.
4. Depth levels: L1 conceptual · L2 practitioner · L3 architect · L4 performance · L5 internals.
5. Label inference vs verified fact in any generated architecture or lesson.
6. Never invent Fabric product limits, quotas, pricing, or roadmap claims.

## Copyright

Paraphrase fully. Any quote < 15 words, one per source, attributed. Never reproduce source
paragraphs, tables, or structure. Store links, claims, original summaries, audience notes,
why-it-matters notes, and takeaways; never store copied text.

## Operating model — you are the LLM engine

LLM work runs locally in the IDE on the user's subscription, not on the server and not via the
metered API. You read sources, extract claims, generate designs, reason about validation, and
author original diagrams, then POST **structured results** to the backend and write git-tracked
files under `content/`. The server (`LLM_MODE=local`, the default) makes no LLM calls. Publish with
`python scripts/import_content.py`.

## Tags and images

- Tag sources/claims/designs with topical hashtags (MicrosoftFabric, DataEngineering, PySpark,
  Python, …) in addition to the capability id.
- External source images are `referenced` assets: store URL + caption + **attribution**, never
  re-host (copyright). Prefer authoring an **original** Mermaid/SVG diagram (`generated` asset) via
  `/prompts:fa-diagram`. Diagrams are vector diagram-as-code, not raster art; no third-party logos.
- **Diagram coverage is enforced** (kept in sync with `CLAUDE.md`): publishing a topic
  commissions **≥2** original diagrams — one architecture, one decision/internals — and the
  article embeds **every** one of them. Each embedded `content/diagrams/*` path must exist on
  disk before `POST /blogs`; the validation pass flags a missing embedded diagram as a
  **critical** issue, blocking `ready_to_share`.

## Scope discipline

This is a single-model + retrieval system, not a 40-agent mesh. Do not introduce orchestration
frameworks, message buses, or per-capability services without an explicit instruction. An
"agent" is a focused prompt over capability-scoped retrieval.

## Reusable Codex prompts

Project prompt templates are in `.codex/prompts/`. Codex loads custom prompts from your home
dir, so copy or symlink them once (see `.codex/README.md`), then invoke as `/prompts:fa-ingest`,
`/prompts:fa-design`, etc. OpenAI now recommends Skills for reusable prompts; these still work
and map 1:1 to the Claude Code commands in `.claude/commands/`.

## How to run

See `backend/README.md`. SQLite by default; set `DATABASE_URL` for Postgres + pgvector at scale.
