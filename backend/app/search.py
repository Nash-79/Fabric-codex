"""Full-text search over the knowledge base (SQLite FTS5).

Design notes:
- One unified FTS5 table `search_index(title, body, tags, kind, ref_id)` over claims,
  sources, blogs, and topics. Content rows are append-only in this system (claims and
  blogs are versioned, never edited), so INSERTs at creation time are the only index
  events; status flips (verify, supersede, needs_review) never touch the index because
  results are hydrated from the live tables at query time and inactive rows are dropped
  there.
- `rebuild_search_index` repopulates from scratch — called at startup when the index is
  empty (covers pre-existing databases) and exposed as POST /search/rebuild.
- Degrades gracefully: on Postgres or a SQLite build without FTS5, falls back to a
  LIKE scan over the same fields. See docs/extending.md for the pgvector/tsvector path.
"""
from __future__ import annotations
import logging
import re
from typing import Optional

from sqlalchemy import text
from sqlmodel import Session, select

from app.models import Source, Claim, Blog, Topic, load_tags

log = logging.getLogger(__name__)

_FTS_DDL = ("CREATE VIRTUAL TABLE IF NOT EXISTS search_index "
            "USING fts5(title, body, tags, kind UNINDEXED, ref_id UNINDEXED)")


def _fts_available(session: Session) -> bool:
    conn = session.connection()
    if conn.engine.url.get_backend_name() != "sqlite":
        return False
    try:
        conn.execute(text(_FTS_DDL))
        return True
    except Exception:  # noqa: BLE001 — sqlite built without FTS5
        return False


def _insert(session: Session, kind: str, ref_id: str, title: str, body: str,
            tags: list[str]) -> None:
    session.connection().execute(
        text("INSERT INTO search_index (title, body, tags, kind, ref_id) "
             "VALUES (:title, :body, :tags, :kind, :ref_id)"),
        {"title": title or "", "body": body or "", "tags": " ".join(tags or []),
         "kind": kind, "ref_id": ref_id})


def index_claim(session: Session, claim: Claim) -> None:
    if _fts_available(session):
        _insert(session, "claim", claim.id, claim.capability_id, claim.text,
                load_tags(claim.tags_json))


def index_source(session: Session, src: Source) -> None:
    if _fts_available(session):
        body = " ".join(filter(None, [src.summary, src.why_it_matters, src.audience]))
        _insert(session, "source", src.id, src.title, body, load_tags(src.tags_json))


def index_blog(session: Session, blog: Blog) -> None:
    if _fts_available(session):
        _insert(session, "blog", blog.id, blog.title,
                " ".join(filter(None, [blog.summary, blog.body_md])),
                load_tags(blog.tags_json))


def index_topic(session: Session, topic: Topic) -> None:
    if _fts_available(session):
        _insert(session, "topic", topic.id, topic.name, topic.description,
                load_tags(topic.tags_json))


def rebuild_search_index(session: Session) -> dict:
    """Repopulate the index from the live tables. Active rows only — superseded and
    deprecated content is history, not search surface."""
    if not _fts_available(session):
        return {"rebuilt": False, "reason": "FTS5 unavailable on this database backend."}
    session.connection().execute(text("DELETE FROM search_index"))
    counts = {"claim": 0, "source": 0, "blog": 0, "topic": 0}
    for c in session.exec(select(Claim).where(Claim.active == True)).all():  # noqa: E712
        index_claim(session, c)
        counts["claim"] += 1
    for s in session.exec(select(Source).where(Source.active == True)).all():  # noqa: E712
        index_source(session, s)
        counts["source"] += 1
    for b in session.exec(select(Blog).where(Blog.active == True)).all():  # noqa: E712
        index_blog(session, b)
        counts["blog"] += 1
    for t in session.exec(select(Topic).where(Topic.active == True)).all():  # noqa: E712
        index_topic(session, t)
        counts["topic"] += 1
    session.commit()
    return {"rebuilt": True, "indexed": counts}


def ensure_index(session: Session) -> None:
    """Startup hook: populate the index when it is empty but the KB is not — the
    upgrade path for databases that predate the search feature."""
    if not _fts_available(session):
        return
    n = session.connection().execute(text("SELECT count(*) FROM search_index")).scalar()
    if n == 0 and session.exec(select(Claim)).first() is not None:
        log.info("search index empty — rebuilding from live tables")
        rebuild_search_index(session)


def _match_query(q: str) -> str:
    """Quote each token (prefix match) so user input can't break FTS5 syntax."""
    tokens = re.findall(r"\w+", q or "")
    return " ".join(f'"{t}"*' for t in tokens)


def _norm_tag(tag: str) -> str:
    return (tag or "").lstrip("#").lower()


