---
description: Ingest every queued source in content/queue.md via the knowledge-curator (local extraction, no API).
argument-hint: [optional extra urls to enqueue first]
---
Process the ingestion queue: $ARGUMENTS

1. If arguments contain URLs, append them to the `## Queued` section of `content/queue.md`
   (one per line, with `tier=<n>` if given).
2. Read `content/queue.md`. For each line under `## Queued` (skip `#` comments and blanks),
   use the **knowledge-curator** subagent on that URL with its tier. Process sequentially so
   cross-source dedup sees earlier results; the backend flags near-duplicate claims from other
   sources as `status=duplicate` — report them, do not fight them.
3. After each successful ingest, move the line to `## Done`, appending
   `-> content/sources/<slug>.json`. Leave failed lines in Queued with a trailing
   `# FAILED: <reason>` comment.
4. Finish with a summary table: source, tier, claims added, duplicates flagged, assets — and
   remind that claims await human verification (Sources tab → "Verify N pending", or
   Registry → "Verify all pending").
