---
description: Ingest every queued source — the server's ingestion queue (submitted via the UI) first, then content/queue.md — via the knowledge-curator (local extraction, no API).
argument-hint: [optional extra urls to enqueue first]
---

Process the ingestion queue: $ARGUMENTS

The `localhost:8000` backend is retired. The queue is exposed to local agents through Supabase
(`queue_public`); you **read**
it with the anon key but you **cannot mutate it** (claim/complete/fail) or write sources — those
are server-side admin actions. So this skill produces `content/sources/*.json` files; an admin then
publishes each in **Settings → Publish** and marks the queue items done in **Settings → Queue**.

Set up keyless reads once:

```bash
source .env 2>/dev/null || true
SB="$SUPABASE_URL/rest/v1"; H1="apikey: $SUPABASE_PUBLISHABLE_KEY"; H2="Authorization: Bearer $SUPABASE_PUBLISHABLE_KEY"
```

1. If `$ARGUMENTS` contains URLs to add to the queue, you can't write them yourself — list them and
   tell the user to add them via **Settings → Queue** (or the URL submit box) before re-running.
2. **Server queue (primary — URLs submitted via the frontend):**
   `curl -s "$SB/queue_public?status=eq.queued&kind=eq.source&select=id,url,title,tier,tags,notes&order=created_at" -H "$H1" -H "$H2"`.
   For each item, in order:
   a. Use the **knowledge-curator** subagent on the item's `url` with its `tier`; pass the
   submitter's `notes` and `tags` as context. The curator writes `content/sources/<slug>.json`
   (metadata + `claims`). It does **not** post anywhere.
   b. Track which `queue_items.id` maps to which `content/sources/<slug>.json` so the human can
   complete the right items after publishing. You do not claim/complete/fail — report the mapping.
   c. **Sources from sources:** the curator reports a handful of high-trust (tier ≤ 3) links it
   relied on. These need a human to add them to the queue — surface them in the summary; do NOT
   try to ingest them in the same run.
3. **File queue (fallback — offline/manual use):** read `content/queue.md`. For each line under
   `## Queued` (skip `#` comments and blanks), run the knowledge-curator the same way. After a
   successful extraction, move the line to `## Done`, appending `-> content/sources/<slug>.json`.
   Leave failed lines in Queued with a trailing `# FAILED: <reason>` comment. (You own this file,
   so you may edit it — unlike the Supabase queue.)
4. Process everything sequentially so you can dedupe by hand against earlier results in the same
   run. Near-duplicate claims across sources are flagged `status=duplicate` **server-side at publish
   time** — do not try to set that yourself.
5. **Validate after publishing.** The deterministic migration validator runs against Supabase, so it
   is meaningful only **after** the admin has published the new files. Once published, run the
   **migration-validator** subagent (it reads Supabase) to confirm KB invariants hold. New sources
   land as `pending` claims, so the verified count not rising is expected — a versioning or
   referential-integrity failure is not.
6. Finish with a summary table: source, tier, claims extracted, assets, and the `queue_items.id` it
   came from — plus the next steps for the human: **Settings → Publish** each
   `content/sources/<slug>.json` (Source + claims), then **Settings → Queue** to complete those
   items, then **Settings → Claims → "Verify all"** to verify. Remind that new
   `content/sources/*.json` files should be committed to git (the Supabase queue is user intent, not
   knowledge — it is never committed).