def search(session: Session, q: str, kind: Optional[str] = None,
           tag: Optional[str] = None, capability: Optional[str] = None,
           limit: int = 20) -> dict:
    """Grouped search results. Hydrates every hit from the live tables so status,
    activity, and filters always reflect current state, not index-time state."""
    groups: dict[str, list] = {"blogs": [], "topics": [], "claims": [], "sources": []}
    if not (q or "").strip():
        return groups
    if _fts_available(session):
        match = _match_query(q)
        if not match:
            return groups
        sql = ("SELECT kind, ref_id, snippet(search_index, 1, '<b>', '</b>', '…', 14) "
               "FROM search_index WHERE search_index MATCH :m ")
        params = {"m": match}
        if kind:
            sql += "AND kind = :k "
            params["k"] = kind
        sql += "ORDER BY rank LIMIT :n"
        params["n"] = limit * 8   # overfetch: hydration drops inactive/filtered rows
        rows = session.connection().execute(text(sql), params).fetchall()
    else:
        rows = _like_rows(session, q, kind, limit * 8)

    for row_kind, ref_id, snippet in rows:
        hit = _hydrate(session, row_kind, ref_id, snippet)
        if hit is None:
            continue
        if tag and _norm_tag(tag) not in [t.lower() for t in hit.get("tags", [])]:
            continue
        if capability and capability not in hit.get("capability_ids", [hit.get("capability_id")]):
            continue
        bucket = {"blog": "blogs", "topic": "topics", "claim": "claims",
                  "source": "sources"}[row_kind]
        if len(groups[bucket]) < limit:
            groups[bucket].append(hit)
    return groups


def _hydrate(session: Session, kind: str, ref_id: str, snippet: str) -> Optional[dict]:
    if kind == "claim":
        c = session.get(Claim, ref_id)
        if not c or not c.active:
            return None
        return {"kind": "claim", "ref": c.id, "id": c.id, "title": c.capability_id,
                "capability_id": c.capability_id, "status": c.status, "depth": c.depth,
                "tags": load_tags(c.tags_json), "snippet": snippet}
    if kind == "source":
        s = session.get(Source, ref_id)
        if not s or not s.active:
            return None
        return {"kind": "source", "ref": s.source_key, "id": s.id, "title": s.title,
                "tier": s.tier, "url": s.url, "tags": load_tags(s.tags_json),
                "snippet": snippet}
    if kind == "blog":
        b = session.get(Blog, ref_id)
        if not b or not b.active:
            return None
        return {"kind": "blog", "ref": b.slug, "id": b.id, "title": b.title,
                "status": b.status, "topic_id": b.topic_id,
                "tags": load_tags(b.tags_json), "snippet": snippet}
    if kind == "topic":
        t = session.get(Topic, ref_id)
        if not t or not t.active:
            return None
        import json
        return {"kind": "topic", "ref": t.slug, "id": t.id, "title": t.name,
                "capability_ids": json.loads(t.capability_ids_json or "[]"),
                "tags": load_tags(t.tags_json), "snippet": snippet}
    return None


def _like_rows(session: Session, q: str, kind: Optional[str], limit: int) -> list[tuple]:
    """Fallback when FTS5 is unavailable (e.g. Postgres): LIKE scan with a crude
    excerpt. Upgrade path: tsvector/pgvector — see docs/extending.md."""
    needle = f"%{q.lower()}%"
    rows: list[tuple] = []

    def excerpt(body: str) -> str:
        i = (body or "").lower().find(q.lower())
        if i < 0:
            return (body or "")[:120]
        start = max(0, i - 40)
        return ("…" if start else "") + body[start:i] + "<b>" + body[i:i + len(q)] + "</b>" \
            + body[i + len(q):i + len(q) + 60] + "…"

    if kind in (None, "claim"):
        for c in session.exec(select(Claim).where(Claim.active == True)).all():  # noqa: E712
            if needle.strip("%") in c.text.lower():
                rows.append(("claim", c.id, excerpt(c.text)))
    if kind in (None, "source"):
        for s in session.exec(select(Source).where(Source.active == True)).all():  # noqa: E712
            hay = " ".join([s.title, s.summary or ""])
            if needle.strip("%") in hay.lower():
                rows.append(("source", s.id, excerpt(hay)))
    if kind in (None, "blog"):
        for b in session.exec(select(Blog).where(Blog.active == True)).all():  # noqa: E712
            hay = " ".join([b.title, b.summary or "", b.body_md or ""])
            if needle.strip("%") in hay.lower():
                rows.append(("blog", b.id, excerpt(hay)))
    if kind in (None, "topic"):
        for t in session.exec(select(Topic).where(Topic.active == True)).all():  # noqa: E712
            hay = " ".join([t.name, t.description or ""])
            if needle.strip("%") in hay.lower():
                rows.append(("topic", t.id, excerpt(hay)))
    return rows[:limit]
