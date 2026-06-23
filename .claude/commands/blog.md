---
description: Compose the cited knowledge-base article for a topic from verified claims, then validate it (local, no API).
argument-hint: <topic-slug>
---
Author and validate the article for topic: $ARGUMENTS

The KB is read directly from Supabase with the anon key (no `localhost:8000` backend). Authoring
writes a git file; **publishing is a human step in Settings → Publish** (the service-role key is
sealed, so agents never write to Supabase).

1. Use the **blog-author** subagent on topic `$ARGUMENTS`. It reads verified claims from Supabase
   and writes `content/blogs/<topic-slug>.json` with portable `cited_source_keys`; note the slug.
2. If the blog-author reports a coverage gap instead of writing, stop and relay the gap — do
   not force an article out of thin claims. (If the topic has zero **verified** claims, the gate
   trips even when pending claims exist — verify them first in Settings → Claims → "Verify all".)
3. Run the **validation-reviewer** subagent over the drafted `content/blogs/<slug>.json`: it
   reasons about grounding/coverage/antipattern (including verbatim-copy checks against the cited
   verified claims read from Supabase) and reports issues. Deterministic citation/freshness checks
   and the confidence score run **server-side after publish** (Settings → Publish, then the
   `validate` action on the blog).
4. Report: blog slug, the source legend, the reviewer's open issues, a reminder to commit
   `content/blogs/` and any new `content/diagrams/` files, and the publish step:
   **Settings → Publish → Blog → paste `content/blogs/<slug>.json`**.
