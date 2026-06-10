# Workflow: author on your laptop, publish to the server

The platform runs LLM work **once, locally, at authoring time** using your IDE coding agents
(your subscriptions), then publishes static, pre-built content to a server that makes no LLM
calls. This avoids metered API costs and keeps no API key on the server.

## Tools — use the VS Code extensions

Both agents read the files already in this repo and run on your existing subscriptions, not the
metered API:

| Tool | Reads | Powered by | Install |
|------|-------|-----------|---------|
| **Claude Code (VS Code extension)** | `CLAUDE.md`, `.claude/agents/`, `.claude/commands/` | Claude **Pro/Max** subscription (sign in with your account) | Open the integrated terminal, run `claude` — the extension auto-installs; or install "Claude Code for VS Code" from the Marketplace |
| **Codex (VS Code extension)** | `AGENTS.md`, `~/.codex/prompts/` | ChatGPT/**Codex** subscription | Install the Codex extension; copy prompts once per `.codex/README.md` |

The extensions share history with their CLIs, give inline diff review, and can run the subagents.
A metered Anthropic/OpenAI API key is **not** required for any of the authoring work.

## The loop

```
 1. Curate    /ingest <source>      curator extracts claims + tags + image refs ─▶ content/sources/*.json ─▶ POST /sources/ingest
 2. Visualise /diagram <capability> diagram-author draws an ORIGINAL svg/mmd     ─▶ content/diagrams/*    ─▶ POST /assets
 3. Verify    (Registry UI / POST /claims/{id}/verify)  human approves pending claims
 4. Design    /design <scenario>    architect writes cited markdown              ─▶ content/designs/*.md  ─▶ POST /designs
 5. Validate  /validate <id>        reviewer reasons locally, posts issues; server adds citation+freshness ─▶ confidence
 6. Teach     /lesson <cap> <level> learning-author writes a tiered lesson        ─▶ content/lessons/*.md
 7. Maintain  /drift <source-key>   drift analyst re-extracts, supersedes, flags affected designs
```

## Publish

```bash
# 1. Author locally with the agents (steps above). Commit content/ to git.
git add content/ && git commit -m "knowledge: add Direct Lake source + diagram"

# 2. Publish the committed content to a running server (local or remote).
python scripts/import_content.py --base http://localhost:8000      # local
python scripts/import_content.py --base https://atlas.example.com  # remote
```

Re-running is safe: an already-known source is re-checked for drift, not duplicated. The server
side only ever runs deterministic logic (versioning, citation, freshness), so it can run anywhere
with no secrets.

## Why this split

- **No API cost** for the heavy LLM work — it's on your subscription, in the IDE.
- **Reproducible + reviewable** — every claim, diagram, and design is a git-tracked file you can
  diff and roll back, with the version chain preserved server-side.
- **Safe to host** — the server holds no API key and performs no generation, so exposing it is low
  risk.
