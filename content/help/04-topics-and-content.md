# Topics and articles

The **Topics** page is the reading portal. Topics form a nested tree (areas → topics →
sub-topics, any depth); each topic maps to one or more capabilities in the registry and can
carry one long-form, cited **article**.

## Reading the tree

- A **number** next to a topic is how many verified claims back it — the raw material an
  article is built from.
- A **dot** means the topic has an article; its colour is the article's status (green
  validated, amber draft/checked, red needs review).
- Click a topic to see its description, mapped capabilities (jump straight to the Registry),
  its article card, and its sub-topics for drilling further.

## Reading an article

Articles open at `Topics → <topic> → Read the article`. What the badges mean:

- **validated** — a full validation pass ran (grounding, coverage, anti-patterns) on top of
  the deterministic citation and freshness checks.
- **checked** — only the deterministic checks ran so far.
- **draft** — published but not yet validated.
- **needs review** — a source behind the article changed; a red banner explains this. Treat
  the article with care until it is re-validated.
- **confidence** — a score computed from validation findings (critical issues weigh most).
- **✓ validated & ready** — full pass, no critical issues.

Every factual sentence carries an `[Sn]` chip — hover it for the source title and tier, and
see the **Sources cited** legend at the end of the article. Statements that are the
author's synthesis rather than verified fact are explicitly labelled *Inference:*.
Sections only exist where verified claims support them — a topic with no performance
claims simply has no performance section, by design.

## Versions

Articles are never edited in place. Republishing a topic creates a new version and retires
the old one; the **version history** link at the bottom of an article shows the chain.

## Adding or changing topics

Topics live in two places that stay in sync:

- **The seed file** — `content/topics.json` in the repo is the source of truth. Add a node
  with a unique `slug`, a `name`, at least one `capability_ids` entry, and optionally a
  `parent_slug` (any nesting depth) and `order`. Then run
  `python scripts/import_content.py` — existing slugs are skipped, new ones are created.
- **The API** — for live curation, `POST /topics` creates a node and `PATCH /topics/<id>`
  renames, re-describes, re-orders, re-parents, or re-maps capabilities. Topics are
  curation surface, not knowledge, so they can be edited in place (unlike claims and
  articles). Mirror any API change back into `content/topics.json` so a fresh server
  seeds the same tree.

Every topic must map to at least one capability from the registry — that mapping is where
its claims, coverage numbers, and article grounding come from.

## Generating an article

Articles are authored by agents in the IDE, never by the server:

- `/blog <topic-slug>` — the blog-author reads the topic's verified claims, writes a cited
  article (`content/blogs/<slug>.json`), publishes it, and the validation-reviewer
  immediately checks it. Use this when the topic already has verified coverage.
- `/publish-topic <topic-slug>` — the full chain: coverage check (suggests sources to
  queue if the topic is thin), a stop for human claim verification, an original diagram,
  the article, validation, and a Help-section sync. Use this for a topic starting cold.

If a topic has too few verified claims, the blog-author **refuses and reports the gap**
instead of writing filler — queue more sources for it (see *Submitting sources*), verify
them, and run it again. To refresh an existing article after new claims arrive, just run
`/blog <topic-slug>` again — the new version supersedes the old one with full history.
