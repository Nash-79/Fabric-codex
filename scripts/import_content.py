#!/usr/bin/env python3
"""Publish locally-authored content to a Fabric Atlas server.

The agents author content as git-tracked files under content/. This script replays those files
into a running backend (local or remote) via the REST API — the "publish" step in the
build-locally / serve-on-server model. It uses only the standard library (no extra deps) so it
runs anywhere.

Usage:
    python scripts/import_content.py                       # -> http://localhost:8000
    python scripts/import_content.py --base https://atlas.example.com
    python scripts/import_content.py --dry-run             # parse + report, no POST

It is safe to re-run: the backend treats a re-ingest of an existing source as a drift check.
"""
import argparse
import json
import re
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCES = ROOT / "content" / "sources"

VALID_TYPES = {"fact", "pattern", "antipattern", "internal"}


def load_registry() -> list[str]:
    """The capability registry lives in backend/app/llm.py (the enforcement copy).

    The backend silently drops claims whose capability_id is not in CAPABILITY_IDS,
    so we pre-validate here and warn loudly instead of losing claims quietly.
    """
    llm_py = ROOT / "backend" / "app" / "llm.py"
    try:
        m = re.search(r"CAPABILITY_IDS\s*=\s*\[(.*?)\]", llm_py.read_text(encoding="utf-8"), re.S)
        return re.findall(r'"([a-z0-9-]+)"', m.group(1)) if m else []
    except OSError:
        return []


def lint(payload: dict, registry: list[str]) -> list[str]:
    """Pre-flight checks mirroring what the backend enforces (or silently drops)."""
    problems = []
    for i, cl in enumerate(payload.get("claims", [])):
        cid = cl.get("capability_id") or cl.get("capabilityId")
        if registry and cid not in registry:
            problems.append(f"claim[{i}] would be DROPPED: unknown capability_id '{cid}'")
        if not cl.get("text"):
            problems.append(f"claim[{i}] would be DROPPED: empty text")
        if cl.get("type") and cl["type"] not in VALID_TYPES:
            problems.append(f"claim[{i}] type '{cl['type']}' is non-standard (kept, but check it)")
    for i, a in enumerate(payload.get("assets", [])):
        if a.get("kind") == "referenced" and not a.get("attribution"):
            problems.append(f"asset[{i}] referenced image lacks attribution")
    return problems


def post(base: str, path: str, payload: dict) -> dict:
    req = urllib.request.Request(
        base.rstrip("/") + path,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://localhost:8000")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    files = sorted(SOURCES.glob("*.json"))
    if not files:
        print(f"No content files in {SOURCES}. Author some with the knowledge-curator agent first.")
        return 0

    registry = load_registry()
    total_claims = total_assets = warnings = 0
    for f in files:
        try:
            payload = json.loads(f.read_text(encoding="utf-8"))
        except json.JSONDecodeError as e:
            print(f"  SKIP {f.name}: invalid JSON ({e})")
            continue
        for p in lint(payload, registry):
            print(f"  WARN {f.name}: {p}")
            warnings += 1
        claims, assets = len(payload.get("claims", [])), len(payload.get("assets", []))
        if args.dry_run:
            print(f"  DRY  {f.name}: {claims} claims, {assets} assets -> {payload.get('title')}")
            total_claims += claims
            total_assets += assets
            continue
        try:
            res = post(args.base, "/sources/ingest", payload)
        except Exception as e:  # noqa: BLE001
            print(f"  FAIL {f.name}: {e}")
            continue
        if res.get("drift"):
            print(f"  DRIFT {f.name}: +{res.get('added',0)} ~{res.get('changed',0)} "
                  f"-{res.get('removed',0)} ={res.get('unchanged',0)}")
        else:
            print(f"  OK   {f.name}: {res.get('claims_added',0)} claims, "
                  f"{res.get('assets_added',0)} assets")
        total_claims += res.get("claims_added", claims)
        total_assets += res.get("assets_added", assets)

    print(f"\nPublished {len(files)} source file(s): ~{total_claims} claims, ~{total_assets} assets"
          f"{' (dry run)' if args.dry_run else ''}."
          + (f" {warnings} warning(s) above need attention." if warnings else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main())
