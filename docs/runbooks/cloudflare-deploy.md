# Runbook — first Cloudflare deploy

You run every step here. Wrangler's login is a browser OAuth flow, and the secrets are yours —
none of this needs to pass through an agent session.

The build config is already committed and verified: `wrangler.jsonc` pins the Worker name and
compatibility date, binds `ASSETS` and `AI`, and `wrangler deploy --dry-run` succeeds locally
(817 modules, 834 assets, 32.7 MiB against a 64 MiB limit).

## 0. Authenticate

```powershell
npx wrangler login
npx wrangler whoami     # confirm the account you expect
```

## 1. Choose: Workers Builds (recommended) or manual deploy

**Workers Builds** connects the GitHub repo so every push to `main` builds and deploys. No secrets
in GitHub — Cloudflare holds them.

Cloudflare dashboard → **Workers & Pages** → **Create** → **Import a repository** →
`Nash-79/Fabric-codex`, then:

| Setting | Value |
|---|---|
| Build command | `npm run build` |
| Deploy command | `npx wrangler deploy` |
| Root directory | `/` |

**Manual**, if you would rather deploy by hand first:

```powershell
npm run build
npm run deploy
```

Either way the Worker is named `fabric-codex`, so the first deploy lands on
`https://fabric-codex.<your-subdomain>.workers.dev`.

## 2. Set the secrets

Four are needed. Two are public values and two are secrets; Cloudflare treats them the same way
here, but only the last two matter for exposure.

```powershell
npx wrangler secret put SUPABASE_URL
# https://ltetbjjordljsntbesnc.supabase.co

npx wrangler secret put SUPABASE_PUBLISHABLE_KEY
# sb_publishable_... (public by design, protected by RLS)

npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
# the sb_secret_... key named "fabriccodexworker" -- BYPASSES RLS, never commit it

npx wrangler secret put FABRIC_ATLAS_APP_URL
# https://fabric-codex.<your-subdomain>.workers.dev   (no trailing slash)
```

`FABRIC_ATLAS_APP_URL` is not required for the app to boot, but until it is set the RSS poller,
source watcher and link checker identify themselves to publishers with the `workers.dev` default
from `src/lib/app-url.ts`. Set it to whatever address a site owner should be able to visit.

Verify:

```powershell
npx wrangler secret list
```

### Optional, only if you use them

| Secret | Why |
|---|---|
| `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_API_TOKEN` | Lets the model catalogue list Workers AI models. The `AI` binding works without them; these are for the Settings picker. |
| `FABRIC_ATLAS_AGENT_READ_TOKEN` | Local agent tooling (`check-queues.mjs`) reading the queue snapshot endpoint. |
| `OPENROUTER_API_KEY` | Only a fallback — the key is normally stored in `system_settings` via the UI (step 4). |

Not needed: `STRIPE_SECRET_KEY` (commented out), `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`,
`LOVABLE_API_KEY`, `DATABASE_URL`.

## 3. Check it serves

```powershell
curl -I https://fabric-codex.<subdomain>.workers.dev/
curl -I https://fabric-codex.<subdomain>.workers.dev/knowledge
curl -I https://fabric-codex.<subdomain>.workers.dev/advisor
```

Then in a browser: sign in with Google. The provider is enabled on the Supabase project, and your
`auth.users` row already exists with the original UUID, so your `admin` role carries over and
`/settings` should open.

**If Google sign-in fails**, the redirect URL is the usual cause. Supabase dashboard →
Authentication → URL Configuration → add the `workers.dev` origin to **Redirect URLs**, and set
**Site URL** to the same.

## 4. Finish configuration in the app

Two things can only be done once the app is running:

1. **OpenRouter key.** Settings → API Keys. The migrated `system_settings` row holds the key that
   was revoked during the migration, so it must be re-entered. It is read from the database first
   and `process.env` only as a fallback, so the UI is the right place.
2. **Model chain.** Settings → API Keys → **Refresh models**, then add entries in the order you
   want and save. Nothing is hardcoded: the list is fetched live, because every `:free` id this
   app previously shipped had been withdrawn by OpenRouter. Free models are shown by default; the
   paid opt-in lists them cheapest-first.

Until a chain is configured the advisor falls back to a single provider, so this is the step that
makes failover real.

## 5. Custom domain (optional, later)

Workers & Pages → the `fabric-codex` Worker → **Settings → Domains & Routes** → add your domain.
Then update `FABRIC_ATLAS_APP_URL` and Supabase's Site/Redirect URLs to match. No code change:
`src/lib/app-url.ts` reads that one variable.

## Rollback

Workers keeps previous versions. Dashboard → the Worker → **Deployments** → roll back to a prior
version. Nothing in this runbook mutates Supabase, so a rollback is a Worker-only operation.
