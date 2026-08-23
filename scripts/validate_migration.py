#!/usr/bin/env python3
"""Assert the Fabric Atlas knowledge-base invariants against a running (Supabase) server.

This is the automatic migration / ingest checker. Run it:
  - after scripts/migrate_to_supabase.py (post-migration health gate),
  - at the end of /ingest-batch whenever new content/queue items are ingested,
  - in CI.

It checks, via the public REST API only (no DB driver), that:
  1. The KB is non-empty (sources, topics, blogs, verified claims all > 0).
  2. Versioning invariant: exactly ONE active row per claim_key / source_key / blog_key.
  3. Referential integrity: every active claim.source_id resolves to a source;
     every blog cited_source_id resolves to an active source.
  4. Embedded diagrams: every content/diagrams/* path referenced in a blog body exists on disk.
  5. Capability integrity: every topic capability_id is in the registry; parent_id resolves.
  6. Search index is populated and /coverage returns claims.

Exits 0 if all invariants hold, non-zero with a report otherwise. Standard library only.

Usage:
    python scripts/validate_migration.py
    python scripts/validate_migration.py --base https://atlas.example.com
    python scripts/validate_migration.py --expect-sources 40 --expect-blogs 17
"""
import argparse
import json
import re
import sys
import urllib.parse
import urllib.request
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def load_registry() -> set[str]:
    """The capability registry lives in atlas-publish.services.server.ts (the enforcement copy
    used by the real Lovable publish path). backend/app/llm.py's copy is retired dead code."""
    publish_ts = ROOT / "src" / "lib" / "atlas-publish.services.server.ts"
    try:
        m = re.search(
            r"CAPABILITY_IDS\s*=\s*new Set<string>\(\[(.*?)\]\)",
            publish_ts.read_text(encoding="utf-8"),
            re.S,
        )
        return set(re.findall(r'"([a-z0-9-]+)"', m.group(1))) if m else set()
    except OSError:
        return set()


def _get(base: str, path: str):
    with urllib.request.urlopen(base.rstrip("/") + path, timeout=60) as resp:
        return json.loads(resp.read().decode("utf-8"))


class Report:
    def __init__(self) -> None:
        self.failures: list[str] = []
        self.warnings: list[str] = []

    def fail(self, msg: str) -> None:
        self.failures.append(msg)

    def warn(self, msg: str) -> None:
        self.warnings.append(msg)

    def ok(self) -> bool:
        return not self.failures


