"""Database engine, session, and runtime config.

Postgres (Supabase) is the store. The canonical schema is the Supabase migration
supabase/migrations/*_fabric_atlas_kb.sql; create_all() below is a dev convenience that
brings the tables up to parity when the migration has not been applied (e.g. a throwaway
local Postgres or the in-memory test DB). Set DATABASE_URL to the Supabase pooler URL, e.g.
postgresql+psycopg://postgres:<pw>@<host>:5432/postgres
"""

import os
from dotenv import load_dotenv
from sqlmodel import SQLModel, create_engine, Session

load_dotenv(override=True)

DATABASE_URL = os.getenv(
    "DATABASE_URL", "postgresql+psycopg://postgres:postgres@localhost:5432/postgres"
)
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
ANTHROPIC_MODEL = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-6")
# "local": LLM work is done by the Claude Code / Codex agents on your laptop and posted as
# structured data (no metered API, no server-side key). "api": the server calls the API itself.
LLM_MODE = os.getenv("LLM_MODE", "local").lower()
CORS_ORIGINS = [
    o.strip() for o in os.getenv("CORS_ORIGINS", "").split(",") if o.strip()
]

# SQLite is no longer a supported backend; the only remaining sqlite use is the in-memory
# test database, which needs check_same_thread=False for the threaded TestClient.
_connect_args = (
    {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
)
engine = create_engine(DATABASE_URL, echo=False, connect_args=_connect_args)


def init_db() -> None:
    # Import models so SQLModel registers the tables before create_all. On Supabase the
    # KB migration already created everything; create_all only fills gaps (no-op normally).
    from app import models  # noqa: F401

    SQLModel.metadata.create_all(engine)


def get_session():
    with Session(engine) as session:
        yield session
