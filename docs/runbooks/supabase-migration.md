# Runbook — migrate Supabase off Lovable Cloud to your own project

You run every command here; the keys never leave your machine. Baseline row counts to verify
against (read from the Lovable project on 2026-09-05):

| Table | Rows |
|---|---|
| `claims` | 3052 |
| `roadmap_items` | 1164 |
| `content_items` | 850 |
| `sources` | 169 |
| `capabilities` | 21 |

## 0. Prerequisites

```bash
supabase --version     # have: 2.67.1 (2.116.0 available; either is fine)
psql --version         # NOT installed yet — see below
```

`psql` and `pg_dump` ship with PostgreSQL client tools. **Already installed** at
`%LOCALAPPDATA%\pgclient\pgsqlin` (psql/pg_dump 17.11) — verified working.

The documented `winget install PostgreSQL.PostgreSQL.17` route **does not work unelevated**: the
EDB installer needs admin rights to write to `Program Files` and prompts for a superuser password,
so it exits 1 with no log. We only need the client binaries, not a server, so the portable zip was
used instead — no admin, nothing added to PATH, nothing registered:

```powershell
# already done; recorded so it is reproducible
Invoke-WebRequest "https://get.enterprisedb.com/postgresql/postgresql-17.11-3-windows-x64-binaries.zip" `
  -OutFile "$env:TEMP\pg17.zip" -UseBasicParsing
Expand-Archive "$env:TEMP\pg17.zip" -DestinationPath "$env:LOCALAPPDATA\pgclient" -Force
```

Because it is not on PATH, call the binaries by full path in the steps below, or add them for the
session:

```powershell
$env:PATH = "$env:LOCALAPPDATA\pgclient\pgsqlin;$env:PATH"
```

## 1. Create the project (Supabase dashboard)

1. https://supabase.com/dashboard → **New project**
2. Name: `fabric-atlas` (or your choice)
3. **Region: pick the one nearest your readers.** Every server function is a
   Worker→Postgres round trip, and this is the one setting that is painful to change later.
4. Set a strong database password and save it — you need it for `pg_dump`/`psql` below.
5. Wait for provisioning to finish.

## 2. Collect the values

Dashboard → **Project Settings**:

| Value | Where | Used as |
|---|---|---|
| Project URL | API → Project URL | `SUPABASE_URL`, `VITE_SUPABASE_URL` |
| Publishable / anon key | API → Project API keys | `SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PUBLISHABLE_KEY` |
| **Service role key** | API → Project API keys | `SUPABASE_SERVICE_ROLE_KEY` — **Worker secret only** |
| Connection string | Database → Connection string → URI | `pg_dump` / `psql` below |
| Project ref | General → Reference ID | `supabase link` |

> **The service-role key bypasses RLS.** It goes in Cloudflare Worker secrets and nowhere else —
> never in `.env`, never in code, never pasted into a chat. The repo is public now.

## 3. Enable Google auth (before cutover)

Authentication → Providers → **Google** → enable, add your OAuth client id/secret, and add the
callback URL Supabase shows you to the Google Cloud console.

Do this *before* the app switches off the Lovable OAuth wrapper, or sign-in breaks at cutover.

## 4. Replay the schema

All 55 migrations are committed, so this is reproducible:

```bash
cd /c/repos/Fabric-codex
supabase link --project-ref <YOUR_NEW_PROJECT_REF>
supabase db push
```

Verify the extension and buckets came across:

```bash
psql "<NEW_CONNECTION_STRING>" -c "select extname from pg_extension where extname='vector';"
psql "<NEW_CONNECTION_STRING>" -c "select id, public from storage.buckets;"
```

Expect `vector`, and two buckets (diagram uploads + source uploads).

## 5. Copy the data

**You run these** — the passwords stay on your machine. Get both connection strings from each
project's dashboard: Database → Connection string → **URI**, and substitute the real password for
`[YOUR-PASSWORD]`. Use the **Session pooler** (port 5432) string, not the transaction pooler —
`pg_dump` needs a session connection.

- **OLD** (Lovable, read-only source): project ref `ysgmvtvwrkrxagefkhrc`
- **NEW** (yours, the target): project ref `ltetbjjordljsntbesnc`

```powershell
# psql/pg_dump are not on PATH by design — add them for this session only
$env:PATH = "$env:LOCALAPPDATA\pgclient\pgsqlin;$env:PATH"

