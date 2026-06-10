"""Domain services. The backend owns all versioning + deterministic validation invariants.

Two modes (set LLM_MODE in .env):
  - "local" (default): the Claude Code / Codex agents do extraction, generation, diagrams, and
    grounding/coverage/antipattern reasoning on your laptop, then POST structured results here.
    The server makes NO LLM calls and needs NO API key.
  - "api": the server calls the Anthropic API on the fly via llm.py (the original v0.1 behaviour).

Sections: helpers · ingestion · versioning · assets · generation · validation · drift · serialisers
"""
from __future__ import annotations
import hashlib
import json
import logging
import re
from difflib import SequenceMatcher

from typing import Optional
from sqlmodel import Session, select
from app import llm
from app.db import LLM_MODE

from app.models import (Source, Claim, Design, ValidationRun, Issue, Asset,
                        dump_tags, load_tags)

log = logging.getLogger(__name__)

SAME = 0.85
CHANGED = 0.55
SEVERITY_WEIGHT = {"critical": 0.4, "warning": 0.15, "info": 0.0}


# --------------------------------------------------------------- helpers
def content_hash(text: str) -> str:
    return hashlib.sha256((text or "").strip().encode("utf-8")).hexdigest()[:16]


def _source_fingerprint(content: str, claims: Optional[list[dict]]) -> str:
    """Drift hash. For structured payloads, hash the sorted claim texts so reordering
    claims in a content file or editing tags/depth does not register as drift."""
    if content:
        return content_hash(content)
    texts = sorted((c.get("text") or "").strip() for c in (claims or []))
    return content_hash(json.dumps(texts))


def slugify(value: str) -> str:
    value = re.sub(r"^https?://", "", (value or "").lower())
    value = re.sub(r"[^a-z0-9]+", "-", value).strip("-")
    return value[:80] or "source"


def _sim(a: str, b: str) -> float:
    return SequenceMatcher(None, a.lower(), b.lower()).ratio()


def _norm_extracted(items: list[dict]) -> list[dict]:
    out = []
    for x in items or []:
        cid = x.get("capability_id") or x.get("capabilityId")
        if cid in llm.CAPABILITY_IDS and x.get("text"):
            out.append({
                "capability_id": cid,
                "text": x["text"].strip(),
                "depth": max(1, min(5, int(x.get("depth", 1)))),
                "type": x.get("type", "fact"),
                "tags": x.get("tags", []),
            })
    return out


# --------------------------------------------------------------- ingestion
def _find_duplicate(session: Session, text: str, capability_id: str,
                    exclude_source_ids: set[str]) -> Optional[Claim]:
    """Cross-source dedup: an active claim in the same capability, from a different
    source family, whose text is near-identical (>= SAME)."""
    candidates = session.exec(
        select(Claim).where(Claim.active == True,  # noqa: E712
                            Claim.capability_id == capability_id)).all()
    for c in candidates:
        if c.source_id not in exclude_source_ids and _sim(c.text, text) >= SAME:
            return c
    return None


def _family_source_ids(session: Session, source_key: str) -> set[str]:
    return {s.id for s in session.exec(
        select(Source).where(Source.source_key == source_key)).all()}


def _insert_claims(session: Session, source: Source, extracted: list[dict]) -> list[Claim]:
    """Insert extracted claims. Claims that near-duplicate an active claim from another
    source are stored as status='duplicate', active=False — flagged for human merge,
    kept out of retrieval and coverage."""
    family = _family_source_ids(session, source.source_key)
    created, duplicates = [], []
    for e in extracted:
        dup = _find_duplicate(session, e["text"], e["capability_id"], family)
        c = Claim(capability_id=e["capability_id"], text=e["text"], depth=e["depth"],
                  type=e["type"],
                  status="duplicate" if dup else "pending",
                  source_id=source.id,
                  tags_json=dump_tags(e.get("tags")), active=not dup)
        session.add(c)
        created.append(c)
        if dup:
            duplicates.append((c, dup))
    session.commit()
    for c in created:
        session.refresh(c)
    return created, [{"claim_id": c.id, "text": c.text, "duplicate_of": d.id,
                      "duplicate_of_text": d.text} for c, d in duplicates]


