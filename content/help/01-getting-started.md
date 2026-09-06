# Getting started

Fabric Codex is a governed knowledge base and reading portal for Microsoft Fabric. Approved
sources become atomic, **cited claims**; an admin verifies every claim before anything is
built on it; verified claims power topic content, solution designs, and lessons — and every
generated piece is validated against what it cites.

## The pages

- **Home** — the big picture: a capability map you can filter, live claim counts, recently
  published content, and Advisor prompt shortcuts.
- **Topics** — the reading portal: a topic tree where each topic gathers the articles,
  designs, and lessons written about it. Start here if you want to _learn_ Fabric.
- **Knowledge Hub** — every article, architecture and lesson in one filterable list. Chips
  narrow it by kind (Everything / Articles / Architectures / Lessons) and by topic. This replaced
  three near-identical pages that differed only by a filter; `/blogs`, `/designs` and `/learn`
  still work and redirect here with the matching chip selected.
- **Reference Docs** (under the **Explore** menu) — authoritative deep-dive technical
  whitepapers and engine internals reference documentation with interactive traces and SVGs.
- **Capability Registry** (under **Explore**) — the spine: every tracked capability with its live
  claim, depth, and diagram coverage. Read-only — a coverage dashboard, not a moderation tool.
- **Sources** (under **Explore**) — every approved source with its trust tier, searchable and
  filterable by tier.
- **Roadmap** (under **Explore**) — what's coming to Microsoft Fabric, tracked against the
  capability registry.
- **Advisor** — ask a question and get an answer grounded only in verified claims, with the model
  chosen by the configured provider chain.
- **Search** — one search box across topics, content, claims, and sources. Also reachable with
  the ⌘K / Ctrl-K palette from anywhere.
- **Help** — these pages.
- **Favorites** and **Settings** — Favorites is for any signed-in user; Settings is
  admin-only (see _Admin settings_).

## The trust model in one screen

1. Nothing enters the knowledge base without a **source** and a **trust tier**
   (T1 Microsoft Learn … T6 unknown).
2. Every extracted claim starts **pending** and needs an admin to verify it before it can be
   cited.
3. Articles, designs, and lessons may only cite verified sources, and every factual sentence
   carries an `[Sn]` citation you can trace back to its source.
4. Publishing never overwrites content in place — every publish of an article, design, or
   lesson creates a new version, and the previous version is archived, not lost.
5. If you spot something wrong, every article, design, and lesson has a **Report an issue**
   button — no sign-in required.

Nothing in this portal is invented by a model and left unchecked — that is the point.
