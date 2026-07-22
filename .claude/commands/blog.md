---
description: Compose the cited knowledge-base article for a topic from verified claims, then validate it (local, no API).
argument-hint: <topic-slug> [--idea <id>]
---

Author and validate the article for topic: $ARGUMENTS

The KB is read directly from Supabase with the anon key (no `localhost:8000` backend). Authoring
writes a git file; **publishing is a human step in Settings → Publish** (the service-role key is
sealed, so agents never write to Supabase).

**Optional `--idea <id>` brief.** If `$ARGUMENTS` ends with `--idea <id>`, strip that token pair
and use the remaining text as the topic slug. Fetch the idea before step 1:

```bash
source .env 2>/dev/null || true
SB="$SUPABASE_URL/rest/v1"; H1="apikey: $SUPABASE_PUBLISHABLE_KEY"; H2="Authorization: Bearer $SUPABASE_PUBLISHABLE_KEY"
curl -s "$SB/queue_items?id=eq.<id>&kind=eq.idea&select=id,title,target_slug,notes,status" -H "$H1" -H "$H2"
```

Parse `notes` as JSON (`rationale`, `target_content_kind`, `target_length_hint`, `diagram_guidance`,
`capability_level`, `supporting_capability_ids`) and fold `rationale` + `target_length_hint` +
`diagram_guidance` into the blog-author invocation below as explicit context. Print one line
confirming what happened: either "Idea `<id>` found — folding in: `<one-line summary>`" or "Idea
`<id>` not found / not kind=idea / notes unparseable — proceeding without a brief." If the idea's
`target_content_kind` is `"lesson"`, stop and tell the user to run `/lesson` instead.

1. Use the **blog-author** subagent on topic `$ARGUMENTS` (the slug with `--idea <id>` stripped, if
   present), passing along the idea's brief as explicit drafting context when one was found. It
   reads verified claims from Supabase and writes `content/articles/<topic-slug>.json` with
   portable `cited_source_keys`; note the slug.
2. If the blog-author reports a coverage gap instead of writing, stop and relay the gap — do
   not force an article out of thin claims. (If the topic has zero **verified** claims, the gate
   trips even when pending claims exist — verify them first in Settings → Claims → "Verify all".)
3. Run the **validation-reviewer** subagent over the drafted `content/articles/<slug>.json`: it
   reasons about grounding/coverage/antipattern (including verbatim-copy checks against the cited
   verified claims read from Supabase) and reports issues. Deterministic citation/freshness checks
   and the confidence score run **server-side after publish** (Settings → Publish, then the
   `validate` action on the article).
4. Report: article slug, the source legend, the reviewer's open issues, a reminder to commit
   `content/articles/` and any new `content/diagrams/` files, and the publish step:
   **Settings → Publish → Article → paste `content/articles/<slug>.json`**. Publishing always
   creates a new version — the prior version is archived, never overwritten in place.