def _resolve_claims(content: str, provided: Optional[list[dict]]) -> list[dict]:
    """Local mode uses agent-provided claims; api mode extracts from content."""
    if provided:
        return _norm_extracted(provided)
    if LLM_MODE == "api" and content:
        return _norm_extracted(llm.extract_claims(content))
    raise ValueError(
        "No claims provided. In local mode, the curator agent extracts claims and posts them as "
        "`claims`. (Set LLM_MODE=api to extract server-side from `content`.)")


def ingest_source(session: Session, url: str, title: str, tier: int, content: str = "",
                  claims: Optional[list[dict]] = None, tags: Optional[list[str]] = None,
                  assets: Optional[list[dict]] = None) -> dict:
    key = slugify(url or title)
    existing = session.exec(
        select(Source).where(Source.source_key == key, Source.active == True)).first()  # noqa: E712
    if existing:
        return detect_drift(session, key, content=content, claims=claims,
                            url=url, title=title, tier=tier, tags=tags, assets=assets)

    extracted = _resolve_claims(content, claims)   # may raise — do it before any writes
    src = Source(source_key=key, version=1, url=url, title=title or url or key, tier=tier,
                 content_hash=_source_fingerprint(content, claims),
                 tags_json=dump_tags(tags), active=True)
    session.add(src)
    session.commit()
    session.refresh(src)

    inserted, duplicates = _insert_claims(session, src, extracted)
    saved_assets = add_assets(session, assets, source_id=src.id)
    return {"source_id": src.id, "source_key": key, "version": 1, "drift": False,
            "claims_added": len(inserted) - len(duplicates), "duplicates": duplicates,
            "assets_added": len(saved_assets),
            "claims": [_claim_dict(c) for c in inserted]}


# --------------------------------------------------------------- versioning
def verify_claim(session: Session, claim_id: str) -> Optional[Claim]:
    c = session.get(Claim, claim_id)
    if not c:
        return None
    if not c.active:
        raise ValueError(f"Claim {claim_id} is {c.status} (inactive); "
                         "only active claims can be verified.")
    c.status = "verified"
    c.confidence = max(c.confidence, 0.85)
    session.add(c)
    session.commit()
    session.refresh(c)
    return c


def verify_claims_bulk(session: Session, source_id: Optional[str] = None,
                       claim_ids: Optional[list[str]] = None) -> dict:
    """Verify all active pending claims for a source, or an explicit id list.
    Inactive / non-pending claims are skipped and reported, never flipped."""
    if source_id:
        rows = session.exec(
            select(Claim).where(Claim.source_id == source_id)).all()
    elif claim_ids:
        rows = [c for cid in claim_ids if (c := session.get(Claim, cid))]
    else:
        raise ValueError("Provide source_id or claim_ids.")
    verified, skipped = [], []
    for c in rows:
        if c.active and c.status == "pending":
            c.status = "verified"
            c.confidence = max(c.confidence, 0.85)
            session.add(c)
            verified.append(c.id)
        else:
            skipped.append({"claim_id": c.id, "status": c.status, "active": c.active})
    session.commit()
    return {"verified": len(verified), "verified_ids": verified, "skipped": skipped}


def reject_claim(session: Session, claim_id: str) -> Optional[Claim]:
    """Human dismissal: mark a pending active claim as rejected and deactivate it.
    Only active claims with status='pending' may be rejected via this path;
    use dismiss_duplicate_claim() for inactive duplicate claims."""
    c = session.get(Claim, claim_id)
    if not c:
        return None
    if not c.active or c.status != "pending":
        raise ValueError(f"Claim {claim_id} has status='{c.status}', active={c.active}; "
                         "only active pending claims can be rejected. "
                         "For duplicate claims use the /dismiss endpoint.")
    c.status = "rejected"
    c.active = False
    session.add(c)
    session.commit()
    session.refresh(c)
    return c


