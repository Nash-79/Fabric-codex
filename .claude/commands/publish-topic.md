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
3. **Diagram.** Use the **diagram-author** subagent on the topic's primary capability so the
   article has at least one original illustration.
4. **Article.** Use the **blog-author** subagent on `$ARGUMENTS` (it embeds the diagram and
   POSTs the blog).
5. **Validate.** Use the **validation-reviewer** subagent over the new blog; it POSTs issues
   to `/blogs/<id>/validate`. If critical issues surface, report them — do not rewrite the
   article yourself; rerun the blog-author with the findings instead.
6. **Docs sync.** Use the **docs-author** subagent so the Help section reflects any new
   surface this work introduced.
7. Finish with: blog slug + confidence + ready_to_share, files written, and the git commit
   reminder (`content/blogs/`, `content/diagrams/`, `content/help/`).
