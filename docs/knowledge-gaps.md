# Knowledge gaps — how Fabric Atlas tracks what it doesn't know

Fabric Atlas admits ignorance in prose rather than inventing depth. This doc defines the model
that keeps those admissions honest. It deliberately contains **no counts and no gap lists** —
those are generated, never committed, so they cannot drift.

## The three-layer model

| Layer | What it is | Where it lives |
|---|---|---|
| **Truth** | The marker in the document body — a labeled placeholder inside an `## Internals` sub-heading | `content/articles/*.json`, `content/designs/*.json` (`body_md`) |
| **Ledger** | The routing entry that turns a gap into ingestion work | `# internals gap: <slug> / <sub-heading> — NEEDS SOURCE: … tier=<n>` lines in `content/queue.md` |
| **View** | The derived inventory — run it, don't write it | `node scripts/gaps.mjs` (`--json` / `--brief` / `--markdown`), or `/gaps` |

There is **no committed gap document**. `node scripts/gaps.mjs --markdown > <path>` gives an
on-demand snapshot; committing one would create a fourth source of truth that drifts like the
rest. The generator (`scripts/lib/internals-gaps.mjs`, shared with CI) re-derives the inventory
from the files every run.

## The two markers

Both open the one-paragraph body of an Internals sub-heading. They are machine-separable and
mean different things:

- **`*Coming soon*`** — a **real gap**. Verified L4/L5 claims for this sub-heading don't exist
  yet, and ingesting a source would close it. Every `*Coming soon*` placeholder must have a
  matching `# internals gap:` line in `content/queue.md` so it routes into ingestion.
- **`*Workload-specific.*`** — **not a gap**. A true statement that a pattern/blueprint document
  has no universal number (performance depends on the reader's capacity, data shape, concurrency,
  freshness objective). Never queued — no source ingestion can close it, so a queue line for it
  would be permanently stale.

Queue-line format details the tooling relies on: the separator before `NEEDS SOURCE:` may be an
em-dash or hyphen; `all sub-headings` expands to the three canonical sub-headings
(`Architecture & design`, `How it works internally`, `Performance characteristics`); multiple
sub-headings join with `+`.

## What the guard fails vs warns on

`npm run validate:content` (run in both `ci.yml` and `publish-content.yml`) imports the same lib:

- **Fails CI (critical):**
  - a placeholder whose prose asserts ``Tracked in `content/queue.md` `` when no matching queue
    line exists — a provable lie in published prose;
  - a queue line with no corresponding placeholder — the gap is closed but the ledger still
    chases it (stale).
- **Warns (never blocks):**
  - an honest untracked `*Coming soon*` placeholder — add the queue line, but **honest gaps must
    never block a merge**;
  - an unparseable `# internals gap:` line.

`validation-reviewer` mirrors these severities at review time, and a placeholder itself never
blocks `ready_to_share`. `scripts/check-queues.mjs` prints an internals-gap drift line at
session start.

## Known open items (not covered by the generator)

Gaps in the knowledge base's *shape* rather than in Internals sections — resolve and delete:

- Topic `data-architecture` has no landing article (the only section node without one).
- `content/articles/investment-analytics-data-modelling.json` is orphaned from
  `content/topics.json` — reachable only via the global content list.
- Supabase holds the CoddSpeed SIGMOD paper as a source under two slugs
  (`coddspeed-gpu-warehouse` and `coddspeed-hardware-accelerated-query-processing-in-microsoft-fabric`);
  an admin should retire one (also noted in `content/queue.md`).
