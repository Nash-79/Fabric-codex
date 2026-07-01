---
description: Ask the expert adviser a Fabric question — answered only from verified claims, with citations.
argument-hint: <question or scenario to walk through>
---

Use the **fabric-advisor** subagent to answer: $ARGUMENTS

Ground the answer ONLY in knowledge-base claims (retrieve scoped from Supabase with the anon key —
`source .env; curl -s "$SUPABASE_URL/rest/v1/claims?capability_id=eq.<id>&status=eq.verified&active=eq.true&select=id,text,depth,source_id,sources(slug,title,tier)" -H "apikey: $SUPABASE_PUBLISHABLE_KEY" -H "Authorization: Bearer $SUPABASE_PUBLISHABLE_KEY"`), cite as [Sn] with a
source legend, label your own reasoning as _(inference)_, and where the KB has no coverage say so
and recommend what to `/ingest` rather than guessing. For walkthrough requests, give numbered,
cited steps.
