"""Database engine, session, and runtime config.

SQLite by default so the knowledge base survives restarts with no infrastructure.
Set DATABASE_URL to a Postgres URL for scale (add pgvector for semantic retrieval).
"""
import os
from dotenv import load_dotenv
from sqlalchemy import text
from sqlmodel import SQLModel, create_engine, Session

load_dotenv()

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
    _migrate_sqlite()


def _migrate_sqlite() -> None:
    """Small additive migrations for the local SQLite default.

    SQLModel's create_all creates missing tables but does not add columns to an existing
    database. Keep this intentionally narrow until the project adopts a migration tool.
    """
    if engine.url.get_backend_name() != "sqlite":
        return
    with engine.begin() as conn:
        cols = {row[1] for row in conn.execute(text("PRAGMA table_info(source)")).fetchall()}
        for name, ddl in {
            "summary": "ALTER TABLE source ADD COLUMN summary VARCHAR DEFAULT ''",
            "audience": "ALTER TABLE source ADD COLUMN audience VARCHAR DEFAULT ''",
            "why_it_matters": "ALTER TABLE source ADD COLUMN why_it_matters VARCHAR DEFAULT ''",
            "takeaways_json": "ALTER TABLE source ADD COLUMN takeaways_json VARCHAR DEFAULT '[]'",
        }.items():
            if name not in cols:
                conn.execute(text(ddl))


def get_session():
    with Session(engine) as session:
        yield session
