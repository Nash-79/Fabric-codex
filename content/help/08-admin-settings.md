# Admin settings

The **Settings** area is visible only to approved admins (the nav's Settings link only
appears once a signed-in user's admin role is confirmed). It is organized into tabs:

## Users

Invite a user by email and starting role. Newly signed-up users appear with a status badge;
the checkmark action approves them (a user must be `approved` before they can use any
authenticated area). **Editor** and **Admin** buttons set roles; the X button suspends a
user. Pending invitations are listed separately and can be revoked or expired from there.

## Content

Edits metadata for **Sources**, **Topics**, **Capabilities**, **Help docs**, and **Diagrams**,
plus lists (read-only summary, linking to their own workflows) for **Designs**. Each list's
**Edit** button opens a dialog for that item's metadata fields (title, summary, description,
tags, etc.) — this is a direct, in-place edit, appropriate because it's metadata, not
knowledge.

- Source rows have a **Review** action that queues the source for a drift/re-ingest pass —
  it lands back in the Queue tab.
- Design rows have a **Validate** action (see _Validation and trust_) but their body text is
  still authored in `content/designs/` and republished, not edited here.

Claim text is never edited from the Content tab — that happens in **Claims**.

## Claims

The full claim moderation workbench: filter by status, **Verify**/**Reject**/**Promote**
individual claims, **Supersede** to create a new pending version of a claim's text, and
**Verify all pending in…** to batch-verify every pending claim in one capability. See
_Curation loop_ for the full behavior.

## Articles

A table of published articles with **Validate** (runs the deterministic checks and updates
the confidence/ready-to-share flag) and **Edit as new version** (opens a dialog to change
title, summary, body, and cited sources; saving creates a new published version — it never
mutates the existing row). A version cannot be saved without at least one cited source.

## Queue

**Queue a source URL** submits a new URL with a trust tier, tags, and a note — this is the
admin-side form described in _Submitting sources_. The table below lists every queue item
with its status and per-row actions: **claim**, **complete** (needs a resulting source id),
**fail** (needs a note), **requeue**, and **dismiss**.

## Publish

Paste an agent-authored JSON file here to replay it into the knowledge base. Choose the kind
— **Source (+ claims)**, **Article**, **Design**, **Lesson**, or **Diagram(s) / assets.json**
— and paste the corresponding `content/*.json` file. Re-publishing a source keeps its
verified claims and only refreshes the pending ones. Publishing an article, design, or
lesson **always creates a new version**; the previous version is archived, never overwritten.
For an article with a new embedded diagram, publish the diagram(s) first so the article's
embedded-diagram check passes.

## Diagrams

Lists registered diagrams with an **Edit** action for caption/kind/topic metadata, and lets
an admin **commission** additional diagrams for a topic at a chosen future time — this adds
an item to the same queue mechanism the ingestion queue uses, tagged for diagram work. A
laptop agent later drains due commissions with `/commission-diagrams`.

## Website Watchers

Add, test, pause, or delete watchers for RSS/Atom and JSON feeds, sitemaps, listing pages, or
individual pages. Auto mode detects the best available first-party mechanism. New URLs and
meaningfully changed known sources land in the Queue for human-reviewed ingestion; blocked sites
remain visible with a structured diagnostic instead of bypassing their anti-bot controls.

Some publishers challenge all datacenter traffic (Cloudflare and similar), so server-side polling
of an otherwise-working feed fails permanently. For those watchers, run
`node scripts/poll-watchers.mjs` on the authoring machine: it fetches the feed with the same
honest client identity, dedupes against the knowledge base and open queue, and appends new posts
to `content/queue.md` for the usual review + `/ingest-batch` flow. It never writes to the
database.

## Logs

A combined, filterable activity stream: admin actions (user approvals, role changes, topic
and source edits, publishes) and the claim status log (previous → new status) together,
searchable and filterable to one stream or the other.

## System

Read-only KPI dashboard: platform stats plus a live breakdown of capability maturity
(preview/GA/deprecated) and claim verification percentage, pulled from the same coverage data
that powers the Capability Registry page.

## Source of truth

`content/` remains the canonical, git-tracked authoring format. Settings edits happen
directly against the database; if a change should survive a fresh environment (a new topic,
an edited Help page, a re-parented topic), mirror it back into the matching `content/` file
before considering it durable.
