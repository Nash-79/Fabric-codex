# LangGraph orchestrator (optional, unwired)

This directory is reference infrastructure for a **future**, outside-the-IDE automation
pipeline. It is not required for, and does not replace, Fabric Atlas's actual default
workflow: a human driving the Claude Code / Codex subagents in `.claude/agents/` and
`.codex/agents/` from the IDE, on their own subscription (see the root `CLAUDE.md` /
`AGENTS.md` "Build-time authoring vs run-time serving" section). Nothing in `backend/`,
`src/`, or CI imports or calls anything in this directory today.

## Why it exists

`content-orchestrator.md` already plays the planning-layer role described in
`../CLAUDE.md`'s "Deliberate non-goals": *"One generation model with good retrieval and
one validation pass delivers ~90% of the value... add a new agent only when a concrete
need forces it."* This directory does not add a new agent mesh — it is scaffolding for
the specific concrete need `content-orchestrator` can't cover: a **scheduled or headless**
run (e.g. cron-triggered nightly content refresh) where no human is present to drive
subagents turn by turn, so the routing/interrupt logic that a human normally provides
needs to live in code instead.

## What's here

- `model_resolver.py` — resolves a capability tier (`reasoning`/`code`/`standard`/`fast`/
  `diagram`) from `../.ucp/models.yaml` to a live LangChain chat model, honoring whichever
  provider API keys are actually set. Same tier vocabulary the Claude Code agent
  frontmatter now carries via `x-ucp-tier`.
- `orchestrator.py` — a minimal `StateGraph` (supervisor → clarify → specialist nodes →
  quality gate → synthesizer) with two structural fixes applied from the start:
  1. Conditional-edge routers return **node-name strings**, never lambdas.
  2. The clarification node genuinely pauses via `interrupt()` + a `MemorySaver`
     checkpointer, so human-in-the-loop review is enforced, not silently skipped.

  Every node body is a **stub** — it records what it would do and moves on. Before this
  is runnable against a real Fabric Atlas KB, wire each node to the same Supabase reads
  the matching Claude Code agent already documents (e.g. `solution_architect_node` should
  do the grounded-claims read `.claude/agents/solution-architect.md` describes, then write
  `content/designs/<slug>.json` the same way).

## Rules if you extend this

- Any diagram-authoring node must follow `.claude/agents/diagram-author.md`'s contract
  (SVG + mandatory evidence sidecar, official-icon policy) — do not invent a second
  diagram-quality standard here.
- Any Supabase write is still a human/service-role-key action taken in Lovable Settings
  → Publish, per every other agent in this repo. A LangGraph node may *draft* files under
  `content/`; it must not attempt to reach Supabase with a service-role key.
- Keep `requirements.txt` scoped to this directory — the main FastAPI backend
  (`backend/requirements.txt`) has no LangGraph dependency and should not gain one just
  because this reference scaffold exists.

## Running the demo

```bash
cd langgraph
pip install -r requirements.txt
python orchestrator.py
```

With no API keys set, `model_resolver.get_llm()` will raise once a node actually tries to
resolve a model — expected for a stub run exercising the graph shape, not the LLM calls.
