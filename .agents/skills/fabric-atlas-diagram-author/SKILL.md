---
name: fabric-atlas-diagram-author
description: Author original rich SVG infographics with grounded semantic sidecars for Microsoft Fabric architectures.
---

# Fabric Atlas Diagram Author

Use this skill when creating or updating an original SVG architecture diagram and its semantic JSON sidecar.

## Workflow

1. Fetch grounding claims for the capability/subject from Supabase REST API (`/claims?capability_id=eq.<id>`).
2. Author `content/diagrams/<slug>.diagram.json` containing stable nodes, directed edges, layers, walkthrough steps, evidence, and drill targets.
3. Author original SVG artwork `content/diagrams/<slug>.svg` with focusable `<g data-node-id="…">` semantic groups.
4. Mirror SVG byte-for-byte to `public/diagrams/<slug>.svg`.
5. Run `node scripts/update-static-hashes.mjs` to update `content/diagrams/assets.json`.
6. Run `npm run validate:diagrams` and `npm run validate:diagram-layout`.
