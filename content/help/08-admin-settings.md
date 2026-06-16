# Admin settings

The **Settings** area is visible only to approved admins. It is for operational maintenance:
users, source review, content metadata, claim moderation, article versions, validation, queue
work, and audit logs.

## Users

Admins can invite users by email, approve them, assign roles, suspend access, and revoke or
expire pending invitations. A signed-in user must have `profiles.status = approved` before they
can enter authenticated areas or call trusted server functions.

Roles live in `user_roles`; approval state lives on `profiles`. Every role and approval change
writes an admin audit event.

## Content

The Content tab edits metadata for sources, topics, capabilities, Help pages, and diagrams.
Source rows also have a **Review** action that queues the source for drift or re-ingest work.

Claim text is never edited in place. Use **Supersede** to create a new pending claim version;
the old row becomes inactive history. Use **Verify**, **Reject**, **Promote**, or **Dismiss**
for moderation.

Articles are also append-only. **Edit as new version** creates a draft version and preserves
citations by default. A version cannot be created without at least one cited source.

## Validation and queue

Use **Validate** on articles and designs to run the deterministic validation pass. Queue items
can be claimed, completed with a resulting source id, failed with a note, requeued, or dismissed.

## Source of truth

`content/` remains the canonical authoring and export format. If Settings changes DB content
that should survive a fresh environment, export it back to `content/` before treating it as
source-controlled truth. Use `python scripts/import_content.py --dry-run` before publishing.
