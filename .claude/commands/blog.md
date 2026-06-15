---
description: Compose the cited knowledge-base article for a topic from verified claims, then validate it (local, no API).
argument-hint: <topic-slug>
---
Author and validate the article for topic: $ARGUMENTS

1. Use the **blog-author** subagent on topic `$ARGUMENTS`. It writes
   `content/blogs/<topic-slug>.json` and POSTs `/blogs`; note the returned blog id and slug.
2. If the blog-author reports a coverage gap instead of writing, stop and relay the gap — do
   not force an article out of thin claims.
3. Immediately run the **validation-reviewer** subagent over the new blog: it fetches
   `GET /blogs/<slug>`, reasons about grounding/coverage/antipattern (including verbatim-copy
   checks against the cited claims), and POSTs its issues to `/blogs/<id>/validate`.
4. Report: blog slug, version, confidence, ready_to_share, open issues, and remind to commit
   `content/blogs/` and any new `content/diagrams/` files.
