---
description: (Moved server-side) RSS polling now runs in the app — Settings → RSS Feeds → "Poll now". This local agent is retired.
argument-hint: (none)
---

Poll the RSS subscriptions and queue new posts: $ARGUMENTS

> **This skill is retired.** RSS polling moved **server-side** because it is deterministic (fetch +
> dedupe + enqueue, no LLM) and the `rss_subscriptions` / `queue_items` tables live in the
> Lovable-managed Supabase project, whose admin credentials are sealed and **not** reachable from a
> local agent. The work this skill used to do is now the `pollRssFeeds` server function
> (`src/lib/settings.functions.ts`).

**To poll feeds:** open **Settings → RSS Feeds** and click **Poll now** (all active feeds) or the
per-row **Poll** button. The server fetches each feed, dedupes new entries against existing sources
and open queue items, enqueues them as `kind=source` items, and records poll state
(`last_polled_at`, `last_seen_guid`, error counters).

**Then run `/ingest-batch`** to extract cited claims from the newly-queued sources.

Do not attempt the old local procedure: there is no `localhost:8000` backend and the direct
Postgres connection it needed is sealed. If you were invoked with this skill, tell the user the
two steps above and stop.
