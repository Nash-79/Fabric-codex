# Codex setup for Fabric Atlas

Codex reads agent instructions from `AGENTS.md` (at the repo root — already committed, shared by
the whole team). Custom **prompts**, however, live in your Codex home directory and are *not*
loaded from the repo, so install them once.

## Install the prompts

Copy (or symlink) the prompt files into your Codex prompts directory, then restart Codex.

**Windows (PowerShell), from the repo root `C:\repos\Fabric-Atlas`:**
```powershell
New-Item -ItemType Directory -Force "$HOME\.codex\prompts" | Out-Null
Copy-Item ".codex\prompts\*.md" "$HOME\.codex\prompts\" -Force
```

**macOS / Linux:**
```bash
mkdir -p ~/.codex/prompts && cp .codex/prompts/*.md ~/.codex/prompts/
```

Restart the Codex CLI (and reload the IDE extension) so it picks up the new prompts.

## Use them

In a Codex session, type `/` and choose, or type the name directly:

```
/prompts:fa-ingest   SOURCE=https://learn.microsoft.com/fabric/...  TIER=1
/prompts:fa-design   SCENARIO="Governed self-service BI over 5TB finance data, 800 users" LATENCY="near real-time"
/prompts:fa-validate DESIGN_ID=ab12cd34
/prompts:fa-drift    SOURCE_KEY=direct-lake-develop
/prompts:fa-lesson   CAPABILITY=direct-lake LEVEL=Intermediate
```

Named placeholders (`$SCENARIO`, `$TIER`, …) are filled from the `KEY=value` arguments you pass;
quote values containing spaces. `$ARGUMENTS` would capture everything if you prefer free text.

## Note on Skills

OpenAI now recommends **Skills** over custom prompts for reusable, optionally repo-shared
workflows. These prompts still work and map 1:1 to the Claude Code commands in
`.claude/commands/`. If you later move to Skills, keep the same five intents (ingest, design,
validate, drift, lesson) and the same domain rules from `AGENTS.md`.

## Backend must be running

All prompts call the local backend at `http://localhost:8000`. Start it first
(`cd backend && uvicorn app.main:app --reload`). The LLM-backed steps need `ANTHROPIC_API_KEY`;
the deterministic steps (versioning, citation/freshness validation) run without it.