def dismiss_duplicate_claim(session: Session, claim_id: str) -> Optional[Claim]:
    """Confirm an inactive duplicate claim as permanently dismissed (rejected).
    Duplicate claims are stored inactive=False; dismiss sets status='rejected'
    to make the human decision explicit and queryable."""
    c = session.get(Claim, claim_id)
    if not c:
        return None
    if c.status != "duplicate":
        raise ValueError(f"Claim {claim_id} has status='{c.status}'; "
                         "only duplicate claims can be dismissed via this endpoint.")
    c.status = "rejected"
    c.active = False   # already False, but be explicit
    session.add(c)
    session.commit()
    session.refresh(c)
    return c


def reject_claims_bulk(session: Session, source_id: Optional[str] = None,
                       claim_ids: Optional[list[str]] = None) -> dict:
    """Reject all active pending claims for a source, or an explicit id list.
    Inactive / non-pending claims are skipped."""
    if source_id:
        rows = session.exec(
            select(Claim).where(Claim.source_id == source_id)).all()
    elif claim_ids:
        rows = [c for cid in claim_ids if (c := session.get(Claim, cid))]
    else:
        raise ValueError("Provide source_id or claim_ids.")
    rejected, skipped = [], []
    for c in rows:
        if c.active and c.status == "pending":
            c.status = "rejected"
            c.active = False
            session.add(c)
            rejected.append(c.id)
        else:
            skipped.append({"claim_id": c.id, "status": c.status, "active": c.active})
    session.commit()
    return {"rejected": len(rejected), "rejected_ids": rejected, "skipped": skipped}


def promote_claim(session: Session, claim_id: str) -> Optional[Claim]:
    """Promote a duplicate claim back to pending/active for human review.
    Only claims with status='duplicate' and active=False may be promoted."""
    c = session.get(Claim, claim_id)
    if not c:
        return None
    if c.status != "duplicate":
        raise ValueError(f"Claim {claim_id} has status '{c.status}'; "
                         "only duplicate claims can be promoted.")
    c.status = "pending"
    c.active = True
    session.add(c)
    session.commit()
    session.refresh(c)
    return c


def supersede_claim(session: Session, old: Claim, new_text: str, source: Source,
                    depth: Optional[int] = None, ctype: Optional[str] = None,
                    tags: Optional[list[str]] = None) -> Claim:
    new = Claim(claim_key=old.claim_key, version=old.version + 1,
                capability_id=old.capability_id, text=new_text,
                depth=depth or old.depth, type=ctype or old.type,
                status="pending", source_id=source.id, supersedes_id=old.id,
                tags_json=dump_tags(tags) if tags else old.tags_json, active=True)
    old.active = False
    old.status = "superseded"
    session.add(old)
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


def claim_history(session: Session, claim_key: str) -> list[Claim]:
    return session.exec(
        select(Claim).where(Claim.claim_key == claim_key).order_by(Claim.version)).all()


# ------------------------------------------------------------------ assets
def add_assets(session: Session, assets: Optional[list[dict]], source_id: Optional[str] = None,
               design_id: Optional[str] = None) -> list[Asset]:
    """Insert assets, deduplicating by path (generated) or url (referenced) within the same
    source/design scope. Returns a list of Asset objects (existing or newly created)."""
    saved = []
    for a in assets or []:
        kind = a.get("kind", "generated")
        eff_source_id = a.get("source_id", source_id)
        eff_design_id = a.get("design_id", design_id)

        # Dedup: skip if an identical asset already exists in the same scope.
        if kind == "generated":
            path_val = a.get("path", "")
            if path_val:
                existing = session.exec(
                    select(Asset).where(
                        Asset.kind == "generated",
                        Asset.path == path_val,
                        Asset.source_id == eff_source_id,
                        Asset.design_id == eff_design_id,
                    )).first()
                if existing:
                    log.warning("add_assets: skipping duplicate generated asset path=%s "
                                "(source_id=%s, design_id=%s, existing id=%s)",
                                path_val, eff_source_id, eff_design_id, existing.id)
                    saved.append(existing)
                    continue
        else:
            url_val = a.get("url", "")
            if url_val:
                existing = session.exec(
                    select(Asset).where(
                        Asset.kind == "referenced",
                        Asset.url == url_val,
                        Asset.source_id == eff_source_id,
                        Asset.design_id == eff_design_id,
                    )).first()
                if existing:
                    log.warning("add_assets: skipping duplicate referenced asset url=%s "
                                "(source_id=%s, design_id=%s, existing id=%s)",
                                url_val, eff_source_id, eff_design_id, existing.id)
                    saved.append(existing)
                    continue

        # referenced (external) images must carry attribution — never re-hosted, link only.
        attribution = a.get("attribution", "")
        if kind == "referenced" and not attribution:
            attribution = "Source unknown — attribution required before display."
        asset = Asset(
            kind=kind, url=a.get("url", ""), path=a.get("path", ""),
            mime=a.get("mime", "image/svg+xml" if kind == "generated" else "image/png"),
            caption=a.get("caption", ""), attribution=attribution,
            license_note=a.get("license_note", "" if kind == "generated"
                               else "External image; referenced with attribution, not re-hosted."),
            capability_id=a.get("capability_id", ""),
            source_id=eff_source_id, claim_id=a.get("claim_id"),
            design_id=eff_design_id)
        session.add(asset)
        saved.append(asset)
    if saved:
        session.commit()
        for a in saved:
            session.refresh(a)
    return saved


