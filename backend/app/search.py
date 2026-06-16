"""Full-text search over the knowledge base.

Backends:
- **Postgres (Supabase)** — Lovable's schema ships per-table GIN `to_tsvector` indexes
  (sources_search_idx, claims_search_idx, blogs_search_idx). We query each table with
  `to_tsvector(...) @@ websearch_to_tsquery(...)` and rank/snippet there. There is no
  separate index table to maintain — Postgres keeps the GIN indexes current automatically,
  so the index_*/rebuild hooks are no-ops on Postgres.
- **SQLite (tests)** — a LIKE scan over the live tables.

Results are always hydrated from the live tables so status/activity reflect current state;
inactive (superseded/deprecated) rows never surface.
"""

from __future__ import annotations
import logging
from typing import Optional

from sqlalchemy import text
from sqlmodel import Session, select

from app.models import Source, Claim, Blog, Topic

log = logging.getLogger(__name__)


def _is_postgres(session: Session) -> bool:
    return session.connection().engine.url.get_backend_name() == "postgresql"


# Index hooks are no-ops: Postgres maintains the GIN indexes; SQLite uses a live LIKE scan.
def index_claim(session: Session, claim: Claim) -> None:  # noqa: D401
    return None


def index_source(session: Session, src: Source) -> None:
    return None


def index_blog(session: Session, blog: Blog) -> None:
    return None


def index_topic(session: Session, topic: Topic) -> None:
    return None


def rebuild_search_index(session: Session) -> dict:
    """No-op: search reads the live tables (Postgres GIN indexes are always current; SQLite
    uses a LIKE scan). Kept for API compatibility with POST /search/rebuild."""
    backend = "postgres" if _is_postgres(session) else "sqlite"
    return {
        "rebuilt": False,
        "reason": f"search reads live tables on {backend}; "
        "no separate index to rebuild.",
    }


def ensure_index(session: Session) -> None:
    return None


def _norm_tag(tag: str) -> str:
    return (tag or "").lstrip("#").lower()


def search(
    session: Session,
    q: str,
    kind: Optional[str] = None,
    tag: Optional[str] = None,
    capability: Optional[str] = None,
    limit: int = 20,
) -> dict:
    """Grouped search results, hydrated from live tables (status/activity always current)."""
    groups: dict[str, list] = {"blogs": [], "topics": [], "claims": [], "sources": []}
    if not (q or "").strip():
        return groups
    rows = (
        _pg_rows(session, q, kind, limit * 8)
        if _is_postgres(session)
        else _like_rows(session, q, kind, limit * 8)
    )

    for row_kind, ref_id, snippet in rows:
        hit = _hydrate(session, row_kind, ref_id, snippet)
        if hit is None:
            continue
        if tag and _norm_tag(tag) not in [t.lower() for t in hit.get("tags", [])]:
            continue
        if capability and capability not in hit.get(
            "capability_ids", [hit.get("capability_id")]
        ):
            continue
        bucket = {
            "blog": "blogs",
            "topic": "topics",
            "claim": "claims",
            "source": "sources",
        }[row_kind]
        if len(groups[bucket]) < limit:
            groups[bucket].append(hit)
    return groups


def _pg_rows(session: Session, q: str, kind: Optional[str], limit: int) -> list[tuple]:
    """Per-table Postgres full-text. Each subquery mirrors the GIN-indexed expression in the
    migration so the index is used; websearch_to_tsquery is injection-safe."""
    parts = []
    if kind in (None, "claim"):
        parts.append(
            "SELECT 'claim' AS kind, id::text AS ref_id, "
            "ts_headline('english', text, websearch_to_tsquery('english', :q), "
            "  'StartSel=<b>,StopSel=</b>,MaxWords=18,MinWords=6') AS snippet, "
            "ts_rank(to_tsvector('english', text), websearch_to_tsquery('english', :q)) AS rank "
            "FROM claims WHERE active AND to_tsvector('english', text) "
            "@@ websearch_to_tsquery('english', :q)"
        )
    if kind in (None, "source"):
        parts.append(
            "SELECT 'source', id::text, "
            "ts_headline('english', coalesce(summary,''), websearch_to_tsquery('english', :q), "
            "  'StartSel=<b>,StopSel=</b>,MaxWords=18,MinWords=6'), "
            "ts_rank(to_tsvector('english', title || ' ' || coalesce(summary,'')), "
            "  websearch_to_tsquery('english', :q)) "
            "FROM sources WHERE active AND "
            "to_tsvector('english', title || ' ' || coalesce(summary,'')) "
            "@@ websearch_to_tsquery('english', :q)"
        )
    if kind in (None, "blog"):
        parts.append(
            "SELECT 'blog', id::text, "
            "ts_headline('english', coalesce(summary,'') || ' ' || coalesce(body_md,''), "
            "  websearch_to_tsquery('english', :q), "
            "  'StartSel=<b>,StopSel=</b>,MaxWords=18,MinWords=6'), "
            "ts_rank(to_tsvector('english', title || ' ' || coalesce(summary,'') || ' ' || "
            "  coalesce(body_md,'')), websearch_to_tsquery('english', :q)) "
            "FROM blogs WHERE active AND "
            "to_tsvector('english', title || ' ' || coalesce(summary,'') || ' ' || "
            "  coalesce(body_md,'')) @@ websearch_to_tsquery('english', :q)"
        )
    if kind in (None, "topic"):
        parts.append(
            "SELECT 'topic', slug, "
            "ts_headline('english', coalesce(description,''), websearch_to_tsquery('english', :q), "
            "  'StartSel=<b>,StopSel=</b>,MaxWords=18,MinWords=6'), "
            "ts_rank(to_tsvector('english', name || ' ' || coalesce(description,'')), "
            "  websearch_to_tsquery('english', :q)) "
            "FROM topics WHERE active AND "
            "to_tsvector('english', name || ' ' || coalesce(description,'')) "
            "@@ websearch_to_tsquery('english', :q)"
        )
    if not parts:
        return []
    sql = " UNION ALL ".join(f"({p})" for p in parts) + " ORDER BY rank DESC LIMIT :n"
    return [
        (r[0], r[1], r[2])
        for r in session.connection()
        .execute(text(sql), {"q": q, "n": limit})
        .fetchall()
    ]


