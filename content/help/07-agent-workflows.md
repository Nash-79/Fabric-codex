# Agent workflows

Fabric Atlas is local-first. Claude Code and Codex run in the IDE, read approved sources, and
write structured results to `content/` or the backend. The server stores and validates those
results; it does not invent claims.

## Claude Code

Claude workflows live in two places:

- `.claude/agents/` contains focused agents such as `knowledge-curator`, `blog-author`,
  `validation-reviewer`, `diagram-author`, and `docs-author`.
- `.claude/commands/` contains slash commands that call those agents, including `/ingest`,
  `/blog`, `/publish-topic`, `/validate`, `/drift`, `/lesson`, and `/docs-sync`.

Use `/docs-sync` after changing routes, settings, source submission, curation, validation, or
authoring workflows. The `docs-author` agent reads the real code and rewrites only Help pages
that drifted.

## Codex

Codex prompt templates live in `.codex/prompts/`. Install them once by following
`.codex/README.md`, then use:

- `/prompts:fa-ingest` to turn an approved source into paraphrased, cited claims.
- `/prompts:fa-design` to draft a cited architecture design from verified claims.
- `/prompts:fa-diagram` to author original diagram assets.
- `/prompts:fa-validate` to run a validation-review pass.
- `/prompts:fa-drift` to compare a changed source with existing claims.
- `/prompts:fa-lesson` to create a tiered learning draft.
- `/prompts:fa-docs-sync` to refresh the Help section from the actual code.

## Documentation rules

Documentation follows the same discipline as claims:

- Do not describe features that do not exist in the current code.
- Keep Help pages user-facing; implementation details belong in `docs/`.
- When docs change, update `content/help/` and publish or seed the content so the Help page in
  the site reflects the files.
- Admin Settings can edit Help metadata and body text, but git-tracked `content/help/` remains
  the source to commit. Mirror DB edits back to files before considering documentation current.
- If a UI workflow changes, run the documentation generator before sharing the change.
