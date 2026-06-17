---
description: Drain the diagram-commission queue — author an original diagram for each due topic.
argument-hint: (none)
---
Fulfil the diagram commissions enqueued from the Settings → Diagrams tab. The server only
schedules; YOU (the diagram-author) generate the diagrams locally — no server-side LLM.

For each **due** commission:

1. List due diagram tasks:
   `curl -s "http://localhost:8000/queue?kind=diagram&status=queued&due_only=true"`
   (Items with a future `scheduled_at` are intentionally hidden until their interval elapses.)

2. For each item, `claim` it:
   `curl -s -X POST http://localhost:8000/queue/<id>/claim`

3. Use the **diagram-author** subagent on the item's `target_slug` (a topic or capability):
   fetch the relevant verified claims for grounding, author an ORIGINAL Mermaid/SVG diagram
   (never a copy, no third-party logos), save it under `content/diagrams/`, and mirror it to
   `public/diagrams/` so the reader can serve it.

4. Register it as a generated asset (this is what makes the topic show as "covered"):
   `curl -s -X POST http://localhost:8000/assets -H 'Content-Type: application/json' -d '{
      "kind":"generated","path":"content/diagrams/<slug>.svg",
      "caption":"<caption>","capability_id":"<the target capability>" }'`

5. Mark the queue item done:
   `curl -s -X POST http://localhost:8000/queue/<id>/complete -H 'Content-Type: application/json' -d '{}'`
   (or `/fail` with an error note if you could not author it).

Then commit the new `content/diagrams/*` files. The Settings → Diagrams coverage table will show the
topic flip from **gap/commissioned** to **covered** once the generated asset is registered.
