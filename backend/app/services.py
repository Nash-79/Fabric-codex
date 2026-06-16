"""Domain services. The backend owns all versioning + deterministic validation invariants.

Unified on the canonical Supabase schema (plural tables, uuid PKs, junction tables). Key
shifts from the old schema:
  - Identity is `slug` (sources/blogs/topics) — no *_key family columns.
  - Source drift updates the source row IN PLACE (slug is UNIQUE); versioning happens at the
    CLAIM level via supersedes_id chains (active flags the current version).
  - Blog/Design citations live in junction tables (blog_sources / design_sources), label = Sn.
  - Topic↔capability mapping lives in topic_capabilities; capabilities are a real table.
  - tags / takeaways / depth_levels are list columns (native arrays on PG, JSON on SQLite).

Two modes (set LLM_MODE in .env): "local" (default, agents POST structured data, no key) and
"api" (server calls the Anthropic API via llm.py).
"""

from __future__ import annotations
import hashlib
import logging
import re
from difflib import SequenceMatcher
from typing import Optional

from sqlmodel import Session, select
from app import llm, search
from app.db import LLM_MODE, ANTHROPIC_API_KEY

from app.models import (
    Source,
    Claim,
    ClaimEvent,
    Capability,
    Design,
    DesignSource,
    ValidationRun,
    Issue,
    Topic,
    TopicCapability,
    Blog,
    BlogSource,
    QueueItem,
    Asset,
    _now,
)

log = logging.getLogger(__name__)

SAME = 0.85
CHANGED = 0.55
SEVERITY_WEIGHT = {"critical": 0.4, "warning": 0.15, "info": 0.0}


class DuplicateSubmission(ValueError):
    def __init__(self, message: str, source_key: str = "", queue_id: str = ""):
        super().__init__(message)
        self.source_key = source_key
        self.queue_id = queue_id


# --------------------------------------------------------------- helpers
_MOJIBAKE = [
    ("â€™", "'"),
    ("â€œ", '"'),
    ("â€\x9d", '"'),
    ("â€”", "—"),
    ("â€“", "–"),
    ("â€¢", "•"),
    ("â€¦", "…"),
    ("â€", '"'),
    ("Â ", " "),
]


def normalize_text(s: str) -> str:
    """Repair common UTF-8 mojibake on text as it enters the KB. No-op for clean text."""
    if not s or "â€" not in s and "Â " not in s:
        return s
    for bad, good in _MOJIBAKE:
        s = s.replace(bad, good)
    return s


def content_hash(text: str) -> str:
    return hashlib.sha256((text or "").strip().encode("utf-8")).hexdigest()[:16]


def _source_fingerprint(content: str, claims: Optional[list[dict]]) -> str:
    if content:
        return content_hash(content)
    texts = sorted((c.get("text") or "").strip() for c in (claims or []))
    return content_hash(__import__("json").dumps(texts))


def slugify(value: str) -> str:
    value = re.sub(r"^https?://", "", (value or "").lower())
    value = re.sub(r"[^a-z0-9]+", "-", value).strip("-")
    return value[:80] or "source"


def _sim(a: str, b: str) -> float:
    return SequenceMatcher(None, a.lower(), b.lower()).ratio()


def _clean_tags(tags) -> list[str]:
    return [str(t).lstrip("#").strip() for t in (tags or []) if str(t).strip()]


def _clean_list(items) -> list[str]:
    return [str(x).strip() for x in (items or []) if str(x).strip()]


def _ensure_capability(session: Session, cid: str) -> None:
    """Capabilities are a FK target now. Seed a row if the registry id is missing so claims
    referencing a valid CAPABILITY_IDS id never fail the FK (idempotent)."""
    if cid in llm.CAPABILITY_IDS and session.get(Capability, cid) is None:
        session.add(Capability(id=cid, name=cid.replace("-", " ").title()))


def _norm_extracted(items: list[dict]) -> list[dict]:
    out = []
    for x in items or []:
        cid = x.get("capability_id") or x.get("capabilityId")
        if cid in llm.CAPABILITY_IDS and x.get("text"):
            out.append(
                {
                    "capability_id": cid,
                    "text": normalize_text(x["text"].strip()),
                    "depth": max(1, min(5, int(x.get("depth", 1)))),
                    "type": x.get("type", "fact"),
                    "tags": _clean_tags(x.get("tags")),
                }
            )
    return out


# --------------------------------------------------------------- ingestion
def _find_duplicate(
    session: Session, text: str, capability_id: str, exclude_source_ids: set[str]
) -> Optional[Claim]:
    candidates = session.exec(
        select(Claim).where(Claim.active == True, Claim.capability_id == capability_id)
    ).all()  # noqa: E712
    for c in candidates:
        if c.source_id not in exclude_source_ids and _sim(c.text, text) >= SAME:
            return c
    return None


def _insert_claims(session: Session, source: Source, extracted: list[dict]):
    """Insert extracted claims; near-duplicates of an active claim from ANOTHER source are
    stored status='duplicate', active=False. (One source row per slug, so the only excluded
    family is this source itself.)"""
    family = {source.id}
    created, duplicates = [], []
    for e in extracted:
        _ensure_capability(session, e["capability_id"])
        dup = _find_duplicate(session, e["text"], e["capability_id"], family)
        c = Claim(
            capability_id=e["capability_id"],
            text=e["text"],
            depth=e["depth"],
            type=e["type"],
            status="duplicate" if dup else "pending",
            source_id=source.id,
            tags=e.get("tags", []),
            active=not dup,
        )
        session.add(c)
        created.append(c)
        if dup:
            duplicates.append((c, dup))
    session.commit()
    for c in created:
        session.refresh(c)
        if c.active:
            search.index_claim(session, c)
    session.commit()
    return created, [
        {
            "claim_id": c.id,
            "text": c.text,
            "duplicate_of": d.id,
            "duplicate_of_text": d.text,
        }
        for c, d in duplicates
    ]


def _resolve_claims(content: str, provided: Optional[list[dict]]) -> list[dict]:
    if provided:
        return _norm_extracted(provided)
    if LLM_MODE == "api" and content:
        return _norm_extracted(llm.extract_claims(content))
    raise ValueError(
        "No claims provided. In local mode, the curator agent extracts claims and posts them "
        "as `claims`. (Set LLM_MODE=api to extract server-side from `content`.)"
    )


