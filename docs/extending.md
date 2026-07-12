# Extending Fabric Atlas

This is the map of every extension point. The golden rule first:

> **The capability registry is the spine.** Claims tag to capabilities, the learning
> portal is a view over capabilities, designs retrieve by capability, coverage is per
> capability. Anything you add should hang off it.

And the two non-negotiables: **nothing enters the knowledge base without a source, a
trust tier, and human approval**, and **all source text is fully paraphrased** (quotes
under 15 words, one per source, attributed — never copied tables or structure).

---

## 1. Add content (the most common extension)

Authoring is local (your IDE agents, your subscription); the server only stores and
serves. The flow:

```
/ingest <url-or-file> tier=<1-6>     # knowledge-curator writes content/sources/<slug>.json
python scripts/import_content.py     # publish: replays files into the running backend
Registry tab → Verify                # human approval — per claim, or "Verify all pending"
```

For many sources at once, add them to `content/queue.md` (one `<url> tier=<n>` per line)
and run `/ingest-batch` — the curator processes the queue sequentially and moves done lines
to the Done section. The Sources tab gets a "Verify N pending" button per source
(`POST /claims/verify-bulk`). Claims that near-duplicate an active claim from another source
are stored as `status=duplicate` (inactive) for human merge — see docs/data-model.md.

Or author the file by hand — the shape is one JSON file **per source**
(see `content/sources/example-direct-lake.json`):

```json
{
  "url": "https://learn.microsoft.com/fabric/...",
  "title": "Page title",
  "tier": 1,
  "summary": "Original short summary for readers.",
  "audience": "Who should read this source.",
  "why_it_matters": "Why this source matters to Fabric architecture or operations.",
  "takeaways": ["A concise original takeaway."],
  "tags": ["MicrosoftFabric", "OneLake"],
  "claims": [
    {
      "capability_id": "onelake",
      "text": "One atomic fact in your own words.",
      "depth": 3,
      "type": "fact",
      "tags": ["OneLake"]
    }
  ],
  "assets": [
    {
      "kind": "referenced",
      "url": "https://...png",
      "caption": "...",
      "attribution": "Microsoft Learn (© Microsoft)",
      "license_note": "External image; linked with attribution, not re-hosted.",
      "capability_id": "onelake"
    }
  ]
}
```

Field rules (enforced or silently dropped by the backend — `import_content.py` warns first):

| Field                                     | Rule                                                                                                                           |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `capability_id`                           | must be in the registry (`backend/app/llm.py` `CAPABILITY_IDS`) — unknown ids are **dropped**                                  |
| `depth`                                   | 1 conceptual · 2 practitioner · 3 architect · 4 performance · 5 internals                                                      |
| `type`                                    | `fact` \| `pattern` \| `antipattern` \| `internal`                                                                             |
| `tier`                                    | 1 MS Learn · 2 Fabric blog · 3 MS GitHub/papers · 4 MVP/community · 5 vendor · 6 unknown                                       |
| `summary` / `audience` / `why_it_matters` | original reader metadata only; do not copy article prose                                                                       |
| `takeaways`                               | 3-5 original, concise takeaways; no copied bullets from the source                                                             |
| `assets[].kind`                           | `referenced` (external image: url + attribution, never re-hosted) or `generated` (original SVG/Mermaid in `content/diagrams/`) |

Re-running the import on an existing source is safe — the backend treats it as a drift
check (versions changed claims, deprecates removed ones, flags citing designs). If claim
texts are unchanged but reader metadata changed, the active source metadata is updated
without creating new claim versions.

## 2. Add a capability

The registry intentionally lives in a few explicit places. Touch all of them:

1. **`backend/app/llm.py` → `CAPABILITY_IDS`** — the enforcement copy. Claims with ids
   not in this list are dropped at ingest. (`scripts/import_content.py` derives its
   pre-flight check from this file, so it stays in sync automatically.)
2. **`frontend/src/App.jsx` → `CAPABILITIES`** — display name + area grouping for the
   Registry grid and Overview links.
3. **`.claude/agents/knowledge-curator.md`** and **`.codex/prompts/fa-ingest.md`** — the
   id lists the authoring agents are prompted with.
4. Optionally seed it: `/ingest <an official overview page> tier=1`, publish, verify.

Restart uvicorn after 1. Areas in the frontend are free-form strings — a new area name
creates a new section automatically.

## 3. Theme and visual changes

### Interactive diagram contract

Registered diagrams render through the typed React/SVG catalog in `src/diagrams/`. Author stable
nodes and directed edges with layers, walkthrough steps, classifications, source keys, risks, and
valid Atlas drill targets. The file under `content/diagrams/` is a script-free print/no-JavaScript
fallback, not an executable asset. Run `npm run validate:diagrams` and `npm run validate:content`
before publishing; a changed fallback hash or incomplete review clears ready-to-share status.

Tooltips must be supplemental: keyboard or touch selection opens the same persistent inspector.
Every hotspot must add evidence, explanation, navigation, or decision support.

All theming is in **`frontend/src/theme.js`**:

- `themes.light` / `themes.dark` — token maps (Fluent neutrals + the Fabric brand ramp
  sampled from the official Fabric product icon: `#117865` teal, `#2AAC94` jade,
  `#25FFD4` mint, `#063D3B` ink).
