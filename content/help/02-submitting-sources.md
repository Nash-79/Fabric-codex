# Submitting sources

Queuing a new source for ingestion is an admin action, done from **Settings → Queue**: paste
a URL, pick a trust tier, and optionally add tags and a note for the curator. Queuing does
not ingest anything by itself — it adds the URL to the ingestion queue for a local
knowledge-curator agent to pick up.

## Trust tiers

| Tier | Meaning |
| ---- | ------- |
| T1 | Microsoft Learn (official docs) |
| T2 | Fabric product blog |
| T3 | Microsoft GitHub / samples |
| T4 | MVP / community |
| T5 | Vendor |
| T6 | Unknown |

Lower numbers are more trusted. Pick honestly — the tier travels with every claim the source
produces and shows on every citation and on the Sources page.

## The queue lifecycle

Queued URLs appear in the **Settings → Queue** table with one of these statuses:

- **queued** — waiting for an ingestion run.
- **claimed** — an ingestion run has picked it up.
- **complete** — done; the source and its pending claims are now in the knowledge base.
- **failed** — something went wrong (the note explains what); **requeue** puts it back in
  line, **dismiss** drops it.

## After it's queued — what happens next

1. **Ingest** — a contributor opens the repo in Claude Code or Codex and runs
   `/ingest-batch`. The knowledge-curator agent claims each queued item, reads the source,
   and extracts a handful of paraphrased claims tagged to a capability and depth — never
   copied text, and external images are linked with attribution, never re-hosted. The
   queue item moves to **complete** and the source appears on the Sources page.
2. **Verify** — the new claims arrive as **pending**. An admin approves them in
   **Settings → Claims**, one at a time or with **Verify all** for a whole capability at
   once. Until a claim is verified, no article, design, or lesson can cite it.
3. **Publish into content** — once verified, the claims are available to the blog-author,
   solution-architect, and learning-author agents. Running `/blog`, `/design`, or `/lesson`
   drafts a cited article, design, or lesson from the new knowledge; an admin then pastes
   the resulting file into **Settings → Publish**, which always creates a new version rather
   than overwriting anything.
4. **Commit** — ingestion wrote `content/sources/<slug>.json`; commit it to git so the
   knowledge is reproducible on any environment.

If an item is marked **failed**, the note explains why (usually an unreachable URL);
**requeue** tries again, **dismiss** drops it.
