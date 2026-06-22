---
description: Ingest every queued source — the server's ingestion queue (submitted via the UI) first, then content/queue.md — via the knowledge-curator (local extraction, no API).
argument-hint: [optional extra urls to enqueue first]
---
Process the ingestion queue: $ARGUMENTS

1. If arguments contain URLs, enqueue them on the server first:
   `curl -s -X POST http://localhost:8000/queue -H "Content-Type: application/json" -d '{"url": "<url>", "tier": <n>}'`
   (a 409 means it is already queued or already in the KB — report and skip).
2. **Server queue (primary — URLs submitted via the frontend):**
   `curl -s "http://localhost:8000/queue?status=queued"`. For each item, in order:
   a. Claim it: `curl -s -X POST http://localhost:8000/queue/<id>/claim` (skip on 409 — someone
      else took it).
   b. Use the **knowledge-curator** subagent on the item's `url` with its `tier`; pass the
      submitter's `notes` and `tags` as context. The curator writes
      `content/sources/<slug>.json` and POSTs `/sources/ingest`.
   c. On success: `curl -s -X POST http://localhost:8000/queue/<id>/complete -H "Content-Type: application/json" -d '{"source_id": "<id from ingest response>"}'`
   d. On failure: `curl -s -X POST http://localhost:8000/queue/<id>/fail -H "Content-Type: application/json" -d '{"error": "<short reason>"}'` and continue.
   e. **Sources from sources:** the curator may enqueue a handful of high-trust (tier ≤ 3) links it
      relied on as new `kind=source` items with `note` starting `discovered via …`. These land back
      in the queue as `pending` for **human approval** — do NOT auto-claim/ingest them in the same
      run. Report them in the summary; a human approves by re-running ingest on the queue later.
3. **File queue (fallback — offline/manual use):** read `content/queue.md`. For each line under
   `## Queued` (skip `#` comments and blanks), run the knowledge-curator the same way. After a
   successful ingest, move the line to `## Done`, appending `-> content/sources/<slug>.json`.
   Leave failed lines in Queued with a trailing `# FAILED: <reason>` comment.
4. Process everything sequentially so cross-source dedup sees earlier results; the backend flags
   near-duplicate claims from other sources as `status=duplicate` — report them, do not fight them.
5. **Validate the result.** After all items are processed, rebuild the search index and run the
   migration validator so the newly-ingested content is checked before it is trusted:
   `curl -s -X POST http://localhost:8000/search/rebuild` then use the **migration-validator**
   subagent (or run `python scripts/validate_migration.py`). Report any FAIL lines and do not
   declare the batch clean if it fails. New sources land as `pending` claims, so the verified
   count not rising is expected — a versioning or referential-integrity failure is not.
6. Finish with a summary table: source, tier, claims added, duplicates flagged, assets — and
   remind that claims await human verification (Sources tab → "Verify N pending", or
   Registry → "Verify all pending"), and that new `content/sources/*.json` files should be
   committed to git (the DB queue itself is user intent, not knowledge — it is never committed).
