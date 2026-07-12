---
description: Generate the internals gap inventory from the files, then rank and route it (no committed gap document).
argument-hint: [focus]
---

Run `node scripts/gaps.mjs --json` for the deterministic facts — the gap inventory is **derived
from the files** (placeholders in `## Internals` sections vs `# internals gap:` lines in
`content/queue.md`), never hand-written, so it cannot drift. Then hand the JSON to the
**coverage-auditor** subagent to rank the gaps by architectural impact and route each one (source
to curate, queue line to add/narrow, depth to deepen)$ARGUMENTS.

Interpretation rules:

- `untracked` with `trackedAssertion: true` is a **provable lie in published prose** — the doc
  claims "Tracked in `content/queue.md`" but no line exists. Fix immediately (add the queue line);
  CI fails on it.
- `stale` means the gap is already closed — delete or narrow the `content/queue.md` line; CI fails
  on it.
- Honest `untracked` placeholders are warnings: add the missing `# internals gap:` line.
- `workloadSpecific` entries are **not gaps** — pattern docs that truthfully have no universal
  number. Never queue them.
- `publishedDrift` entries need a republish (push to main; `publish-content.yml` handles it).

For an on-demand snapshot file, `node scripts/gaps.mjs --markdown > <path>` — do not commit it;
the repo does not own its freshness. See `docs/knowledge-gaps.md` for the model.
