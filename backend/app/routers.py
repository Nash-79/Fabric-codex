"""REST API. Thin layer over services — all invariants live in services.py.

v0.2: ingest/design/validate/drift accept pre-built structured payloads from the local agents
(default), plus tags and image/diagram assets. The server makes no LLM calls in local mode.
v0.3: adds reject/reject-bulk/promote claim endpoints; Design exposes ready_to_share.
"""
from __future__ import annotations
from pathlib import Path
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select
from app.db import get_session
from app.models import Source, Claim, Design, ValidationRun, Issue, Asset, load_tags
from app import services, llm

router = APIRouter()


# ------------------------------------------------------------------ schemas
class IngestIn(BaseModel):
    url: str = ""
    title: str = ""
    tier: int = 6
    tags: list[str] = []
    content: str = ""                 # used only in LLM_MODE=api
    claims: Optional[list[dict]] = None   # local mode: agent-extracted claims
    assets: list[dict] = []


class DriftIn(BaseModel):
    content: str = ""
    claims: Optional[list[dict]] = None
    url: str = ""
    title: str = ""
    tier: Optional[int] = None


class DesignCreateIn(BaseModel):              # local mode: agent-authored design
    scenario: str
    output_md: str
    title: str = ""
    constraints: dict = {}
    tags: list[str] = []
    cited_source_ids: Optional[list[str]] = None
    assets: list[dict] = []


class DesignGenerateIn(BaseModel):            # api mode
    scenario: str
    constraints: dict = {}


class ValidateIn(BaseModel):
    issues: Optional[list[dict]] = None       # local mode: validation-reviewer's findings


class AssetIn(BaseModel):
    kind: str = "generated"
    url: str = ""
    path: str = ""
    caption: str = ""
    attribution: str = ""
    license_note: str = ""
    capability_id: str = ""
    source_id: Optional[str] = None
    claim_id: Optional[str] = None
    design_id: Optional[str] = None


class LessonIn(BaseModel):
    capability: str
    level: str = "Beginner"


class BulkClaimIn(BaseModel):
    source_id: Optional[str] = None
    claim_ids: Optional[list[str]] = None


# ------------------------------------------------------------------ sources
@router.post("/sources/ingest")
def ingest(body: IngestIn, session: Session = Depends(get_session)):
    try:
        return services.ingest_source(session, body.url, body.title, body.tier,
                                      content=body.content, claims=body.claims,
                                      tags=body.tags, assets=body.assets)
    except llm.LLMUnavailable as e:
        raise HTTPException(503, str(e))
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.get("/sources")
def list_sources(session: Session = Depends(get_session)):
    rows = session.exec(select(Source).order_by(Source.created_at.desc())).all()
    return [{**r.model_dump(), "tags": load_tags(r.tags_json)} for r in rows]


@router.post("/sources/{source_key}/drift")
def drift(source_key: str, body: DriftIn, session: Session = Depends(get_session)):
    try:
        return services.detect_drift(session, source_key, content=body.content,
                                     claims=body.claims, url=body.url,
                                     title=body.title, tier=body.tier)
    except (llm.LLMUnavailable, ValueError) as e:
        raise HTTPException(400, str(e))


# ------------------------------------------------------------------- claims
@router.get("/claims")
def list_claims(capability: Optional[str] = None, status: Optional[str] = None,
                tag: Optional[str] = None, include_inactive: bool = False,
                session: Session = Depends(get_session)):
    stmt = select(Claim)
    if not include_inactive:
        stmt = stmt.where(Claim.active == True)  # noqa: E712
    if capability:
        stmt = stmt.where(Claim.capability_id == capability)
    if status:
        stmt = stmt.where(Claim.status == status)
    rows = [services._claim_dict(c) for c in session.exec(stmt).all()]
    if tag:
        t = tag.lstrip("#").lower()
        rows = [r for r in rows if t in [x.lower() for x in r["tags"]]]
    return rows


@router.get("/claims/{claim_key}/history")
def history(claim_key: str, session: Session = Depends(get_session)):
    return [services._claim_dict(c) for c in services.claim_history(session, claim_key)]


