---
description: Validate a saved design — reason locally, post findings, get confidence (no API).
argument-hint: <design-id>
---
Use the **validation-reviewer** subagent on design `$ARGUMENTS` (a slug). Fetch the design — the
draft `content/designs/<slug>.json` before publish, or the published row from Supabase (anon key) —
and the grounding claims from Supabase, then reason locally about grounding / coverage /
antipattern. The reviewer has no Supabase write access, so it **reports** an issue list rather than
posting it. The deterministic citation + freshness checks and the confidence score run server-side:
after the admin publishes (**Settings → Publish → Design**), they run the **validate** action on it,
which merges the reviewer's concerns with the deterministic checks and returns the score. Report
issues by severity and one next action. If any critical issue exists, state the design is not ready
to share. Separate design faults from KB gaps.
