"""Pytest bootstrap.

The app now defaults to Postgres (Supabase). The test suite runs against a fresh in-memory
SQLite via a dependency override (see tests/), and must NOT touch a real Postgres at import or
lifespan time. Point DATABASE_URL at in-memory SQLite *before* app.db is imported so the
module-level engine and the startup lifespan are harmless during tests.
"""

import os

os.environ.setdefault("DATABASE_URL", "sqlite://")
