# Agent workflows

Fabric Atlas is local-first. Claude Code and Codex run in the IDE, read approved sources, and
write structured results to `content/` or the backend. The server stores and validates those
results; it does not invent claims.

## Claude Code

Claude workflows live in two places:

- `.claude/agents/` contains focused agents such as `knowledge-curator`, `blog-author`,
  `content-orchestrator`, `validation-reviewer`, `diagram-author`, and `docs-author`.
- `.claude/commands/` contains slash commands that call those agents, including `/ingest`,
  `/orchestrate-content`, `/blog`, `/publish-topic`, `/validate`, `/drift`, `/lesson`, and
  `/docs-sync`.

Start with `/orchestrate-content` when you want a master view across unclaimed queue items,
claimed work, pending claims, RSS poll state, existing articles, local drafts, and diagram gaps.
It returns a ranked workplan and stops at human gates such as Settings → RSS Feeds, Publish,
Queue, and Claims. Article candidates are self-evaluated for grounding, novelty, richness, depth,
diagram coverage, and whether the next human gate is clear.

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
- `/prompts:fa-docs-sync` to refresh the Help section from the actual code.

Use `FOCUS=<topic-or-capability>` with `/prompts:fa-orchestrate` when you want a narrower plan,
for example `/prompts:fa-orchestrate FOCUS=ai-apis`.

For latest RSS coverage, poll feeds in Settings first, then rerun the orchestrator. The agents read
the resulting queue; they do not poll feeds or complete queue items themselves.

## Documentation rules

Documentation follows the same discipline as claims:

- Do not describe features that do not exist in the current code.
- Keep Help pages user-facing; implementation details belong in `docs/`.
- When docs change, update `content/help/` and publish or seed the content so the Help page in
  the site reflects the files.
- Admin Settings can edit Help metadata and body text, but git-tracked `content/help/` remains
  the source to commit. Mirror DB edits back to files before considering documentation current.
- If a UI workflow changes, run the documentation generator before sharing the change.