def ingest_source(
    session: Session,
    url: str,
    title: str,
    tier: int,
    content: str = "",
    claims: Optional[list[dict]] = None,
    tags: Optional[list[str]] = None,
    assets: Optional[list[dict]] = None,
    summary: str = "",
    audience: str = "",
    why_it_matters: str = "",
    takeaways: Optional[list[str]] = None,
    document: Optional[dict] = None,
) -> dict:
    slug = slugify(url or title)
    existing = session.exec(
        select(Source).where(Source.slug == slug, Source.active == True)
    ).first()  # noqa: E712
    if existing:
        return detect_drift(
            session,
            slug,
            content=content,
            claims=claims,
            url=url,
            title=title,
            tier=tier,
            tags=tags,
            assets=assets,
            summary=summary,
            audience=audience,
            why_it_matters=why_it_matters,
            takeaways=takeaways,
            document=document,
        )

    extracted = _resolve_claims(content, claims)  # may raise — before any writes
    src = Source(
        slug=slug,
        version=1,
        url=url,
        title=normalize_text(title) or url or slug,
        tier=tier,
        content_hash=_source_fingerprint(content, claims),
        document=document or {},
        summary=normalize_text(summary),
        audience=normalize_text(audience),
        why_it_matters=normalize_text(why_it_matters),
        takeaways=[normalize_text(t) for t in _clean_list(takeaways)],
        tags=_clean_tags(tags),
        active=True,
    )
    session.add(src)
    session.commit()
    session.refresh(src)
    search.index_source(session, src)
    session.commit()

    inserted, duplicates = _insert_claims(session, src, extracted)
    saved_assets = add_assets(session, assets, source_id=src.id)
    return {
        "source_id": src.id,
        "source_key": slug,
        "slug": slug,
        "version": 1,
        "drift": False,
        "claims_added": len(inserted) - len(duplicates),
        "duplicates": duplicates,
        "assets_added": len(saved_assets),
        "claims": [_claim_dict(c) for c in inserted],
    }


# --------------------------------------------------------------- versioning / curation
def _record_event(
    session: Session, claim: Claim, action: str, prev_status: str
) -> None:
    session.add(
        ClaimEvent(
            claim_id=claim.id,
            capability_id=claim.capability_id,
            action=action,
            prev_status=prev_status,
            new_status=claim.status,
            text_snippet=claim.text[:120],
        )
    )


def verify_claim(session: Session, claim_id: str) -> Optional[Claim]:
    c = session.get(Claim, claim_id)
    if not c:
        return None
    if not c.active:
        raise ValueError(
            f"Claim {claim_id} is {c.status} (inactive); only active claims "
            "can be verified."
        )
    prev = c.status
    c.status = "verified"
    c.confidence = max(c.confidence, 0.85)
    _record_event(session, c, "verified", prev)
    session.add(c)
    session.commit()
    session.refresh(c)
    return c


def verify_claims_bulk(
    session: Session,
    source_id: Optional[str] = None,
    claim_ids: Optional[list[str]] = None,
) -> dict:
    if source_id:
        rows = session.exec(select(Claim).where(Claim.source_id == source_id)).all()
    elif claim_ids:
        rows = [c for cid in claim_ids if (c := session.get(Claim, cid))]
    else:
        raise ValueError("Provide source_id or claim_ids.")
    verified, skipped = [], []
    for c in rows:
        if c.active and c.status == "pending":
            prev = c.status
            c.status = "verified"
            c.confidence = max(c.confidence, 0.85)
            _record_event(session, c, "verified", prev)
            session.add(c)
            verified.append(c.id)
        else:
            skipped.append({"claim_id": c.id, "status": c.status, "active": c.active})
    session.commit()
    return {"verified": len(verified), "verified_ids": verified, "skipped": skipped}


def reject_claim(session: Session, claim_id: str) -> Optional[Claim]:
    c = session.get(Claim, claim_id)
    if not c:
        return None
    if not c.active or c.status != "pending":
        raise ValueError(
            f"Claim {claim_id} has status='{c.status}', active={c.active}; only active "
            "pending claims can be rejected. For duplicate claims use the /dismiss endpoint."
        )
    prev = c.status
    c.status = "rejected"
    c.active = False
    _record_event(session, c, "rejected", prev)
    session.add(c)
    session.commit()
    session.refresh(c)
    return c


def dismiss_duplicate_claim(session: Session, claim_id: str) -> Optional[Claim]:
    c = session.get(Claim, claim_id)
    if not c:
        return None
    if c.status != "duplicate":
        raise ValueError(
            f"Claim {claim_id} has status='{c.status}'; only duplicate claims "
            "can be dismissed via this endpoint."
        )
    prev = c.status
    c.status = "rejected"
    c.active = False
    _record_event(session, c, "dismissed", prev)
    session.add(c)
    session.commit()
    session.refresh(c)
    return c


def reject_claims_bulk(
    session: Session,
    source_id: Optional[str] = None,
    claim_ids: Optional[list[str]] = None,
) -> dict:
    if source_id:
        rows = session.exec(select(Claim).where(Claim.source_id == source_id)).all()
    elif claim_ids:
        rows = [c for cid in claim_ids if (c := session.get(Claim, cid))]
    else:
        raise ValueError("Provide source_id or claim_ids.")
    rejected, skipped = [], []
    for c in rows:
        if c.active and c.status == "pending":
            prev = c.status
            c.status = "rejected"
            c.active = False
            _record_event(session, c, "rejected", prev)
            session.add(c)
            rejected.append(c.id)
        else:
            skipped.append({"claim_id": c.id, "status": c.status, "active": c.active})
    session.commit()
    return {"rejected": len(rejected), "rejected_ids": rejected, "skipped": skipped}


def revert_claims(session: Session, claim_ids: list[str]) -> dict:
    reverted, skipped = [], []
    for cid in claim_ids:
        c = session.get(Claim, cid)
        if not c:
            skipped.append({"claim_id": cid, "reason": "not found"})
            continue
        if c.status not in ("verified", "rejected"):
            skipped.append(
                {"claim_id": cid, "reason": f"status={c.status!r} cannot be reverted"}
            )
            continue
        prev = c.status
        c.status = "pending"
        c.active = True
        _record_event(session, c, "reverted", prev)
        session.add(c)
        reverted.append(cid)
    session.commit()
    return {"reverted": len(reverted), "reverted_ids": reverted, "skipped": skipped}


def promote_claim(session: Session, claim_id: str) -> Optional[Claim]:
    c = session.get(Claim, claim_id)
    if not c:
        return None
    if c.status != "duplicate":
        raise ValueError(
            f"Claim {claim_id} has status '{c.status}'; only duplicate claims "
            "can be promoted."
        )
    prev = c.status
    c.status = "pending"
    c.active = True
    _record_event(session, c, "promoted", prev)
    session.add(c)
    session.commit()
    session.refresh(c)
    return c


def recent_claim_events(session: Session, limit: int = 30) -> list[dict]:
    rows = session.exec(
        select(ClaimEvent).order_by(ClaimEvent.actioned_at.desc()).limit(limit)
    ).all()
    return [
        {
            "id": ev.id,
            "claim_id": ev.claim_id,
            "capability_id": ev.capability_id,
            "action": ev.action,
            "prev_status": ev.prev_status,
            "new_status": ev.new_status,
            "text_snippet": ev.text_snippet,
            "actioned_at": ev.actioned_at.isoformat(),
        }
        for ev in rows
    ]


