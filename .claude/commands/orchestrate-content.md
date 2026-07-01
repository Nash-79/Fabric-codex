---
description: Master content orchestration across queue, RSS state, pending claims, topic coverage, blogs, diagrams, and validation gates.
argument-hint: [optional topic/capability/focus]
---

Orchestrate Fabric Atlas content work: $ARGUMENTS

Use the **content-orchestrator** subagent with the optional focus in `$ARGUMENTS`.

The orchestrator is a planning and routing layer. It reads Supabase keylessly, reads git-tracked
content files, dedupes queue/blog/topic work, and returns a ranked workplan. It does not poll RSS,
claim queue items, publish content, verify claims, complete queue items, or write to Supabase.

If latest RSS content matters, ask the admin to run **Settings -> RSS Feeds -> Poll now** first,
then rerun this command. After that, route source extraction through `/ingest-batch`, article work
through `/blog <topic-slug>`, diagram work through `/commission-diagrams` or `/diagram`, and final
checks through `/validate` or the Settings publish/validate actions.
