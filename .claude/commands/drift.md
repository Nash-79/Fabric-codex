---
description: Re-check a source for changes, version affected claims, flag impacted designs.
argument-hint: <source-key>
---

Use the **source-drift-analyst** subagent on source `$ARGUMENTS` (a source slug). Read the current
source content, re-extract the claims yourself, then diff them **locally** against the source's
active claims read from Supabase with the anon key (no `localhost:8000` backend — see the agent for
the recipe). Summarise the diff (added / changed / removed / unchanged) and list every design that
cites the source (via `content_item_sources` — articles, designs, and lessons). Write the re-extracted claims to
`content/sources/<slug>.json` for the admin to publish (**Settings → Publish → Source**; added
claims land pending, verified ones are preserved). Supersede/deprecate versioning and marking
designs `needs_review` are admin actions — give a concrete remediation list naming the exact claims
and designs to action.
