---
description: Poll every active RSS subscription, dedupe, and enqueue new posts as kind=source items for ingestion (local agent — the server never polls).
argument-hint: [optional feed-url to poll just that one]
---
Poll the RSS subscriptions and queue new posts: $ARGUMENTS

Subscriptions live in the Supabase `rss_subscriptions` table (managed from Settings → RSS Feeds).
The server only stores them — **this agent does the fetching**. New entries are enqueued through the
backend `POST /queue`, which dedupes against existing sources and open queue items, so they then flow
through `/ingest-batch` unchanged.

Use the direct Postgres connection for reads/writes (it bypasses the admin-only RLS):
`DATABASE_URL` is in `backend/.env`. Run SQL with `psql "$DATABASE_URL" -c "…"` (or the `+psycopg`
URL via a tiny Python snippet if `psql` is unavailable).

1. **Load active feeds.** If $ARGUMENTS names a single feed URL, scope to it; otherwise:
   ```sql
   SELECT id, feed_url, title, default_tier, default_tags, last_seen_guid, last_polled_at
   FROM public.rss_subscriptions WHERE status = 'active' ORDER BY created_at;
   ```

2. **For each feed**, in order:
   a. Fetch the feed with `WebFetch` (RSS 2.0 or Atom). Parse out each entry's `link`/`id`,
      `title`, and `pubDate`/`updated`.
   b. **Determine what's new.** Treat entries as new when their guid/link is not equal to and newer
      than `last_seen_guid` (fall back to `pubDate > last_polled_at` when no guid). Process newest
      last so `last_seen_guid` ends on the most recent entry. Cap to the most recent ~25 entries on
      a feed's first poll (when `last_seen_guid IS NULL`) and **log that cap** — do not silently
      ingest an entire archive.
   c. **Enqueue each new entry** through the backend (it owns dedup + versioning invariants):
      `curl -s -X POST http://localhost:8000/queue -H "Content-Type: application/json" \
        -d '{"url": "<entry link>", "title": "<entry title>", "tier": <default_tier>, "tags": <default_tags>, "notes": "via RSS: <feed title>"}'`
      A `409` means it is already an approved source or already queued — count it as a skip, not an
      error.
   d. **Record poll state** (success):
      ```sql
      UPDATE public.rss_subscriptions
      SET last_polled_at = now(), last_seen_guid = '<newest entry guid>', error_count = 0, last_error = ''
      WHERE id = '<id>';
      ```
   e. **On fetch/parse failure**, do not advance `last_seen_guid`; bump the error counter:
      ```sql
      UPDATE public.rss_subscriptions
      SET last_polled_at = now(), error_count = error_count + 1, last_error = '<short reason>'
      WHERE id = '<id>';
      ```
      Continue to the next feed.

3. **Do not ingest here.** This skill only fills the queue. Tell the user to run `/ingest-batch`
   to extract cited claims from the newly-queued sources (or chain it yourself if asked).

4. **Summary.** Finish with a table: feed, entries found, new queued, skipped (dup/409), errors —
   plus a reminder that queued items await `/ingest-batch`, and that polling can be scheduled
   hands-off with `/loop 6h /poll-rss-feeds`.

Notes:
- Respect copyright: only the entry **URL + title** are queued here; the knowledge-curator does the
  paraphrased extraction later under the usual guardrails. Never store feed body text.
- The queue (`queue_items`) is user/automation intent, not knowledge — it is never committed to git.
  Only the `content/sources/*.json` produced by `/ingest-batch` is committed.
