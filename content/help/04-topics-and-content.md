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

Every article, design, and lesson opens at `/content/<kind>/<slug>` — the same reading layout
regardless of kind, with the topic tree on the left, a table of contents in the middle-left
rail, and the citation list on the right.

- The kind pill at the top tells you whether you're reading an **article**, **design**, or
  **lesson**.
- Reading time, number of sources, and (if any are embedded) number of diagrams are shown
  under the title.
- A **preview** badge appears if the content touches a capability that is still in preview.
- Every factual sentence carries an `[Sn]` chip — hover it for the source title and tier, and
  see the citation list on the right for the full legend.

Sections only exist where verified claims support them — a topic with no performance claims
simply has no performance section in its article, by design.

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
