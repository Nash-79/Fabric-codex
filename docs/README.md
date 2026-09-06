# Documentation

Start here. Project overview and quickstart live in the [root README](../README.md).

## Understanding the system

| Document | Read it when |
|---|---|
| [architecture.md](architecture.md) | You want the system shape and the reasoning behind it |
| [data-model.md](data-model.md) | **Before touching claim or content versioning.** Supersede chains are easy to break |
| [knowledge-gaps.md](knowledge-gaps.md) | Understanding how coverage gaps are tracked and what CI fails on |

## Doing things

| Document | Read it when |
|---|---|
| [workflow.md](workflow.md) | Authoring content with the local agent pipeline |
| [extending.md](extending.md) | Adding a capability, diagram, view or agent |
| [deployment.md](deployment.md) | Deploying, or changing infrastructure |
| [dependencies.md](dependencies.md) | Upgrading anything |
| [official-icon-policy.md](official-icon-policy.md) | Using a Microsoft icon in a diagram |

## Runbooks

Step-by-step operational procedures, written to be followed rather than read.

| Runbook | For |
|---|---|
| [runbooks/cloudflare-deploy.md](runbooks/cloudflare-deploy.md) | A first deploy, including secrets and the Supabase URL configuration OAuth needs |
| [runbooks/supabase-migration.md](runbooks/supabase-migration.md) | The completed Lovable → self-owned Supabase migration, with the schema and auth gotchas it surfaced |

## Archive

[archive/](archive/) holds completed and superseded plans. They record why decisions were made and
are **not** current — where they contradict the live docs, the live docs win.

## Agent contracts

Not in this directory, but part of the documentation surface:

- [../CLAUDE.md](../CLAUDE.md) — the contract for Claude Code: domain rules, scope discipline,
  copyright guardrails
- [../AGENTS.md](../AGENTS.md) — the same for Codex and other agent runtimes, plus the multi-agent
  coordination protocol
- [../.agent-locks.md](../.agent-locks.md) — active file claims when more than one agent is working
