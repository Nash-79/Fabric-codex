---
description: End-to-end publish chain for one topic — coverage check, human verify gate, diagram, cited article, validation, docs sync. No server-side orchestration; this is the local agent chain.
argument-hint: <topic-slug>
---

Publish topic: $ARGUMENTS

Run the chain below **in order, stopping at the human gates** — this command orchestrates
existing agents; it adds no new machinery.

1. **Coverage check.** Fetch `GET /topics/$ARGUMENTS` for the mapped capabilities, then use
   the **coverage-auditor** subagent scoped to them. If coverage is thin (no verified L1/L2,
   or L3 missing for a practitioner topic), list the recommended sources, enqueue them with
   `POST /queue`, and **stop here** — tell the user to run `/ingest-batch` and verify, then
   re-run this command.
2. **Human verify gate.** If the mapped capabilities have pending claims
   (`GET /claims?capability=<id>&status=pending`), stop and ask the user to verify them in
   the Registry first — blogs may only cite sources with verified claims.
3. **Diagrams (commission at least two).** Use the **diagram-author** subagent twice so the
   article is illustrated end to end:
   a. an **architecture** diagram — the workload's components, data flow, and place in Fabric;
   b. a **decision / internals** diagram — query path, engine internals, or a comparison
   (e.g. Import vs DirectQuery vs Direct Lake for BI topics; hot vs cold path for RTI;
   V-Order vs plain Parquet for engineering). Register both as generated assets.
   Verify each `.svg`/`.mmd` exists on disk before moving on — an article that embeds a missing
   diagram fails validation as a **critical** issue and can never reach `ready_to_share`.
4. **Article.** Use the **blog-author** subagent on `$ARGUMENTS`. It must embed **every**
   commissioned diagram (architecture near the top, the decision/internals diagram inside
   `### How it works internally` under `## Internals`), not just the first. The article must
   carry a mandatory `## Internals` section with all three sub-headings (`Architecture &
   design`, `How it works internally`, `Performance characteristics`) — grounded where L4/L5
   claims exist, otherwise a labeled `*Coming soon*` placeholder plus a `content/queue.md`
   entry (never a silently omitted section). Then write the article file for publish.
5. **Validate.** Use the **validation-reviewer** subagent over the new article; it reasons about
   grounding/coverage/antipattern locally, and its findings feed the `validateContent` server
   action an admin runs from **Settings → Publish** after publishing. If critical issues surface,
   report them — do not rewrite the article yourself; rerun the blog-author with the findings
   instead.
6. **Docs sync.** Use the **docs-author** subagent so the Help section reflects any new
   surface this work introduced.
7. Finish with: article slug + confidence + ready_to_share, files written, and the git commit
   reminder (`content/articles/`, `content/diagrams/`, `content/help/`).
