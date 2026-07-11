---
description: Master content orchestration across queue, RSS state, pending claims, topic coverage, blogs, diagrams, and validation gates.
argument-hint: [optional topic/capability/focus]
---

Orchestrate Fabric Atlas content work: $ARGUMENTS

Use the **content-orchestrator** subagent with the optional focus in `$ARGUMENTS`.

The orchestrator is a resumable planning and execution layer. It reads Supabase keylessly,
dedupes work, drains queued sources into git-tracked source files, asks one contextual editorial
question round, and then coordinates selected article, solution architecture, reusable data
architecture pattern, diagram, and validation work. It cannot publish, verify claims, complete
queue items, or write to Supabase; authenticated mutations remain human actions in Settings.

The report ends with a **publish checklist**: every git-tracked content file that is ready to go
live right now, in dependency order (sources, then diagrams, then the articles/designs/lessons that
cite them), each as an exact `Settings -> Publish -> ...` action to paste. Anything not ready is
listed as Blocked with the specific reason instead. Work through that list top to bottom — it is
the single place ordering/dependencies have already been resolved.

If latest RSS content matters, ask the admin to run **Settings -> RSS Feeds -> Poll now** first,
then rerun this command. After that, route source extraction through `/ingest-batch`, article work
through `/blog <topic-slug>`, diagram work through `/commission-diagrams` or `/diagram`, and final
checks through `/validate` or the Settings publish/validate actions.

When execution is requested, keep the workflow together. After extraction, use AskUserQuestion to
ask which evidence-backed article additions/new articles, solution scenarios, and missing reusable
data patterns the user wants. Publish sources and verify their pending claims at the required
mid-run checkpoint; then resume, author all selected outputs, and finish with one deploy plus
**Settings -> Publish -> Publish all** release action.
