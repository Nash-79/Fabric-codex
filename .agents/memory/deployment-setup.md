---
name: Production deployment setup
description: How Fabric Atlas is wired for Lovable deployment through the root TanStack Start app.
---

# Production deployment setup

## The pattern

Production is the Lovable-hosted TanStack Start app in `src/`.

- `.lovable/project.json` selects the Lovable TanStack Start template.
- `vite.config.ts` extends `@lovable.dev/vite-tanstack-config`.
- `src/routes/*` is the routed app surface.
- `src/lib/*.functions.ts` provides TanStack server functions.
- Supabase is the production knowledge base, with bundled `content/` as fallback where implemented.
- `/api/chat` uses the Lovable AI Gateway and requires `LOVABLE_API_KEY`.

The legacy `frontend/` SPA and `backend/` FastAPI service are local/authoring assets unless they
are deliberately hosted separately. They are not part of the Lovable production deployment.

## Build command

Lovable builds from the repository root using the root package scripts:

```bash
npm run build
```

Local dev for the hosted app:

```bash
npm install
npm run dev
```

## Runtime environment

Set these in Lovable, not in source control:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` for admin-only server functions and seeding
- `LOVABLE_API_KEY` for Advisor chat

## Key files

- `.lovable/project.json` — Lovable project template
- `vite.config.ts` — Lovable/TanStack build config
- `package.json` — root app scripts and dependencies
- `src/routes/__root.tsx` — app shell
- `src/routes/api/chat.ts` — Advisor API route
- `src/lib/atlas.functions.ts` — public KB server functions
- `src/lib/seed.functions.ts` — admin seeding from `content/`

## What NOT to do

- Do not add host-specific deployment files for another platform unless that platform is explicitly
  being used.
- Do not make `frontend/` the production app path by accident; Lovable builds `src/`.
- Do not put service-role secrets in `.env` or client-visible `VITE_*` variables.
