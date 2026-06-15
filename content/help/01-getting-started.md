# Getting started

Fabric Atlas is a governed knowledge base and reading portal for Microsoft Fabric. Approved
sources become atomic, **cited claims**; a human verifies every claim before anything is
built on it; verified claims power topic articles, solution designs, and lessons — and
everything generated is validated against what it cites.

## The pages

- **Overview** — the big picture: platform story, coverage stats, platform-level claims.
- **Topics** — the reading portal: a nested topic tree where each topic can carry one
  rich, cited article. Start here if you want to *learn* Fabric.
- **Search** — full-text search across articles, topics, claims, and sources.
- **Registry** — the curation workbench: capabilities, claims, verify/reject, audit log.
- **Sources** — every ingested source with its trust tier, plus the **Add a source** form
  to queue new URLs for ingestion.
- **Designs** — cited solution architectures with their validation runs.
- **Learn** — short lessons per capability and level.
- **Help** — these pages.
- **Author** — the authoring loop for contributors working in the IDE.

## The trust model in one screen

1. Nothing enters the knowledge base without a **source** and a **trust tier**
   (T1 Microsoft Learn … T6 unknown).
2. Every extracted claim starts **pending** and needs a human click to become **verified**.
3. Articles and designs may only cite verified knowledge, and every factual sentence
   carries an `[Sn]` citation you can trace back to its source.
4. When a source changes, everything citing it is automatically flagged for re-review.

Nothing in this portal is invented by a model and left unchecked — that is the point.
