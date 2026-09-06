# Fabric Codex

A source-grounded knowledge platform for Microsoft Fabric.

Approved sources become **versioned, trust-graded claims**, each tagged to a Fabric **capability**
and a **depth level**. Those claims feed cited articles, solution architectures and tiered lessons —
and every generated output is validated against the claims it cites.

**The capability registry is the spine.** Ingestion tags claims to capabilities, the reader is a
view over them, retrieval is scoped by them, and coverage gaps are visible per capability and
depth. Everything else hangs off that.

**Live:** https://fabric-codex.nmepani.workers.dev

---

## The rules that shape everything

1. **Every factual claim cites a source.** No source, no claim.
2. **Claims are versioned, never edited in place.** A change creates a new version whose
   `supersedes_id` points back; the old one is marked superseded.
3. **Trust tiers**, best to worst: T1 Microsoft Learn · T2 Fabric product blog · T3 Microsoft
   GitHub samples · T4 MVP/community · T5 vendor · T6 unknown.
4. **Depth levels:** L1 conceptual · L2 practitioner · L3 architect · L4 performance · L5 internals.
5. **Inference is labelled as inference.** Generated prose distinguishes verified fact from
   reasoning.
6. **Never invent product limits, quotas, or roadmap claims.**

These are enforced in code and in every agent prompt. See [CLAUDE.md](CLAUDE.md) for the full
contract.

---

## How it fits together

```
Approved source
      │  knowledge-curator (local agent, your IDE subscription)
      ▼
content/sources/<slug>.json ── cited, paraphrased claims
      │  git commit + push
      ▼
Settings → Publish  ── human-gated, service-role write
      ▼
Supabase (Postgres + pgvector + RLS)
      │
      ▼
Cloudflare Worker ── SSR reader, advisor, admin
```

**LLM work happens on your laptop, not the server.** Local agents extract claims and author
content; the deployed app stores, serves and runs deterministic checks. The one deliberate
exception is admin-triggered article-idea generation, which routes through the configured provider
chain.

Full detail: **[docs/architecture.md](docs/architecture.md)**.

---

## Repository layout

| Path | What it is |
|---|---|
| `src/` | TanStack Start app — SSR reader, advisor, admin. Deployed to Cloudflare Workers. |
| `supabase/migrations/` | The canonical schema. 56 migrations, replayable from scratch. |
| `content/` | Git-tracked authored knowledge: `sources/` `diagrams/` `articles/` `lessons/` `help/` |
| `scripts/` | Validators, the queue digest, watcher polling, hash regeneration. |
| `.claude/agents/` | 16 focused subagents (curator, architect, validator, diagram-author, …). |
| `.claude/commands/` | 16 slash commands that drive them. |
| `.codex/` `.gemini/` | The same contracts for other agent runtimes. |
| `docs/` | Architecture, data model, workflow, runbooks. Start at [docs/](docs/). |
| `langgraph/` | Unwired reference scaffold for a possible headless pipeline. Nothing calls it. |

---

## Quickstart

```bash
npm install
cp .env.example .env      # add your Supabase URL + publishable key
npm run dev               # http://localhost:8080
```

Optional local git cleanup after merges:

```bash
git config hooks.pruneMergedBranches true
```

When enabled, the post-merge hook prunes merged local branches whose upstream remote branch no
longer exists, and also prunes merged local-only branches (including branches never pushed).

Running against the deployed Worker locally:

```bash
npm run build
npm run preview:worker    # wrangler dev, exercises the real Workers runtime
```

### The checks CI runs

```bash
npm run typecheck              # tsc --noEmit
npm test                       # vitest
npm run lint                   # eslint + prettier
npm run validate:content       # internals-gap tracking, citation shape
npm run validate:diagrams      # sidecars, registered hashes, mirrors
npm run validate:diagram-layout  # headless render at 390/768/1280px
npm run verify:schema          # KB invariants against Supabase
```

`validate:diagrams` checks a **registered SHA-256 per SVG**. Editing a diagram means editing both
`content/diagrams/<slug>.svg` and its `public/diagrams/` mirror, then running
`node scripts/update-static-hashes.mjs`. See [docs/extending.md](docs/extending.md).

---

## Deployment

Cloudflare Workers, auto-deployed from `main` via Workers Builds. Supabase (Postgres + pgvector)
holds data and auth.

Step-by-step, including secrets and the Supabase URL configuration that OAuth needs:
**[docs/deployment.md](docs/deployment.md)**.

---

## Documentation

| Doc | Read it when |
|---|---|
| [docs/architecture.md](docs/architecture.md) | You want the system shape and why it is that shape |
| [docs/data-model.md](docs/data-model.md) | Before touching claim or content versioning |
| [docs/workflow.md](docs/workflow.md) | Authoring content with the agent pipeline |
| [docs/extending.md](docs/extending.md) | Adding capabilities, diagrams, views, agents |
| [docs/deployment.md](docs/deployment.md) | Deploying, or changing infrastructure |
| [docs/knowledge-gaps.md](docs/knowledge-gaps.md) | Understanding coverage gaps and how they're tracked |
| [docs/dependencies.md](docs/dependencies.md) | Upgrading anything |
| [docs/official-icon-policy.md](docs/official-icon-policy.md) | Using Microsoft icons in a diagram |
| [docs/runbooks/](docs/runbooks/) | Operational procedures |
| [docs/archive/](docs/archive/) | Completed plans, kept for context |

---

## Copyright

Sources are paraphrased in full. Any unavoidable quote stays under 15 words, one per source,
attributed. Article paragraphs, tables and structure are never reproduced — the knowledge base
stores links, metadata, extracted claims and original summaries.

Diagrams are original work. Microsoft's official architecture icons may appear under Microsoft's
diagram terms when obtained from an official collection, used unchanged with an adjacent product
label, and tracked per [docs/official-icon-policy.md](docs/official-icon-policy.md). Not affiliated
with Microsoft.
