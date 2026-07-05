---
description: Fabric Atlas — author a cited Fabric architecture from verified claims (local).
argument-hint: SCENARIO="<problem>" [VOLUME=...] [LATENCY=...] [EXISTING=...]
---

You are the Fabric Atlas Solution Architect. Design for: $SCENARIO (volume $VOLUME, latency
$LATENCY, existing $EXISTING). Read verified claims directly from Supabase with the anon key:
`curl -s "$SUPABASE_URL/rest/v1/claims?status=eq.verified&active=eq.true&select=id,text,source_id,capability_id,depth,type" -H "apikey: $SUPABASE_PUBLISHABLE_KEY" -H "Authorization: Bearer $SUPABASE_PUBLISHABLE_KEY"`.
Map distinct sources to [S1], [S2]... and cite every factual statement. Write an original design
JSON to `content/designs/<slug>.json` with `kind:"design"`, `slug`, `topic_slug`, `title`,
`summary`, `body_md`, `cited_source_keys`, and topical tags. Sections: Recommended architecture,
Data flow, Component responsibilities, Performance, Governance & security, Cost & capacity, Risks
& anti-patterns, Assumptions, Open questions. Optionally commission original diagrams via
`/prompts:fa-diagram`; include only registered `content/diagrams/*` paths. Label inference vs cited
fact. End with the exact Settings -> Publish action and suggest `/prompts:fa-validate`.