$OLD = "<paste OLD connection URI>"
$NEW = "<paste NEW connection URI>"
```

**Clear the seeded capabilities first.** Three migrations
(`20260616120000_unify_backend_columns.sql`, `20260616133043_*.sql`,
`20260726220000_add_materialized_lake_views_capability.sql`) seed `public.capabilities`, so the new
project already holds 21 rows. A data-only restore would hit primary-key conflicts on exactly that
table. The dump carries the authoritative rows, so empty it first:

```powershell
psql $NEW -v ON_ERROR_STOP=1 -c "truncate table public.capabilities cascade;"
```

Then dump and restore. `--disable-triggers` keeps FK ordering from mattering, and needs the
`--superuser=postgres` hint on Supabase:

```powershell
pg_dump $OLD --data-only --no-owner --no-privileges --schema=public `
  --disable-triggers --superuser=postgres -f fabric-data.sql

psql $NEW -v ON_ERROR_STOP=1 -f fabric-data.sql
```

If the restore stops on an error, nothing is half-applied per-statement but the run is partial —
re-truncate the affected tables and re-run rather than restoring twice on top of itself.

Verify against the baseline table at the top of this runbook:

```powershell
psql $NEW -c "select 'claims' t, count(*) from claims
union all select 'roadmap_items', count(*) from roadmap_items
union all select 'content_items', count(*) from content_items
union all select 'sources', count(*) from sources
union all select 'capabilities', count(*) from capabilities;"
```

Expect **3052 / 1164 / 850 / 169 / 21**. Paste the output back and the invariant checks in step 8
confirm the rest.

## 5b. STATUS — COMPLETE (2026-09-05)

**Phase 1 is finished.** All 29 readable tables reconcile against the source (16,279 rows). The
old project is untouched and remains a rollback. Remaining work is Phase 2 (Cloudflare), not here.

Final state:

- **Data:** every table matches source counts. `learning_paths` (5) and `path_items` (23) are
  *higher* on the new project — new seed content from `20260823170000_seed_learning_paths.sql`
  that the old project never had. Not a discrepancy.
- **Auth:** one user, created via the admin API with the **original UUID preserved**
  (`2d32a631-…`), so no FK remapping was needed anywhere. `user_roles` holds `admin`; a trigger
  auto-creates that row, so the copy reports a duplicate-key "failure" that is actually correct.
- **Keys:** both now on the modern `sb_publishable_` / `sb_secret_` system; legacy JWT keys
  disabled. `client.server.ts` makes no assumption about key format, so no code change was needed.
- **Grants:** `sql/lovable-revert-grants.sql` has been run. The admin tables on the old project are
  401 again and `system_settings` is no longer anon-readable.

Two things caught only by reconciling *after* the copy, worth repeating on any future migration:

1. **The source keeps changing while you read it.** `admin_audit_events` gained two rows mid-copy —
   they turned out to be `settings.api_key_saved` events from the old app being used during the
   migration. Always re-diff at the end rather than trusting the first pass.
2. **That drift can invalidate an earlier table.** Those events revealed `system_settings` had been
   copied *before* the key was updated, so the new project held a stale value. Re-synced.

---

## 5c. How the copy was actually done (2026-09-05)



