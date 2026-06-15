---
description: Re-check a source for changes, version affected claims, flag impacted designs.
argument-hint: <source-key>
---
Use the **source-drift-analyst** subagent on source $ARGUMENTS. Read the current source content,
re-extract the claims yourself, then POST them to
http://localhost:8000/sources/$ARGUMENTS/drift as `{"claims":[...]}`. Summarise the diff
(added / changed / removed / unchanged), confirm what was superseded or deprecated, list every
affected design now marked needs_review, and give a concrete remediation list.
