---
description: Validate a saved design — reason locally, post findings, get confidence (no API).
argument-hint: <design-id>
---
Use the **validation-reviewer** subagent on design $ARGUMENTS. Fetch the design and grounding
claims, reason locally about grounding / coverage / antipattern, then
`curl -s -X POST http://localhost:8000/designs/$ARGUMENTS/validate -H "Content-Type: application/json" -d '{"issues":[...]}'`.
The backend merges your findings with deterministic citation + freshness checks and returns the
confidence score. Report issues by severity, the score, and one next action. If any critical
issue exists, state the design is not ready to share. Separate design faults from KB gaps.
