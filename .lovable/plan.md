## Problem (two bugs, one symptom)

Pending claims reappear after refresh / redeploy because the **content re-seed path is destructive**, not because verification failed to persist. And there is no single-click "verify every pending claim" — only per-capability bulk verify.

Reference: prior discussion at https://lovable.dev/projects/c635fb0f-b182-43cf-a5a9-f5020dd068e3?messageId=main%3Aagent%2300000000090459%23ast%3APDFSAFQN

### Bug 1 — Re-seed deletes verified claims

`src/lib/seed-content.server.ts:168` and `src/lib/seed.functions.ts:170-174` both do:

```ts
await supabaseAdmin.from("claims").delete().eq("source_id", ins.id); // ALL statuses
// then insert everything from content/*.json as status='pending'
```

The correct pattern already exists in `src/lib/atlas-publish.services.server.ts:146-166` (single-source publish):

```ts
// delete only pending, then insert fresh pending; verified/rejected/superseded survive
.delete().eq("source_id", ...).eq("status", "pending")
```

The cron webhook `/api/public/hooks/seed-content` calls `runContentSeed` on every content-signature change, so any edit to `content/sources/*.json` currently nukes curation for that source. The signature-skip helps but does not fix the root cause.

### Bug 2 — No global bulk verify

`bulkVerifyClaims` in `src/lib/atlas-admin.services.server.ts:58` requires `capabilityId` or `topicSlug`. The Claims panel only exposes a per-capability dropdown. There is no "verify every active pending claim".

## Changes

### 1. Make re-seed preserve curation

Edit both seed paths to mirror the publish path:

- `src/lib/seed-content.server.ts` around line 168 — replace the blanket delete with a pending-only delete, then insert only claims whose `(source_id, capability_id, normalized text)` do NOT already exist as verified/rejected/superseded (so the same text isn't re-inserted as pending alongside a verified copy).
- `src/lib/seed.functions.ts` around line 170 — same treatment; rename `sourceClaimsDeleted` → `sourcePendingClaimsDeleted` in the summary shape.

Dedup rule (avoids "verified copy + new pending duplicate"): before insert, fetch existing non-pending claims for that `source_id`, key by `(capability_id, trimmed lowercase text)`, and skip any incoming row that matches. This matches the intent of `scripts/replay_verified_status.py` and the `duplicate` status flow.

### 2. Add global bulk verify

- `src/lib/atlas-admin.services.server.ts` — extend `bulkVerifyClaims` to accept `{ scope: "all" }` in addition to `capabilityId` / `topicSlug`. When `scope === "all"`, select every `active=true, status='pending'` claim id and run through `mutateClaimStatus` (keeps the claim-event audit log intact — no shortcut UPDATE).
- `src/lib/settings.functions.ts` — expose the new input shape through the existing `bulkVerifyClaims` server-fn validator.
- `src/components/settings/ClaimsPanel.tsx` — add a second button next to the existing per-capability control: **"Verify all N pending"** (N = total pending+active count derived from the same `claims` query already in the panel). Confirm dialog with the count. Disabled when N = 0. Uses the same `useMutation` + toast pattern.

### 3. Persistence end-to-end after fix

Verified claims will survive:

- manual Settings → Publish (already correct)
- cron `/api/public/hooks/seed-content` re-runs (fixed here)
- `seedFromContent` server fn from Settings → System (fixed here)
- redeploy (deploy doesn't touch DB; only cron/seed does)

No migration needed — the `claims.status` column already persists correctly; only the seed writer was wiping it.

## Non-goals

- No schema changes, no RLS changes, no new tables.
- No change to `mutateClaimStatus`, `supersedeClaim`, or the claim-events log.
- No change to the per-capability bulk verify (kept as-is next to the new button).
- No auto-verify on ingest — human gate stays.

## Verification

1. Seed a fresh source, verify a claim in Settings → Claims.
2. Edit `content/sources/<slug>.json` summary, POST to `/api/public/hooks/seed-content` with `force: true`. Confirm the verified claim is still `verified` and no duplicate pending row appeared.
3. Click **Verify all N pending** — all pending+active claims flip to verified, claim-events rows appear, toast shows count.
4. Refresh the page and redeploy preview — counts persist.
5. `bun run tsgo` clean.

## Files touched

- `src/lib/seed-content.server.ts` (pending-only delete + dedup skip)
- `src/lib/seed.functions.ts` (same)
- `src/lib/atlas-admin.services.server.ts` (`scope: "all"` branch)
- `src/lib/settings.functions.ts` (validator)
- `src/components/settings/ClaimsPanel.tsx` (Verify-all button)
