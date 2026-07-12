---
name: "source-command-commission-diagrams"
description: "Drain the diagram-commission queue — author an original diagram for each due topic."
---

# source-command-commission-diagrams

Use this skill when the user asks to run the migrated source command `commission-diagrams`.

## Command Template

Fulfil the diagram commissions enqueued from the Settings → Diagrams tab. The server only
schedules; YOU (the diagram-author) generate the diagrams locally — no server-side LLM. There is no
`localhost:8000` backend: you **read** the queue with the anon key but cannot mutate it or register
assets (those are admin/server-side). You produce the files; the human completes the queue items and
registers the diagrams in Settings.

Set up keyless reads once:

```bash
source .env 2>/dev/null || true
SB="$SUPABASE_URL/rest/v1"; H1="apikey: $SUPABASE_PUBLISHABLE_KEY"; H2="Authorization: Bearer $SUPABASE_PUBLISHABLE_KEY"
```

For each **due** commission:

1. List due diagram tasks (a future `scheduled_at` is intentionally hidden until its interval
   elapses, so filter to due-or-null):
   `curl -s "$SB/queue_public?kind=eq.diagram&status=eq.queued&or=(scheduled_at.is.null,scheduled_at.lte.now())&select=id,target_slug,notes,scheduled_at" -H "$H1" -H "$H2"`

2. Use the **diagram-author** subagent on the item's `target_slug` (a topic or capability): fetch
   the relevant verified claims for grounding, author an ORIGINAL `<slug>.diagram.json` topology
   plus a detailed SVG fallback (never a copy, no third-party logos). Every node drills into
   inputs, processing, outputs, a worked example, controls, and failure modes; every edge is
   labelled and decision diagrams branch. Save both under `content/diagrams/`, mirror the SVG to
   `public/diagrams/`, run `npm run validate:diagrams`, and
   append the asset entry to `content/diagrams/assets.json` with both `topic_slug` and
   `capability_id` (the `target_slug` from the commission is a topic slug unless the queue notes
   explicitly say otherwise).

3. Track which `queue_items.id` you fulfilled and report the mapping — you cannot claim/complete the
   queue items yourself.

Then commit the new `content/diagrams/*` files and the updated `content/diagrams/assets.json`. To
make the diagrams live and flip the coverage table from **gap/commissioned** to **covered**, the
admin registers the new assets (in-app content bootstrap / `scripts/import_content.py`) and marks
the fulfilled commission items done in **Settings → Diagrams / Queue**.