- Components style against `c.<token>` which resolves to `var(--<token>)`; `applyTheme()`
  flips every token at once. **To add a color: add it to both maps, then use `c.name`.**
  Component code never hardcodes hex values.
- `BRAND` holds the raw ramp for gradients and the logo mark.
- `frontend/index.html` sets `data-theme` before first paint (no flash); keep its two
  background rules in sync if you change `bg`.

Licensing note: Microsoft's icon terms allow Fabric icons inside architecture diagrams
but **not** as a third-party app's logo — that's why the header uses an original mark
(`AtlasMark` in App.jsx) drawn with the brand palette.

## 4. Add a view (tab)

In `frontend/src/App.jsx`: add `["my-tab", "My Tab"]` to the `tabs` array in `App`, a
component for it, and a branch in the tab switch. If it calls a new backend path, add
that path to the proxy list in `frontend/vite.config.js`.

## 5. Add an API endpoint

- Routes are thin (`backend/app/routers.py`); invariants live in `backend/app/services.py`.
  Follow that split.
- **If you touch `backend/app/models.py`, update `docs/data-model.md` in the same commit**
  — the claim version chain is the load-bearing concept; read that doc before changing it.
- The server stays deterministic in `LLM_MODE=local` (the default): no LLM calls, no key.
  LLM-on-server behaviour belongs in `llm.py` behind the `api` mode.

## 6. Add an agent or skill

Agents are markdown prompts in `.claude/agents/` (Claude Code) and `.codex/prompts/`
(Codex), wired to slash commands in `.claude/commands/`. Before adding one, re-read the
non-goals in `CLAUDE.md`: an agent here is _retrieval scoped to capabilities + a focused
prompt_ — no agent mesh, no mega-prompt. Add a new agent only when a concrete need forces
it; copy the structure of an existing one (inputs → method → hard rules → output).

Agents POST through the local backend (`http://localhost:8000`) via curl, never direct
DB writes — the backend owns versioning and validation invariants.

## 7. Diagrams

Always **original** artwork (the diagram-author agent, or by hand): Mermaid or SVG into
`content/diagrams/`, registered as a `generated` asset (`POST /assets` or the `assets`
array of a source file). Diagrams shown in the web UI must be **SVG** (it renders them via
`<img>`). Standalone capability diagrams (no source/design parent) also belong in the
git-tracked manifest `content/diagrams/assets.json` — `import_content.py` replays it
idempotently so a fresh server gets the diagrams back. The Registry tab shows a
capability's generated diagrams above its claims. Never copy or re-host source images —
reference them with attribution instead. The platform overview on the Overview tab is
`content/diagrams/fabric-platform-overview.svg`; it renders from the asset registered on
the `fabric-platform` capability, falling back to that static path.

## 8. Lessons

Verify claims first (lessons may only use approved claims), then `/lesson <capability>
<Beginner|Intermediate|Expert>` writes `content/lessons/<slug>.md`. Levels map to depths:
Beginner=L1–L2, Intermediate=L3, Expert=L4–L5. The Learn tab lists whatever is in
`content/lessons/` via `GET /lessons/files` — no registration step.

## 9. Publish to a real server

```
python scripts/import_content.py --base https://atlas.example.com   # replay content/
```

Content files in git are the source of truth; any server can be rebuilt from them. For
scale, point `DATABASE_URL` at Postgres (see `docs/data-model.md`). Keep `LLM_MODE=local`
on servers — they should never need an API key.

## 10. Ask the adviser

`/advise <question>` runs the **fabric-advisor** agent: an expert Q&A view over the same
knowledge base. It retrieves claims scoped to the capabilities the question touches, answers
with `[Sn]` citations and a source legend, labels its own reasoning _(inference)_, and — when
the KB has no coverage — says so and recommends what to `/ingest` instead of guessing.

The same grounded answer is available as an endpoint: `POST /advisor/chat` ({message,
capabilities, history}) runs the identical retrieval server-side and returns a cited answer.
It needs `LLM_MODE=api` + a key (the Lovable chat UI calls it); in local mode use the `/advise`
skill, which runs the retrieval on the laptop without a server-side key.

## 11. Keeping content fresh

`/drift <source-key>` re-extracts a source, diffs claims, supersedes changed ones, and
flags every design **and blog** citing that source as `needs_review`. Run it when Microsoft
updates a doc, or on a schedule. The coverage-auditor agent (`what are we missing?`) reports
capability × depth gaps — thin L4/L5 coverage is the usual finding.

## 12. Search

`GET /search?q=&kind=&tag=&capability=` is served by `backend/app/search.py`: a unified
Postgres **tsvector** index (`search_doc`) over claims, sources, blogs, and topics, queried
with `websearch_to_tsquery` ranked by `ts_rank` and snippeted with `ts_headline`. Content rows
are append-only, so the index only ever receives INSERTs at creation time; results are hydrated
from the live tables at query time, which is why status flips (verify, supersede, needs_review)
never need reindexing. `POST /search/rebuild` repopulates from scratch (also runs automatically
at startup when the index is empty). The SQLite test DB has no `search_doc` and degrades to a
live LIKE scan.

Upgrade path:

- **Semantic (server)**: enable pgvector, add an `embedding vector(N)` column, compute
  embeddings at publish time, and rank by vector distance. Query embeddings either client-side
  (transformers.js, pin the model) or via a dedicated embedding sidecar — never the FastAPI
  process itself.
