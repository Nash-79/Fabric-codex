# Curation loop

Claim moderation happens in **Settings → Claims**, and is admin-only. The public
**Capability Registry** page shows the same coverage as a read-only dashboard — verified
counts, depth coverage, gaps — but has no moderation controls of its own.

## Claim states

- **pending** — freshly extracted, awaiting review.
- **verified** — approved; it can now ground articles, designs, and lessons.
- **rejected** — dismissed (wrong, irrelevant, or unverifiable).
- **duplicate** — near-identical to an active claim from another source; needs a decision
  before it can be cited.
- **superseded** — replaced by a newer version of the same claim; kept as history.

## Working the queue

The Claims table in Settings filters by status (pending / verified / duplicate / rejected /
superseded / all). Each row has row-level actions:

- **Verify** — approves a pending claim.
- **Reject** — dismisses it (or, for a duplicate row, dismisses the duplicate — the button
  reads Reject either way).
- **Promote** — only shown on **duplicate** rows; sends the claim back into the normal
  pending/verify flow because it turned out to be genuinely new information.
- **Supersede** — opens a dialog to edit the claim text. This does not edit the claim in
  place: it creates a new **pending** claim version and deactivates the current one.

When a whole capability has a backlog of pending claims, the **Verify all pending in…**
control at the top of the panel verifies every pending claim for one chosen capability in a
single action.

## Audit log

**Settings → Logs** shows a combined activity stream: admin actions (source review, topic
edits, publishes) and the claim-status log (previous status → new status, with a text
snippet) in one filterable, searchable list. Every claim status change is recorded here.
