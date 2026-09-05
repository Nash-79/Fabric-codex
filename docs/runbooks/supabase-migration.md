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

`psql` and `pg_dump` ship with PostgreSQL client tools:

```powershell
winget install PostgreSQL.PostgreSQL.17
# then reopen the shell so psql/pg_dump are on PATH
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
cd /c/repos/Fabric-Atlas
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

Dump data only from the old project — the schema already exists from step 4:

```bash
pg_dump "<OLD_CONNECTION_STRING>" \
  --data-only --no-owner --no-privileges \
  --schema=public \
  --exclude-table-data='storage.*' \
  -f fabric-data.sql

psql "<NEW_CONNECTION_STRING>" -v ON_ERROR_STOP=1 -f fabric-data.sql
```

If FK ordering causes trouble, add `--disable-triggers` to the `pg_dump` call.

Verify against the baseline table above:

```bash
psql "<NEW_CONNECTION_STRING>" -c "
select 'claims' t, count(*) from claims
union all select 'roadmap_items', count(*) from roadmap_items
union all select 'content_items', count(*) from content_items
union all select 'sources', count(*) from sources
union all select 'capabilities', count(*) from capabilities;"
```

## 6. Auth users

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
