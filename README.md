# Fabric Atlas

A governed, source-grounded knowledge and architecture platform for Microsoft Fabric.

Approved sources become **versioned, source-graded claims**, each tagged to a Fabric
**capability** and a **depth level**. Those claims feed **cited** solution architectures and
**tiered learning**, and every output is run through a **validation pass**. The
**capability registry is the spine** the whole system hangs on.

## What's here

```
CLAUDE.md            Project memory for Claude Code (domain rules, scope discipline)
AGENTS.md            The same, for Codex / other agents (committed, repo-shared)
.claude/agents/      Seven focused subagents (curator, architect, validator, drift, learning,
                     coverage, diagram-author)
.claude/commands/    Slash commands: /ingest /design /validate /drift /lesson /diagram
.codex/prompts/      The same intents as Codex prompts (+ .codex/README.md install note)
backend/             FastAPI + SQLModel — claim versioning + the validation pass
content/             Git-tracked authored knowledge: sources/ diagrams/ designs/ lessons/
scripts/             import_content.py — publish authored content to a running server
docs/workflow.md     Author-locally / publish-to-server model + VS Code extension setup
docs/data-model.md   How versioning, supersede, drift, tags, assets, and validation work
docs/extending.md    Every extension point: content, capabilities, theme, views, agents
frontend/            React app (see "Frontend" below)
```

## Two ways to run the LLM work

- **Local (default, no API cost):** the Claude Code / Codex **VS Code extensions** do extraction,
  generation, validation reasoning, and diagrams on your subscription, write files under
  `content/`, and POST structured data. The server holds no key (`LLM_MODE=local`). See
  `docs/workflow.md`.
- **API (optional):** set `LLM_MODE=api` and `ANTHROPIC_API_KEY` to have the server generate on the
  fly via `llm.py`.

## Quick start

```bash
# 1) backend
cd backend && python -m venv .venv && . .venv/Scripts/activate
pip install -r requirements.txt && cp .env.example .env   # add ANTHROPIC_API_KEY
uvicorn app.main:app --reload                              # http://localhost:8000/docs

# 2) Claude Code — open the repo; subagents and commands are auto-discovered
#    e.g.  /ingest https://learn.microsoft.com/fabric/fundamentals/direct-lake-develop tier=1
#          /design Governed self-service BI over 5TB finance data, 800 concurrent users
#          /validate <design-id>

# 3) Codex — copy prompts once (see .codex/README.md), then /prompts:fa-ingest etc.
```

## The loop

```
approved source ──▶ knowledge-curator ──▶ pending claims (capability + depth + tier + citation)
                                              │  human verifies in the Registry
                                              ▼
scenario ──▶ solution-architect ──▶ cited architecture ──▶ validation-reviewer ──▶ issues + confidence
                                              ▲                                        │
            source changes ──▶ source-drift-analyst ──────────────────────────────────┘
                                   (supersede claims, flag affected designs)

same claims ──▶ learning-author ──▶ Beginner / Intermediate / Expert lessons (grounded, cited)
```

## Frontend

A real Vite + React app lives in `frontend/` (the old `fabric-atlas.jsx` was a claude.ai-only
artifact prototype — it does not run locally and can be deleted). Run it alongside the backend:

```bash
cd frontend
npm install
npm run dev          # http://localhost:5173 (proxies API calls to :8000 — start the backend first)
```

The UI is themed to the **Microsoft Fabric design language** — Fluent neutrals plus the
Fabric brand ramp sampled from the official product icon, light theme by default with a
dark toggle (tokens in `frontend/src/theme.js`).

Tabs: **Overview** (the overarching Microsoft Fabric view — platform story, original
architecture diagram, platform-level claims, jump-offs into every capability),
**Registry** (coverage grid, tag filters, claim browser, Verify button, version history),
**Sources** (tier-graded sources; referenced images shown as attributed links, generated diagrams
rendered inline from `/content/...`), **Designs** (cited markdown, validation runs, confidence,
one-click deterministic validation), **Learn** (lessons authored from verified claims), and
**Author** (the agent-driven authoring loop, step by step).

## Design stance

This is deliberately a **single-model + retrieval** system, not a 40-agent mesh. Each "agent" is
a focused prompt over capability-scoped retrieval. Add complexity only when a concrete need
forces it. See `CLAUDE.md` for the full rationale and guardrails (including copyright rules:
paraphrase, quotes < 15 words, never reproduce source structure).