@router.post("/claims/{claim_id}/verify")
def verify(claim_id: str, session: Session = Depends(get_session)):
    try:
        c = services.verify_claim(session, claim_id)
    except ValueError as e:
        raise HTTPException(409, str(e))
    if not c:
        raise HTTPException(404, "Claim not found.")
    return services._claim_dict(c)


@router.post("/claims/verify-bulk")
def verify_bulk(body: BulkClaimIn, session: Session = Depends(get_session)):
    """Verify every active pending claim of a source (or an explicit id list).
    The human approval step, batched — inactive/non-pending claims are skipped."""
    try:
        return services.verify_claims_bulk(session, source_id=body.source_id,
                                           claim_ids=body.claim_ids)
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.post("/claims/{claim_id}/reject")
def reject(claim_id: str, session: Session = Depends(get_session)):
    """Human dismissal: mark a pending active claim as rejected and deactivate it."""
    try:
        c = services.reject_claim(session, claim_id)
    except ValueError as e:
        raise HTTPException(409, str(e))
    if not c:
        raise HTTPException(404, "Claim not found.")
    return services._claim_dict(c)


@router.post("/claims/reject-bulk")
def reject_bulk(body: BulkClaimIn, session: Session = Depends(get_session)):
    """Reject every active pending claim of a source (or an explicit id list).
    Inactive / non-pending claims are skipped."""
    try:
        return services.reject_claims_bulk(session, source_id=body.source_id,
                                           claim_ids=body.claim_ids)
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.post("/claims/{claim_id}/promote")
def promote(claim_id: str, session: Session = Depends(get_session)):
    """Promote a duplicate claim back to pending/active for human review."""
    try:
        c = services.promote_claim(session, claim_id)
    except ValueError as e:
        raise HTTPException(409, str(e))
    if not c:
        raise HTTPException(404, "Claim not found.")
    return services._claim_dict(c)


@router.post("/claims/{claim_id}/dismiss")
def dismiss(claim_id: str, session: Session = Depends(get_session)):
    """Permanently dismiss an inactive duplicate claim (mark as rejected).
    This is the human confirmation that the claim truly duplicates an existing one
    and should not enter the verify queue even if promoted."""
    try:
        c = services.dismiss_duplicate_claim(session, claim_id)
    except ValueError as e:
        raise HTTPException(409, str(e))
    if not c:
        raise HTTPException(404, "Claim not found.")
    return services._claim_dict(c)


class RevertIn(BaseModel):
    claim_ids: list[str]


@router.post("/claims/revert")
def revert(body: RevertIn, session: Session = Depends(get_session)):
    """Revert a list of recently actioned claims back to pending.
    Accepts verified or rejected claims. Used by the undo toast in the UI."""
    if not body.claim_ids:
        raise HTTPException(400, "claim_ids must not be empty.")
    return services.revert_claims(session, body.claim_ids)


@router.get("/claims/recent-actions")
def recent_actions(limit: int = 30, session: Session = Depends(get_session)):
    """Return the last N claim curation events (verified/rejected/promoted/dismissed),
    newest first. Used to power the Registry audit log panel."""
    return services.recent_claim_events(session, limit=min(limit, 200))


@router.get("/tags")
def list_tags(session: Session = Depends(get_session)):
    counts: dict[str, int] = {}
    for c in session.exec(select(Claim).where(Claim.active == True)).all():  # noqa: E712
        for t in load_tags(c.tags_json):
            counts[t] = counts.get(t, 0) + 1
    return dict(sorted(counts.items(), key=lambda kv: -kv[1]))


@router.get("/coverage")
def coverage(session: Session = Depends(get_session)):
    grid: dict[str, dict[int, int]] = {}
    for c in session.exec(select(Claim).where(Claim.active == True)).all():  # noqa: E712
        grid.setdefault(c.capability_id, {1: 0, 2: 0, 3: 0, 4: 0, 5: 0})
        grid[c.capability_id][c.depth] += 1
    return grid


# ------------------------------------------------------------------ assets
@router.post("/assets")
def create_asset(body: AssetIn, session: Session = Depends(get_session)):
    saved = services.add_assets(session, [body.model_dump()])
    return services._asset_dict(saved[0])


