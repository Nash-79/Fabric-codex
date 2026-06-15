#!/usr/bin/env python3
"""Re-runnable migration: populate the Supabase-backed Atlas server from content/ git files.

This is the "publish" step for the Supabase era. It assumes:
  1. The Supabase KB schema migration has been applied
     (supabase/migrations/*_fabric_atlas_kb.sql — via `supabase db push` or the dashboard).
  2. The FastAPI backend is running with DATABASE_URL pointed at Supabase.

It then:
  - checks the server is reachable,
  - replays content/ (topics -> sources+claims -> diagrams -> blogs) via import_content.py,
  - rebuilds the Postgres tsvector search index (POST /search/rebuild),
  - prints a per-table summary.

Idempotent: import_content.py skips unchanged content and the schema SQL is IF NOT EXISTS,
so this is safe to run repeatedly. Standard library only.

Usage:
    python scripts/migrate_to_supabase.py
    python scripts/migrate_to_supabase.py --base https://atlas.example.com
    python scripts/migrate_to_supabase.py --dry-run
"""
import argparse
import json
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import import_content  # noqa: E402  — reuse the idempotent replay logic


def _get(base: str, path: str):
    with urllib.request.urlopen(base.rstrip("/") + path, timeout=60) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _post(base: str, path: str, payload: dict | None = None):
    data = json.dumps(payload or {}).encode("utf-8")
    req = urllib.request.Request(base.rstrip("/") + path, data=data,
                                 headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=120) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _reachable(base: str) -> bool:
    try:
        _get(base, "/topics")
        return True
    except Exception as e:  # noqa: BLE001
        print(f"  Server not reachable at {base}: {e}")
        print("  Start the backend (uvicorn app.main:app) with DATABASE_URL set to Supabase first.")
        return False


def summarize(base: str) -> dict:
    """Per-table counts straight from the API — the post-migration health snapshot."""
    counts = {}
    try:
        counts["sources"] = len(_get(base, "/sources"))
        counts["topics"] = len(_get(base, "/topics"))
        counts["blogs"] = len(_get(base, "/blogs"))
        counts["claims_verified"] = len(_get(base, "/claims?status=verified"))
        counts["claims_pending"] = len(_get(base, "/claims?status=pending"))
        cov = _get(base, "/coverage")
        counts["capabilities_covered"] = len([k for k, v in cov.items() if v])
    except Exception as e:  # noqa: BLE001
        print(f"  WARN could not read summary: {e}")
    return counts


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://localhost:8000")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    print(f"== Migrate content -> Supabase via {args.base} ==")
    if not args.dry_run and not _reachable(args.base):
        return 2

    # 1. Replay all content (reuses import_content's main, which is idempotent).
    print("\n-- Replaying content/ --")
    sys.argv = ["import_content", "--base", args.base] + (["--dry-run"] if args.dry_run else [])
    rc = import_content.main()
    if rc != 0:
        print("  import_content reported a failure; aborting before search rebuild.")
        return rc

    # 2. Rebuild the Postgres full-text index from the freshly imported live tables.
    if not args.dry_run:
        print("\n-- Rebuilding search index --")
        try:
            res = _post(args.base, "/search/rebuild")
            print(f"  {res}")
        except Exception as e:  # noqa: BLE001
            print(f"  WARN search rebuild failed: {e}")

    # 3. Summary.
    if not args.dry_run:
        print("\n-- Summary --")
        for k, v in summarize(args.base).items():
            print(f"  {k}: {v}")
        print("\nNext: run scripts/replay_verified_status.py once (restores curation status),")
        print("then scripts/validate_migration.py to assert the KB invariants.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