def supersede_claim(
    session: Session,
    old: Claim,
    new_text: str,
    source: Source,
    depth: Optional[int] = None,
    ctype: Optional[str] = None,
    tags: Optional[list[str]] = None,
) -> Claim:
    new = Claim(
        version=old.version + 1,
        capability_id=old.capability_id,
        text=new_text,
        depth=depth or old.depth,
        type=ctype or old.type,
        status="pending",
        source_id=source.id,
        supersedes_id=old.id,
        tags=_clean_tags(tags) if tags else list(old.tags),
        active=True,
    )
    old.active = False
    old.status = "superseded"
    session.add(old)
    session.add(new)
    session.commit()
    session.refresh(new)
    search.index_claim(session, new)
    session.commit()
    return new


def supersede_claim_text(
    session: Session,
    claim_id: str,
    new_text: str,
    depth: Optional[int] = None,
    ctype: Optional[str] = None,
    tags: Optional[list[str]] = None,
) -> Optional[Claim]:
    old = session.get(Claim, claim_id)
    if not old:
        return None
    if not old.active:
        raise ValueError("Only active claims can be superseded.")
    text = normalize_text((new_text or "").strip())
    if not text:
        raise ValueError("new_text is required.")
    source = session.get(Source, old.source_id)
    if not source:
        raise ValueError("Claim source no longer exists.")
    prev_status = old.status
    new = supersede_claim(
        session,
        old,
        text,
        source,
        depth=depth,
        ctype=ctype,
        tags=tags,
    )
    _record_event(session, new, "superseded", prev_status)
    session.add(new)
    session.commit()
    session.refresh(new)
    return new


def deprecate_claim(session: Session, old: Claim) -> Claim:
    old.active = False
    old.status = "deprecated"
    session.add(old)
    session.commit()
    session.refresh(old)
    return old


def claim_history(session: Session, claim_id: str) -> list[Claim]:
    """Walk the supersedes_id chain for a claim (oldest first). `claim_id` may be any
    version in the chain — we walk back to the root then forward."""
    start = session.get(Claim, claim_id)
    if not start:
        return []
    # walk back to root
    root = start
    seen = {root.id}
    while root.supersedes_id and root.supersedes_id not in seen:
        prev = session.get(Claim, root.supersedes_id)
        if not prev:
            break
        root, _ = prev, seen.add(prev.id)
    # walk forward from root following who-supersedes-whom
    chain, cur = [root], root
    while True:
        nxt = session.exec(select(Claim).where(Claim.supersedes_id == cur.id)).first()
        if not nxt or nxt.id in {c.id for c in chain}:
            break
        chain.append(nxt)
        cur = nxt
    return chain


# ------------------------------------------------------------------ assets
def add_assets(
    session: Session,
    assets: Optional[list[dict]],
    source_id: Optional[str] = None,
    design_id: Optional[str] = None,
    blog_id: Optional[str] = None,
) -> list[Asset]:
    saved = []
    for a in assets or []:
        kind = a.get("kind", "generated")
        eff_source_id = a.get("source_id", source_id)
        eff_design_id = a.get("design_id", design_id)
        eff_blog_id = a.get("blog_id", blog_id)

        if kind == "generated" and a.get("path"):
            existing = session.exec(
                select(Asset).where(
                    Asset.kind == "generated",
                    Asset.path == a["path"],
                    Asset.source_id == eff_source_id,
                    Asset.design_id == eff_design_id,
                    Asset.blog_id == eff_blog_id,
                )
            ).first()
            if existing:
                saved.append(existing)
                continue
        elif kind == "referenced" and a.get("url"):
            existing = session.exec(
                select(Asset).where(
                    Asset.kind == "referenced",
                    Asset.url == a["url"],
                    Asset.source_id == eff_source_id,
                    Asset.design_id == eff_design_id,
                    Asset.blog_id == eff_blog_id,
                )
            ).first()
            if existing:
                saved.append(existing)
                continue

        attribution = a.get("attribution", "")
        if kind == "referenced" and not attribution:
            raise ValueError(
                "Referenced assets require attribution (copyright); never re-host."
            )
        asset = Asset(
            kind=kind,
            url=a.get("url", ""),
            path=a.get("path", ""),
            mime=a.get("mime", "image/svg+xml" if kind == "generated" else "image/png"),
            caption=a.get("caption", ""),
            attribution=attribution,
            license_note=a.get(
                "license_note",
                (
                    ""
                    if kind == "generated"
                    else "External image; referenced with attribution, not re-hosted."
                ),
            ),
            capability_id=a.get("capability_id", ""),
            source_id=eff_source_id,
            claim_id=a.get("claim_id"),
            design_id=eff_design_id,
            blog_id=eff_blog_id,
        )
        session.add(asset)
        saved.append(asset)
    if saved:
        session.commit()
        for a in saved:
            session.refresh(a)
    return saved


# --------------------------------------------------------------- generation / grounding
def _grounding_context(session: Session, limit: int = 70):
    verified = session.exec(
        select(Claim)
        .where(Claim.active == True, Claim.status == "verified")
        .order_by(Claim.created_at, Claim.id)
    ).all()  # noqa: E712
    pending = session.exec(
        select(Claim)
        .where(Claim.active == True, Claim.status == "pending")
        .order_by(Claim.created_at, Claim.id)
    ).all()  # noqa: E712
    claims = (verified + pending)[:limit]
    src_order, tag_of = [], {}
    for c in claims:
        if c.source_id not in tag_of:
            tag_of[c.source_id] = "S" + str(len(src_order) + 1)
            src_order.append(c.source_id)
    ctx = "\n".join(
        f"[{tag_of[c.source_id]}] ({c.capability_id}, L{c.depth}) {c.text}"
        for c in claims
    )
    legend_lines = []
    for sid in src_order:
        s = session.get(Source, sid)
        legend_lines.append(
            f"{tag_of[sid]} = {s.title} (T{s.tier}){'' if s.active else '  [SUPERSEDED]'}"
        )
    return ctx, "\n".join(legend_lines), {tag_of[sid]: sid for sid in src_order}, claims


def _parse_cited(md: str, tag_to_source: dict) -> list[str]:
    tags = set(re.findall(r"\[S(\d+)\]", md))
    return [tag_to_source["S" + t] for t in tags if ("S" + t) in tag_to_source]


