---
description: Write a grounded, cited lesson for a capability at a chosen level (local, no API).
argument-hint: <capability-id> <Beginner|Intermediate|Expert> [--idea <id>]
---

**Optional `--idea <id>` brief.** If `$ARGUMENTS` ends with `--idea <id>`, strip that token pair;
the remaining text is `<capability-id> <Beginner|Intermediate|Expert>` as usual (if `$ARGUMENTS` is
just `--idea <id>` with no explicit capability/level, derive both from the idea itself:
`supporting_capability_ids[0]` for the capability, `capability_level` for the level). Fetch the
idea first:

```bash
source .env 2>/dev/null || true
SB="$SUPABASE_URL/rest/v1"; H1="apikey: $SUPABASE_PUBLISHABLE_KEY"; H2="Authorization: Bearer $SUPABASE_PUBLISHABLE_KEY"
curl -s "$SB/queue_items?id=eq.<id>&kind=eq.idea&select=id,title,target_slug,notes,status" -H "$H1" -H "$H2"
```

Parse `notes` as JSON and fold `rationale` into the lesson's angle/framing (still <400 words —
`target_length_hint` for a lesson idea is always the literal "under 400 words", matching
learning-author's own cap, never a different number). Print one line confirming what happened:
either "Idea `<id>` found — folding in: `<one-line summary>`" or "Idea `<id>` not found / not
kind=idea / notes unparseable / capability+level could not be derived — proceeding without a
brief." If the idea's `target_content_kind` is `"article"`, stop and tell the user to run `/blog`
or `/publish-topic` instead — this command is for lessons only.

Use the **learning-author** subagent for: $ARGUMENTS (with `--idea <id>` stripped, capability and
level resolved as above). Map level to depths (Beginner=L1-L2, Intermediate=L3, Expert=L4-L5), pull
verified claims from Supabase with the anon key (no `localhost:8000` backend — see the
learning-author agent for the `$SB`/header recipe), and write the lesson yourself (<400 words:
explanation, worked example, "what goes wrong"), cited as [Sn], folding in the idea's rationale as
framing context when one was found. Source summaries may shape the lesson flow, but every product
fact must come from verified claims. Save it as `content/lessons/<capability>-<level>.json` (title,
body_md, depth_levels, cited_source_keys — see the learning-author agent for the exact envelope).
If no claims exist at that depth, report the gap instead of inventing content. Finish by telling
the user to open **Settings → Publish**, choose **Lesson**, and paste the JSON file — this is the
only way lesson content reaches production; publishing always creates a new version, never
overwrites in place.
