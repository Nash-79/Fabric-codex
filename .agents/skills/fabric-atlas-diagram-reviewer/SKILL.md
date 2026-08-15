---
name: fabric-atlas-diagram-reviewer
description: Audit Fabric Atlas SVG diagrams and semantic sidecars for spatial layout, text overlaps, multi-device responsiveness, text budget, tone, color contrast, official icons, and infographic presentation.
---

# Fabric Atlas Diagram Reviewer Skill

Use this skill whenever asked to review, audit, quality-check, or validate the visual design, multi-device responsiveness, or layout of any Fabric Atlas diagram.

## Review Workflow

1. **Automated Layout & Geometry Scan:**
   Run the headless audit tool on the target diagram:
   ```bash
   node scripts/review-diagram.mjs --slug <diagram-slug>
   ```

2. **Evaluate the 7 Quality Dimensions:**
   - **Dimension 1: Spatial Layout & Overlap Detection** (0 collisions, 8px+ padding, strict viewBox bounding).
   - **Dimension 2: Multi-Device Responsiveness** (Audited at 390px mobile, 768px tablet, 1024px laptop, 1280px desktop; verify `layoutHint: "wide"` or `"full-bleed"`).
   - **Dimension 3: Typography & Sizing Hierarchy** (Hero 18–20px bold, section titles 11–13px caps, card headers 13–15px, takeaways 10.5–11.5px max 2–3 lines, pills 9–10.5px).
   - **Dimension 4: Visual Flow & Conduits** (Directional conduits `stroke-width="2.5"`, numbered badges ①➔②➔③, condition pills `[ ANSI = ON ]`, custom arrowheads).
   - **Dimension 5: Tone & Color Harmony** (Curated domain colors: OneLake teal, Spark purple, Warehouse blue, Power BI gold, Warnings red; WCAG AA 4.5:1 text contrast; saturated linear gradients).
   - **Dimension 6: Infographic Presentation & Assets** (Official Microsoft Fabric icons `<g data-official-icon="microsoft">`, drop shadows, graphic metaphors vs plain text cards).
   - **Dimension 7: Semantic Sidecar Grounding** (1:1 node ID mapping, tooltip `<title data-node-tooltip="true">`, evidence citations).

3. **Deliver Scorecard & Recommendations:**
   Produce a structured scorecard with concrete coordinates and a prescriptive visual improvement blueprint.
