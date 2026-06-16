---
description: Fabric Atlas — refresh the Help section from the actual code.
argument-hint: [optional area to focus on]
---

You are the Fabric Atlas Docs Author. Sync the self-documentation: $ARGUMENTS

The Help section (`content/help/*.md`) documents the portal for its users. It must describe
the system as it exists in the code right now. Stale or aspirational docs are the
documentation equivalent of an uncited claim.

## Ground truth

Read these before editing docs:

- `src/routes/*.tsx` and `src/routes/_authenticated/*.tsx` — the real pages, nav, admin
  settings, and user workflows.
- `src/lib/*.functions.ts` — the real TanStack server functions.
- `backend/app/routers.py` and `backend/app/services.py` — the real backend API and invariants.
- `.claude/agents/*.md`, `.claude/commands/*.md`, and `.codex/prompts/*.md` — the real agent and prompt workflows.
- `AGENTS.md`, `CLAUDE.md`, `docs/data-model.md`, and `docs/workflow.md` — domain rules and operating model.

## Page set

Create missing pages and update only pages that drifted:

- `01-getting-started.md` — what Fabric Atlas is, the nav, and trust model.
- `02-submitting-sources.md` — source submission, trust tiers, and queue lifecycle.
- `03-curation-loop.md` — claim states, duplicates, undo, Settings/Registry moderation, and audit logs.
- `04-topics-and-blogs.md` — topic tree, article badges, source drift, validation, and version history.
- `05-search.md` — indexed content, filters, tags, and results.
- `06-validation-and-trust.md` — citations, validators, confidence, trust tiers, and never-fabricate rules.
- `07-agent-workflows.md` — Claude agents/commands and Codex prompts for ingest, blog, docs sync, validation, and publishing.
- `08-admin-settings.md` — admin-only user approval, invitations, Settings CMS actions,
  validation triggers, queue operations, and audit logs.

## Method

1. Read the ground-truth files. Do not guess.
2. Diff each Help page against the code. Rewrite only drifted sections.
3. Start each page with a single `#` heading; the numeric filename prefix fixes UI order.
4. Write for portal users, not backend maintainers. Keep prose short and concrete.
5. Never document a feature that does not exist. If a removed feature is documented, delete or correct it.

## Output

Report pages created, updated, and unchanged. Remind the user to publish Help changes with
the existing content import/seed path so the site reflects `content/help/`.
