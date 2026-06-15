# Validation and trust

Fabric Atlas's core promise: **no fabricated content**. This page explains the machinery
behind that promise.

## Citations

Every factual sentence in an article or design carries an `[Sn]` citation that resolves to
a real, ingested source with a trust tier. The mapping is owned by whoever authored the
document and is checked — a citation to a source that does not exist is a critical
validation failure. Articles are held to a stricter bar than designs: they may only cite
sources that back at least one human-verified claim.

## The validation pass

Two layers run over every article and design:

1. **Deterministic checks** (always, server-side): every `[Sn]` resolves; cited sources are
   still current (freshness); for articles, every embedded diagram file actually exists.
2. **Reviewer checks** (the validation-reviewer agent): **grounding** (does each statement
   follow from a cited claim?), **coverage** (is something the scenario needs missing?),
   **antipattern** (known Fabric bad practices, and for articles, copied-rather-than-
   paraphrased text).

Findings have a severity (critical / warning / info) and produce the **confidence** score.
Any critical finding sets the document to **needs review** and removes its
ready-to-share flag.

## Drift — keeping published content honest

When a source is re-checked and its content changed, the affected claims are versioned
(never edited), and **every article and design citing that source is automatically flagged
needs-review**. That is why an article can show a red banner: the knowledge under it moved.

## Trust tiers

Every source carries a tier from T1 (Microsoft Learn) to T6 (unknown), shown on source
cards, citations, and search results. Tiers don't block content — they make the strength of
the underlying evidence visible wherever it is used.

## What the system never does

- Invent product limits, quotas, or roadmap claims.
- Publish a claim without a source, or an article citing unverified knowledge.
- Re-host external images (they are linked with attribution; diagrams are original SVGs).
- Edit published content in place — every change is a new version with history.
