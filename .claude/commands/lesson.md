---
description: Write a grounded, cited lesson for a capability at a chosen level (local, no API).
argument-hint: <capability-id> <Beginner|Intermediate|Expert>
---

Use the **learning-author** subagent for: $ARGUMENTS. Map level to depths (Beginner=L1-L2,
Intermediate=L3, Expert=L4-L5), pull verified claims from Supabase with the anon key (no
`localhost:8000` backend — see the learning-author agent for the `$SB`/header recipe), and write
the lesson yourself (<400 words: explanation, worked example, "what goes wrong"), cited as [Sn].
Source summaries may shape the lesson flow, but every product fact must come from verified claims.
Save it as `content/lessons/<capability>-<level>.json` (title, body_md, depth_levels,
cited_source_keys — see the learning-author agent for the exact envelope). If no claims exist at
that depth, report the gap instead of inventing content. Finish by telling the user to open
**Settings → Publish**, choose **Lesson**, and paste the JSON file — this is the only way lesson
content reaches production; publishing always creates a new version, never overwrites in place.
