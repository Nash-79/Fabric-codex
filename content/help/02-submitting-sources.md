# Submitting sources

The **Sources** page has an **Add a source** form: paste a URL, pick a trust tier, and
optionally add tags and a note for the curator. Submitting does not ingest anything by
itself — it queues the URL for the local knowledge-curator agent.

## Trust tiers

| Tier | Meaning |
|------|---------|
| T1 | Microsoft Learn (official docs) |
| T2 | Fabric product blog |
| T3 | Microsoft GitHub / papers |
| T4 | MVP / community |
| T5 | Vendor |
| T6 | Unknown |

Lower numbers are more trusted. Pick honestly — the tier travels with every claim the
source produces and shows on every citation.

## The queue lifecycle

Submitted URLs appear in the **Ingestion queue** panel with one of these states:

- **queued** — waiting for an ingestion run.
- **claimed** — an ingestion run has picked it up.
- **ingested** — done; the source and its pending claims are now in the knowledge base.
- **failed** — something went wrong (the error is shown); use **Retry** to requeue or
  **Dismiss** to drop it.

Duplicates are rejected at submission time: if the URL is already in the knowledge base or
already queued, the form tells you instead of creating a second copy.

## What happens after /ingest-batch

A contributor runs `/ingest-batch` in their IDE. The knowledge-curator agent claims each
queued item, reads the source, and extracts 6–12 paraphrased claims tagged to a capability
and depth — never copied text, and external images are linked with attribution, never
re-hosted. The new claims arrive as **pending** and wait for human verification (see
*Curation loop*).