def _advisor_context(
    session: Session, capabilities: Optional[list[str]] = None, limit: int = 60
):
    def _scoped(status: str):
        stmt = select(Claim).where(
            Claim.active == True, Claim.status == status
        )  # noqa: E712
        if capabilities:
            stmt = stmt.where(Claim.capability_id.in_(capabilities))
        return session.exec(stmt.order_by(Claim.created_at, Claim.id)).all()

    verified = _scoped("verified")
    claims = verified[:limit]
    if len(claims) < 6:
        claims = (verified + _scoped("pending"))[:limit]
    src_order, tag_of = [], {}
    for c in claims:
        if c.source_id not in tag_of:
            tag_of[c.source_id] = "S" + str(len(src_order) + 1)
            src_order.append(c.source_id)
    ctx = "\n".join(
        f"[{tag_of[c.source_id]}] ({c.capability_id}, L{c.depth}"
        f"{'' if c.status == 'verified' else ', PENDING'}) {c.text}"
        for c in claims
    )
    legend_lines = []
    for sid in src_order:
        s = session.get(Source, sid)
        legend_lines.append(f"{tag_of[sid]} = {s.title} (T{s.tier})")
    return ctx, "\n".join(legend_lines), claims


def _llm_key_available() -> bool:
    return bool(ANTHROPIC_API_KEY)


def _advisor_fallback_reason() -> str:
    return "local_mode" if LLM_MODE != "api" else "missing_api_key"


def _advisor_fallback_answer(reason: str, claim_count: int) -> str:
    why = (
        "LLM_MODE is not set to api"
        if reason == "local_mode"
        else "ANTHROPIC_API_KEY is not configured"
    )
    return (
        f"Server-side Advisor generation is disabled because {why}. "
        f"I found {claim_count} scoped knowledge-base claim(s) and returned them as `context` "
        "with the citation `legend` and `system` prompt. Use the local `/advise` agent or a "
        "client-side generator with that context to produce a cited answer. Do not answer from "
        "general knowledge if the returned context is insufficient."
    )


def advisor_chat(
    session: Session,
    question: str,
    capabilities: Optional[list[str]] = None,
    history: Optional[list[dict]] = None,
) -> dict:
    """Grounded Fabric Q&A over the KB. Key-optional: with a key it generates the answer; without
    one it returns the grounded retrieval payload for client-side (Lovable AI) generation.
    """
    caps = [c for c in (capabilities or []) if c in llm.CAPABILITY_IDS]
    ctx, legend, claims = _advisor_context(session, caps or None)
    base = {"legend": legend, "claim_count": len(claims), "capabilities": caps or "all"}
    if not claims:
        return {
            **base,
            "mode": "empty",
            "grounded": False,
            "answer": "The knowledge base has no verified claims for that question yet. "
            "Ingest an authoritative source (/ingest <url> tier=<n>) and verify its claims, "
            "then ask again.",
        }
    if LLM_MODE != "api" or not _llm_key_available():
        reason = _advisor_fallback_reason()
        return {
            **base,
            "mode": "context",
            "grounded": True,
            "answer": _advisor_fallback_answer(reason, len(claims)),
            "fallback_reason": reason,
            "server_generation": False,
            "question": question,
            "context": ctx,
            "system": llm.ADVISOR_SYSTEM,
            "note": "Returning grounded context for local or client-side generation. "
            "Cite [Sn] from the legend; do not add facts beyond the context.",
        }
    answer = llm.advisor_answer(question, ctx, legend, history=history)
    return {
        **base,
        "mode": "answer",
        "answer": answer,
        "grounded": True,
        "server_generation": True,
    }


def _set_citations(
    session: Session,
    *,
    blog_id: Optional[str] = None,
    design_id: Optional[str] = None,
    source_ids: list[str],
) -> None:
    """Replace the citation junction rows (blog_sources / design_sources) for a target.
    label = S1,S2… in the given order; position preserves it."""
    if blog_id is not None:
        for row in session.exec(
            select(BlogSource).where(BlogSource.blog_id == blog_id)
        ).all():
            session.delete(row)
        for i, sid in enumerate(source_ids, start=1):
            session.add(
                BlogSource(blog_id=blog_id, label=f"S{i}", source_id=sid, position=i)
            )
    if design_id is not None:
        for row in session.exec(
            select(DesignSource).where(DesignSource.design_id == design_id)
        ).all():
            session.delete(row)
        for i, sid in enumerate(source_ids, start=1):
            session.add(
                DesignSource(
                    design_id=design_id, label=f"S{i}", source_id=sid, position=i
                )
            )
    session.commit()


def _cited_source_ids(
    session: Session, *, blog_id: Optional[str] = None, design_id: Optional[str] = None
) -> list[str]:
    if blog_id is not None:
        rows = session.exec(
            select(BlogSource)
            .where(BlogSource.blog_id == blog_id)
            .order_by(BlogSource.position)
        ).all()
    else:
        rows = session.exec(
            select(DesignSource)
            .where(DesignSource.design_id == design_id)
            .order_by(DesignSource.position)
        ).all()
    return [r.source_id for r in rows]


def create_design(
    session: Session,
    scenario: str,
    output_md: str,
    constraints: Optional[dict] = None,
    tags: Optional[list[str]] = None,
    cited_source_ids: Optional[list[str]] = None,
    assets: Optional[list[dict]] = None,
    title: str = "",
    slug: str = "",
    document: Optional[dict] = None,
) -> dict:
    if cited_source_ids is None:
        raise ValueError(
            "cited_source_ids is required: pass the source ids behind the [Sn] "
            "tags used in output_md."
        )
    unknown = [sid for sid in cited_source_ids if session.get(Source, sid) is None]
    if unknown:
        raise ValueError(f"cited_source_ids contains unknown source id(s): {unknown}")
    slug = slugify(slug or title or scenario[:60])
    new_hash = content_hash(output_md)
    # slug is UNIQUE; designs update in place (no supersedes chain) so re-import is idempotent.
    existing = session.exec(select(Design).where(Design.slug == slug)).first()
    if existing:
        if existing.content_hash == new_hash:
            return {
                "design_id": existing.id,
                "output_md": existing.body_md,
                "cited_source_ids": cited_source_ids,
                "drift": False,
                "reason": "content unchanged",
            }
        existing.title = title or existing.title
        existing.scenario = scenario
        existing.constraints = constraints or {}
        existing.body_md = output_md
        existing.tags = _clean_tags(tags)
        existing.content_hash = new_hash
        if document is not None:
            existing.document = document
        existing.status = "draft"
        session.add(existing)
        session.commit()
        _set_citations(session, design_id=existing.id, source_ids=cited_source_ids)
        add_assets(session, assets, design_id=existing.id)
        return {
            "design_id": existing.id,
            "output_md": output_md,
            "cited_source_ids": cited_source_ids,
            "drift": True,
        }
    design = Design(
        slug=slug,
        title=title or scenario[:60],
        scenario=scenario,
        constraints=constraints or {},
        body_md=output_md,
        tags=_clean_tags(tags),
        status="draft",
        content_hash=new_hash,
        document=document or {},
    )
    session.add(design)
    session.commit()
    session.refresh(design)
    _set_citations(session, design_id=design.id, source_ids=cited_source_ids)
    add_assets(session, assets, design_id=design.id)
    return {
        "design_id": design.id,
        "output_md": output_md,
        "cited_source_ids": cited_source_ids,
        "drift": False,
    }