# --------------------------------------------------------------- generation
def _grounding_context(session: Session, limit: int = 70):
    # Deterministic order: verified before pending, then oldest first — so the [Sn]
    # legend is stable across calls (citation parsing depends on this).
    verified = session.exec(
        select(Claim).where(Claim.active == True, Claim.status == "verified")  # noqa: E712
        .order_by(Claim.created_at, Claim.id)).all()
    pending = session.exec(
        select(Claim).where(Claim.active == True, Claim.status == "pending")  # noqa: E712
        .order_by(Claim.created_at, Claim.id)).all()
    claims = (verified + pending)[:limit]
    src_order, tag_of = [], {}
    for c in claims:
        if c.source_id not in tag_of:
            tag_of[c.source_id] = "S" + str(len(src_order) + 1)
            src_order.append(c.source_id)
    ctx = "\n".join(f"[{tag_of[c.source_id]}] ({c.capability_id}, L{c.depth}) {c.text}" for c in claims)
    legend_lines = []
    for sid in src_order:
        s = session.get(Source, sid)
        legend_lines.append(f"{tag_of[sid]} = {s.title} (T{s.tier}){'' if s.active else '  [SUPERSEDED]'}")
    return ctx, "\n".join(legend_lines), {tag_of[sid]: sid for sid in src_order}, claims


def _parse_cited(md: str, tag_to_source: dict) -> list[str]:
    tags = set(re.findall(r"\[S(\d+)\]", md))
    return [tag_to_source["S" + t] for t in tags if ("S" + t) in tag_to_source]


def create_design(session: Session, scenario: str, output_md: str,
                  constraints: Optional[dict] = None, tags: Optional[list[str]] = None,
                  cited_source_ids: Optional[list[str]] = None,
                  assets: Optional[list[dict]] = None, title: str = "") -> dict:
    """Local-authoring path: the architect agent already produced the design; persist it.

    `cited_source_ids` must come from whoever built the [Sn] legend the design text uses.
    Re-deriving the mapping here from a fresh grounding context silently mis-attributes
    citations when the author used a different claim set/order, so it is rejected."""
    if cited_source_ids is None:
        raise ValueError(
            "cited_source_ids is required: pass the source ids behind the [Sn] tags used "
            "in output_md (the agent that authored the design owns that mapping).")
    unknown = [sid for sid in cited_source_ids if session.get(Source, sid) is None]
    if unknown:
        raise ValueError(f"cited_source_ids contains unknown source id(s): {unknown}")
    design = Design(title=title or scenario[:60], scenario=scenario,
                    constraints_json=json.dumps(constraints or {}),
                    output_md=output_md, tags_json=dump_tags(tags),
                    cited_source_ids_json=json.dumps(cited_source_ids), status="draft")
    session.add(design)
    session.commit()
    session.refresh(design)
    add_assets(session, assets, design_id=design.id)
    return {"design_id": design.id, "output_md": output_md, "cited_source_ids": cited_source_ids}


