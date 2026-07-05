## Goal

Give the app a durable "is the backend actually in the right shape?" signal — checked automatically on startup and in CI, browsable as a Settings page, and extended to cover required seed data.

## Scope

Three connected pieces, all read-only against Supabase (no schema changes required):

1. **Migration/schema health check** — a single server function that answers: expected tables present? expected RPCs present? expected columns on critical tables? latest applied migration timestamp? Returns a structured report (`ok | warn | fail` per check, plus details).
2. **Startup + CI gates** — invoke the check on server boot and from a `npm run verify:schema` script wired into CI (`.github/workflows/ci.yml`). Non-zero exit on `fail`; log warnings otherwise. No user-visible crash if it degrades — surface via logs + the status page.
3. **Data integrity + seed check** — extend the same report with counts and freshness for required default rows: `roadmap_items`, `content_items` (per kind), `capabilities`, `topics`, `help_docs`. Flag empty tables or stale rows (configurable threshold). No auto-seeding — this is a *check*, not a mutation, and seeding is already an explicit admin action.
4. **Settings → Migration Status page** — new admin-only tab under `/settings` rendering the report: latest migration file/timestamp, per-table row counts, RPC availability, seed status, last-run timestamp, and a Re-run button.

## Files to add / touch

**New**
- `src/lib/schema-health.server.ts` — pure server helper: expected-tables list, expected-RPC list, expected-columns map, seed thresholds. Uses `supabaseAdmin` (service role — needed to read `supabase_migrations.schema_migrations` and `information_schema`).
- `src/lib/schema-health.functions.ts` — `getSchemaHealth` server fn (admin-gated via `requireSupabaseAuth` + `has_role('admin')`), dynamic-imports the `.server` helper inside the handler.
- `src/components/settings/MigrationStatusPanel.tsx` — renders the report with green/amber/red badges, table of checks, list of latest 10 migrations, seed rows summary.
- `scripts/verify-schema.mjs` — CLI wrapper that runs the same checks (imports the `.server` helper via a small Node entrypoint using `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` from env). Exits 1 on `fail`.
- `.github/workflows/ci.yml` — add `npm run verify:schema` step (skipped when the required secrets are absent, e.g. on external PRs).

**Edited**
- `src/routes/_authenticated/settings.tsx` — register the new panel as a tab (only visible to admins, matching existing SystemPanel gating).
- `package.json` — add `"verify:schema": "node scripts/verify-schema.mjs"` script.
- `src/start.ts` (or the SSR entry that already runs once) — best-effort call to `getSchemaHealth` on first request; log `warn`/`fail` results to server logs. Never blocks the request.

## Expected-shape source of truth

Hand-maintained lists inside `schema-health.server.ts`, seeded from what the repo already relies on:

- **Tables** (from `<supabase-tables>`): `admin_audit_events`, `capabilities`, `claims`, `content_item_sources`, `content_items`, `diagrams`, `favorites`, `help_docs`, `profiles`, `queue_items`, `roadmap_items`, `roadmap_sync_state`, `rss_subscriptions`, `sources`, `topic_capabilities`, `topics`, `user_invitations`, `user_roles`, `validation_runs`, plus the legacy `*_legacy` tables tolerated as `warn` if missing.
- **RPCs** (from `<db-functions>`): `has_role`, `current_user_has_role`, `atlas_health_counts`, `search_atlas`, `admin_set_user_roles`, `admin_approve_user`, `admin_suspend_user`, `admin_record_event`, `bootstrap_first_admin`, `handle_new_user`, `touch_updated_at`.
- **Critical columns** — a small map, e.g. `content_items.kind`, `content_items.status`, `queue_items.scheduled_at`, `capabilities.maturity`, `roadmap_items.*`.
- **Seed thresholds** — `roadmap_items >= 1`, `content_items where kind='article' and active >= 1`, `capabilities >= 1`, `topics >= 1`, `help_docs >= 1`. Missing → `fail`; empty when others populated → `warn`.

## Report shape

```ts
type Check = { id: string; label: string; status: 'ok'|'warn'|'fail'; detail?: string }
type SchemaHealthReport = {
  generatedAt: string
  latestMigration: { version: string; name: string } | null
  recentMigrations: Array<{ version: string; name: string }>
  checks: Check[]        // tables, rpcs, columns, seed rows
  summary: { ok: number; warn: number; fail: number }
}
```

## Non-goals

- No schema migrations, no auto-seed, no writes.
- No new tables — the check lives entirely in code + existing `supabase_migrations` metadata.
- No changes to auth flow, RLS, or the existing `atlas_health_counts` RPC (we call it, not replace it).
- No UI on public routes; status page is admin-only under `_authenticated`.

## Verification

- `bun run tsgo` clean.
- Manually load `/settings` as admin, confirm the panel renders with all checks green against the current DB.
- Run `npm run verify:schema` locally — exits 0.
- Temporarily rename an expected RPC in the expected-list to a bogus name, confirm the CLI exits 1 and the panel shows a red check; revert.
