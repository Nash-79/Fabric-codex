# Curation loop

The **Registry** page is where humans control what the knowledge base asserts.

## Claim states

- **pending** — freshly extracted, awaiting your judgement.
- **verified** — you approved it; it can now ground articles, designs, and lessons.
- **rejected** — you dismissed it (wrong, irrelevant, or unverifiable).
- **duplicate** — near-identical to an active claim from another source; parked for review.
- **superseded / deprecated** — replaced or removed when its source changed; kept as history.

## Working the queue

Pick a capability card (or a tag) to open its claim list. Each pending claim has
**Verify** and **Reject** buttons; reject asks for a second click to confirm. When more
than one pending claim is shown, **Verify all** / **Reject all** batch the action — they
arm for three seconds first so a stray click does nothing.

Every action shows an **Undo** toast for five seconds; undo returns the claims to pending.

## Duplicates

When the same fact arrives from a second source, the newer claim is parked as a
**duplicate** instead of entering the verify queue. Open the duplicates panel to either
**Promote** it (it really is new information — send it to the verify queue) or
**Dismiss** it (confirm it duplicates what you already have).

## Audit log

The **Recent actions** panel lists every verify/reject/promote/dismiss with the previous
and new status, filterable by capability and action type. Claim **History** shows the full
version chain of any claim — versions are never edited in place.
