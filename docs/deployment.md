# Deployment

Cloudflare Workers for hosting and compute, Supabase for data and auth.

**Live:** https://fabric-codex.nmepani.workers.dev

For a first-time deploy, follow [runbooks/cloudflare-deploy.md](runbooks/cloudflare-deploy.md) —
this page is the reference for how it is wired and what to change when something moves.

## Topology

| Piece | Where | Notes |
|---|---|---|
| App | Cloudflare Worker `fabric-codex` | SSR, server functions, admin |
| Static assets | `env.ASSETS` binding | 830 files, counted separately from Worker size |
| Workers AI | `env.AI` binding | 10k neurons/day free |
| Database + auth | Supabase `ltetbjjordljsntbesnc` | Postgres, pgvector, RLS, Google OAuth |
| CI/CD | Cloudflare Workers Builds | Auto-deploys every push to `main` |

## Configuration

`wrangler.jsonc` is the owned config and is the source of truth.

Nitro's Cloudflare preset also emits `.output/server/wrangler.json`, but that file is regenerated
on every build and **cannot** be relied on: it derives the Worker name from the git remote
(`nash-79-fabric-codex`, and renaming a deployed Worker changes its URL) and stamps
`compatibility_date` with *today's* date, so runtime semantics would drift with every rebuild.
`wrangler.jsonc` pins both, and Nitro merges it in.

### Secrets

Four matter. Set with `npx wrangler secret put <NAME>`.

| Secret | Value | Why |
|---|---|---|
| `SUPABASE_URL` | `https://ltetbjjordljsntbesnc.supabase.co` | Throws when absent |
| `SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_…` | Public by design, protected by RLS |
| `SUPABASE_SERVICE_ROLE_KEY` | `sb_secret_…` | **Bypasses RLS.** Worker secrets only, never committed |
| `FABRIC_ATLAS_APP_URL` | The deployed origin, no trailing slash | Drives every outbound crawler User-Agent |

Optional: `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_API_TOKEN` (lets the Settings picker list Workers
AI models — the `AI` binding works without them), `FABRIC_ATLAS_AGENT_READ_TOKEN` (local agent
tooling), `OPENROUTER_API_KEY` (a fallback; the key normally lives in `system_settings` via the UI).

Not used: `STRIPE_SECRET_KEY` (commented out), `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`,
`LOVABLE_API_KEY`, `DATABASE_URL` (local tooling only).

### Supabase URL configuration

**The single most common deployment failure.** Supabase falls back to its Site URL whenever a
requested `redirectTo` is not in the allow-list — and the factory default is `localhost:3000`, so
Google sign-in silently redirects there.

Dashboard → Authentication → URL Configuration:

| Field | Value |
|---|---|
| Site URL | the deployed origin |
| Redirect URLs | the deployed origin + `/**` |

The `/**` wildcard is required: the app redirects to `/topics` and to arbitrary `next=` paths, so a
bare origin matches neither. This also governs **email sign-up**, whose confirmation link is built
from Site URL.

In Google Cloud Console the authorised redirect URI is Supabase's own callback —
`https://<project>.supabase.co/auth/v1/callback` — not the app's. It does not change when the app
moves.

## Size budget

Measured with `npx wrangler deploy --dry-run`:

| | |
|---|---|
| Total Upload | **32.7 MiB** of a **64 MiB** uncompressed limit |
| Static assets | 830 files (limit 20,000), largest 1.2 MiB (limit 25 MiB each) |

The `gzip` figure wrangler also prints is informational — the 3 MB / 10 MB *compressed* caps were
withdrawn on 2026-09-04 and no longer apply.

**What grows.** Articles do **not** count toward Worker size: bodies live in Supabase and images
are static assets. Diagrams **do**, at ~90 KiB each (the SVG plus its `.diagram.json` sidecar, both
code-split into the SSR bundle). 29 MiB free leaves room for roughly 320 more beyond the current
103; about 25 MiB of the bundle is fixed framework code.

If that ceiling is ever approached, serve diagrams as **static assets** rather than bundling them —
they are already mirrored to `public/diagrams/` and hash-registered. Do **not** move them into
Supabase Storage: they are already lazy-loaded, so it would add a round trip on the render path and
drop the hash guarantee while saving nothing at runtime.

## Deploying

Auto-deploy on push to `main` via Workers Builds. Manually:

```bash
npm run build
npm run deploy          # wrangler deploy
npm run preview:worker  # wrangler dev — exercises the real Workers runtime locally
```

`wrangler dev` is worth using before any infrastructure change: it catches Node-API assumptions
that a Vite dev server hides. That is how the `node:dns` dependency in the SSRF guard was found —
it does not exist on Workers even with `nodejs_compat`.

## Database changes

```bash
supabase link --project-ref <ref>   # prompts for the DB password; never store it
supabase db push                    # apply pending migrations
npm run gen:types                   # regenerate types from the live schema
```

`gen:types` reads the **live** schema, so a new RPC only becomes typed after its migration is
applied. Changing a migration requires updating [data-model.md](data-model.md) in the same commit —
CI enforces this.

## Rollback

Workers keeps previous versions: dashboard → the Worker → **Deployments** → roll back. That is a
Worker-only operation and touches no data.

Database changes are forward-only. Supabase Pro provides daily backups with 7-day PITR.
