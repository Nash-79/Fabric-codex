# Topics and content

**Topics** is the reading portal. Topics form a nested tree (areas → topics → sub-topics, any
depth). Each topic can be linked to one or more capabilities in the Capability Registry, and
each topic gathers whatever **content** — articles, designs, and lessons — has been written
about it.

## The topic tree

A collapsible tree sits on the left of the Topics page, a topic's own page, and every content
detail page. It starts as a narrow icon rail; hover it (or click the pin icon) to expand it
into the full topic hierarchy. When you're viewing a topic or a piece of content, the tree
auto-expands the chain of ancestor topics down to the one you're on, so you always know where
you are.

The main Topics page also shows top-level areas as cards, each listing its sub-topics with a
short description — a faster way to scan the whole map before drilling in.

## A topic page

Open any topic to see its description, the capabilities it's mapped to (each is a link into
the Capability Registry), a **Content** section, and its subtopics.

The **Content** section lists everything published about this topic — articles, designs, and
lessons together, each tagged with a kind pill (Article / Design / Lesson) so you can tell
them apart at a glance. Click any row to open it.

## Reading a piece of content

Every article, design, and lesson opens at `/content/<kind>/<slug>` — the same surrounding
layout regardless of kind, with the topic tree on the left, a table of contents in the
middle-left rail, and the citation list on the right.

- The kind pill at the top tells you whether you're reading an **article**, **design**, or
  **lesson**.
- Reading time, number of sources, and (if any are embedded) number of diagrams are shown
  under the title.
- A **preview** badge appears if the content touches a capability that is still in preview.
- Every factual sentence carries an `[Sn]` chip — hover it for the source title and tier, and
  see the citation list on the right for the full legend.

Sections only exist where verified claims support them — a topic with no performance claims
simply has no performance section in its article, by design.

The opening block right under the title varies a little by kind, when the piece has the
relevant detail filled in to show:

- **Designs** may show a **Scenario** summary and a **Constraints** list right up top, before
  the write-up itself — the situation the design was built for and the limits it was designed
  around.
- **Lessons** show their level (Beginner / Intermediate / Expert), an estimated time to work
  through them, and a **What you'll learn** list of objectives, plus **Prerequisites** where
  the lesson names any.
- **Tutorial-style articles** may show a **Before you start** list and an **Outcome** summary
  the same way.

If a piece doesn't have that detail filled in, this block simply doesn't appear — you go
straight from the title into the write-up, same as always.

## Step-by-step walkthroughs

Some articles and tutorials — the ones that walk you through actually doing something, not
just explaining a concept — present part of the text as a numbered sequence of connected step
cards instead of plain paragraphs, so you can see at a glance how many steps there are and
where you are in them.

If you like, you can click the circle on a step to check it off as done; it turns into a
checkmark. This is remembered only on your own browser, not on your account — it resets if
you clear site data or switch devices — so treat it as a personal progress marker rather than
something anyone else can see.

A walkthrough is often followed by a **Checkpoint** callout describing what you should see if
you followed the steps correctly, so you can confirm you're on track before moving on.

## Callouts

Beyond the checkpoint mentioned above, articles, designs, and lessons use a small set of other
labeled callout boxes: **Note**, **Tip**, **Warning**, **Important**, **Before you start**,
**Expected result**, **Key takeaway**, and **Definition**. One more —
**Inference (not a sourced fact)** — is the visible marker for the rule that generated text
must label its own inferences: anything in that box is the author's reasoning from the cited
claims, not a claim with its own citation. Some content also includes a **Try it** box that
stays collapsed until you click it to reveal a worked answer or example.

## Interactive diagrams

Diagrams embedded in content aren't static pictures. Click or tap a region — a box, a
component, a step in the flow — to open a detail panel with a plain-language explanation of
that part, the evidence and citations behind it, and, where the diagram has it, a worked
example, the controls that affect it, and what happens when it fails. Hovering a region (or
moving keyboard focus to it) shows a quick preview tooltip even without clicking.

Open a diagram in its zoom view (the button in its corner) to pan and zoom freely, and — when
the diagram offers one — start a **guided walkthrough** that steps through its parts in order
with Next/Previous controls, highlighting one region at a time instead of leaving you to find
your own way around. Some diagrams also let you filter which layers are shown, or jump
straight to a related diagram, topic, capability, or piece of content from inside the detail
panel.

## Lessons: objectives, time, and completion

Every lesson states its level, an estimated time to work through it, and what you'll be able
to do afterward (its objectives, and sometimes prerequisites) — shown at the top of the
lesson, and again as a short summary on its card on the **Learn** page. A **Mark complete**
button on the lesson lets you check it off; completed lessons then show a checkmark on their
Learn page card too. Like step completion, this is remembered on your own browser only — a
personal tracker, not something synced to your account or visible to anyone else.

## Reporting an issue

Every piece of content has a **Report an issue** button, plus a small feedback dot next to
each section heading (shown on hover, or always visible on touch) so you can flag a specific
section instead of the whole piece. Pick a category — factual error, outdated, unclear,
broken link/diagram, or missing citation — and describe what's wrong; quoting the exact
sentence helps. You do not need to be signed in to report an issue.

A report never edits the content directly. It's reviewed — with agent assistance that checks
the report against the article's actual text and citations before a human acts on it — and,
when it's actionable, routed into the normal ingestion/curation pipeline like any other
editorial work.

## Versions

Publishing an article, design, or lesson always creates a **new version** — it never
overwrites the previous one in place. When an admin republishes a slug from **Settings →
Publish**, the prior active version is archived (its slug becomes `<slug>@v<N>` and its
status changes to `superseded`) and the new version becomes active. This applies to all three
kinds equally.

## Adding or changing topics

- **The seed file** — `content/topics.json` in the repo is the authoring source of truth for
  bootstrapping a fresh environment. Add a node with a unique `slug`, a `name`, an optional
  `description`, and optionally a `parent_slug` (any nesting depth) and `sort_order`.
- **Settings → Content → Topics** is where an admin edits a topic live: name, description,
  parent (re-parenting), sort order, active flag, and tags. This is a metadata edit, not a
  knowledge change, so it applies immediately — unlike claims and content, topics can be
  edited in place. If a live edit should survive a fresh environment, mirror it back into
  `content/topics.json`.

A topic's link to capabilities is what makes its claims and coverage numbers show up — a
topic with no mapped capabilities has no claims to draw on, even if its slug is spelled
correctly everywhere.

## Generating content for a topic

Articles, designs, and lessons are authored by agents in the IDE, never by the server:

- `/blog <topic-slug>` — the blog-author reads the topic's verified claims and writes a cited
  article to `content/articles/<slug>.json`.
- `/design <scenario>` — the solution-architect drafts a cited design to
  `content/designs/<slug>.md`, expected to set a `topic_slug` so it shows up on the right
  topic page (older designs published before this existed may show as Uncategorized until an
  admin re-links them).
- `/lesson <capability-id> <level>` — the learning-author writes a tiered lesson to
  `content/lessons/<capability>-<level>.json`.
- `/publish-topic <topic-slug>` — the full chain for a topic starting cold: a coverage check,
  a stop for human claim verification, at least two original diagrams, the article, and
  validation.

If a topic has too few verified claims, these agents **refuse and report the gap** instead of
writing filler — queue more sources for it (see _Submitting sources_), verify them, and run
the command again. Whatever the agent writes still has to be pasted into **Settings →
Publish** by an admin before it goes live; that step is what actually creates the new
version.
