## What I found (verified against the database)

The data-mozart feed **is working**. Nothing is broken in fetching or parsing:

- Watcher "Nikolla Inc" (`https://data-mozart.com/feed`) was created 12:29:55, auto-detected as **rss**, scope `data-mozart.com` `/`.
- The poll at **12:30:38 discovered 10 items and queued all 10** (audit event `watcher.polled`, `queued: 10`).
- Those 10 rows are in the queue right now with status `queued` — they are in fact the *only* 10 open queue items in the whole backlog (e.g. "Materialized Lake Views in Microsoft Fabric…", "CLUSTER BY in Fabric Warehouse…").
- The poll you ran ~35 seconds later at **12:31:14** reported `outcome: unchanged, queued: 0`. That is correct behaviour, not a failure: the feed's ETag/Last-Modified were stored on the first poll, so the site replied `304 Not Modified` and there was nothing new to queue.

So the real problem is **reporting, not ingestion**: a successful poll that finds nothing new looks identical to a poll that failed, and the queued items are not linked back to the watcher that produced them. A secondary cosmetic bug: feed titles keep raw numeric HTML entities (`&#8217;`, `&#8211;`) because the entity decoder only handles named entities.

## Plan

### 1. Make poll outcomes self-explanatory (WatchersPanel)
For each watcher in the poll result, render an explicit outcome line instead of bare counters:
- `unchanged` → "Up to date — the site returned 304 Not Modified since the last poll; no new posts."
- `success, queued 0, skipped N` → "N items seen, all already queued or already ingested."
- `success, queued N` → "N new items added to the queue" plus a direct link to the Queue tab.
- error → keep the existing remediation hint and Retry button.

### 2. Show each watcher's tracked/queued state on the row
Add per-watcher counts (items tracked, open queue items) to `listSourceWatchers` and display them in the row, so "did this feed ever produce anything?" is answerable at a glance rather than only from the last poll's delta.

### 3. Add a "Force re-scan" action
An admin action that clears `etag` / `last_modified` (and optionally `detected_url`) for one watcher before polling, so a 304 can be bypassed on demand when you want to re-verify a feed end to end.

### 4. Decode numeric HTML entities in feed titles
Extend the `decode()` helper in the watcher parser to convert `&#NNN;` / `&#xHH;` so queued titles read "can't" / "–" instead of `can&#8217;t`. Applies to future polls; existing 10 rows can be left as-is or normalised by a one-off update.

### Technical notes
- Files: `src/components/settings/WatchersPanel.tsx` (outcome rendering, force-rescan button, counts column), `src/lib/settings.functions.ts` (`listSourceWatchers` counts, new `rescanSourceWatcher` server fn writing an audit event), `src/lib/source-watcher.server.ts` (`decode()` numeric entities, covered by `source-watcher.test.ts`).
- No schema change required; `etag` / `last_modified` columns already exist on `source_watchers`.
- No change to discovery, scope, or dedupe logic — those are behaving correctly.