def generate_design(session: Session, scenario: str, constraints: dict) -> dict:
    ctx, legend, tag_to_source, claims = _grounding_context(session)
    if not claims:
        raise ValueError("Knowledge base is empty — ingest sources first.")
    md = llm.generate_architecture(scenario, constraints, ctx, legend)
    res = create_design(
        session,
        scenario,
        md,
        constraints=constraints,
        cited_source_ids=_parse_cited(md, tag_to_source),
    )
    res["legend"] = legend
    return res


# --------------------------------------------------------------- validation
def _validate_document(
    session: Session,
    *,
    target_kind: str,
    target,
    md: str,
    cited_ids: list[str],
    agent_issues: Optional[list[dict]],
    scenario: str = "",
) -> dict:
    issues: list[dict] = []
    if not re.findall(r"\[S(\d+)\]", md):
        issues.append(
            {
                "validator": "citation",
                "severity": "warning",
                "message": f"{target_kind.capitalize()} contains no citations; factual "
                "claims are untraceable.",
                "ref": "",
            }
        )
    for sid in cited_ids:
        s = session.get(Source, sid)
        if s is None:
            issues.append(
                {
                    "validator": "citation",
                    "severity": "critical",
                    "message": "A cited source id does not exist.",
                    "ref": sid,
                }
            )
        elif not s.active:
            issues.append(
                {
                    "validator": "freshness",
                    "severity": "warning",
                    "message": f"Cited source '{s.title}' has been superseded.",
                    "ref": sid,
                }
            )
        stale = session.exec(
            select(Claim).where(Claim.source_id == sid, Claim.active == False)
        ).all()  # noqa: E712
        if stale:
            issues.append(
                {
                    "validator": "freshness",
                    "severity": "info",
                    "message": f"{len(stale)} claim(s) from this source are "
                    "superseded/deprecated.",
                    "ref": sid,
                }
            )

    if target_kind == "blog":
        issues.extend(_check_blog_images(md))

    valid_v, valid_s = {"grounding", "coverage", "antipattern"}, {
        "critical",
        "warning",
        "info",
    }
    full_pass = True
    if agent_issues is not None:
        issues.extend(
            {
                "validator": i.get("validator", "grounding"),
                "severity": i.get("severity", "warning"),
                "message": i.get("message", ""),
                "ref": i.get("ref", ""),
            }
            for i in agent_issues
            if i.get("validator") in valid_v
            and i.get("severity") in valid_s
            and i.get("message")
        )
    elif LLM_MODE == "api":
        try:
            ctx, _, _, _ = _grounding_context(session)
            issues.extend(llm.review_design(md, scenario, ctx))
        except llm.LLMUnavailable:
            full_pass = False
            issues.append(
                {
                    "validator": "grounding",
                    "severity": "info",
                    "message": "LLM validators skipped (no key).",
                    "ref": "",
                }
            )
    else:
        full_pass = False
        issues.append(
            {
                "validator": "grounding",
                "severity": "info",
                "message": "No agent issues supplied; ran deterministic validators only. "
                "Run the validation-reviewer agent for grounding/coverage/antipattern.",
                "ref": "",
            }
        )

    penalty = sum(SEVERITY_WEIGHT.get(i["severity"], 0.0) for i in issues)
    confidence = round(max(0.0, 1.0 - penalty), 2)
    run = ValidationRun(
        design_id=target.id if target_kind == "design" else None,
        target_kind=target_kind,
        target_id=target.id,
        score=confidence,
        confidence=confidence,
    )
    session.add(run)
    session.commit()
    session.refresh(run)
    for i in issues:
        session.add(
            Issue(
                validation_run_id=run.id,
                validator=i["validator"],
                severity=i["severity"],
                message=i["message"],
                ref=i.get("ref", ""),
            )
        )
    has_critical = any(i["severity"] == "critical" for i in issues)
    rts = full_pass and not has_critical
    # Blog stores its score in validation_confidence; Design in confidence.
    if target_kind == "blog":
        target.validation_confidence = confidence
    else:
        target.confidence = confidence
    target.ready_to_share = rts
    target.status = (
        "needs_review" if has_critical else "validated" if full_pass else "checked"
    )
    session.add(target)
    session.commit()
    return {
        "run_id": run.id,
        "confidence": confidence,
        "full_pass": full_pass,
        "ready_to_share": rts,
        "issues": issues,
    }


def _check_blog_images(md: str) -> list[dict]:
    from pathlib import Path

    repo_root = Path(__file__).resolve().parents[2]
    issues = []
    for path in re.findall(r"!\[[^\]]*\]\(([^)\s]+)\)", md):
        if "content/diagrams/" not in path:
            continue
        if not (repo_root / path.lstrip("/")).exists():
            issues.append(
                {
                    "validator": "citation",
                    "severity": "critical",
                    "message": f"Embedded diagram not found on disk: {path}",
                    "ref": path,
                }
            )
    return issues


def validate_design(
    session: Session, design_id: str, agent_issues: Optional[list[dict]] = None
) -> dict:
    design = session.get(Design, design_id)
    if not design:
        raise ValueError("Design not found.")
    res = _validate_document(
        session,
        target_kind="design",
        target=design,
        md=design.body_md,
        cited_ids=_cited_source_ids(session, design_id=design.id),
        agent_issues=agent_issues,
        scenario=design.scenario,
    )
    return {"design_id": design_id, **res}


def validate_blog(
    session: Session, blog_id: str, agent_issues: Optional[list[dict]] = None
) -> dict:
    blog = session.get(Blog, blog_id)
    if not blog:
        raise ValueError("Blog not found.")
    res = _validate_document(
        session,
        target_kind="blog",
        target=blog,
        md=blog.body_md,
        cited_ids=_cited_source_ids(session, blog_id=blog.id),
        agent_issues=agent_issues,
        scenario=blog.title,
    )
    return {"blog_id": blog_id, **res}


