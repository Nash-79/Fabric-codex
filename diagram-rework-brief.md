# Sidecar re-authoring brief (shared by all rework agents)

You are re-authoring interactive diagram sidecars whose current content is formalized placeholder
junk: caption-fragment labels ("and watch-outs", "scored across strength"), zero evidence
anywhere, and straight 1→2→3 chains. Your job is to replace each assigned sidecar with a genuinely
authored one.

## Your assignment

`diagram-rework-remaining.json` at the repo root lists all work items. You are given an index
range (0-based, inclusive start, exclusive end). For each item in your range:

**Write one complete, valid JSON file per item before moving to the next item.** Do not draft a
file across multiple partial edits — compose the full node/edge/walkthrough content in your own
reasoning first, then write it in one shot. If your session is interrupted, only the item you are
mid-writing is at risk; everything before it must already be a complete, parseable file.

- `slug` — overwrite `content/diagrams/<slug>.diagram.json` (it exists; replace it fully)
- `articles` — the article file(s) embedding this diagram; read `body_md` for what the diagram
  must express
- `sources` — the ONLY source keys you may cite; read each `content/sources/<key>.json` (`claims`
  array: text, depth, type)
- `caption` — what the original SVG depicts; your graph should express the same subject

Do NOT touch any `.svg`, `assets.json`, or `diagram-rework.json`. Only the assigned
`.diagram.json` files.

## Contract (schema in `src/diagrams/types.ts` — read it first)

Also read ONE good example before writing anything:
`content/diagrams/silver-layer-modelling-architecture.diagram.json` (flow) and
`content/diagrams/data-modelling-decision.diagram.json` (decision).

- Conform to `AuthoredDiagram` exactly. NO x/y/width/height — layout is derived from edges.
- `id` = the slug. `type`: "decision" if the slug/caption says decision, "internals" for
  internals/engine/query-path subjects, "flow" for data-movement paths, else "architecture".
  Keep `topicSlug`/`capabilityIds` consistent with the work item. `revision` "3",
  `qaStatus` "draft", `staticPath` "/diagrams/<slug>.svg".
- 6–9 nodes. Labels are SHORT (~40 chars), real product/step names — never sentence fragments.
- **Topology must be real.** Architectures/flows branch and converge where the system genuinely
  does; add a `feedback` edge where a loop truly exists (retry, replay, watermark, tuning).
  A straight chain is acceptable ONLY when the subject is truly linear.
- **A `decision` diagram must branch**: a question node with 2–3 outgoing `kind:"branch"` edges
  whose labels ARE the answers. Validation fails a decision with no branch edge.
- Every edge has a `label` that says what flows or why the branch is taken.
- **Classification is an honesty contract.** `fact` = sourced product behaviour and MUST carry
  `evidence` [{sourceKey, note}] where the note paraphrases a real claim from an allowed source.
  `pattern`/`inference` = practice/interpretation, cite nothing rather than faking it.
  `warning` = a real failure mode; include at least one warning node per diagram where the
  subject has a genuine trap (most do).
- **Aim for several cited fact nodes per diagram** — the sources are listed because the article
  already cites them; read the claims and ground what they support. A diagram with zero evidence
  is what you are replacing, not what you are producing.
- `drill` must be node-specific: inputs/processing/outputs, ONE concrete worked example,
  controls, failureModes. `metrics` only for figures that trace to a claim (sourceKey) or are
  clearly labelled pattern guidance (no sourceKey). NEVER invent limits/quotas/latency numbers.
- `walkthrough`: ordered steps over the node ids telling the story.
- `accessibleSummary`/`longDescription`: genuinely descriptive prose for screen readers.
- Name products accurately in `label`/`tags`/`drillTarget` — the renderer infers official
  Microsoft Fabric icons from those fields.

## Verify before finishing

Run `npm run validate:diagrams` from the repo root — it MUST pass. Then confirm for each of your
files: JSON parses, every fact node cites, every edge labelled, decision diagrams branch.

Return: per slug — node/edge count, classification breakdown, evidence count, and confirmation
validate:diagrams passed.