def generate_design(session: Session, scenario: str, constraints: dict) -> dict:
    """API path (LLM_MODE=api): server generates via llm.py."""
    ctx, legend, tag_to_source, claims = _grounding_context(session)
    if not claims:
        raise ValueError("Knowledge base is empty — ingest sources first.")
    md = llm.generate_architecture(scenario, constraints, ctx, legend)
    res = create_design(session, scenario, md, constraints=constraints,
                         cited_source_ids=_parse_cited(md, tag_to_source))
    res["legend"] = legend
    return res


# --------------------------------------------------------------- validation
def validate_design(session: Session, design_id: str,
                    agent_issues: Optional[list[dict]] = None) -> dict:
    design = session.get(Design, design_id)
    if not design:
        raise ValueError("Design not found.")
    issues: list[dict] = []
    md = design.output_md
    cited_ids = json.loads(design.cited_source_ids_json or "[]")

    # deterministic (always, no key)
    if not re.findall(r"\[S(\d+)\]", md):
        issues.append({"validator": "citation", "severity": "warning",
                       "message": "Design contains no citations; factual claims are untraceable.", "ref": ""})
    for sid in cited_ids:
        s = session.get(Source, sid)
        if s is None:
            issues.append({"validator": "citation", "severity": "critical",
                           "message": "A cited source id does not exist.", "ref": sid})
        elif not s.active:
            issues.append({"validator": "freshness", "severity": "warning",
                           "message": f"Cited source '{s.title}' has been superseded.", "ref": sid})
        stale = session.exec(
            select(Claim).where(Claim.source_id == sid, Claim.active == False)).all()  # noqa: E712
        if stale:
            issues.append({"validator": "freshness", "severity": "info",
                           "message": f"{len(stale)} claim(s) from this source are superseded/deprecated.", "ref": sid})

    # grounding / coverage / antipattern
    valid_v, valid_s = {"grounding", "coverage", "antipattern"}, {"critical", "warning", "info"}
    full_pass = True   # False = only deterministic validators ran -> status "checked"
    if agent_issues is not None:  # local mode: validation-reviewer agent supplies these
        issues.extend({"validator": i.get("validator", "grounding"),
                       "severity": i.get("severity", "warning"),
                       "message": i.get("message", ""), "ref": i.get("ref", "")}
                      for i in agent_issues
                      if i.get("validator") in valid_v and i.get("severity") in valid_s and i.get("message"))
    elif LLM_MODE == "api":
        try:
            ctx, _, _, _ = _grounding_context(session)
            issues.extend(llm.review_design(md, design.scenario, ctx))
        except llm.LLMUnavailable:
            full_pass = False
            issues.append({"validator": "grounding", "severity": "info",
                           "message": "LLM validators skipped (no key).", "ref": ""})
    else:
        full_pass = False
        issues.append({"validator": "grounding", "severity": "info",
                       "message": "No agent issues supplied; ran deterministic validators only. "
                                  "Run the validation-reviewer agent for grounding/coverage/antipattern.", "ref": ""})

    penalty = sum(SEVERITY_WEIGHT.get(i["severity"], 0.0) for i in issues)
    confidence = round(max(0.0, 1.0 - penalty), 2)
    run = ValidationRun(design_id=design_id, confidence=confidence)
    session.add(run)
    session.commit()
    session.refresh(run)
    for i in issues:
        session.add(Issue(run_id=run.id, validator=i["validator"], severity=i["severity"],
                          message=i["message"], ref=i.get("ref", "")))
    has_critical = any(i["severity"] == "critical" for i in issues)
    rts = full_pass and not has_critical
    design.confidence = confidence
    design.ready_to_share = rts
    # "checked" = only deterministic citation/freshness validators ran; "validated" means a
    # grounding/coverage/antipattern review (agent or API) was part of this run.
    design.status = ("needs_review" if has_critical
                     else "validated" if full_pass else "checked")
    session.add(design)
    session.commit()
    return {"design_id": design_id, "run_id": run.id, "confidence": confidence,
            "full_pass": full_pass,
            "ready_to_share": rts, "issues": issues}


