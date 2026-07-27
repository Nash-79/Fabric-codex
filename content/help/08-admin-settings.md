# Admin settings

The **Settings** area is visible only to approved admins (the nav's Settings link only
appears once a signed-in user's admin role is confirmed). Its tabs are grouped into People,
Knowledge, Published, Pipeline, and System.

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

## Diagrams

Lists registered diagrams with an **Edit** action for caption/kind/topic metadata, and lets
an admin **commission** additional diagrams for a topic at a chosen future time — this adds
an item to the same queue mechanism the ingestion queue uses, tagged for diagram work. A
laptop agent later drains due commissions with `/commission-diagrams`.

## Feedback

Every reader-submitted "Report an issue" note lands here, newest first, with its category
(factual error, outdated, unclear, broken link/diagram, missing citation), the section it was
attached to, and its status (new / triaged / actioned / dismissed). Reports on the same
article and section are grouped with a count so a repeated complaint stands out.

Feedback is triaged locally, not on the server: run the `/triage-feedback` command, which
checks each new report against the article's actual text and citations and writes a
structured verdict file. Paste that file's contents into **Apply triage results** here to
post each verdict's status and AI analysis back to the matching row. Once triaged, a row can
be marked **actioned** (if it fed into a fix) or **dismissed**.

## Pipeline → Overview

A single dashboard of the whole discover-to-publish journey: active watchers, open/failed/
ingested queue work, published sources, claims awaiting verification vs. verified, and live
articles — each stage tile jumps straight to its own tab. Below it, the full operator
sequence (reserve → extract locally → publish and link → verify) and shortcuts to run the
blog/design prompts on newly verified knowledge. A **Needs attention** list surfaces failing
watchers, failed queue items, and a pending-claims backlog, and a **Suggested next actions**
list ranks concrete next steps with a copyable command for each.

## Pipeline → Article Ideas

Generated candidate ideas for new articles or lessons, fused from the Fabric roadmap,
coverage gaps, reader feedback, and stale articles. **Auto-generate** produces ideas from all
of those signals at once; **Generate from prompt** takes an admin-supplied topic or direction
instead (still checked against real grounding before being kept). Each idea shows its signal
type, target content kind (article or lesson), a rationale, and — once expanded — a
ready-to-copy local command (`/blog`, `/lesson`, or their Codex equivalents) that a
contributor runs to actually author it.

An idea can be **approved** (marks it claimed so a human can author it), **amended** (edit its
title, target slug, angle, rationale, length, or diagram guidance before it's authored), or
**dismissed**. A dismissed idea can be **revived** back to the queue and re-approved later.
Once an idea has actually been authored, its brief is frozen.

## Pipeline → Watchers

Add, test, pause, or delete watchers for RSS/Atom and JSON feeds, sitemaps, listing pages, or
individual pages. Every watcher is always auto-mapped and must pass a server-side discovery test
before it can be added. Polling tries the retained successful endpoint first, then falls back in
order through feed, sitemap, listing, and single-page monitoring. The first strategy returning
safe in-scope output becomes the retained mapping for the next poll; it is a performance hint, not
a permanent lock. New URLs and meaningfully changed known sources land in the Queue for
human-reviewed ingestion.

**Test and detect** previews the winning strategy, resolved endpoint, sample count, and every
attempt made. A single page is valid output: its normalized content fingerprint is monitored and a
review is queued only when it changes. Fetch/parse errors, empty results, and out-of-scope results
fall through to the next strategy. If every strategy fails, creation is refused with structured
diagnostics rather than saving a watcher that cannot currently be polled.

Some publishers challenge all datacenter traffic (Cloudflare and similar), so server-side polling
of an otherwise-working feed fails permanently. For those watchers, a contributor runs
`node scripts/poll-watchers.mjs` on their own machine: it uses the same retained-first fallback
hierarchy with the same honest client identity, dedupes against the knowledge base and open queue,
and appends new posts to `content/queue.md` for the usual review + `/ingest-batch` flow.

## Pipeline → Queue

**Queue a source URL** submits a new URL with a trust tier, tags, and a note — this is the
admin-side form described in _Submitting sources_. The table below lists every queue item
with its status and per-row actions: **reserve** (stored as `claimed`), **complete** (needs a
resulting source id), **fail** (needs a note), **requeue**, and **dismiss**. Checking multiple
still-queued rows and clicking **Reserve selected** claims them all in one action instead of
one row at a time.

**Reserve does not extract the source or create claims.** The complete sequence is shown in
**Pipeline → Overview**: reserve → extract locally → publish Source (+ claims) → link the
queue item to the result source → verify pending claims. The same overview then routes verified
knowledge into a new or augmented article, a solution architecture, or a reusable data
architecture pattern. Both architecture outputs are currently published as **Design**; pattern
designs use the `DataArchitecture` and `ArchitecturePattern` tags.

## Pipeline → Publish

Paste an agent-authored JSON file here to replay it into the knowledge base. Choose the kind
— **Source (+ claims)**, **Article**, **Design**, **Lesson**, or **Diagram(s) / assets.json**
— and paste the corresponding `content/*.json` file. Re-publishing a source keeps its
verified claims and only refreshes the pending ones. Publishing an article, design, or
lesson **always creates a new version**; the previous version is archived, never overwritten.
For an article with a new embedded diagram, publish the diagram(s) first so the article's
embedded-diagram check passes.

## Pipeline → Roadmap

Mirrors the public Microsoft Fabric roadmap (via a community mirror API) so upcoming
capabilities can inform article ideas and coverage planning. **Poll now** syncs the latest
items; each shows its status, release type, target release, and publish date, and can be
mapped to a capability with a dropdown so its signal counts toward that capability's
planning. Canonical Microsoft blog links found during the poll are queued as sources and
auto-claimed, but their extracted claims still go through normal human verification like any
other source.

## Logs

A combined, filterable activity stream: admin actions (user approvals, role changes, topic
and source edits, publishes) and the claim status log (previous → new status) together,
searchable and filterable to one stream or the other.

## System

Read-only KPI dashboard: platform stats plus a live breakdown of capability maturity
(preview/GA/deprecated) and claim verification percentage, pulled from the same coverage data
that powers the Capability Registry page.

## System → Migrations

A read-only health check for the database schema: which checks pass, warn, or fail, the
latest applied migration, and a list of recently applied migrations. Useful for confirming a
deploy landed cleanly, not a place to run or author migrations.

## Source of truth

`content/` remains the canonical, git-tracked authoring format. Settings edits happen
directly against the database; if a change should survive a fresh environment (a new topic,
an edited Help page, a re-parented topic), mirror it back into the matching `content/` file
before considering it durable.
