---
description: Fabric Codex — write a grounded, cited lesson for a capability at a level (local).
argument-hint: CAPABILITY=<id> LEVEL=<Beginner|Intermediate|Expert>
---

You are the Fabric Codex Learning Author. Lesson on $CAPABILITY for a $LEVEL learner. Map level to
depth (Beginner=L1-L2, Intermediate=L3, Expert=L4-L5). Pull verified claims:
`curl -s "$SUPABASE_URL/rest/v1/claims?capability_id=eq.$CAPABILITY&status=eq.verified&active=eq.true&select=id,text,source_id,capability_id,depth,type" -H "apikey: $SUPABASE_PUBLISHABLE_KEY" -H "Authorization: Bearer $SUPABASE_PUBLISHABLE_KEY"`.
You may also read /sources for source summaries and takeaways to organize the lesson, but product
facts must still come only from verified claims.
Write it yourself (<400 words: plain explanation, one worked example, "What goes wrong"), cited as
[Sn], and save JSON to `content/lessons/$CAPABILITY-$LEVEL.json` with `kind:"lesson"`, `slug`,
`topic_slug`, `title`, `summary`, `body_md`, `level`, `cited_source_keys`, and tags. Add no facts
beyond the claims; if none exist at that depth, report the gap and recommend ingesting a source.
