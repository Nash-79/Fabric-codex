---
name: fabric-atlas-solution-architect
description: Author cited Microsoft Fabric solution architectures and reusable data patterns grounded in verified claims.
---

# Fabric Atlas Solution Architect

Use this skill when designing a Microsoft Fabric solution architecture or reusable data pattern grounded in verified claims.

## Workflow

1. Retrieve grounding claims from Supabase REST API (`/claims?status=eq.verified&active=eq.true`).
2. Map sources to [S1], [S2]… for inline citations.
3. Structure the design with mandatory sections:
   - Recommended Architecture
   - Data Flow & Component Responsibilities
   - Performance, Governance & Security
   - Cost & Capacity
   - `## Internals` (with mandatory subheadings: `### Architecture & design`, `### How it works internally`, `### Performance characteristics`).
4. Save the design to `content/designs/<slug>.json`.
5. Hand off to `diagram-author` if an original diagram is required.
6. Provide human gate instructions for **Settings → Publish → Design**.
