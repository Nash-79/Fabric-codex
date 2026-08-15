---
name: fabric-atlas-diagram-author
description: Author original rich SVG infographics with grounded semantic sidecars for Microsoft Fabric architectures.
---

# Fabric Atlas Diagram Author

Use this skill when creating or updating an original SVG architecture infographic and its semantic JSON sidecar.

## Infographic Design Principles (No Tiled Boxes)

Avoid generating uniform card grids or CSS flexbox-like rectangular tiles. Author **visually flow-driven infographics**:
- **Flow Conduits:** Use bold data pipelines (`stroke-width="2.5"`), curved bezier connectors (`M ... Q ... L ...`), and numbered stage badges (① ➔ ② ➔ ③).
- **Official Icons:** Incorporate official Microsoft Fabric icons from `content/diagrams/icons/microsoft/svg/` (wrapped in `<g data-official-icon="microsoft" data-icon-name="...">`) alongside service labels for instant product recognition.
- **Graphic Hierarchy:** Bold card headlines (13–14px) + punchy state/metric pills (e.g. `2x faster`, `1M–16M rows`, `Cold / Hot`) + maximum 2 lines of high-signal takeaway. Delegate deep paragraphs to the sidecar drill-down.
- **Graphic Metaphors:** Choose from the 6 core archetypes:
  1. *Pipeline Flow & Medallion Rail* (left-to-right continuous ribbon with stage hubs and payload badges).
  2. *Decision Tree & Trade-Off Matrix* (diamond/hex decision hubs with YES/NO/FALLBACK condition pills).
  3. *Engine Internals Cutaway Stack* (layered vertical execution stack with SIMD/vectorized blocks and fallback trapdoors).
  4. *State Transition & Memory Ladder* (color-graduated thermometers from Cold to Hot with latency gauges).
  5. *Storage Anatomy & Object Model* (exploded log/file hierarchy with 1:1 segment mapping).
  6. *Trap vs Remedy Split* (side-by-side comparison with red breakages vs green governed flows).

## Workflow

1. Fetch grounding claims for the capability/subject from Supabase REST API (`/claims?capability_id=eq.<id>`).
2. Author `content/diagrams/<slug>.diagram.json` containing stable nodes, directed edges, layers, walkthrough steps, evidence, and drill targets. Set `layoutHint: "wide"` or `"full-bleed"` when appropriate.
3. Author original SVG artwork `content/diagrams/<slug>.svg` with focusable `<g data-node-id="…">` semantic groups, role="img", and aria-labelledby.
4. Mirror SVG byte-for-byte to `public/diagrams/<slug>.svg`.
5. Run `node scripts/update-static-hashes.mjs` to update `content/diagrams/assets.json`.
6. Run `npm run validate:diagrams` and `npm run validate:diagram-layout`.