# --------------------------------------------------------------- drift
def detect_drift(
    session: Session,
    source_key: str,
    content: str = "",
    claims: Optional[list[dict]] = None,
    url: str = "",
    title: str = "",
    tier: Optional[int] = None,
    tags: Optional[list[str]] = None,
    assets: Optional[list[dict]] = None,
    summary: str = "",
    audience: str = "",
    why_it_matters: str = "",
    takeaways: Optional[list[str]] = None,
    document: Optional[dict] = None,
) -> dict:
    """Source slug is UNIQUE: the source row is updated IN PLACE; versioning happens at the
    claim level via supersedes chains."""
    slug = source_key
    src = session.exec(
        select(Source).where(Source.slug == slug, Source.active == True)
    ).first()  # noqa: E712
    if src is None:
        return ingest_source(
            session,
            url or slug,
            title,
            tier or 6,
            content=content,
            claims=claims,
            tags=tags,
            assets=assets,
            summary=summary,
            audience=audience,
            why_it_matters=why_it_matters,
            takeaways=takeaways,
            document=document,
        )

    new_hash = _source_fingerprint(content, claims)
    if new_hash == src.content_hash:
        backfilled = False
        for field, value in (
            ("summary", summary),
            ("audience", audience),
            ("why_it_matters", why_it_matters),
        ):
            if value and getattr(src, field) != value:
                setattr(src, field, value)
                backfilled = True
        if takeaways is not None and _clean_list(takeaways) != list(src.takeaways):
            src.takeaways = _clean_list(takeaways)
            backfilled = True
        if document is not None and document != src.document:
            src.document = document
            backfilled = True
        if backfilled:
            session.add(src)
            session.commit()
        return {
            "source_key": slug,
            "slug": slug,
            "drift": False,
            "reason": "content unchanged",
            "metadata_updated": backfilled,
            "added": 0,
            "changed": 0,
            "removed": 0,
            "unchanged": 0,
            "affected_designs": [],
            "affected_blogs": [],
        }

    extracted = _resolve_claims(content, claims)  # may raise — before any writes

    # Update the source row in place (one row per slug); bump version + refresh metadata.
    src.version += 1
    src.content_hash = new_hash
    if document is not None:
        src.document = document
    src.url = url or src.url
    src.title = title or src.title
    if tier is not None:
        src.tier = tier
    src.summary = summary or src.summary
    src.audience = audience or src.audience
    src.why_it_matters = why_it_matters or src.why_it_matters
    if takeaways is not None:
        src.takeaways = _clean_list(takeaways)
    if tags:
        src.tags = _clean_tags(tags)
    session.add(src)
    session.commit()
    session.refresh(src)
    search.index_source(session, src)
    session.commit()
    add_assets(session, assets, source_id=src.id)

    old_claims = session.exec(
        select(Claim).where(Claim.active == True, Claim.source_id == src.id)
    ).all()  # noqa: E712
    matched, added, changed, unchanged = set(), [], [], []
    for e in extracted:
        _ensure_capability(session, e["capability_id"])
        cands = [c for c in old_claims if c.capability_id == e["capability_id"]]
        best, score = None, 0.0
        for c in cands:
            sc = _sim(c.text, e["text"])
            if sc > score:
                best, score = c, sc
        if best and score >= SAME:
            matched.add(best.id)
            unchanged.append({"claim_id": best.id})
        elif best and score >= CHANGED:
            matched.add(best.id)
            nc = supersede_claim(
                session, best, e["text"], src, e["depth"], e["type"], e.get("tags")
            )
            changed.append({"old_id": best.id, "new_id": nc.id, "text": e["text"]})
        else:
            dup = _find_duplicate(session, e["text"], e["capability_id"], {src.id})
            nc = Claim(
                capability_id=e["capability_id"],
                text=e["text"],
                depth=e["depth"],
                type=e["type"],
                status="duplicate" if dup else "pending",
                source_id=src.id,
                tags=e.get("tags", []),
                active=not dup,
            )
            session.add(nc)
            if nc.active:
                session.commit()
                search.index_claim(session, nc)
            added.append(
                {
                    "text": e["text"],
                    "capability": e["capability_id"],
                    **({"duplicate_of": dup.id} if dup else {}),
                }
            )
    session.commit()

    removed = []
    for c in old_claims:
        if c.id not in matched:
            deprecate_claim(session, c)
            removed.append({"claim_id": c.id, "text": c.text})

    # Citing designs/blogs (via junction) → needs_review.
    citing_designs = {
        r.design_id
        for r in session.exec(
            select(DesignSource).where(DesignSource.source_id == src.id)
        ).all()
    }
    affected = []
    for did in citing_designs:
        d = session.get(Design, did)
        if d:
            d.status = "needs_review"
            session.add(d)
            affected.append({"design_id": d.id, "title": d.title})
    citing_blogs = {
        r.blog_id
        for r in session.exec(
            select(BlogSource).where(BlogSource.source_id == src.id)
        ).all()
    }
    affected_blogs = []
    for bid in citing_blogs:
        b = session.get(Blog, bid)
        if b and b.active:
            b.status = "needs_review"
            b.ready_to_share = False
            session.add(b)
            affected_blogs.append({"blog_id": b.id, "slug": b.slug, "title": b.title})
    session.commit()
    return {
        "source_key": slug,
        "slug": slug,
        "drift": True,
        "new_version": src.version,
        "added": len(added),
        "changed": len(changed),
        "removed": len(removed),
        "unchanged": len(unchanged),
        "detail": {"added": added, "changed": changed, "removed": removed},
        "affected_designs": affected,
        "affected_blogs": affected_blogs,
    }


# --------------------------------------------------------------- ingestion queue
def submit_queue_item(
    session: Session,
    url: str,
    title: str = "",
    tier: int = 6,
    notes: str = "",
    tags: Optional[list[str]] = None,
    submitted_by: str = "",
) -> dict:
    url = (url or "").strip()
    if not url.lower().startswith(("http://", "https://")):
        raise ValueError("A valid http(s) URL is required.")
    if not 1 <= int(tier) <= 6:
        raise ValueError("tier must be between 1 (Microsoft Learn) and 6 (unknown).")
    key = slugify(url)
    existing_src = session.exec(
        select(Source).where(Source.slug == key, Source.active == True)
    ).first()  # noqa: E712
    if existing_src:
        raise DuplicateSubmission(
            f"Already in the knowledge base as source '{existing_src.title}'.",
            source_key=key,
        )
    for q in session.exec(
        select(QueueItem).where(QueueItem.status.in_(["queued", "claimed"]))
    ).all():
        if slugify(q.url) == key:
            raise DuplicateSubmission(
                "This URL is already queued for ingestion.", queue_id=q.id
            )
    item = QueueItem(
        url=url,
        title=title,
        tier=int(tier),
        note=notes,
        notes=notes,
        tags=_clean_tags(tags),
        submitted_by=submitted_by or None,
    )
    session.add(item)
    session.commit()
    session.refresh(item)
    return _queue_dict(item)


def list_queue(session: Session, status: Optional[str] = None) -> list[dict]:
    stmt = select(QueueItem).order_by(QueueItem.created_at.desc())
    if status:
        stmt = stmt.where(QueueItem.status == status)
    return [_queue_dict(q) for q in session.exec(stmt).all()]


