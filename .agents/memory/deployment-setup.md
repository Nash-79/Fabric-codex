---
name: Production deployment setup
description: How Fabric Atlas is wired for autoscale deployment — single FastAPI process serves both the API and the built React SPA.
---

# Production deployment setup

## The pattern

Autoscale = one process, one port. FastAPI (port 5000) serves everything:
- API routes (`/claims`, `/designs`, etc.) — matched first via `include_router`
- `/content` static mount — authored diagrams/lessons
- `/assets` static mount — built React JS/CSS bundle (`frontend/dist/assets/`)
- `/{full_path:path}` catch-all — returns `frontend/dist/index.html` for SPA client-side routing

The SPA mounts only activate when `frontend/dist/` exists (i.e. after `npm run build`).
In dev, `dist/` may or may not exist; dev traffic hits the Vite dev server on port 5000 directly.

## Build command (in `.replit [deployment]`)

```
bash -c "pip install -r backend/requirements.txt && cd frontend && npm install && npm run build"
```

**Why explicit install steps:** The deployer's auto-install step looks for `package.json` at the project root. A minimal root `package.json` (`package.json` — name/version/private only, no deps) satisfies the auto-detector so it doesn't error. The build command then handles both Python and Node deps explicitly.

## Run command

```
bash -c "cd backend && uvicorn app.main:app --host 0.0.0.0 --port 5000"
```

**Why:** Must bind to `0.0.0.0` (not `localhost`) so the autoscale health probe can reach it. Port 5000 matches what Replit's proxy expects.

## Key files

- `backend/app/main.py` — SPA static mounts and catch-all route at the bottom
- `package.json` (root) — minimal, satisfies deployer auto-detection
- `.replit [deployment]` — build/run commands and `deploymentTarget = "autoscale"`

## What NOT to do

- Don't use `localhost` in the run command — health probe can't reach it.
- Don't omit the root `package.json` — the deployer's "Installing packages" step will fail with `package.json: open package.json: no such file or directory`.
- Don't put `StaticFiles(directory=dist, html=True)` at `/` before the router — it captures API routes. Mount assets at `/assets` and use a `/{full_path:path}` catch-all instead.
