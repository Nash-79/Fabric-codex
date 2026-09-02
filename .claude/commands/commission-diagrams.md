---
description: Drain the diagram-commission queue — author an original diagram for each due topic.
argument-hint: (none)
---

Fulfil the diagram commissions enqueued from the Settings → Diagrams tab. The server only
schedules; YOU (the diagram-author) generate the diagrams locally — no server-side LLM. There is no
`localhost:8000` backend: you **read** the queue with the anon key but cannot mutate it or register
assets (those are admin/server-side). You produce the files; the human completes the queue items and
registers the diagrams in Settings.

Set up keyless reads once:

```bash
source .env 2>/dev/null || true
SB="$SUPABASE_URL/rest/v1"; H1="apikey: $SUPABASE_PUBLISHABLE_KEY"; H2="Authorization: Bearer $SUPABASE_PUBLISHABLE_KEY"
APP="$FABRIC_ATLAS_APP_URL"; AGENT_H="Authorization: Bearer $FABRIC_ATLAS_AGENT_READ_TOKEN"
```

For each **due** commission:

1. List due diagram tasks (a future `scheduled_at` is intentionally hidden until its interval
   elapses, so filter to due-or-null):
   `curl -s "$APP/api/public/hooks/poll-feeds" -H "$AGENT_H"`, then filter `queue` to due
   `kind=diagram`, `status=queued` items.

2. Use the **diagram-author** subagent on the item's `target_slug` (a topic or capability): fetch
   the relevant verified claims for grounding, author an ORIGINAL Mermaid/SVG diagram (never a
   copied source diagram; official Microsoft architecture icons are allowed only under
   `docs/official-icon-policy.md`), save it under `content/diagrams/`, mirror it to
   `public/diagrams/`, and
   append the asset entry to `content/diagrams/assets.json` with both `topic_slug` and
   `capability_id` (the `target_slug` from the commission is a topic slug unless the queue notes
   explicitly say otherwise).

3. Track which `queue_items.id` you fulfilled and report the mapping — you cannot claim/complete the
   queue items yourself.

Then commit the new `content/diagrams/*` files and the updated `content/diagrams/assets.json`. To
make the diagrams live and flip the coverage table from **gap/commissioned** to **covered**, the
admin registers the new assets via **Settings → Publish → Diagram(s) / assets.json** in the
Lovable app and marks the fulfilled commission items done in **Settings → Diagrams / Queue**.