def _queue_transition(
    session: Session,
    item_id: str,
    allowed_from: tuple[str, ...],
    new_status: str,
    **updates,
) -> dict:
    item = session.get(QueueItem, item_id)
    if not item:
        raise LookupError("Queue item not found.")
    if item.status not in allowed_from:
        raise ValueError(
            f"Queue item is '{item.status}'; expected one of {allowed_from}."
        )
    item.status = new_status
    for k, v in updates.items():
        setattr(item, k, v)
    session.add(item)
    session.commit()
    session.refresh(item)
    return _queue_dict(item)


def claim_queue_item(session: Session, item_id: str) -> dict:
    return _queue_transition(
        session, item_id, ("queued",), "claimed", claimed_at=_now()
    )


def complete_queue_item(session: Session, item_id: str, source_id: str) -> dict:
    return _queue_transition(
        session,
        item_id,
        ("claimed", "queued"),
        "ingested",
        result_source_id=source_id,
        error="",
    )


def fail_queue_item(session: Session, item_id: str, error: str = "") -> dict:
    return _queue_transition(
        session, item_id, ("claimed", "queued"), "failed", error=error
    )


def requeue_queue_item(session: Session, item_id: str) -> dict:
    return _queue_transition(
        session, item_id, ("failed", "claimed"), "queued", claimed_at=None, error=""
    )


def dismiss_queue_item(session: Session, item_id: str) -> dict:
    return _queue_transition(session, item_id, ("queued", "failed"), "dismissed")


# --------------------------------------------------------------- topics
def _topic_capabilities(session: Session, slug: str) -> list[str]:
    return [
        r.capability_id
        for r in session.exec(
            select(TopicCapability).where(TopicCapability.topic_slug == slug)
        ).all()
    ]


def create_topic(
    session: Session,
    slug: str,
    name: str,
    capability_ids: list[str],
    parent_id: Optional[str] = None,
    description: str = "",
    order: int = 0,
    tags: Optional[list[str]] = None,
) -> dict:
    slug = slugify(slug or name)
    if session.get(Topic, slug):
        raise ValueError(f"Topic slug '{slug}' already exists.")
    if not capability_ids:
        raise ValueError(
            "A topic must map to at least one capability (the registry is the spine)."
        )
    unknown = [c for c in capability_ids if c not in llm.CAPABILITY_IDS]
    if unknown:
        raise ValueError(f"Unknown capability id(s): {unknown}")
    # parent_id is the parent topic slug (Topic PK is slug).
    if parent_id and session.get(Topic, parent_id) is None:
        raise ValueError("parent_id (parent slug) does not exist.")
    t = Topic(
        slug=slug,
        name=name or slug,
        parent_slug=parent_id,
        description=description,
        sort_order=order,
        tags=_clean_tags(tags),
    )
    session.add(t)
    for cid in capability_ids:
        _ensure_capability(session, cid)
        session.add(TopicCapability(topic_slug=slug, capability_id=cid))
    session.commit()
    session.refresh(t)
    search.index_topic(session, t)
    session.commit()
    return _topic_dict(session, t)


def update_topic(session: Session, topic_id: str, **fields) -> dict:
    t = session.get(Topic, topic_id)  # topic_id is the slug
    if not t:
        raise LookupError("Topic not found.")
    if fields.get("capability_ids") is not None:
        caps = fields.pop("capability_ids")
        if not caps:
            raise ValueError("A topic must keep at least one capability mapping.")
        unknown = [c for c in caps if c not in llm.CAPABILITY_IDS]
        if unknown:
            raise ValueError(f"Unknown capability id(s): {unknown}")
        for r in session.exec(
            select(TopicCapability).where(TopicCapability.topic_slug == t.slug)
        ).all():
            session.delete(r)
        for cid in caps:
            _ensure_capability(session, cid)
            session.add(TopicCapability(topic_slug=t.slug, capability_id=cid))
    mapping = {
        "name": "name",
        "description": "description",
        "order": "sort_order",
        "parent_id": "parent_slug",
        "active": "active",
    }
    for k, attr in mapping.items():
        if fields.get(k) is not None:
            setattr(t, attr, fields[k])
    session.add(t)
    session.commit()
    session.refresh(t)
    return _topic_dict(session, t)


def list_topics(session: Session, include_counts: bool = False) -> list[dict]:
    rows = session.exec(
        select(Topic).where(Topic.active == True).order_by(Topic.sort_order, Topic.name)
    ).all()  # noqa: E712
    out = [_topic_dict(session, t) for t in rows]
    if include_counts:
        for d in out:
            caps = d["capability_ids"]
            d["verified_claims"] = (
                len(
                    session.exec(
                        select(Claim).where(
                            Claim.active == True,
                            Claim.status == "verified",  # noqa: E712
                            Claim.capability_id.in_(caps),
                        )
                    ).all()
                )
                if caps
                else 0
            )
            blog = _active_blog_for_topic(session, d["slug"])
            d["blog"] = (
                {
                    "slug": blog.slug,
                    "title": blog.title,
                    "status": blog.status,
                    "ready_to_share": blog.ready_to_share,
                }
                if blog
                else None
            )
    return out


def _active_blog_for_topic(session: Session, topic_slug: str) -> Optional[Blog]:
    return session.exec(
        select(Blog)
        .where(Blog.topic_slug == topic_slug, Blog.active == True)
        .order_by(Blog.created_at.desc())  # noqa: E712
    ).first()


def get_topic(session: Session, slug: str) -> dict:
    t = session.get(Topic, slug)
    if not t:
        raise LookupError("Topic not found.")
    children = session.exec(
        select(Topic)
        .where(Topic.parent_slug == t.slug, Topic.active == True)
        .order_by(Topic.sort_order, Topic.name)  # noqa: E712
    ).all()
    blog = _active_blog_for_topic(session, t.slug)
    return {
        **_topic_dict(session, t),
        "children": [_topic_dict(session, c) for c in children],
        "blog": _blog_dict(session, blog, body=False) if blog else None,
    }


