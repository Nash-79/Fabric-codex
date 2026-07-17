---
description: Triage new reader-submitted article feedback into a structured, actionable JSON verdict (local, no API).
argument-hint: [optional article slug to focus on]
---

Use the **feedback-triage** subagent on the current batch of `new` reader feedback. $ARGUMENTS

The agent reads the token-protected `GET /api/public/hooks/poll-feeds` snapshot (`.feedback[]`),
verifies each report against the article's actual `body_md` and its grounding claims, and writes a
structured verdict per item — it has no Supabase write access, so it writes
`content/feedback-triage/<batch>.json` and appends any actionable items as
`# feedback: <slug> / <section> — ...` lines to `content/queue.md` (same routing as internals
gaps).

After the run: open **Settings → Feedback**, paste the written file's contents into "Apply triage
results" to post the `ai_analysis` and `status` back to each `content_feedback` row. Actionable
items then flow through the normal `/ingest-batch` → human-verify pipeline like any other queued
work.
