---
description: End-to-end publish chain for one topic — coverage check, human verify gate, diagram, cited article, validation, docs sync. No server-side orchestration; this is the local agent chain.
argument-hint: <topic-slug> [--idea <id>]
---

Publish topic: $ARGUMENTS

Run the chain below **in order, stopping at the human gates** — this command orchestrates
existing agents; it adds no new machinery.

The KB is read directly from Supabase with the anon key (no `localhost:8000` backend). Set up
keyless reads once:

```bash
source .env 2>/dev/null || true
SB="$SUPABASE_URL/rest/v1"; H1="apikey: $SUPABASE_PUBLISHABLE_KEY"; H2="Authorization: Bearer $SUPABASE_PUBLISHABLE_KEY"
```

**Optional `--idea <id>` brief.** If `$ARGUMENTS` ends with `--idea <id>`, strip that token pair
and use the remaining text as the topic slug. Fetch the idea before starting step 1:

```bash
curl -s "$SB/queue_items?id=eq.<id>&kind=eq.idea&select=id,title,target_slug,notes,status" -H "$H1" -H "$H2"
```

Parse `notes` as JSON (`rationale`, `target_content_kind`, `target_length_hint`, `diagram_guidance`,
`capability_level`, `supporting_capability_ids`). Fold `rationale` + `target_length_hint` +
`diagram_guidance` into the blog-author brief in step 4 as explicit context, the same way a human
would paraphrase it manually today. Print one line confirming what happened before proceeding:
either "Idea `<id>` found — folding in: `<one-line summary of rationale/length/diagram guidance>`"
or "Idea `<id>` not found / not kind=idea / notes unparseable — proceeding without a brief, same as
if `--idea` had been omitted." Never silently proceed as if the brief was relayed when it wasn't.
If the idea's `target_content_kind` is `"lesson"`, stop and tell the user to run `/lesson` instead
— this command is for articles only.

1. **Coverage check.** Fetch the topic's mapped capabilities —
   `curl -s "$SB/topic_capabilities?topic_slug=eq.$ARGUMENTS&select=capability_id" -H "$H1" -H "$H2"`
   — then use the **coverage-auditor** subagent scoped to them. If coverage is thin (no verified
   L1/L2, or L3 missing for a practitioner topic), list the recommended sources and **stop here**
   — tell the user to add them via **Settings → Queue** (or the URL submit box), then run
   `/ingest-batch` and publish/verify, then re-run this command. You cannot write to the queue
   yourself.
2. **Human verify gate.** Check for pending claims on the mapped capabilities —
   `curl -s "$SB/claims?active=eq.true&status=eq.pending&capability_id=in.(<ids>)&select=id,capability_id,depth,type,source_id" -H "$H1" -H "$H2"`
   — and if any exist, stop and ask the user to verify them first in **Settings → Claims →
   "Verify all"** (or per-claim review) — articles may only cite verified claims.
3. **Diagrams (commission at least two).** Use the **diagram-author** subagent twice so the
   article is illustrated end to end:
   a. an **architecture** diagram — the workload's components, data flow, and place in Fabric;
   b. a **decision / internals** diagram — query path, engine internals, or a comparison
   (e.g. Import vs DirectQuery vs Direct Lake for BI topics; hot vs cold path for RTI;
   V-Order vs plain Parquet for engineering). Register both as generated assets.
   Verify each `.svg`/`.mmd` exists on disk before moving on — an article that embeds a missing
   diagram fails validation as a **critical** issue and can never reach `ready_to_share`.
4. **Article.** Use the **blog-author** subagent on the topic slug, passing along the idea's
   brief (rationale, length hint, diagram guidance) as explicit context if `--idea` was given. It
   must embed **every** commissioned diagram (architecture near the top, the decision/internals
   diagram inside `### How it works internally` under `## Internals`), not just the first. The
   article must carry a mandatory `## Internals` section with all three sub-headings (`Architecture &
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
7. Finish with a publish checklist, same format as content-orchestrator's: article slug +
   confidence + ready_to_share, every file written this run, and the git commit reminder
   (`content/articles/`, `content/diagrams/`, `content/help/`). After committing and the branch
   deploys, tell the user **Settings → Publish → "Publish all"** will pick up the new article,
   its diagrams, and any new sources in one click, in the correct order — the per-file
   `Settings -> Publish -> <kind> -> paste ...` flow is only needed if they want this one article
   live before the next deploy.
