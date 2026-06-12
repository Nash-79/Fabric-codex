"""Fabric Atlas API.

Run: uvicorn app.main:app --reload   (interactive docs at /docs)
"""
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from app.db import init_db, CORS_ORIGINS
from app.routers import router


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    # Populate the search index when it is empty but the KB is not — the upgrade
    # path for databases created before the search feature existed.
    from sqlmodel import Session
    from app.db import engine
    from app.search import ensure_index
    with Session(engine) as session:
        ensure_index(session)
    yield


app = FastAPI(title="Fabric Atlas", version="0.2.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS or ["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)

# Serve the git-tracked authored content (generated diagrams, designs, lessons) so the
# frontend can render them, e.g. /content/diagrams/<slug>.svg
_content_dir = Path(__file__).resolve().parents[2] / "content"
if _content_dir.is_dir():
    app.mount("/content", StaticFiles(directory=str(_content_dir)), name="content")


@app.get("/health")
def health():
    return {"status": "ok"}


# Serve the built React SPA in production (dist/ exists after `npm run build`).
# Several SPA routes (/sources, /topics/<slug>, /search, …) share their path with a JSON
# API route, so the catch-all alone is not enough: browser navigations (Accept: text/html)
# must get index.html even on paths the API would match. fetch() calls send Accept: */*
# and pass through to the API untouched.
_dist_dir = Path(__file__).resolve().parents[2] / "frontend" / "dist"
if _dist_dir.is_dir():
    app.mount("/assets", StaticFiles(directory=str(_dist_dir / "assets")), name="spa-assets")

    _NON_SPA_PREFIXES = ("/docs", "/redoc", "/openapi.json", "/content", "/assets")

    @app.middleware("http")
    async def spa_navigation(request, call_next):
        if (request.method == "GET"
                and "text/html" in request.headers.get("accept", "")
                and not request.url.path.startswith(_NON_SPA_PREFIXES)):
            return FileResponse(str(_dist_dir / "index.html"))
        return await call_next(request)

    @app.get("/{full_path:path}", include_in_schema=False)
    async def spa_fallback(full_path: str):
        return FileResponse(str(_dist_dir / "index.html"))
