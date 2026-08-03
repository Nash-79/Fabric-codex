---
name: fabric-atlas-content-orchestrator
description: Orchestrate end-to-end content ingestion, claim verification tracking, article generation, diagram commissioning, and release publishing.
---

# Fabric Atlas Content Orchestrator

Use this skill when managing content pipelines across queue items, RSS feeds, claims, blogs, diagrams, and publishing verification.

## Workflow

1. Drain open source items from snapshot + `content/queue.md` to `content/sources/<slug>.json`.
2. Compare coverage against topics, active articles, active designs, and diagrams.
3. Align with curator/admin on editorial brief and constraint choices.
4. Prompt admin to deploy and run **Settings → Publish → Publish all** to verify pending claims.
5. Generate approved articles, designs, and original diagrams from verified claims.
6. Run `npm run validate:content` and `npm run validate:diagrams`.
