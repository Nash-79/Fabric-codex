#!/usr/bin/env python3
"""Local DuckDB retrieval index over the knowledge base (read side only).

The SQLite app DB stays the system of record; this builds a derived, throwaway
analytical index the agents can use for fast scoped retrieval at scale:

  - claims + source metadata in one denormalised table
  - BM25 full-text search over claim text + tags (DuckDB `fts` extension)
  - a coverage cube view (capability x depth)

Rebuild any time (it is derived data — gitignored, never authoritative):
    python scripts/build_index.py --rebuild                 # needs duckdb: pip install duckdb
    python scripts/build_index.py --rebuild --embed         # + sentence-transformers vectors
    python scripts/build_index.py --search "direct lake framing eviction"
    python scripts/build_index.py --search "shortcut security" --capability onelake -n 5
    python scripts/build_index.py --search "how column data loads" --semantic

Semantic search is deliberately local-CLI-only: the server stays deterministic (no model in
the FastAPI process); agents — who already run locally — get the semantic layer here.
`--embed` needs `pip install sentence-transformers` and downloads the model on first use;
without it the script degrades to BM25. Keep EMBED_MODEL pinned: vectors from different
models do not compare.

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

EMBED_MODEL = "all-MiniLM-L6-v2"   # 384-dim; pinned — see module docstring
EMBED_DIM = 384


def _load_embedder():
    try:
        from sentence_transformers import SentenceTransformer
    except ImportError:
        print("sentence-transformers not installed (pip install sentence-transformers) — "
              "continuing without embeddings.")
        return None
    return SentenceTransformer(EMBED_MODEL)


def fetch(base: str, path: str):
    with urllib.request.urlopen(base.rstrip("/") + path, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def rebuild(base: str, embed: bool = False) -> int:
    import duckdb

    claims = fetch(base, "/claims")
    sources = {s["id"]: s for s in fetch(base, "/sources")}
    try:
        blogs = [fetch(base, f"/blogs/{b['slug']}") for b in fetch(base, "/blogs")]
        topics = fetch(base, "/topics")
    except Exception:  # noqa: BLE001 — older server without the portal layer
        blogs, topics = [], []
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
        "source_summary": sources.get(c["source_id"], {}).get("summary", ""),
        "source_takeaways": " ".join(sources.get(c["source_id"], {}).get("takeaways", []) or []),
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
            source_id VARCHAR, source_title VARCHAR, source_url VARCHAR,
            source_summary VARCHAR, source_takeaways VARCHAR, tier INTEGER)
    """)
    con.executemany(
        "INSERT INTO claims VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        [[r[k] for k in ("id", "claim_key", "version", "capability_id", "depth", "type",
                         "status", "text", "tags", "source_id", "source_title",
                         "source_url", "source_summary", "source_takeaways", "tier")]
         for r in rows])
    con.execute("""
        CREATE VIEW coverage AS
        SELECT capability_id, depth, count(*) AS n
        FROM claims GROUP BY capability_id, depth ORDER BY capability_id, depth
    """)
    con.execute("INSTALL fts; LOAD fts;")
    con.execute("PRAGMA create_fts_index('claims', 'id', 'text', 'tags', "
                "'source_summary', 'source_takeaways')")

    # Portal layer alongside claims: blogs (full article text) and the topic tree.
    con.execute("CREATE TABLE blogs (id VARCHAR, slug VARCHAR, topic_id VARCHAR, "
                "title VARCHAR, summary VARCHAR, body_md VARCHAR, status VARCHAR)")
    con.executemany("INSERT INTO blogs VALUES (?,?,?,?,?,?,?)",
                    [[b["id"], b["slug"], b["topic_id"], b["title"], b.get("summary", ""),
                      b.get("body_md", ""), b["status"]] for b in blogs])
    con.execute("CREATE TABLE topics (id VARCHAR, slug VARCHAR, parent_id VARCHAR, "
                "name VARCHAR, description VARCHAR)")
    con.executemany("INSERT INTO topics VALUES (?,?,?,?,?)",
                    [[t["id"], t["slug"], t.get("parent_id"), t["name"],
                      t.get("description", "")] for t in topics])

    embedded = 0
    if embed and (model := _load_embedder()) is not None:
        con.execute(f"ALTER TABLE claims ADD COLUMN embedding FLOAT[{EMBED_DIM}]")
        vecs = model.encode([r["text"] for r in rows], show_progress_bar=False)
        con.executemany("UPDATE claims SET embedding = ? WHERE id = ?",
                        [[v.tolist(), r["id"]] for v, r in zip(vecs, rows)])
        embedded += len(rows)
        if blogs:
            con.execute(f"ALTER TABLE blogs ADD COLUMN embedding FLOAT[{EMBED_DIM}]")
            bvecs = model.encode([f"{b['title']}\n{b.get('summary', '')}" for b in blogs],
                                 show_progress_bar=False)
            con.executemany("UPDATE blogs SET embedding = ? WHERE id = ?",
                            [[v.tolist(), b["id"]] for v, b in zip(bvecs, blogs)])
            embedded += len(blogs)

    con.close()
    print(f"Indexed {len(rows)} claims from {len(sources)} sources, "
          f"{len(blogs)} blogs, {len(topics)} topics"
          + (f", {embedded} embeddings ({EMBED_MODEL})" if embedded else "")
          + f" -> {INDEX}")
    return 0