# --------------------------------------------------------------- blogs
def create_blog(
    session: Session,
    topic_id: str,
    slug: str,
    title: str,
    body_md: str,
    summary: str = "",
    cited_source_ids: Optional[list[str]] = None,
    tags: Optional[list[str]] = None,
    depth_levels: Optional[list[int]] = None,
    assets: Optional[list[dict]] = None,
    document: Optional[dict] = None,
) -> dict:
    """topic_id is the topic slug. Re-posting a slug supersedes the prior version."""
    if not cited_source_ids:
        raise ValueError(
            "cited_source_ids is required and non-empty: a blog with no citations "
            "is untraceable prose."
        )
    if session.get(Topic, topic_id) is None:
        raise ValueError("topic_id (topic slug) does not exist.")
    for sid in cited_source_ids:
        s = session.get(Source, sid)
        if s is None:
            raise ValueError(f"cited_source_ids contains unknown source id: {sid}")
        backed = session.exec(
            select(Claim).where(
                Claim.source_id == sid,
                Claim.active == True,  # noqa: E712
                Claim.status == "verified",
            )
        ).first()
        if backed is None:
            raise ValueError(
                f"Source '{s.title}' ({sid}) has no verified active claims; blogs "
                "may only cite sources whose claims a human has verified."
            )

    slug = slugify(slug or title)
    title, summary, body_md = (
        normalize_text(title),
        normalize_text(summary),
        normalize_text(body_md),
    )
    prior = session.exec(
        select(Blog).where(Blog.slug == slug, Blog.active == True)
    ).first()  # noqa: E712
    blog = Blog(
        topic_slug=topic_id,
        slug=slug,
        title=title,
        summary=summary,
        body_md=body_md,
        tags=_clean_tags(tags),
        depth_levels=sorted({int(d) for d in (depth_levels or [])}),
        status="draft",
        content_hash=content_hash(body_md),
        document=document or {},
    )
    if prior:
        # slug is UNIQUE — free the slug on the prior row by suffixing it, keep history.
        blog.version = prior.version + 1
        blog.supersedes_id = prior.id
        prior.active = False
        prior.slug = f"{prior.slug}@v{prior.version}"
        session.add(prior)
        session.commit()
    session.add(blog)
    session.commit()
    session.refresh(blog)
    _set_citations(session, blog_id=blog.id, source_ids=cited_source_ids)
    search.index_blog(session, blog)
    session.commit()
    add_assets(session, assets, blog_id=blog.id)
    return _blog_dict(session, blog)


def list_blogs(
    session: Session,
    topic_id: Optional[str] = None,
    status: Optional[str] = None,
    tag: Optional[str] = None,
) -> list[dict]:
    stmt = (
        select(Blog).where(Blog.active == True).order_by(Blog.created_at.desc())
    )  # noqa: E712
    if topic_id:
        stmt = stmt.where(Blog.topic_slug == topic_id)
    if status:
        stmt = stmt.where(Blog.status == status)
    rows = session.exec(stmt).all()
    if tag:
        norm = tag.lstrip("#").lower()
        rows = [b for b in rows if norm in [t.lower() for t in b.tags]]
    return [_blog_dict(session, b, body=False) for b in rows]


def get_blog(session: Session, slug: str) -> dict:
    b = session.exec(
        select(Blog).where(Blog.slug == slug, Blog.active == True)
    ).first()  # noqa: E712
    if not b:
        raise LookupError("Blog not found.")
    rows = session.exec(
        select(BlogSource)
        .where(BlogSource.blog_id == b.id)
        .order_by(BlogSource.position)
    ).all()
    legend = []
    for r in rows:
        s = session.get(Source, r.source_id)
        if s:
            legend.append(
                {
                    "tag": r.label,
                    "id": s.id,
                    "title": s.title,
                    "tier": s.tier,
                    "url": s.url,
                    "active": s.active,
                }
            )
    assets = session.exec(select(Asset).where(Asset.blog_id == b.id)).all()
    return {
        **_blog_dict(session, b),
        "legend": legend,
        "assets": [_asset_dict(a) for a in assets],
    }


def blog_history(session: Session, slug: str) -> list[dict]:
    """Walk the supersedes chain. slug may be the active slug; superseded versions carry a
    @vN suffix, so resolve the active row then walk supersedes_id backward."""
    active = session.exec(select(Blog).where(Blog.slug == slug)).first()
    if not active:
        # maybe a suffixed historical slug
        active = session.exec(select(Blog).where(Blog.slug.like(f"{slug}@v%"))).first()
    if not active:
        raise LookupError("Blog not found.")
    chain, cur = [], active
    seen = set()
    while cur and cur.id not in seen:
        chain.append(cur)
        seen.add(cur.id)
        cur = session.get(Blog, cur.supersedes_id) if cur.supersedes_id else None
    chain.reverse()
    return [_blog_dict(session, b, body=False) for b in chain]


# --------------------------------------------------------------- serialisers
def _queue_dict(q: QueueItem) -> dict:
    return {
        "id": q.id,
        "url": q.url,
        "title": q.title,
        "tier": q.tier,
        "notes": q.notes or q.note,
        "tags": list(q.tags),
        "status": q.status,
        "claimed_at": q.claimed_at.isoformat() if q.claimed_at else None,
        "result_source_id": q.result_source_id,
        "error": q.error,
        "submitted_by": q.submitted_by,
        "created_at": q.created_at.isoformat(),
    }


def _topic_dict(session: Session, t: Topic) -> dict:
    return {
        "id": t.slug,
        "slug": t.slug,
        "name": t.name,
        "parent_id": t.parent_slug,
        "description": t.description,
        "capability_ids": _topic_capabilities(session, t.slug),
        "order": t.sort_order,
        "tags": list(t.tags),
        "active": t.active,
        "created_at": t.created_at.isoformat(),
    }


def _blog_dict(session: Session, b: Blog, body: bool = True) -> dict:
    d = {
        "id": b.id,
        "version": b.version,
        "topic_id": b.topic_slug,
        "topic_slug": b.topic_slug,
        "slug": b.slug,
        "title": b.title,
        "summary": b.summary,
        "cited_source_ids": _cited_source_ids(session, blog_id=b.id),
        "tags": list(b.tags),
        "depth_levels": list(b.depth_levels),
        "status": b.status,
        "confidence": b.validation_confidence,
        "ready_to_share": b.ready_to_share,
        "supersedes_id": b.supersedes_id,
        "active": b.active,
        "created_at": b.created_at.isoformat(),
    }
    if body:
        d["body_md"] = b.body_md
    return d


def _source_dict(s: Source) -> dict:
    return {
        "id": s.id,
        "source_key": s.slug,
        "slug": s.slug,
        "version": s.version,
        "url": s.url,
        "title": s.title,
        "tier": s.tier,
        "summary": s.summary,
        "audience": s.audience,
        "why_it_matters": s.why_it_matters,
        "takeaways": list(s.takeaways),
        "tags": list(s.tags),
        "active": s.active,
        "created_at": s.created_at.isoformat(),
    }


def _claim_dict(c: Claim) -> dict:
    return {
        "id": c.id,
        "version": c.version,
        "capability_id": c.capability_id,
        "text": c.text,
        "depth": c.depth,
        "type": c.type,
        "status": c.status,
        "source_id": c.source_id,
        "supersedes_id": c.supersedes_id,
        "confidence": c.confidence,
        "tags": list(c.tags),
        "active": c.active,
        "created_at": c.created_at.isoformat(),
    }


def _asset_dict(a: Asset) -> dict:
    return {
        "id": a.id,
        "kind": a.kind,
        "url": a.url,
        "path": a.path,
        "mime": a.mime,
        "caption": a.caption,
        "attribution": a.attribution,
        "license_note": a.license_note,
        "capability_id": a.capability_id,
        "source_id": a.source_id,
        "claim_id": a.claim_id,
        "design_id": a.design_id,
    }