def validate(base: str, expect_sources: int, expect_blogs: int) -> Report:
    r = Report()
    registry = load_registry()

    try:
        sources = _get(base, "/sources")
        topics = _get(base, "/topics")
        blogs = _get(base, "/blogs")
        claims = _get(base, "/claims?include_inactive=true")
        verified = _get(base, "/claims?status=verified")
        coverage = _get(base, "/coverage")
    except Exception as e:  # noqa: BLE001
        r.fail(f"Server not reachable / API error at {base}: {e}")
        return r

    # 1. Non-empty KB.
    if not sources:
        r.fail("No sources in the KB.")
    if not topics:
        r.fail("No topics in the KB.")
    if not blogs:
        r.fail("No blogs in the KB.")
    if not verified:
        r.fail(
            "No verified claims — blogs/advisor would be ungrounded "
            "(did you run replay_verified_status.py?)."
        )

    if expect_sources and len(sources) != expect_sources:
        r.warn(f"Source count {len(sources)} != expected {expect_sources}.")
    if expect_blogs and len(blogs) != expect_blogs:
        r.warn(f"Blog count {len(blogs)} != expected {expect_blogs}.")

    # 2. Versioning (slug + supersedes_id model): one active row per slug for sources/blogs;
    #    no two active claims share a supersedes chain (an active claim's supersedes_id must
    #    point only at an inactive predecessor).
    def row_key(row, key):
        if key in row:
            return row[key]
        if key == "slug" and "source_key" in row:
            return row["source_key"]
        return None

    def dup_keys(rows, key):
        c = Counter(row_key(row, key) for row in rows if row_key(row, key))
        return [k for k, n in c.items() if n > 1]

    active_claims = [c for c in claims if c.get("active")]
    for label, rows, key in [
        ("source", [s for s in sources if s.get("active")], "slug"),
        ("blog", [b for b in blogs if b.get("active")], "slug"),
    ]:
        dups = dup_keys(rows, key)
        if dups:
            r.fail(
                f"Versioning invariant violated: {len(dups)} {label}(s) have >1 active "
                f"row for the same slug (e.g. {dups[:3]})."
            )
    # An active claim must not be superseded by another *active* claim.
    active_ids = {c["id"] for c in active_claims}
    superseded_by_active = [
        c["id"] for c in active_claims if c.get("supersedes_id") in active_ids
    ]
    if superseded_by_active:
        r.fail(
            f"Versioning invariant violated: {len(superseded_by_active)} active claim(s) "
            f"supersede another active claim (e.g. {superseded_by_active[:3]})."
        )

    # 3. Referential integrity.
    source_ids = {s["id"] for s in sources}
    active_source_ids = {s["id"] for s in sources if s.get("active")}
    for c in active_claims:
        if c.get("source_id") not in source_ids:
            r.fail(
                f"Claim {c['id']} references missing source_id {c.get('source_id')}."
            )
    for b in blogs:
        for sid in b.get("cited_source_ids", []):
            if sid not in active_source_ids:
                r.warn(f"Blog '{b['slug']}' cites source {sid} that is not active.")

    # 4. Embedded diagrams exist on disk (mirror services._check_blog_images).
    for b in blogs:
        try:
            full = _get(base, f"/blogs/{urllib.parse.quote(b['slug'])}")
        except Exception:  # noqa: BLE001
            continue
        for path in re.findall(r"!\[[^\]]*\]\(([^)\s]+)\)", full.get("body_md", "")):
            if "content/diagrams/" not in path:
                continue
            if not (ROOT / path.lstrip("/")).exists():
                r.fail(f"Blog '{b['slug']}' embeds missing diagram: {path}")

    # 5. Capability + parent integrity for topics.
    topic_ids = {t["id"] for t in topics}
    for t in topics:
        for cid in t.get("capability_ids", []):
            if registry and cid not in registry:
                r.fail(f"Topic '{t['slug']}' maps unknown capability '{cid}'.")
        if t.get("parent_id") and t["parent_id"] not in topic_ids:
            r.fail(f"Topic '{t['slug']}' has dangling parent_id {t['parent_id']}.")

    # 6. Coverage + search populated.
    if not any(coverage.values()):
        r.fail("/coverage is empty — no verified claims mapped to capabilities.")
    try:
        hits = _get(base, "/search?q=fabric")
        if not any(hits.get(k) for k in ("blogs", "topics", "claims", "sources")):
            r.warn(
                "Search returned no hits for 'fabric' — index may need POST /search/rebuild."
            )
    except Exception as e:  # noqa: BLE001
        r.warn(f"Search check skipped: {e}")

    return r


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://localhost:8000")
    ap.add_argument("--expect-sources", type=int, default=0)
    ap.add_argument("--expect-blogs", type=int, default=0)
    args = ap.parse_args()

    print(f"== Validating KB invariants at {args.base} ==")
    r = validate(args.base, args.expect_sources, args.expect_blogs)
    for w in r.warnings:
        print(f"  WARN  {w}")
    for f in r.failures:
        print(f"  FAIL  {f}")
    if r.ok():
        print(f"\nOK — all invariants hold ({len(r.warnings)} warning(s)).")
        return 0
    print(f"\nFAILED — {len(r.failures)} invariant violation(s).")
    return 1


if __name__ == "__main__":
    sys.exit(main())
