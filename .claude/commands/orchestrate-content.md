---
description: Master content orchestration across queue, RSS state, pending claims, topic coverage, blogs, diagrams, and validation gates.
argument-hint: [optional topic/capability/focus]
---

Orchestrate Fabric Atlas content work: $ARGUMENTS

Use the **content-orchestrator** subagent with the optional focus in `$ARGUMENTS`.

The orchestrator is a planning and routing layer. It reads Supabase keylessly, reads git-tracked
content files, dedupes queue/blog/topic work, and returns a ranked workplan. It does not poll RSS,
claim queue items, publish content, verify claims, complete queue items, or write to Supabase — the
service-role key needed to publish is sealed and unreachable from any local agent or script, so
publishing is always a human action in Settings.

The report ends with a **publish checklist**: every git-tracked content file that is ready to go
live right now, in dependency order (sources, then diagrams, then the articles/designs that cite
them), each as an exact `Settings -> Publish -> ...` action to paste. Anything not ready is listed
as Blocked with the specific reason instead. Work through that list top to bottom — it is the
single place ordering/dependencies have already been resolved.

If latest RSS content matters, ask the admin to run **Settings -> RSS Feeds -> Poll now** first,
then rerun this command. After that, route source extraction through `/ingest-batch`, article work
through `/blog <topic-slug>`, diagram work through `/commission-diagrams` or `/diagram`, and final
checks through `/validate` or the Settings publish/validate actions.
