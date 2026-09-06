# Codex setup for Fabric Codex

Codex reads agent instructions from `AGENTS.md` (at the repo root — already committed, shared by
the whole team). Custom **prompts**, however, live in your Codex home directory and are _not_
loaded from the repo, so install them once.

## Install the prompts

Copy (or symlink) the prompt files into your Codex prompts directory, then restart Codex.

**Windows (PowerShell), from the repo root `C:\repos\Fabric-codex`:**

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
/prompts:fa-orchestrate FOCUS=ai-apis
/prompts:fa-orchestrate EXECUTE=true
/prompts:fa-ingest   SOURCE=https://learn.microsoft.com/fabric/...  TIER=1
/prompts:fa-blog     TOPIC=direct-lake
/prompts:fa-design   SCENARIO="Governed self-service BI over 5TB finance data, 800 users" LATENCY="near real-time"
/prompts:fa-validate DESIGN_ID=ab12cd34
/prompts:fa-drift    SOURCE_KEY=direct-lake-develop
/prompts:fa-lesson   CAPABILITY=direct-lake LEVEL=Intermediate
/prompts:fa-docs-sync search
```

Named placeholders (`$SCENARIO`, `$TIER`, …) are filled from the `KEY=value` arguments you pass;
quote values containing spaces. `$ARGUMENTS` would capture everything if you prefer free text.

## Note on Skills

OpenAI now recommends **Skills** over custom prompts for reusable, optionally repo-shared
workflows. These prompts still work and map 1:1 to the Claude Code commands in
`.claude/commands/`. If you later move to Skills, keep the same intents (orchestrate, ingest,
blog, design, validate, drift, lesson, docs sync, and the publishing helpers) and the same domain
rules from `AGENTS.md`.

## Data access and human gates

Current authoring prompts read Supabase with the publishable/anon key in `.env` and write
git-tracked files under `content/`. Admin mutations remain app actions: publish files in
**Settings -> Publish**, verify claims in **Settings -> Claims**, complete queue items in
**Settings -> Queue**, and poll feeds in **Settings -> RSS Feeds**.

Queue and watcher state is private. Configure `FABRIC_ATLAS_AGENT_READ_TOKEN` as a server-only
secret on the deployed app, then set the same value and `FABRIC_ATLAS_APP_URL` in the local
uncommitted environment. Agent workflows read the sanitized
`GET /api/public/hooks/poll-feeds` snapshot; they must
fail loudly when it is unavailable rather than treating private state as empty.

`EXECUTE=true` keeps ingestion, editorial questions, downstream authoring, and validation in one
resumable orchestration run. It pauses once for source publication and claim verification, then
finishes with a consolidated **Publish all** action for generated articles, designs, lessons, and
diagrams.

The local FastAPI backend is still useful for backend development and tests, but the Codex content
authoring loop does not require a metered OpenAI API key or server-side LLM calls.