# --------------------------------------------------------------- drift
def detect_drift(session: Session, source_key: str, content: str = "",
                 claims: Optional[list[dict]] = None, url: str = "", title: str = "",
                 tier: Optional[int] = None, tags: Optional[list[str]] = None,
                 assets: Optional[list[dict]] = None) -> dict:
    current_src = session.exec(
        select(Source).where(Source.source_key == source_key, Source.active == True)).first()  # noqa: E712
    if current_src is None:
        return ingest_source(session, url or source_key, title, tier or 6,
                             content=content, claims=claims, tags=tags, assets=assets)

    new_hash = _source_fingerprint(content, claims)
    if new_hash == current_src.content_hash:
        return {"source_key": source_key, "drift": False, "reason": "content unchanged",
                "added": 0, "changed": 0, "removed": 0, "unchanged": 0, "affected_designs": []}

    extracted = _resolve_claims(content, claims)   # may raise — do it before any writes

    current_src.active = False
    session.add(current_src)
    new_src = Source(source_key=source_key, version=current_src.version + 1,
                     url=url or current_src.url, title=title or current_src.title,
                     tier=tier if tier is not None else current_src.tier,
                     content_hash=new_hash,
                     tags_json=dump_tags(tags) if tags else current_src.tags_json,
                     active=True)
    session.add(new_src)
    session.commit()
    session.refresh(new_src)
    add_assets(session, assets, source_id=new_src.id)

    family_ids = [s.id for s in session.exec(
        select(Source).where(Source.source_key == source_key)).all()]
    old_claims = session.exec(
        select(Claim).where(Claim.active == True, Claim.source_id.in_(family_ids))).all()  # noqa: E712

    matched, added, changed, unchanged = set(), [], [], []
    for e in extracted:
        cands = [c for c in old_claims if c.capability_id == e["capability_id"]]
        best, score = None, 0.0
        for c in cands:
            sc = _sim(c.text, e["text"])
            if sc > score:
                best, score = c, sc
        if best and score >= SAME:
            matched.add(best.id)
            best.source_id = new_src.id
            session.add(best)
            unchanged.append({"claim_id": best.id})
        elif best and score >= CHANGED:
            matched.add(best.id)
            nc = supersede_claim(session, best, e["text"], new_src, e["depth"], e["type"], e.get("tags"))
            changed.append({"old_id": best.id, "new_id": nc.id, "text": e["text"]})
        else:
            dup = _find_duplicate(session, e["text"], e["capability_id"], set(family_ids))
            session.add(Claim(capability_id=e["capability_id"], text=e["text"], depth=e["depth"],
                              type=e["type"],
                              status="duplicate" if dup else "pending",
                              source_id=new_src.id,
                              tags_json=dump_tags(e.get("tags")), active=not dup))
            added.append({"text": e["text"], "capability": e["capability_id"],
                          **({"duplicate_of": dup.id} if dup else {})})
    session.commit()

    removed = []
    for c in old_claims:
        if c.id not in matched:
            deprecate_claim(session, c)
            removed.append({"claim_id": c.id, "text": c.text})

    affected, fam = [], set(family_ids) | {new_src.id}
    for d in session.exec(select(Design)).all():
        if set(json.loads(d.cited_source_ids_json or "[]")) & fam:
            d.status = "needs_review"
            session.add(d)
            affected.append({"design_id": d.id, "title": d.title})
    session.commit()
    return {"source_key": source_key, "drift": True, "new_version": new_src.version,
            "added": len(added), "changed": len(changed), "removed": len(removed),
            "unchanged": len(unchanged),
            "detail": {"added": added, "changed": changed, "removed": removed},
            "affected_designs": affected}


# --------------------------------------------------------------- serialisers
def _claim_dict(c: Claim) -> dict:
    return {"id": c.id, "claim_key": c.claim_key, "version": c.version,
            "capability_id": c.capability_id, "text": c.text, "depth": c.depth,
            "type": c.type, "status": c.status, "source_id": c.source_id,
            "supersedes_id": c.supersedes_id, "confidence": c.confidence,
            "tags": load_tags(c.tags_json), "active": c.active,
            "created_at": c.created_at.isoformat()}


def _asset_dict(a: Asset) -> dict:
    return {"id": a.id, "kind": a.kind, "url": a.url, "path": a.path, "mime": a.mime,
            "caption": a.caption, "attribution": a.attribution, "license_note": a.license_note,
            "capability_id": a.capability_id, "source_id": a.source_id,
            "claim_id": a.claim_id, "design_id": a.design_id}
