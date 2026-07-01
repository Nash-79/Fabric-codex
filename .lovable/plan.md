## Findings from review

- `/`, `/settings`, `/advisor` all return 200 — the app is healthy end-to-end.
- **Bug**: `GET /api/public/health/atlas` returns 500. The handler imports `supabaseAdmin`, which requires `SUPABASE_SERVICE_ROLE_KEY` — that key is not available in this runtime, so the handler crashes at first use.
  - Log: `Missing Supabase environment variable(s): SUPABASE_SERVICE_ROLE_KEY at GET /api/public/health/atlas.ts:19`
- **Deprecation noise** (11 warnings on every SSR/client build): `src/lib/atlas.functions.ts` uses `createServerFn().inputValidator()`, which TanStack Start now flags as deprecated in favour of `.validator()`. Same pattern in `src/lib/settings.functions.ts`, `src/lib/seed.functions.ts`, and `src/lib/api/example.functions.ts`.
- No runtime errors, no console errors, no TS errors.

## Plan

1. **Fix the health endpoint** (`src/routes/api/public/health/atlas.ts`)
   - Replace `supabaseAdmin` with a server-side publishable-key client (same pattern already used in `atlas.functions.ts`) so it works without the service-role key.
   - `seed_runs` and `pg_indexes` reads: fall back gracefully — if the publishable role can't read `seed_runs`, report `last_run_at: null` and status `degraded` with a clear reason instead of throwing.
   - Keep the response shape identical (`status`, `seed`, `counts`, `search_atlas`) so anything polling the endpoint keeps working.

2. **Migrate `inputValidator()` → `validator()`** across the four server-function files:
   - `src/lib/atlas.functions.ts` (8 call sites)
   - `src/lib/settings.functions.ts` (1)
   - `src/lib/seed.functions.ts` (1)
   - `src/lib/api/example.functions.ts` (1)
   - Mechanical rename only; no behavior change.

3. **Validate**
   - `curl` all top-nav routes + `/api/public/health/atlas` and confirm 200 (or 200/503 with a structured body for health).
   - Confirm dev-server logs no longer emit `inputValidator is deprecated` warnings.
   - Confirm no new TypeScript errors.

Nothing else in the app needs touching — no schema drift, no missing migrations, no auth regressions.