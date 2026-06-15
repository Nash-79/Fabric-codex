---
description: Ask the expert adviser a Fabric question — answered only from verified claims, with citations.
argument-hint: <question or scenario to walk through>
---
Use the **fabric-advisor** subagent to answer: $ARGUMENTS

Ground the answer ONLY in knowledge-base claims (retrieve scoped:
`curl -s "http://localhost:8000/claims?capability=<id>&status=verified"`), cite as [Sn] with a
source legend, label your own reasoning as *(inference)*, and where the KB has no coverage say so
and recommend what to `/ingest` rather than guessing. For walkthrough requests, give numbered,
cited steps.