@router.get("/assets")
def list_assets(source: Optional[str] = None, design: Optional[str] = None,
                capability: Optional[str] = None, session: Session = Depends(get_session)):
    stmt = select(Asset)
    if source:
        stmt = stmt.where(Asset.source_id == source)
    if design:
        stmt = stmt.where(Asset.design_id == design)
    if capability:
        stmt = stmt.where(Asset.capability_id == capability)
    return [services._asset_dict(a) for a in session.exec(stmt).all()]


# ------------------------------------------------------------------ designs
@router.post("/designs")
def design_create(body: DesignCreateIn, session: Session = Depends(get_session)):
    try:
        return services.create_design(session, body.scenario, body.output_md,
                                      constraints=body.constraints, tags=body.tags,
                                      cited_source_ids=body.cited_source_ids,
                                      assets=body.assets, title=body.title)
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.post("/designs/generate")
def design_generate(body: DesignGenerateIn, session: Session = Depends(get_session)):
    try:
        return services.generate_design(session, body.scenario, body.constraints)
    except llm.LLMUnavailable as e:
        raise HTTPException(503, str(e))
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.get("/designs")
def list_designs(session: Session = Depends(get_session)):
    rows = session.exec(select(Design).order_by(Design.created_at.desc())).all()
    return [{**r.model_dump(), "tags": load_tags(r.tags_json)} for r in rows]


@router.get("/designs/{design_id}")
def get_design(design_id: str, session: Session = Depends(get_session)):
    d = session.get(Design, design_id)
    if not d:
        raise HTTPException(404, "Design not found.")
    assets = session.exec(select(Asset).where(Asset.design_id == design_id)).all()
    return {**d.model_dump(), "tags": load_tags(d.tags_json),
            "assets": [services._asset_dict(a) for a in assets]}


@router.post("/designs/{design_id}/validate")
def design_validate(design_id: str, body: ValidateIn = ValidateIn(),
                    session: Session = Depends(get_session)):
    try:
        return services.validate_design(session, design_id, agent_issues=body.issues)
    except ValueError as e:
        raise HTTPException(404, str(e))


@router.get("/designs/{design_id}/validations")
def list_validations(design_id: str, session: Session = Depends(get_session)):
    runs = session.exec(select(ValidationRun).where(ValidationRun.design_id == design_id)
                        .order_by(ValidationRun.created_at.desc())).all()
    out = []
    for r in runs:
        issues = session.exec(select(Issue).where(Issue.run_id == r.id)).all()
        out.append({**r.model_dump(), "issues": [i.model_dump() for i in issues]})
    return out


# ------------------------------------------------------------------ lessons
@router.get("/lessons/files")
def lesson_files():
    """Deterministic listing of locally-authored lessons (content/lessons/*.md).

    Lessons are written by the learning-author agent and served statically at
    /content/lessons/<name>; this endpoint just enumerates them for the UI.
    """
    lessons_dir = Path(__file__).resolve().parents[2] / "content" / "lessons"
    if not lessons_dir.is_dir():
        return []
    return [{"name": f.name, "path": f"content/lessons/{f.name}"}
            for f in sorted(lessons_dir.glob("*.md"))]


@router.post("/lessons/generate")
def lesson(body: LessonIn, session: Session = Depends(get_session)):
    """API path only. In local mode the learning-author agent writes the lesson and saves it
    under content/lessons/; this endpoint is the on-the-fly fallback."""
    levels = {"Beginner": [1, 2], "Intermediate": [3], "Expert": [4, 5]}
    depths = levels.get(body.level, [1, 2])
    claims = session.exec(
        select(Claim).where(Claim.active == True,  # noqa: E712
                            Claim.capability_id == body.capability,
                            Claim.depth.in_(depths))).all()
    if not claims:
        raise HTTPException(400, f"No {body.level}-level claims for {body.capability}.")
    tag_of, order = {}, []
    for c in claims:
        if c.source_id not in tag_of:
            tag_of[c.source_id] = "S" + str(len(order) + 1)
            order.append(c.source_id)
    ctx = "\n".join(f"[{tag_of[c.source_id]}] {c.text}" for c in claims)
    try:
        md = llm.write_lesson(body.capability, body.level, ctx)
    except llm.LLMUnavailable as e:
        raise HTTPException(503, str(e))
    legend = "\n".join(f"{tag_of[sid]} = {session.get(Source, sid).title}" for sid in order)
    return {"capability": body.capability, "level": body.level, "lesson_md": md, "legend": legend}
