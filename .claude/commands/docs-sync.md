---
description: Refresh the Help section — the docs-author agent diffs content/help/*.md against the actual code and rewrites only what drifted.
argument-hint: [optional area to focus on]
---
Sync the self-documentation: $ARGUMENTS

Use the **docs-author** subagent. If arguments name a specific area (e.g. "search",
"queue"), focus the pass there; otherwise sweep all help pages. Report pages
created/updated/unchanged and remind to commit `content/help/`.
