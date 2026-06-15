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
BLOGS = ROOT / "content" / "blogs"
TOPICS_FILE = ROOT / "content" / "topics.json"
ASSET_MANIFEST = ROOT / "content" / "diagrams" / "assets.json"

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


def get(base: str, path: str):
    with urllib.request.urlopen(base.rstrip("/") + path, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def replay_asset_manifest(base: str, dry_run: bool) -> tuple[int, int]:
    """Replay standalone generated assets (capability diagrams) from the git-tracked
    manifest. Source-attached assets replay via their source files; these don't,
    so the manifest keeps them rebuildable. Idempotent: registered paths are skipped."""
    if not ASSET_MANIFEST.exists():
        return 0, 0
    entries = json.loads(ASSET_MANIFEST.read_text(encoding="utf-8"))
    try:
        existing = {a.get("path") for a in get(base, "/assets") if a.get("path")}
    except Exception:  # noqa: BLE001 — dry runs may have no server
        existing = set()
    added = skipped = 0
    for a in entries:
        if a.get("path") in existing:
            skipped += 1
            continue
        if not dry_run:
            post(base, "/assets", a)
        added += 1
    return added, skipped


def replay_topics(base: str, registry: list[str], dry_run: bool) -> tuple[int, int]:
    """Replay the topic tree from content/topics.json. Parents are referenced by
    parent_slug and must appear before their children in the file. Idempotent:
    existing slugs are skipped (rename/describe via PATCH /topics, not re-seed)."""
    if not TOPICS_FILE.exists():
        return 0, 0
    entries = json.loads(TOPICS_FILE.read_text(encoding="utf-8"))
    try:
        existing = {t["slug"]: t["id"] for t in get(base, "/topics")}
    except Exception:  # noqa: BLE001 — dry runs may have no server
        existing = {}
    added = skipped = 0
    slug_to_id = dict(existing)
    for t in entries:
        for cid in t.get("capability_ids", []):
            if registry and cid not in registry:
                print(f"  WARN topics.json: '{t.get('slug')}' maps unknown capability '{cid}'")
        if t["slug"] in existing:
            skipped += 1
            continue
        parent_slug = t.get("parent_slug")
        if parent_slug and parent_slug not in slug_to_id and not dry_run:
            print(f"  WARN topics.json: '{t['slug']}' parent '{parent_slug}' not found — created as root")
        if dry_run:
            added += 1
            slug_to_id[t["slug"]] = "(dry)"
            continue
        payload = {"slug": t["slug"], "name": t.get("name", t["slug"]),
                   "description": t.get("description", ""),
                   "capability_ids": t.get("capability_ids", []),
                   "order": t.get("order", 0), "tags": t.get("tags", []),
                   "parent_id": slug_to_id.get(parent_slug)}
        try:
            created = post(base, "/topics", payload)
            slug_to_id[t["slug"]] = created["id"]
            added += 1
        except Exception as e:  # noqa: BLE001
            print(f"  FAIL topic '{t['slug']}': {e}")
    return added, skipped


def replay_blogs(base: str, dry_run: bool) -> tuple[int, int]:
    """Replay blog articles from content/blogs/*.json. The files store portable keys
    (topic_slug + cited_source_keys) because DB ids differ across servers; both are
    resolved here before POST. Re-posting an unchanged article is skipped; a changed
    body supersedes the active version on the server (append-only)."""
    files = sorted(BLOGS.glob("*.json")) if BLOGS.is_dir() else []
    if not files:
        return 0, 0
    try:
        topics = {t["slug"]: t["id"] for t in get(base, "/topics")}
        sources = {s["source_key"]: s["id"] for s in get(base, "/sources") if s.get("active")}
    except Exception:  # noqa: BLE001
        topics, sources = {}, {}
    added = skipped = 0
    for f in files:
        try:
            b = json.loads(f.read_text(encoding="utf-8"))
        except json.JSONDecodeError as e:
            print(f"  SKIP {f.name}: invalid JSON ({e})")
            continue
        if not b.get("cited_source_keys"):
            print(f"  WARN {f.name}: blog has no cited_source_keys — the server will reject it")
        if dry_run:
            print(f"  DRY  blog {f.name}: '{b.get('title')}' -> topic '{b.get('topic_slug')}'")
            added += 1
            continue
        topic_id = topics.get(b.get("topic_slug"))
        if not topic_id:
            print(f"  FAIL {f.name}: topic slug '{b.get('topic_slug')}' not on server (seed topics first)")
            continue
        cited, missing = [], []
        for key in b.get("cited_source_keys", []):
            (cited if key in sources else missing).append(sources.get(key, key))
        if missing:
            print(f"  FAIL {f.name}: cited source key(s) not on server: {missing}")
            continue
        slug = b.get("slug") or f.stem
        try:
            current = get(base, f"/blogs/{slug}")
            if current.get("body_md") == b.get("body_md"):
                skipped += 1
                continue
        except Exception:  # noqa: BLE001 — 404 = new blog
            pass
        payload = {"topic_id": topic_id, "slug": slug, "title": b.get("title", ""),
                   "summary": b.get("summary", ""), "body_md": b.get("body_md", ""),
                   "cited_source_ids": cited, "tags": b.get("tags", []),
                   "depth_levels": b.get("depth_levels", []), "assets": b.get("assets", [])}
        try:
            res = post(base, "/blogs", payload)
            print(f"  OK   blog {f.name}: v{res.get('version')} '{res.get('title')}'"
                  " — run /validate-blog or the validation-reviewer before sharing")
            added += 1
        except Exception as e:  # noqa: BLE001
            print(f"  FAIL {f.name}: {e}")
    return added, skipped


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
    registry = load_registry()

    # Topics first — blogs reference them, and sources are independent of them.
    t_added, t_skipped = replay_topics(args.base, registry, args.dry_run)
    if t_added or t_skipped:
        print(f"  Topics: {t_added} created, {t_skipped} already present.")

    if not files:
        print(f"No content files in {SOURCES}. Author some with the knowledge-curator agent first.")
        return 0

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

    dia_added, dia_skipped = replay_asset_manifest(args.base, args.dry_run)
    if dia_added or dia_skipped:
        print(f"  Diagram manifest: {dia_added} registered, {dia_skipped} already present.")

    # Blogs last — they cite sources and hang off topics, so both must exist first.
    b_added, b_skipped = replay_blogs(args.base, args.dry_run)
    if b_added or b_skipped:
        print(f"  Blogs: {b_added} published, {b_skipped} unchanged.")

    print(f"\nPublished {len(files)} source file(s): ~{total_claims} claims, ~{total_assets} assets"
          f"{' (dry run)' if args.dry_run else ''}."
          + (f" {warnings} warning(s) above need attention." if warnings else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main())
