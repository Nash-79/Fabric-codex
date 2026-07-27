# Agent workflows

Fabric Atlas is local-first. Claude Code and Codex run in the IDE, read approved sources, and
write structured results to `content/`. The server stores and validates those results; it does
not invent claims.

Queue and watcher configuration is private workflow state. Local agents read a sanitized snapshot
from `GET /api/public/hooks/poll-feeds` using `FABRIC_ATLAS_APP_URL` and the server-only
`FABRIC_ATLAS_AGENT_READ_TOKEN`. If either value is missing or rejected, orchestration stops with
an explicit configuration error; an inaccessible queue is never interpreted as an empty queue.

## Claude Code

Claude workflows live in two places:

- `.claude/agents/` contains focused agents such as `knowledge-curator`, `blog-author`,
  `content-orchestrator`, `validation-reviewer`, `diagram-author`, `feedback-triage`, and
  `docs-author`.
- `.claude/commands/` contains slash commands that call those agents, including `/ingest`,
  `/orchestrate-content`, `/blog`, `/publish-topic`, `/validate`, `/drift`, `/lesson`,
  `/commission-diagrams`, `/gaps`, `/triage-feedback`, and `/docs-sync`.

Start with `/orchestrate-content` when you want a master view across unclaimed queue items,
claimed work, pending claims, RSS poll state, existing articles, local drafts, and diagram gaps.
It returns a ranked workplan and stops at human gates such as Settings → RSS Feeds, Publish,
Queue, and Claims. Article candidates are self-evaluated for grounding, novelty, richness, depth,
diagram coverage, and whether the next human gate is clear.

Use `/triage-feedback` to review new reader-submitted "Report an issue" notes (see
_Admin settings_ → Feedback): the agent checks each report against the article's actual text and
citations and writes a verdict file for an admin to apply in Settings.

Use `/gaps` for the derived `## Internals` coverage-gap inventory (never a hand-written gap
document) — it ranks placeholders by architectural impact and routes each to a source, a queue
line, or a depth to deepen.

Use `/docs-sync` after changing routes, settings, source submission, curation, validation, or
authoring workflows. The `docs-author` agent reads the real code and rewrites only Help pages
that drifted.

## Codex

Codex prompt templates live in `.codex/prompts/`. Install them once by following
`.codex/README.md`, then use:

- `/prompts:fa-orchestrate` to rank queue, RSS, claim, article, and diagram work.
- `/prompts:fa-ingest` to turn an approved source into paraphrased, cited claims.
- `/prompts:fa-blog` to draft or enrich a cited topic article from verified claims.
- `/prompts:fa-design` to draft a cited architecture design from verified claims.
- `/prompts:fa-diagram` to author original diagram assets.
- `/prompts:fa-validate` to run a validation-review pass.
- `/prompts:fa-drift` to compare a changed source with existing claims.
- `/prompts:fa-lesson` to create a tiered learning draft.
- `/prompts:fa-gaps` to generate and route the `## Internals` coverage-gap inventory.
- `/prompts:fa-docs-sync` to refresh the Help section from the actual code.

Reader feedback triage (`/triage-feedback`) does not yet have a Codex prompt equivalent — run it
from Claude Code.

Use `FOCUS=<topic-or-capability>` with `/prompts:fa-orchestrate` when you want a narrower plan,
for example `/prompts:fa-orchestrate FOCUS=ai-apis`.

After verifying claims from a newly published source:

- run `/prompts:fa-blog TOPIC=<topic-slug>` to create a missing article or augment an existing
  article when the source adds new verified coverage, depth, diagrams, or drift corrections;
- run `/prompts:fa-design SCENARIO="<workload problem>"` for a solution architecture;
- run `/prompts:fa-design SCENARIO="Reusable <pattern> data architecture pattern"` when a
  reusable data architecture pattern is missing, and tag it `DataArchitecture` and
  `ArchitecturePattern`.

Solution architectures and reusable data architecture patterns both use the governed **Design**
content type today. Publish them through **Settings → Publish → Design**, then validate before
sharing.

To run the whole journey as one resumable job, use
`/prompts:fa-orchestrate EXECUTE=true` (Claude: `/orchestrate-content execute`). The orchestrator:

1. drains open source queue items and writes the extracted source files;
2. compares the new evidence with existing articles, designs, and diagrams;
3. asks one compact question round about proposed article creation/augmentation, solution
   scenarios, and missing reusable data architecture patterns;
4. pauses while an admin publishes the sources, completes the queue items, and verifies their
   pending claims;
5. resumes to author and validate every selected artifact; and
6. finishes with one dependency-ordered **Settings → Publish → Publish all** release action.

The mid-run source/claim checkpoint is mandatory: newly extracted claims cannot ground an article
or architecture until they have been published and human-verified.

For latest RSS coverage, poll feeds in Settings first, then rerun the orchestrator. The agents read
the resulting queue; they do not poll feeds or complete queue items themselves.

Article and lesson ideas are generated inside the app itself (Settings → Pipeline → Article
Ideas), not by a local agent — see _Admin settings_. Approving an idea there surfaces a ready-to-
copy `/blog`, `/lesson`, or Codex-equivalent command with an `--idea <id>` flag that folds the
idea's brief into that authoring run automatically.

## Documentation rules

Documentation follows the same discipline as claims:

- Do not describe features that do not exist in the current code.
- Keep Help pages user-facing; implementation details belong in `docs/`.
- When docs change, update `content/help/` and publish or seed the content so the Help page in
  the site reflects the files.
- Admin Settings can edit Help metadata and body text, but git-tracked `content/help/` remains
  the source to commit. Mirror DB edits back to files before considering documentation current.
- If a UI workflow changes, run the documentation generator before sharing the change.
