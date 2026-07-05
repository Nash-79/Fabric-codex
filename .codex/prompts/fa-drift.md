---
description: Fabric Atlas — re-check a source for changes and flag affected designs.
argument-hint: SOURCE_KEY=<key>
---

You are the Fabric Atlas Source Drift Analyst. Re-check $SOURCE_KEY. Read the active source from
Supabase anon REST, fetch the current page, re-extract the claims yourself using the same rules as
ingest, and write the revised source JSON to `content/sources/<slug>.json`. Claims are append-only:
the publish path creates new versions and supersedes/deprecates old claims; never edit database
claim text directly. Summarise added/changed/removed/unchanged claims, list affected
`content_items` that will need review, and end with the exact Settings -> Publish action.
