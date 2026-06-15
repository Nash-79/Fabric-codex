## Goal

Replace the current "domains + assets + favorites" demo with the real Fabric Atlas domain model from the GitHub repo, seeded from `content/*` JSON, and add a cited Advisor chat powered by Lovable AI.

## New data model (Supabase migration)

Drop existing `domains`, `assets`, `favorites`. Create:

- `topics` — tree of topics (`slug` PK-ish, `parent_slug`, `name`, `description`, `sort_order`)
- `capabilities` — registry spine (`id`, `name`, optional `description`)
- `topic_capabilities` — m:n topics↔capabilities
- `sources` — `id`, `slug`, `url`, `title`, `tier` (1–6), `tags[]`, `summary`
- `claims` — `id`, `source_id`, `capability_id`, `text`, `depth` (1–5), `type` (fact/pattern/internal/inference), `tags[]`, `version`, `supersedes_id`, `active`, `status` (append-only)
- `blogs` — `id`, `topic_slug`, `slug`, `title`, `summary`, `body_md`, `version`, `status`, `validation_confidence`, `created_at`
- `blog_sources` — citations (blog_id, source_id, label e.g. "S1")
- `diagrams` — `slug`, `path`, `caption`, `kind` (architecture/decision/internals)
- `favorites` — user bookmarks across blogs/topics/sources
- `help_docs` — `slug`, `title`, `body_md`, `order`

All public-read tables grant SELECT to `anon`; `favorites` is RLS-scoped to `auth.uid()`. `profiles` + auto-create trigger stay. `user_roles` + `has_role` added so an `admin` role can manage content.

## Seed import (one-shot server fn, admin-only)

`src/lib/seed.functions.ts` `seedFromContent()`:
- Reads bundled JSON from `content/topics.json`, `content/sources/*.json`, `content/blogs/*.json`, `content/diagrams/assets.json`, `content/help/*.md` (imported via Vite `import.meta.glob('/content/**', { eager: true, query: '?raw' })`).
- Upserts topics, derives capabilities from claim `capability_id`s + `topics.capability_ids`, inserts sources + claims (version 1, active), inserts blogs + diagram refs, inserts help docs.
- Re-runnable; idempotent on `slug`.
- Gated behind `has_role(auth.uid(),'admin')`. A "Seed content" button appears on `/admin` for the first admin.

## Routes (TanStack Start)

Public:
- `/` — Hero "Governed knowledge → grounded architecture", value props, links to Topics / Atlas / Advisor.
- `/topics` — Tree view of `topics`, expandable, with capability chips and claim counts.
- `/topics/$slug` — Topic detail: description, child topics, latest blog (if any), capabilities, source list.
- `/blog/$slug` — Blog reader: markdown body (`react-markdown` + remark-gfm), inline `[S1]` citations resolved to a sticky footnote panel with source title/tier/url, embedded diagrams from `content/diagrams/*.svg` served as static assets.
- `/atlas` — Capability registry grid; filter by capability → list of claims (text, depth badge L1–L5, source tier badge 1–6, tags).
- `/sources` — Browse approved sources, filter by tier/tag, link out.
- `/search` — Full-text search across blogs, claims, sources, topics (Postgres `to_tsvector` GIN indexes; server fn returns grouped hits).
- `/advisor` — Grounded chat (see below).
- `/help` — Renders `help_docs`.

Authenticated (`/_authenticated/`):
- `/favorites` — bookmarks list.
- `/admin` — admin-only: "Seed content" + simple stats (counts per table, coverage by capability×depth).

Auth page `/auth` keeps email + Google (broker via `lovable.auth`).

## Advisor chat (grounded, cited)

- Server route `src/routes/api/chat.ts` using AI SDK + Lovable AI Gateway (`google/gemini-3-flash-preview`).
- Per request: take last user message, embed-free keyword retrieval (Postgres `websearch_to_tsquery` over `claims.text` + `claims.tags` + `sources.title`), top 12 claims with their source URL/tier. Pass as a numbered context block `[C1]…[Cn]` with source metadata.
- System prompt enforces the domain rules: cite every fact as `[Cn]`; label inferences; refuse if context is empty ("the knowledge base is silent on this"); never invent limits/quotas.
- UI: `/advisor` page using `useChat` + `DefaultChatTransport`, `message.parts` rendering, markdown, citation chips that expand to the cited source card. One conversation, localStorage persistence (per `chat-agent-ui-contract`).

## UI / theming

Keep the Microsoft Fabric-aligned dark palette already in `src/lib/fabric-theme.ts` (extend with depth + tier color tokens). Reusable components:

- `TopicTree`, `CapabilityChip`, `DepthBadge` (L1–L5), `TierBadge` (T1–T6, color-coded), `ClaimCard`, `SourceCard`, `BlogReader` (with `<Citation n={1} />`), `DiagramFigure`, `AdvisorChat`.
- `SiteHeader` updated to: Topics · Atlas · Sources · Advisor · Search · Help · Favorites (when signed in).

## Technical bits

- Add deps: `react-markdown`, `remark-gfm`, `ai`, `@ai-sdk/react`, `@ai-sdk/openai-compatible`, `zod` (probably already in).
- Serve diagrams: copy `content/diagrams/*.svg` to `public/content/diagrams/` at build via a small Vite plugin or commit to `public/` once during seeding.
- Server fns live in `src/lib/*.functions.ts`; `supabaseAdmin` only imported inside `.handler()` via `await import(...)`.
- Search and listing functions use `supabaseAdmin` (public read) — never `requireSupabaseAuth` in public route loaders.
- Drop unused tables (`domains`, `assets`) in the migration.

## Out of scope (call out)

- No ingestion/curation/validation UI (this is the read+chat platform; authoring still happens in the GitHub repo via JSON).
- No claim versioning UI beyond storing `version`/`supersedes_id`; old versions are hidden by `active=true`.
- No Microsoft OAuth provider (Google + email only, as already configured).

## Build order

1. Migration: drop old tables, create new schema + grants + RLS + `user_roles`/`has_role`.
2. Bundle `content/*` into `public/` + Vite raw imports for JSON; write `seed.functions.ts`.
3. Implement public list/detail server fns + replace routes (`/`, `/topics`, `/topics/$slug`, `/blog/$slug`, `/atlas`, `/sources`, `/search`, `/help`).
4. Implement Advisor (`/api/chat` + `/advisor`).
5. Admin page + favorites refactor.
6. Verify with `invoke-server-function` (chat + a few list fns) and a manual browse.
