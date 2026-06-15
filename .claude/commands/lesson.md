---
description: Write a grounded, cited lesson for a capability at a chosen level (local, no API).
argument-hint: <capability-id> <Beginner|Intermediate|Expert>
---
Use the **learning-author** subagent for: $ARGUMENTS. Map level to depths (Beginner=L1-L2,
Intermediate=L3, Expert=L4-L5), pull verified claims from http://localhost:8000/claims, and write
the lesson yourself (<400 words: explanation, worked example, "what goes wrong"), cited as [Sn].
Source summaries may shape the lesson flow, but every product fact must come from verified claims.
Save it to content/lessons/<capability>-<level>.md. If no claims exist at that depth, report the
gap instead of inventing content.
