"""Fabric Atlas API.

Run: uvicorn app.main:app --reload   (interactive docs at /docs)
"""
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from app.db import init_db, CORS_ORIGINS
from app.routers import router


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
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
