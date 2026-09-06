# Validation and trust

Fabric Codex's core promise: **no fabricated content**. This page explains the machinery
behind that promise.

## Citations

Every factual sentence in an article, design, or lesson carries an `[Sn]` citation that
resolves to a real, approved source with a trust tier. The citation legend for a piece of
content lists every cited source with its title and tier. Publishing refuses outright if a
document has no cited sources at all, or if a cited source slug can't be resolved on the
server — there is no way to publish an uncited document.

## The validation pass

Two kinds of checking happen, at different points:

1. **Deterministic checks** (server-side, on demand): from **Settings → Content**, an admin
   can run **Validate** on an article or design. This checks that the document has at least
   one cited source, and that every diagram image embedded in its body is a diagram actually
   registered in the system — a missing diagram file is a critical finding. The result sets
   a confidence score and a **ready to share** flag (true only when there are zero critical
   findings).
2. **Agent review** (in the IDE, before publishing): the validation-reviewer agent reads a
   drafted article or design and reasons about **grounding** (does each statement follow
   from a cited claim?), **coverage** (is something the scenario needs missing?), and
   **antipattern** issues (known Fabric bad practices, and copied-rather-than-paraphrased
   text). This runs locally as part of the authoring workflow, before the file is ever
   pasted into Settings → Publish.

## Trust tiers

Every source carries a tier from T1 (Microsoft Learn) to T6 (unknown), shown on source cards
and in every citation. Tiers don't block content from being published — they make the
strength of the underlying evidence visible wherever it is used.

## What the system never does

- Invent product limits, quotas, or roadmap claims.
- Publish an article, design, or lesson with no cited sources.
- Re-host external images (they are linked with attribution; diagrams are original SVGs
  authored by the diagram-author agent).
- Overwrite a published article, design, or lesson in place — every publish is a new version;
  the previous one is archived, never lost.
