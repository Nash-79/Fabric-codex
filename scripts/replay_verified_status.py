#!/usr/bin/env python3
"""One-time: restore claim curation status from the old SQLite DB onto the Supabase server.

content/*.json carries no per-claim status, so a clean re-import lands every claim as
`pending`. The retired SQLite database (backend/fabric_atlas.db) holds the human curation
work — ~440 verified claims, a few rejected. This script reads that status and replays it
onto the freshly imported claims in Supabase via the REST API.

Matching: claims are matched by (capability_id, normalized text), since the 12-char hex ids
differ between the old DB and the fresh import. Normalization collapses whitespace so minor
formatting differences don't block a match.

Idempotent: already-verified/rejected claims on the server are skipped, so re-running is safe.
Run ONCE, right after the first `migrate_to_supabase.py`. Standard library only.

Usage:
    python scripts/replay_verified_status.py
    python scripts/replay_verified_status.py --base https://atlas.example.com \
        --sqlite backend/fabric_atlas.db
    python scripts/replay_verified_status.py --dry-run
"""
import argparse
import json
import re
import sqlite3
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DB = ROOT / "backend" / "fabric_atlas.db"


def _norm(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "")).strip().lower()


def _key(capability_id: str, text: str) -> tuple:
    return (capability_id or "", _norm(text))


def _get(base: str, path: str):
    with urllib.request.urlopen(base.rstrip("/") + path, timeout=60) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _post(base: str, path: str):
    req = urllib.request.Request(base.rstrip("/") + path, data=b"{}",
                                 headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode("utf-8"))


def read_old_status(db_path: Path) -> dict:
    """Map (capability_id, normalized text) -> status for active curated claims in SQLite."""
    if not db_path.exists():
        print(f"  Old SQLite DB not found at {db_path} — nothing to replay.")
        return {}
    conn = sqlite3.connect(str(db_path))
    out: dict = {}
    rows = conn.execute(
        "SELECT capability_id, text, status FROM claim "
        "WHERE active = 1 AND status IN ('verified', 'rejected')").fetchall()
    for capability_id, text, status in rows:
        out[_key(capability_id, text)] = status
    conn.close()
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://localhost:8000")
    ap.add_argument("--sqlite", default=str(DEFAULT_DB))
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    old = read_old_status(Path(args.sqlite))
    if not old:
        return 0
    n_ver = sum(1 for v in old.values() if v == "verified")
    n_rej = sum(1 for v in old.values() if v == "rejected")
    print(f"Old DB: {n_ver} verified, {n_rej} rejected claim(s) to replay.")

    # Pull current server claims (include inactive so we can match rejected-but-deactivated).
    try:
        server_claims = _get(args.base, "/claims?include_inactive=true")
    except Exception as e:  # noqa: BLE001
        print(f"  Server not reachable at {args.base}: {e}")
        return 2

    applied = skipped = unmatched = 0
    matched_keys = set()
    for c in server_claims:
        k = _key(c.get("capability_id", ""), c.get("text", ""))
        want = old.get(k)
        if want is None:
            continue
        matched_keys.add(k)
        if c.get("status") == want:
            skipped += 1
            continue
        # Only transition pending claims (verify/reject require pending+active on the server).
        if c.get("status") != "pending":
            skipped += 1
            continue
        verb = "verify" if want == "verified" else "reject"
        if args.dry_run:
            print(f"  DRY  {verb} {c['id']} ({c['capability_id']}) {c['text'][:60]}…")
            applied += 1
            continue
        try:
            _post(args.base, f"/claims/{c['id']}/{verb}")
            applied += 1
        except Exception as e:  # noqa: BLE001
            print(f"  FAIL {verb} {c['id']}: {e}")

    unmatched = len(old) - len(matched_keys)
    print(f"\n{'(dry run) ' if args.dry_run else ''}Applied {applied}, "
          f"skipped {skipped} (already set / not pending), unmatched {unmatched}.")
    if unmatched:
        print("  Unmatched claims usually mean the text was edited since the old DB; "
              "review those manually in the curation UI.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
