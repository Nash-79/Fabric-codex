# Fabric Atlas — Faithful UI Port + Model Selector

Rebuild the app to match the original `frontend/` SPA one-for-one, on top of the existing Supabase schema and TanStack Start stack. Add a cheap-default model selector to the Advisor.

## Navigation (exact order)

`Overview · Topics · Search · Registry · Sources · Designs · Learn · Help · Author`

Header: `AtlasMark` logo + "Fabric Atlas" + "for Microsoft Fabric" tagline + health chip + Light/Dark toggle (localStorage `fa.theme`).

## Theme & primitives

- `src/lib/fabric-theme.ts` — port `frontend/src/theme.js` verbatim: brand teal ramp (`#117865`), Segoe UI / Cascadia Code, full light + dark token maps, `applyTheme()` writes CSS vars on `<html>`.
- `src/lib/fabric-constants.ts` — `CAPABILITIES`, `DEPTHS`, `TIER_COLORS`, `TIER_LABELS`, `SEV_COLORS`.
- `src/components/fabric/ui.tsx` — `Chip`, `Btn`, `Empty`, `Code`, `AtlasMark`.
- `src/components/fabric/Markdown.tsx`, `FabricInfographic.tsx`.
- `src/hooks/use-window-width.ts` for mobile rules.
- Rewrite `SiteHeader.tsx` to match original layout.

## Routes (one-for-one with `frontend/src/views/*`)

| Path | Source view | Data |
|---|---|---|
| `/` | OverviewView | counts + featured topics |
| `/topics` | TopicsView | tree of topics |
| `/topics/$slug` | TopicView | topic + capabilities + claims + blog |
| `/search` | SearchView | FTS across topics/claims/sources/blogs |
| `/registry` (NEW) | RegistryView | capabilities table + coverage |
| `/sources` | SourcesView | list + submit-to-queue form (auth) |
| `/designs` (NEW) | DesignsView | designs + validation runs |
| `/learn` (NEW) | LearnView | lessons by depth |
| `/blog/$slug` | BlogView | rendered article + cited claims |
| `/help` + `/help/$page` | HelpView | markdown docs |
| `/author` (NEW) | AuthorView | static docs page (read-only; no agent loop) |
| `/advisor` | (kept) | chat + **model selector dropdown** |

Remove `/atlas` route. Keep `/_authenticated/admin` and `/_authenticated/favorites`.

## Advisor model selector

Dropdown in Advisor UI; choice persisted in `localStorage` (`fa.advisor.model`); sent with each chat request; server validates against allowlist.

Allowlist (cheap defaults first, expensive last):

- `google/gemini-3.1-flash-lite-preview` — Cheapest
- `google/gemini-3-flash-preview` — **Default**
- `google/gemini-2.5-flash`
- `google/gemini-3.5-flash`
- `google/gemini-2.5-pro` — Moderate
- `google/gemini-3.1-pro-preview` — Moderate
- `openai/gpt-5-mini` — Moderate
- `openai/gpt-5` — Expensive

Server (`src/routes/api/chat.ts`) reads `body.model`, falls back to default if not in allowlist.

## Backend additions

Tables already present: `topics`, `topic_capabilities`, `capabilities`, `sources`, `claims`, `blogs`, `blog_sources`, `diagrams`, `help_docs`, `favorites`, `user_roles`, `profiles`.

New migration adds:

- `queue_items` (url, note, status, submitted_by, created_at) — Sources submit form
- `lessons` (slug, title, depth, body_md, capability_id) — Learn page
- `designs` (slug, title, summary, body_md, status) + `validation_runs` (design_id, score, ran_at) + `issues` (validation_run_id, severity, message) — Designs page

All with `GRANT SELECT TO anon, authenticated` for public-read, `GRANT ALL TO service_role`, RLS on, public-read policies. Writes via `createServerFn` with `requireSupabaseAuth` + admin role check.

## Server functions (`src/lib/atlas.functions.ts`)

Public reads: `listCapabilities`, `listTopics`, `getTopic`, `searchAll`, `listSources`, `listClaims`, `listBlogs`, `getBlog`, `listLessons`, `listDesigns`, `getDesign`, `getCounts`, `listHelpDocs`, `getHelpDoc`.

Authenticated: `submitQueueItem`, `toggleFavorite`.

Admin-gated (`has_role(uid,'admin')`): `verifyClaim`, `runValidation`, `seedFromContent`.

## Out of scope (mirror original non-goals)

- Claude Code agent loop (local-only)
- Real-time drift detection
- Direct claim mutation (versioning enforced at service layer — admin verify only)

## Files

**Add**: `fabric-theme.ts`, `fabric-constants.ts`, `use-window-width.ts`, `fabric/ui.tsx`, `fabric/Markdown.tsx`, `fabric/FabricInfographic.tsx`, route files for `/registry`, `/designs`, `/learn`, `/help.$page`, `/author`, `/blog.$slug`, model-selector component in Advisor.

**Rewrite**: `SiteHeader.tsx`, `routes/index.tsx`, `routes/topics.tsx`, `routes/topics.$slug.tsx`, `routes/search.tsx`, `routes/sources.tsx`, `routes/help.tsx`, `routes/advisor.tsx`, `routes/api/chat.ts`, `atlas.functions.ts`.

**Delete**: `routes/atlas.tsx`, old AssetCard remnants.

**Migration**: `queue_items`, `lessons`, `designs`, `validation_runs`, `issues` with grants + RLS.