def _hydrate(session: Session, kind: str, ref_id: str, snippet: str) -> Optional[dict]:
    if kind == "claim":
        c = session.get(Claim, ref_id)
        if not c or not c.active:
            return None
        return {
            "kind": "claim",
            "ref": c.id,
            "id": c.id,
            "title": c.capability_id,
            "capability_id": c.capability_id,
            "status": c.status,
            "depth": c.depth,
            "tags": list(c.tags),
            "snippet": snippet,
        }
    if kind == "source":
        s = session.get(Source, ref_id)
        if not s or not s.active:
            return None
        return {
            "kind": "source",
            "ref": s.slug,
            "id": s.id,
            "title": s.title,
            "tier": s.tier,
            "url": s.url,
            "tags": list(s.tags),
            "snippet": snippet,
        }
    if kind == "blog":
        b = session.get(Blog, ref_id)
        if not b or not b.active:
            return None
        return {
            "kind": "blog",
            "ref": b.slug,
            "id": b.id,
            "title": b.title,
            "status": b.status,
            "topic_id": b.topic_slug,
            "tags": list(b.tags),
            "snippet": snippet,
        }
    if kind == "topic":
        t = session.get(Topic, ref_id)
        if not t or not t.active:
            return None
        from app.services import _topic_capabilities

        return {
            "kind": "topic",
            "ref": t.slug,
            "id": t.slug,
            "title": t.name,
            "capability_ids": _topic_capabilities(session, t.slug),
            "tags": list(t.tags),
            "snippet": snippet,
        }
    return None


def _like_rows(
    session: Session, q: str, kind: Optional[str], limit: int
) -> list[tuple]:
    """SQLite test-DB fallback: LIKE scan over live tables with a crude excerpt."""
    needle = q.lower()

    def excerpt(body: str) -> str:
        i = (body or "").lower().find(needle)
        if i < 0:
            return (body or "")[:120]
        start = max(0, i - 40)
        return (
            ("…" if start else "")
            + body[start:i]
            + "<b>"
            + body[i : i + len(q)]
            + "</b>"
            + body[i + len(q) : i + len(q) + 60]
            + "…"
        )

    rows: list[tuple] = []
    if kind in (None, "claim"):
        for c in session.exec(
            select(Claim).where(Claim.active == True)
        ).all():  # noqa: E712
            if needle in c.text.lower():
                rows.append(("claim", c.id, excerpt(c.text)))
    if kind in (None, "source"):
        for s in session.exec(
            select(Source).where(Source.active == True)
        ).all():  # noqa: E712
            hay = " ".join([s.title, s.summary or ""])
            if needle in hay.lower():
                rows.append(("source", s.id, excerpt(hay)))
    if kind in (None, "blog"):
        for b in session.exec(
            select(Blog).where(Blog.active == True)
        ).all():  # noqa: E712
            hay = " ".join([b.title, b.summary or "", b.body_md or ""])
            if needle in hay.lower():
                rows.append(("blog", b.id, excerpt(hay)))
    if kind in (None, "topic"):
        for t in session.exec(
            select(Topic).where(Topic.active == True)
        ).all():  # noqa: E712
            hay = " ".join([t.name, t.description or ""])
            if needle in hay.lower():
                rows.append(("topic", t.slug, excerpt(hay)))
    return rows[:limit]
