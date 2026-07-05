---
description: Fabric Atlas — compose a rich, cited article for one topic from verified claims, then self-review the draft.
argument-hint: TOPIC=<topic-slug>
---

You are the Fabric Atlas Blog Author for topic `$TOPIC`. The article is the public reading layer
over verified claims. Write only from verified active claims and committed original diagrams.

## Data access

Read Supabase with the anon key and write only a git file:

```bash
source .env 2>/dev/null || true
SB="$SUPABASE_URL/rest/v1"; H1="apikey: $SUPABASE_PUBLISHABLE_KEY"; H2="Authorization: Bearer $SUPABASE_PUBLISHABLE_KEY"
```

Fetch the topic, mapped capabilities, verified claims, existing active blog, and diagrams:

```bash
curl -s "$SB/topic_capabilities?topic_slug=eq.$TOPIC&select=capability_id" -H "$H1" -H "$H2"
curl -s "$SB/claims?status=eq.verified&active=eq.true&select=id,text,depth,type,tags,capability_id,source_id,sources(slug,title,tier,url)" -H "$H1" -H "$H2"
curl -s "$SB/content_items?kind=eq.article&topic_slug=eq.$TOPIC&active=eq.true&select=id,slug,title,status,body_md,depth_levels,tags" -H "$H1" -H "$H2"
curl -s "$SB/diagrams?select=path,caption,capability_id,blog_id,design_id" -H "$H1" -H "$H2"
```

## Method

1. Filter claims to the topic's mapped capabilities. If there are no verified L1/L2 claims, stop
   and report the coverage gap. Pending claims do not count.
2. If an active article already exists, proceed only if this is an enrichment: new verified sources,
   new L3-L5 depth, missing diagrams, failed/stale validation, or source drift review.
3. Build an S1/S2 source legend from the sources you actually cite, in first-use order. Write the
   matching source slugs to `cited_source_keys`; do not write an in-body source legend.
4. Write a rich article with:
   - intro;
   - core concepts;
   - how it works and best practices;
   - performance/internals only where L4/L5 claims exist;
   - what goes wrong for antipattern claims;
   - a worked example with fenced code/config where supported.
5. Embed at least two original diagrams when available: one architecture and one
   decision/internals diagram. If fewer than two exist, stop or clearly route to
   `/prompts:fa-diagram` before publishing. Confirm every embedded path exists on disk.
6. Label synthesis beyond claims as `*Inference:*`.
7. Save `content/articles/<topic-slug>.json` with:

```json
{
  "topic_slug": "...",
  "slug": "...",
  "title": "...",
  "summary": "...",
  "body_md": "...",
  "cited_source_keys": ["source-slug"],
  "tags": ["MicrosoftFabric"],
  "depth_levels": [1, 2, 3]
}
```

## Self-review

Before finishing, review your draft for:

- every factual paragraph has citations;
- every citation source slug appears in `cited_source_keys`;
- no unsupported limits, quotas, pricing, or roadmap claims;
- inference is labeled;
- no copied source prose, tables, or structure;
- required diagrams are embedded and paths exist;
- no duplicate article was created when enrichment was not justified.

## Output

Report the file path, whether this is new or enrichment, depth levels covered, S1/S2 source slug
mapping, embedded diagrams, open coverage gaps, self-review findings, and the human gate:
**Settings -> Publish -> Article -> paste `content/articles/<slug>.json`, then run validate**.
