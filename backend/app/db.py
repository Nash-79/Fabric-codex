"""Database engine, session, and runtime config.

SQLite by default so the knowledge base survives restarts with no infrastructure.
Set DATABASE_URL to a Postgres URL for scale (add pgvector for semantic retrieval).
"""
import os
from dotenv import load_dotenv
from sqlmodel import SQLModel, create_engine, Session

load_dotenv(override=True)

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./fabric_atlas.db")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
ANTHROPIC_MODEL = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-6")
# "local": LLM work is done by the Claude Code / Codex agents on your laptop and posted as
# structured data (no metered API, no server-side key). "api": the server calls the API itself.
LLM_MODE = os.getenv("LLM_MODE", "local").lower()
CORS_ORIGINS = [o.strip() for o in os.getenv("CORS_ORIGINS", "").split(",") if o.strip()]

_connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, echo=False, connect_args=_connect_args)


def init_db() -> None:
    # Import models so SQLModel registers the tables before create_all.
    from app import models  # noqa: F401
    SQLModel.metadata.create_all(engine)


def get_session():
    with Session(engine) as session:
        yield session
