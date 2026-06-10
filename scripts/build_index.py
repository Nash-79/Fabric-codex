#!/usr/bin/env python3
"""Local DuckDB retrieval index over the knowledge base (read side only).

The SQLite app DB stays the system of record; this builds a derived, throwaway
analytical index the agents can use for fast scoped retrieval at scale:

  - claims + source metadata in one denormalised table
  - BM25 full-text search over claim text + tags (DuckDB `fts` extension)
  - a coverage cube view (capability x depth)

Rebuild any time (it is derived data — gitignored, never authoritative):
    python scripts/build_index.py --rebuild                 # needs duckdb: pip install duckdb
    python scripts/build_index.py --search "direct lake framing eviction"
    python scripts/build_index.py --search "shortcut security" --capability onelake -n 5

Agents: prefer the REST API for small KBs; switch to this index when /claims gets large.
Upgrade path: the same table can be managed as a DuckLake catalog (ATTACH 'ducklake:...')
to gain snapshot time-travel over the claim store — see docs/extending.md.
"""
import argparse
import json
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INDEX = ROOT / "var" / "atlas_index.duckdb"


def fetch(base: str, path: str):
    with urllib.request.urlopen(base.rstrip("/") + path, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def rebuild(base: str) -> int:
    import duckdb

    claims = fetch(base, "/claims")
    sources = {s["id"]: s for s in fetch(base, "/sources")}
    if not claims:
        print("No active claims in the backend — publish first (scripts/import_content.py).")
        return 1

    rows = [{
        "id": c["id"], "claim_key": c["claim_key"], "version": c["version"],
        "capability_id": c["capability_id"], "depth": c["depth"], "type": c["type"],
        "status": c["status"], "text": c["text"], "tags": " ".join(c.get("tags") or []),
        "source_id": c["source_id"],
        "source_title": sources.get(c["source_id"], {}).get("title", ""),
        "source_url": sources.get(c["source_id"], {}).get("url", ""),
        "tier": sources.get(c["source_id"], {}).get("tier", 6),
    } for c in claims]

    INDEX.parent.mkdir(parents=True, exist_ok=True)
    if INDEX.exists():
        INDEX.unlink()
    con = duckdb.connect(str(INDEX))
    con.execute("""
        CREATE TABLE claims (
            id VARCHAR, claim_key VARCHAR, version INTEGER, capability_id VARCHAR,
            depth INTEGER, type VARCHAR, status VARCHAR, text VARCHAR, tags VARCHAR,
            source_id VARCHAR, source_title VARCHAR, source_url VARCHAR, tier INTEGER)
    """)
    con.executemany(
        "INSERT INTO claims VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
        [[r[k] for k in ("id", "claim_key", "version", "capability_id", "depth", "type",
                         "status", "text", "tags", "source_id", "source_title",
                         "source_url", "tier")] for r in rows])
    con.execute("""
        CREATE VIEW coverage AS
        SELECT capability_id, depth, count(*) AS n
        FROM claims GROUP BY capability_id, depth ORDER BY capability_id, depth
    """)
    con.execute("INSTALL fts; LOAD fts;")
    con.execute("PRAGMA create_fts_index('claims', 'id', 'text', 'tags')")
    con.close()
    print(f"Indexed {len(rows)} claims from {len(sources)} sources -> {INDEX}")
    return 0


def search(query: str, capability: str | None, limit: int) -> int:
    import duckdb

    if not INDEX.exists():
        print("Index missing — run with --rebuild first.")
        return 1
    con = duckdb.connect(str(INDEX), read_only=True)
    con.execute("LOAD fts;")
    where = "score IS NOT NULL" + (" AND capability_id = ?" if capability else "")
    params = [query] + ([capability] if capability else []) + [limit]
    rows = con.execute(f"""
        SELECT score, capability_id, depth, status, tier, source_title, text
        FROM (SELECT *, fts_main_claims.match_bm25(id, ?) AS score FROM claims)
        WHERE {where} ORDER BY score DESC LIMIT ?
    """, params).fetchall()
    con.close()
    if not rows:
        print("No matches.")
        return 0
    for score, cap, depth, status, tier, title, text in rows:
        print(f"[{score:5.2f}] ({cap}, L{depth}, {status}, T{tier}) {text}\n        src: {title}")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://localhost:8000")
    ap.add_argument("--rebuild", action="store_true")
    ap.add_argument("--search")
    ap.add_argument("--capability")
    ap.add_argument("-n", type=int, default=10)
    args = ap.parse_args()
    if args.rebuild:
        rc = rebuild(args.base)
        if rc or not args.search:
            return rc
    if args.search:
        return search(args.search, args.capability, args.n)
    if not args.rebuild:
        print(__doc__)
    return 0


if __name__ == "__main__":
    sys.exit(main())
