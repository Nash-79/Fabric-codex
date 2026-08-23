# fabric_spark_toolkit — staged source material

First-party (user-authored) expert-level Microsoft Fabric / Spark content, staged here so
`content/sources/*.json` entries can cite a stable, repo-relative path instead of a personal local
file path. Ingested per [docs/plan/phase-2-content.md](../../docs/plan/phase-2-content.md) WP2.2.

**Not portal content itself** — these are the raw materials `knowledge-curator` extracts claims
from. Published articles live in `content/articles/`; this directory is the citable source.

## What's here and what's excluded

Copied from the original toolkit, minus:
- `nbhtml/` — pure derived nbconvert output (~81% bundled third-party CSS), zero content loss
  since every notebook here already carries its own outputs.
- `docs.html` — a viewer wrapping the four `.md`/`.ipynb`-adjacent docs already present here as
  their own files, plus a "Build Plan & Gap Analysis" section that is internal authoring
  meta-content, not something to publish. Harvested for context during ingestion, not copied in.

## Provenance

Original work — verified during ingestion planning: only 6 `learn.microsoft.com` URLs exist across
the whole corpus, all inside formal "References & Further Reading" sections (citation, not
reproduction). No LICENSE file accompanies the original; the author has confirmed authorship and
released it for ingestion into Fabric Atlas.

## Known staleness / handling notes (carried from ingestion planning)

- Preserve the `SPARK_DEFAULT` / `FABRIC_DOC` / `HEURISTIC` basis tags as claim `type` — this
  classification work is already done; do not re-derive it.
- Preserve the finding codes (`L001…L021`, `N001…N005`, `S001…S005`, `P003…P015`, `M001`) as stable
  claim keys/tags cross-referencing standards ↔ analyzer ↔ notebooks.
- Version-stamp time-sensitive claims on ingestion, especially the ANSI×NEE fallback behavior
  (asserted in 4 places — exactly the kind of thing Microsoft changes) and Runtime 2.0 GA/LTS
  labels.
- The three heuristic implementations (`.py` modules, inlined notebook cells, and a JS port inside
  `spark_internals.html`) are intentionally triplicated by the original author for consistency
  checking — the `.py` files are canonical; treat the other two as derived, not independent
  sources, when extracting claims.