def search(query: str, capability: str | None, limit: int, semantic: bool = False) -> int:
    import duckdb

    if not INDEX.exists():
        print("Index missing — run with --rebuild first.")
        return 1
    con = duckdb.connect(str(INDEX), read_only=True)
    con.execute("LOAD fts;")
    where = "score IS NOT NULL" + (" AND capability_id = ?" if capability else "")
    params = [query] + ([capability] if capability else []) + [limit]
    rows = con.execute(f"""
        SELECT score, capability_id, depth, status, tier, source_title, text, id
        FROM (SELECT *, fts_main_claims.match_bm25(id, ?) AS score FROM claims)
        WHERE {where} ORDER BY score DESC LIMIT ?
    """, params).fetchall()

    if semantic:
        rows = _fuse_semantic(con, query, capability, limit, rows)

    con.close()
    if not rows:
        print("No matches.")
        return 0
    for score, cap, depth, status, tier, title, text, _id in rows:
        print(f"[{score:5.2f}] ({cap}, L{depth}, {status}, T{tier}) {text}\n        src: {title}")
    return 0


def _fuse_semantic(con, query: str, capability: str | None, limit: int,
                   bm25_rows: list) -> list:
    """Cosine top-k over the embedded claims, fused with BM25 via reciprocal rank
    fusion. Degrades to the BM25 rows when the index has no embeddings or the
    model is unavailable."""
    cols = {r[0] for r in con.execute("PRAGMA table_info('claims')").fetchall()}
    if "embedding" not in cols:
        print("(index has no embeddings — rebuild with --embed; showing BM25 only)\n")
        return bm25_rows
    model = _load_embedder()
    if model is None:
        return bm25_rows
    qvec = model.encode([query], show_progress_bar=False)[0].tolist()
    where = "embedding IS NOT NULL" + (" AND capability_id = ?" if capability else "")
    params = [qvec] + ([capability] if capability else []) + [limit * 2]
    sem_rows = con.execute(f"""
        SELECT array_cosine_similarity(embedding, ?::FLOAT[{EMBED_DIM}]) AS score,
               capability_id, depth, status, tier, source_title, text, id
        FROM claims WHERE {where} ORDER BY score DESC LIMIT ?
    """, params).fetchall()

    # Reciprocal rank fusion: 1/(60+rank) per list, summed per claim id.
    fused: dict[str, float] = {}
    by_id: dict[str, tuple] = {}
    for rank, row in enumerate(bm25_rows):
        fused[row[7]] = fused.get(row[7], 0.0) + 1.0 / (60 + rank)
        by_id[row[7]] = row
    for rank, row in enumerate(sem_rows):
        fused[row[7]] = fused.get(row[7], 0.0) + 1.0 / (60 + rank)
        by_id[row[7]] = row
    ranked = sorted(fused.items(), key=lambda kv: -kv[1])[:limit]
    return [(score,) + by_id[cid][1:] for cid, score in ranked]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://localhost:8000")
    ap.add_argument("--rebuild", action="store_true")
    ap.add_argument("--embed", action="store_true",
                    help="compute sentence-transformers vectors during --rebuild")
    ap.add_argument("--search")
    ap.add_argument("--semantic", action="store_true",
                    help="fuse BM25 with cosine similarity (needs an --embed index)")
    ap.add_argument("--capability")
    ap.add_argument("-n", type=int, default=10)
    args = ap.parse_args()
    if args.rebuild:
        rc = rebuild(args.base, embed=args.embed)
        if rc or not args.search:
            return rc
    if args.search:
        return search(args.search, args.capability, args.n, semantic=args.semantic)
    if not args.rebuild:
        print(__doc__)
    return 0


if __name__ == "__main__":
    sys.exit(main())
