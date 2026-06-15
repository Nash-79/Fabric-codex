"""Database engine, session, and runtime config.

SQLite by default so the knowledge base survives restarts with no infrastructure.
Set DATABASE_URL to a Postgres URL for scale (add pgvector for semantic retrieval).
"""
import os
from dotenv import load_dotenv
from sqlalchemy import text
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


def _run_migrations(raw_conn) -> None:
    """Idempotent column additions for schema upgrades not handled by create_all.

    SQLite's ALTER TABLE only supports ADD COLUMN, so each migration is a
    conditional ADD — safe to run on every startup.
    """
    cursor = raw_conn.cursor()
    migrations = [
        # v0.3: ready_to_share persisted on Design after full validation pass
        ("design", "ready_to_share", "INTEGER NOT NULL DEFAULT 0"),
        # v0.4 (Task #2): new_status column on ClaimEvent audit trail
        ("claimevent", "new_status", "TEXT NOT NULL DEFAULT ''"),
        # v0.4 portal layer: ValidationRun generalised to designs + blogs
        ("validationrun", "target_kind", "TEXT NOT NULL DEFAULT 'design'"),
        ("validationrun", "target_id", "TEXT NOT NULL DEFAULT ''"),
        # v0.4 portal layer: diagrams can hang off blogs
        ("asset", "blog_id", "TEXT"),
    ]
    for table, column, col_def in migrations:
        # PRAGMA table_info returns rows where the second element is the column name
        cursor.execute(f"PRAGMA table_info({table})")
        cols = {row[1] for row in cursor.fetchall()}
        if column not in cols:
            cursor.execute(f"ALTER TABLE {table} ADD COLUMN {column} {col_def}")
    raw_conn.commit()


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

    # Run additive schema migrations for columns added after initial create_all.
    # For SQLite we use the raw connection; for Postgres the same PRAGMA-safe guard
    # can be swapped for an information_schema check.
    if DATABASE_URL.startswith("sqlite"):
        with engine.connect() as conn:
            _run_migrations(conn.connection)


def get_session():
    with Session(engine) as session:
        yield session