The copy was run over the REST API rather than `pg_dump`: the Lovable project is **not in your
Supabase account** (it belongs to Lovable's org), so there is no DB password for it and the
`pg_dump` route in step 5 is not available. Read via the old project's still-valid anon key
(after running `sql/lovable-export-grants.sql`), written via the new project's service-role key.

**Copied and verified — every count matches the baseline:**

| Table | Rows | Table | Rows |
|---|---|---|---|
| `claims` | 3052 | `content_item_sources` | 5996 |
| `content_items` | 850 | `diagram_nodes` | 785 |
| `sources` | 169 | `diagrams` | 103 |
| `roadmap_items` | 1164 | `topic_capabilities` | 104 |
| `seed_runs` | 1670 | `topics` | 43 |
| `capabilities` | 21 | `help_docs` | 8 |
| `roadmap_sync_state` | 1 | | |

`search_atlas('direct lake')` returns correctly ranked results on the new project, so the tsvector
indexes rebuilt on insert. Note the RPC signature is `search_atlas(term, max_results)` — not `q`.

Three issues hit and solved, worth knowing if this is ever re-run:

- **`content_items` self-references** via `supersedes_id` (the version chain). A flat insert fails
  with FK 23503; the 850 rows must be topologically sorted so parents insert first.
- **`diagram_nodes.search_vector` is a generated column** — writing it fails with 428C9. Strip it.
- **Large `body_md` blobs** time out at 1000-row pages (57014); use 100.

**Still blocked — 10 tables, 2308 rows.** All fail FK on `auth.users`, which is empty on the new
project. There is exactly one user (Google OAuth, no password hash to migrate), so per step 6 the
answer is re-invite, not a hash dump:

`queue_items` (1154), `admin_audit_events` (905), `source_watcher_items` (211), `user_progress`
(25), `source_watchers` (7), `rss_subscriptions` (2), `favorites` (2), `system_settings` (2),
`profiles` (1), `user_roles` (1).

**Sequence:** sign into the new project with Google → that creates the `auth.users` row → then copy
these ten, remapping the old user id (`2d32a631-…`) to the new one. Requires Google auth configured
on the new project (step 3, still outstanding).

**Do not run `sql/lovable-revert-grants.sql` until those ten are across** — it would re-block the
reads. But note `system_settings` holds `openrouter_api_key`, currently readable by the public anon
key while the grant stands: rotate that key once the revert is done.

## 6. Auth users — DONE

**What worked (better than either option below):** the admin API accepts an explicit `id`, so the
single user was recreated with the **same UUID** as the old project. That means no id remapping
across the ten tables that FK to `auth.users` — every reference simply resolved.

```
POST /auth/v1/admin/users     (service-role key)
  { "id": "<original uuid>", "email": "<address>", "email_confirm": true }
```

Creating the user through the dashboard instead assigns a **random** UUID and forces a remap of
`user_id` / `submitted_by` / `created_by` / `actor_id` / `updated_by` / `approved_by` across
`profiles`, `user_roles`, `user_progress`, `favorites`, `system_settings`, `rss_subscriptions`,
`source_watchers`, `source_watcher_items`, `queue_items` and `admin_audit_events`. Preserving the
id avoids all of it.

Note Google auth was **not** required for this — it is still needed for sign-in at cutover
(Authentication → Providers → Google), but it does not gate the data migration.

<details>
<summary>Original guidance (kept for reference)</summary>

Check the count first — this decides the approach:

```bash
psql "<OLD_CONNECTION_STRING>" -c "select count(*) from auth.users;"
```

- **Small (likely — this is an admin-gated app):** recreate the accounts by invite in the new
  project. Simplest and safest.
- **Large:** dump `auth.users` directly to preserve password hashes:
  ```bash
  pg_dump "<OLD_CONNECTION_STRING>" --data-only --table=auth.users -f auth-users.sql
  psql "<NEW_CONNECTION_STRING>" -f auth-users.sql
  ```
  Then confirm `public.profiles` rows still match user ids, and re-grant the admin role:
  ```bash
  psql "<NEW_CONNECTION_STRING>" -c "select user_id, role from user_roles;"
  ```

**Sign in and confirm `/settings` still gates on admin before deleting anything.**

</details>

## 7. Storage objects

The two buckets hold uploaded diagrams and sources. Either re-upload from `content/` (the git
tree is the source of truth) or copy via the Supabase CLI/S3-compatible API. Phase 2 moves these
to R2 anyway, so a light-touch copy is fine.

## 8. Verify invariants

```bash
npm run verify:schema            # needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in env
python scripts/validate_migration.py
```

These assert one active version per key, referential integrity, embedded-diagram existence, and a
populated search index.

## 9. Hand back

Give me the **Project URL** and **publishable/anon key** (both public, safe to share) and I will
wire the app's env-driven config. **Keep the service-role key** — you set it directly as a
Cloudflare Worker secret in Phase 2:

```bash
wrangler secret put SUPABASE_SERVICE_ROLE_KEY
```

## Rollback

Nothing here mutates the Lovable project — it is read-only at the source. If anything goes wrong,
the old project is untouched and you can re-run from step 4 against a fresh project.
