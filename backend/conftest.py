"""Pytest bootstrap.

The app now defaults to Postgres (Supabase). The test suite runs against a fresh in-memory
SQLite via a dependency override (see tests/), and must NOT touch a real Postgres at import or
lifespan time. Point DATABASE_URL at in-memory SQLite *before* app.db is imported so the
module-level engine and the startup lifespan are harmless during tests.

app.db calls dotenv.load_dotenv(override=True) at import time, which would otherwise clobber
the sqlite:// override below with whatever DATABASE_URL is set in backend/.env (a real Postgres
URL for local dev) — the app then hangs at startup trying to reach a Postgres host that isn't
listening. Neutralize load_dotenv before app.db (or anything importing it) runs.
"""

import os
import dotenv

dotenv.load_dotenv = lambda *args, **kwargs: False

os.environ["DATABASE_URL"] = "sqlite://"
