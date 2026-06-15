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
from app import llm, search
from app.db import LLM_MODE

from app.models import (Source, Claim, ClaimEvent, Design, ValidationRun, Issue, Asset,
                        Topic, Blog, QueueItem,
                        dump_tags, load_tags, dump_list, load_list)

log = logging.getLogger(__name__)

SAME = 0.85
CHANGED = 0.55
SEVERITY_WEIGHT = {"critical": 0.4, "warning": 0.15, "info": 0.0}


# --------------------------------------------------------------- helpers
# Common Windows-1252-decoded-as-UTF-8 mojibake → the character it should have been.
# Order matters: the 3-byte sequences (em/en dash, bullet) must be tried before the
# 2-byte ones so a longer match wins. Applied to *incoming* text only, never to stored
# rows — versioned claims/blogs are append-only and must not be rewritten in place.
_MOJIBAKE = [
    ("â€™", "'"),   # â€™  right single quote / apostrophe
    ("â€œ", "\""),  # â€œ  left double quote
    ("â€", "\""),  # â€\x9d right double quote
    ("â€”", "—"),  # â€"  em dash
    ("â€“", "–"),  # â€"  en dash
    ("â€¢", "•"),  # â€¢  bullet
    ("â€¦", "…"),  # â€¦  ellipsis
    ("â€", "\""),         # bare â€ leftover → straight quote
    ("Â ", " "),          # Â + nbsp → space
]


def normalize_text(s: str) -> str:
    """Repair common UTF-8 mojibake on text as it enters the knowledge base.

    Runs at the ingestion boundary (before a new claim/source/blog version is
    persisted) so future imports stay clean without ever mutating existing,
    versioned rows. A no-op for already-clean text."""
    if not s or "â€" not in s and "Â " not in s:
        return s
    for bad, good in _MOJIBAKE:
        s = s.replace(bad, good)
    return s


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
                "text": normalize_text(x["text"].strip()),
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
        if c.active:
            search.index_claim(session, c)
    session.commit()
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
                  assets: Optional[list[dict]] = None, summary: str = "",
                  audience: str = "", why_it_matters: str = "",
                  takeaways: Optional[list[str]] = None) -> dict:
    key = slugify(url or title)
    existing = session.exec(
        select(Source).where(Source.source_key == key, Source.active == True)).first()  # noqa: E712
    if existing:
        return detect_drift(session, key, content=content, claims=claims,
                            url=url, title=title, tier=tier, tags=tags, assets=assets,
                            summary=summary, audience=audience,
                            why_it_matters=why_it_matters, takeaways=takeaways)

    extracted = _resolve_claims(content, claims)   # may raise — do it before any writes
    src = Source(source_key=key, version=1, url=url,
                 title=normalize_text(title) or url or key, tier=tier,
                 content_hash=_source_fingerprint(content, claims),
                 summary=normalize_text(summary), audience=normalize_text(audience),
                 why_it_matters=normalize_text(why_it_matters),
                 takeaways_json=dump_list([normalize_text(t) for t in (takeaways or [])]),
                 tags_json=dump_tags(tags), active=True)
    session.add(src)
    session.commit()
    session.refresh(src)
    search.index_source(session, src)
    session.commit()

    inserted, duplicates = _insert_claims(session, src, extracted)
    saved_assets = add_assets(session, assets, source_id=src.id)
    return {"source_id": src.id, "source_key": key, "version": 1, "drift": False,
            "claims_added": len(inserted) - len(duplicates), "duplicates": duplicates,
            "assets_added": len(saved_assets),
            "claims": [_claim_dict(c) for c in inserted]}


# --------------------------------------------------------------- versioning
def _record_event(session: Session, claim: Claim, action: str, prev_status: str) -> None:
    """Append one ClaimEvent row for every human curation action.
    Called after the claim status has already been updated so claim.status
    reflects the new state."""
    ev = ClaimEvent(
        claim_id=claim.id,
        claim_key=claim.claim_key,
        capability_id=claim.capability_id,
        action=action,
        prev_status=prev_status,
        new_status=claim.status,
        text_snippet=claim.text[:120],
    )
    session.add(ev)


def verify_claim(session: Session, claim_id: str) -> Optional[Claim]:
    c = session.get(Claim, claim_id)
    if not c:
        return None
    if not c.active:
        raise ValueError(f"Claim {claim_id} is {c.status} (inactive); "
                         "only active claims can be verified.")
    prev = c.status
    c.status = "verified"
    c.confidence = max(c.confidence, 0.85)
    _record_event(session, c, "verified", prev)
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
    prev = c.status
    c.status = "rejected"
    c.active = False
    _record_event(session, c, "rejected", prev)
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
    prev = c.status
    c.status = "rejected"
    c.active = False   # already False, but be explicit
    _record_event(session, c, "dismissed", prev)
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
    """Revert a list of recently actioned claims back to pending/active.
    Accepts claims that are currently verified (active=True) or rejected
    (active=False). Used by the undo toast in the UI."""
    reverted, skipped = [], []
    for cid in claim_ids:
        c = session.get(Claim, cid)
        if not c:
            skipped.append({"claim_id": cid, "reason": "not found"})
            continue
        if c.status not in ("verified", "rejected"):
            skipped.append({"claim_id": cid, "reason": f"status={c.status!r} cannot be reverted"})
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
    """Promote a duplicate claim back to pending/active for human review.
    Only claims with status='duplicate' and active=False may be promoted."""
    c = session.get(Claim, claim_id)
    if not c:
        return None
    if c.status != "duplicate":
        raise ValueError(f"Claim {claim_id} has status '{c.status}'; "
                         "only duplicate claims can be promoted.")
    prev = c.status
    c.status = "pending"
    c.active = True
    _record_event(session, c, "promoted", prev)
    session.add(c)
    session.commit()
    session.refresh(c)
    return c


def recent_claim_events(session: Session, limit: int = 30) -> list[dict]:
    """Return the most recent curation events across all claims, newest first."""
    from app.models import ClaimEvent
    rows = session.exec(
        select(ClaimEvent).order_by(ClaimEvent.actioned_at.desc()).limit(limit)
    ).all()
    return [
        {
            "id": ev.id,
            "claim_id": ev.claim_id,
            "claim_key": ev.claim_key,
            "capability_id": ev.capability_id,
            "action": ev.action,
            "prev_status": ev.prev_status,
            "new_status": ev.new_status,
            "text_snippet": ev.text_snippet,
            "actioned_at": ev.actioned_at.isoformat(),
        }
        for ev in rows
    ]


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
    search.index_claim(session, new)
    session.commit()
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
               design_id: Optional[str] = None, blog_id: Optional[str] = None) -> list[Asset]:
    """Insert assets, deduplicating by path (generated) or url (referenced) within the same
    source/design/blog scope. Returns a list of Asset objects (existing or newly created)."""
    saved = []
    for a in assets or []:
        kind = a.get("kind", "generated")
        eff_source_id = a.get("source_id", source_id)
        eff_design_id = a.get("design_id", design_id)
        eff_blog_id = a.get("blog_id", blog_id)

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
                        Asset.blog_id == eff_blog_id,
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
                        Asset.blog_id == eff_blog_id,
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
            design_id=eff_design_id, blog_id=eff_blog_id)
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
def _validate_document(session: Session, *, target_kind: str, target, md: str,
                       cited_ids: list[str], agent_issues: Optional[list[dict]],
                       scenario: str = "") -> dict:
    """Shared validation core for designs and blogs. Runs the deterministic
    citation + freshness validators, merges agent/API grounding issues, computes
    confidence, writes a ValidationRun, and updates the target's
    status/confidence/ready_to_share (Design and Blog share those field names)."""
    issues: list[dict] = []

    # deterministic (always, no key)
    if not re.findall(r"\[S(\d+)\]", md):
        issues.append({"validator": "citation", "severity": "warning",
                       "message": f"{target_kind.capitalize()} contains no citations; "
                                  "factual claims are untraceable.", "ref": ""})
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

    if target_kind == "blog":
        issues.extend(_check_blog_images(md))

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
            issues.extend(llm.review_design(md, scenario, ctx))
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
    run = ValidationRun(design_id=target.id if target_kind == "design" else "",
                        target_kind=target_kind, target_id=target.id,
                        confidence=confidence)
    session.add(run)
    session.commit()
    session.refresh(run)
    for i in issues:
        session.add(Issue(run_id=run.id, validator=i["validator"], severity=i["severity"],
                          message=i["message"], ref=i.get("ref", "")))
    has_critical = any(i["severity"] == "critical" for i in issues)
    rts = full_pass and not has_critical
    target.confidence = confidence
    target.ready_to_share = rts
    # "checked" = only deterministic citation/freshness validators ran; "validated" means a
    # grounding/coverage/antipattern review (agent or API) was part of this run.
    target.status = ("needs_review" if has_critical
                     else "validated" if full_pass else "checked")
    session.add(target)
    session.commit()
    return {"run_id": run.id, "confidence": confidence, "full_pass": full_pass,
            "ready_to_share": rts, "issues": issues}


def _check_blog_images(md: str) -> list[dict]:
    """Blogs embed only generated diagrams under content/diagrams/. A referenced
    diagram that is missing on disk is a content-integrity failure (the published
    article would render a broken image), so it is a *critical* issue: the blog must
    not reach ready_to_share until the diagram exists or the reference is removed."""
    from pathlib import Path
    repo_root = Path(__file__).resolve().parents[2]
    issues = []
    for path in re.findall(r"!\[[^\]]*\]\(([^)\s]+)\)", md):
        if "content/diagrams/" not in path:
            continue
        rel = path.lstrip("/")
        if not (repo_root / rel).exists():
            issues.append({"validator": "citation", "severity": "critical",
                           "message": f"Embedded diagram not found on disk: {path}", "ref": path})
    return issues


def validate_design(session: Session, design_id: str,
                    agent_issues: Optional[list[dict]] = None) -> dict:
    design = session.get(Design, design_id)
    if not design:
        raise ValueError("Design not found.")
    res = _validate_document(session, target_kind="design", target=design,
                             md=design.output_md,
                             cited_ids=json.loads(design.cited_source_ids_json or "[]"),
                             agent_issues=agent_issues, scenario=design.scenario)
    return {"design_id": design_id, **res}


def validate_blog(session: Session, blog_id: str,
                  agent_issues: Optional[list[dict]] = None) -> dict:
    blog = session.get(Blog, blog_id)
    if not blog:
        raise ValueError("Blog not found.")
    res = _validate_document(session, target_kind="blog", target=blog,
                             md=blog.body_md,
                             cited_ids=json.loads(blog.cited_source_ids_json or "[]"),
                             agent_issues=agent_issues, scenario=blog.title)
    return {"blog_id": blog_id, **res}


# --------------------------------------------------------------- drift
def detect_drift(session: Session, source_key: str, content: str = "",
                 claims: Optional[list[dict]] = None, url: str = "", title: str = "",
                 tier: Optional[int] = None, tags: Optional[list[str]] = None,
                 assets: Optional[list[dict]] = None, summary: str = "",
                 audience: str = "", why_it_matters: str = "",
                 takeaways: Optional[list[str]] = None) -> dict:
    current_src = session.exec(
        select(Source).where(Source.source_key == source_key, Source.active == True)).first()  # noqa: E712
    if current_src is None:
        return ingest_source(session, url or source_key, title, tier or 6,
                             content=content, claims=claims, tags=tags, assets=assets,
                             summary=summary, audience=audience,
                             why_it_matters=why_it_matters, takeaways=takeaways)

    new_hash = _source_fingerprint(content, claims)
    if new_hash == current_src.content_hash:
        # Reader metadata is discovery text, not knowledge — backfill in place on a no-op
        # drift so re-running import_content.py can enrich older rows without versioning.
        backfilled = False
        for field, value in (("summary", summary), ("audience", audience),
                             ("why_it_matters", why_it_matters)):
            if value and getattr(current_src, field) != value:
                setattr(current_src, field, value)
                backfilled = True
        if takeaways is not None and dump_list(takeaways) != current_src.takeaways_json:
            current_src.takeaways_json = dump_list(takeaways)
            backfilled = True
        if backfilled:
            session.add(current_src)
            session.commit()
        return {"source_key": source_key, "drift": False, "reason": "content unchanged",
                "metadata_updated": backfilled,
                "added": 0, "changed": 0, "removed": 0, "unchanged": 0,
                "affected_designs": [], "affected_blogs": []}

    extracted = _resolve_claims(content, claims)   # may raise — do it before any writes

    current_src.active = False
    session.add(current_src)
    new_src = Source(source_key=source_key, version=current_src.version + 1,
                     url=url or current_src.url, title=title or current_src.title,
                     tier=tier if tier is not None else current_src.tier,
                     content_hash=new_hash,
                     summary=summary or current_src.summary,
                     audience=audience or current_src.audience,
                     why_it_matters=why_it_matters or current_src.why_it_matters,
                     takeaways_json=(dump_list(takeaways) if takeaways is not None
                                     else current_src.takeaways_json),
                     tags_json=dump_tags(tags) if tags else current_src.tags_json,
                     active=True)
    session.add(new_src)
    session.commit()
    session.refresh(new_src)
    search.index_source(session, new_src)
    session.commit()
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
            nc = Claim(capability_id=e["capability_id"], text=e["text"], depth=e["depth"],
                       type=e["type"],
                       status="duplicate" if dup else "pending",
                       source_id=new_src.id,
                       tags_json=dump_tags(e.get("tags")), active=not dup)
            session.add(nc)
            if nc.active:
                session.commit()
                search.index_claim(session, nc)
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
    # Published articles must not silently outlive the sources behind them.
    affected_blogs = []
    for b in session.exec(select(Blog).where(Blog.active == True)).all():  # noqa: E712
        if set(json.loads(b.cited_source_ids_json or "[]")) & fam:
            b.status = "needs_review"
            b.ready_to_share = False
            session.add(b)
            affected_blogs.append({"blog_id": b.id, "slug": b.slug, "title": b.title})
    session.commit()
    return {"source_key": source_key, "drift": True, "new_version": new_src.version,
            "added": len(added), "changed": len(changed), "removed": len(removed),
            "unchanged": len(unchanged),
            "detail": {"added": added, "changed": changed, "removed": removed},
            "affected_designs": affected, "affected_blogs": affected_blogs}


# --------------------------------------------------------------- ingestion queue
def submit_queue_item(session: Session, url: str, title: str = "", tier: int = 6,
                      notes: str = "", tags: Optional[list[str]] = None,
                      submitted_by: str = "") -> dict:
    """Queue a URL for local agent ingestion. Rejects duplicates of sources already
    in the KB and of URLs already queued/claimed (returns the conflict for the UI)."""
    url = (url or "").strip()
    if not url.lower().startswith(("http://", "https://")):
        raise ValueError("A valid http(s) URL is required.")
    if not 1 <= int(tier) <= 6:
        raise ValueError("tier must be between 1 (Microsoft Learn) and 6 (unknown).")
    key = slugify(url)
    existing_src = session.exec(
        select(Source).where(Source.source_key == key, Source.active == True)).first()  # noqa: E712
    if existing_src:
        raise DuplicateSubmission(
            f"Already in the knowledge base as source '{existing_src.title}'.",
            source_key=key)
    for q in session.exec(
            select(QueueItem).where(QueueItem.status.in_(["queued", "claimed"]))).all():
        if slugify(q.url) == key:
            raise DuplicateSubmission("This URL is already queued for ingestion.",
                                      queue_id=q.id)
    item = QueueItem(url=url, title=title, tier=int(tier), notes=notes,
                     tags_json=dump_tags(tags), submitted_by=submitted_by)
    session.add(item)
    session.commit()
    session.refresh(item)
    return _queue_dict(item)


class DuplicateSubmission(ValueError):
    def __init__(self, message: str, source_key: str = "", queue_id: str = ""):
        super().__init__(message)
        self.source_key = source_key
        self.queue_id = queue_id


def list_queue(session: Session, status: Optional[str] = None) -> list[dict]:
    stmt = select(QueueItem).order_by(QueueItem.created_at.desc())
    if status:
        stmt = stmt.where(QueueItem.status == status)
    return [_queue_dict(q) for q in session.exec(stmt).all()]


def _queue_transition(session: Session, item_id: str, allowed_from: tuple[str, ...],
                      new_status: str, **updates) -> dict:
    item = session.get(QueueItem, item_id)
    if not item:
        raise LookupError("Queue item not found.")
    if item.status not in allowed_from:
        raise ValueError(f"Queue item is '{item.status}'; expected one of {allowed_from}.")
    item.status = new_status
    for k, v in updates.items():
        setattr(item, k, v)
    session.add(item)
    session.commit()
    session.refresh(item)
    return _queue_dict(item)


def claim_queue_item(session: Session, item_id: str) -> dict:
    from app.models import _now
    return _queue_transition(session, item_id, ("queued",), "claimed", claimed_at=_now())


def complete_queue_item(session: Session, item_id: str, source_id: str) -> dict:
    return _queue_transition(session, item_id, ("claimed", "queued"), "ingested",
                             result_source_id=source_id, error="")


def fail_queue_item(session: Session, item_id: str, error: str = "") -> dict:
    return _queue_transition(session, item_id, ("claimed", "queued"), "failed", error=error)


def requeue_queue_item(session: Session, item_id: str) -> dict:
    return _queue_transition(session, item_id, ("failed", "claimed"), "queued",
                             claimed_at=None, error="")


def dismiss_queue_item(session: Session, item_id: str) -> dict:
    return _queue_transition(session, item_id, ("queued", "failed"), "dismissed")


# --------------------------------------------------------------- topics
def create_topic(session: Session, slug: str, name: str, capability_ids: list[str],
                 parent_id: Optional[str] = None, description: str = "",
                 order: int = 0, tags: Optional[list[str]] = None) -> dict:
    slug = slugify(slug or name)
    if session.exec(select(Topic).where(Topic.slug == slug)).first():
        raise ValueError(f"Topic slug '{slug}' already exists.")
    unknown = [c for c in capability_ids or [] if c not in llm.CAPABILITY_IDS]
    if unknown:
        raise ValueError(f"Unknown capability id(s): {unknown}")
    if not capability_ids:
        raise ValueError("A topic must map to at least one capability (the registry is the spine).")
    if parent_id and session.get(Topic, parent_id) is None:
        raise ValueError("parent_id does not exist.")
    t = Topic(slug=slug, name=name or slug, parent_id=parent_id, description=description,
              capability_ids_json=json.dumps(capability_ids), order=order,
              tags_json=dump_tags(tags))
    session.add(t)
    session.commit()
    session.refresh(t)
    search.index_topic(session, t)
    session.commit()
    return _topic_dict(t)


def update_topic(session: Session, topic_id: str, **fields) -> dict:
    t = session.get(Topic, topic_id)
    if not t:
        raise LookupError("Topic not found.")
    if "capability_ids" in fields and fields["capability_ids"] is not None:
        caps = fields.pop("capability_ids")
        unknown = [c for c in caps if c not in llm.CAPABILITY_IDS]
        if unknown:
            raise ValueError(f"Unknown capability id(s): {unknown}")
        if not caps:
            raise ValueError("A topic must keep at least one capability mapping.")
        t.capability_ids_json = json.dumps(caps)
    for k in ("name", "description", "order", "parent_id", "active"):
        if k in fields and fields[k] is not None:
            setattr(t, k, fields[k])
    session.add(t)
    session.commit()
    session.refresh(t)
    return _topic_dict(t)


def list_topics(session: Session, include_counts: bool = False) -> list[dict]:
    rows = session.exec(
        select(Topic).where(Topic.active == True)  # noqa: E712
        .order_by(Topic.order, Topic.name)).all()
    out = [_topic_dict(t) for t in rows]
    if include_counts:
        for d in out:
            caps = d["capability_ids"]
            d["verified_claims"] = len(session.exec(
                select(Claim).where(Claim.active == True,  # noqa: E712
                                    Claim.status == "verified",
                                    Claim.capability_id.in_(caps))).all()) if caps else 0
            blog = _active_blog_for_topic(session, d["id"])
            d["blog"] = ({"slug": blog.slug, "title": blog.title, "status": blog.status,
                          "ready_to_share": blog.ready_to_share} if blog else None)
    return out


def _active_blog_for_topic(session: Session, topic_id: str) -> Optional[Blog]:
    return session.exec(
        select(Blog).where(Blog.topic_id == topic_id, Blog.active == True)  # noqa: E712
        .order_by(Blog.created_at.desc())).first()


def get_topic(session: Session, slug: str) -> dict:
    t = session.exec(select(Topic).where(Topic.slug == slug)).first()
    if not t:
        raise LookupError("Topic not found.")
    children = session.exec(
        select(Topic).where(Topic.parent_id == t.id, Topic.active == True)  # noqa: E712
        .order_by(Topic.order, Topic.name)).all()
    blog = _active_blog_for_topic(session, t.id)
    return {**_topic_dict(t),
            "children": [_topic_dict(c) for c in children],
            "blog": _blog_dict(blog, body=False) if blog else None}


# --------------------------------------------------------------- blogs
def create_blog(session: Session, topic_id: str, slug: str, title: str, body_md: str,
                summary: str = "", cited_source_ids: Optional[list[str]] = None,
                tags: Optional[list[str]] = None, depth_levels: Optional[list[int]] = None,
                assets: Optional[list[dict]] = None) -> dict:
    """Persist a locally-authored blog article. Stricter than designs: every cited
    source must back at least one verified active claim — blogs are public prose.
    Re-posting a slug supersedes the prior version (append-only, like claims)."""
    if cited_source_ids is None or not cited_source_ids:
        raise ValueError(
            "cited_source_ids is required and non-empty: a blog with no citations is "
            "untraceable prose. Pass the source ids behind the [Sn] tags in body_md.")
    if session.get(Topic, topic_id) is None:
        raise ValueError("topic_id does not exist.")
    for sid in cited_source_ids:
        s = session.get(Source, sid)
        if s is None:
            raise ValueError(f"cited_source_ids contains unknown source id: {sid}")
        backed = session.exec(
            select(Claim).where(Claim.source_id == sid, Claim.active == True,  # noqa: E712
                                Claim.status == "verified")).first()
        if backed is None:
            raise ValueError(
                f"Source '{s.title}' ({sid}) has no verified active claims; blogs may "
                "only cite sources whose claims a human has verified.")

    slug = slugify(slug or title)
    title, summary, body_md = (normalize_text(title), normalize_text(summary),
                               normalize_text(body_md))
    prior = session.exec(
        select(Blog).where(Blog.slug == slug, Blog.active == True)).first()  # noqa: E712
    blog = Blog(topic_id=topic_id, slug=slug, title=title, summary=summary,
                body_md=body_md, cited_source_ids_json=json.dumps(cited_source_ids),
                tags_json=dump_tags(tags),
                depth_levels_json=json.dumps(sorted({int(d) for d in (depth_levels or [])})),
                status="draft")
    if prior:
        blog.blog_key = prior.blog_key
        blog.version = prior.version + 1
        blog.supersedes_id = prior.id
        prior.active = False
        session.add(prior)
    session.add(blog)
    session.commit()
    session.refresh(blog)
    search.index_blog(session, blog)
    session.commit()
    add_assets(session, assets, blog_id=blog.id)
    return _blog_dict(blog)


def list_blogs(session: Session, topic_id: Optional[str] = None,
               status: Optional[str] = None, tag: Optional[str] = None) -> list[dict]:
    stmt = select(Blog).where(Blog.active == True).order_by(Blog.created_at.desc())  # noqa: E712
    if topic_id:
        stmt = stmt.where(Blog.topic_id == topic_id)
    if status:
        stmt = stmt.where(Blog.status == status)
    rows = session.exec(stmt).all()
    if tag:
        norm = tag.lstrip("#").lower()
        rows = [b for b in rows if norm in [t.lower() for t in load_tags(b.tags_json)]]
    return [_blog_dict(b, body=False) for b in rows]


def get_blog(session: Session, slug: str) -> dict:
    b = session.exec(
        select(Blog).where(Blog.slug == slug, Blog.active == True)).first()  # noqa: E712
    if not b:
        raise LookupError("Blog not found.")
    cited = json.loads(b.cited_source_ids_json or "[]")
    legend = []
    for i, sid in enumerate(cited, start=1):
        s = session.get(Source, sid)
        if s:
            legend.append({"tag": f"S{i}", "id": s.id, "title": s.title,
                           "tier": s.tier, "url": s.url, "active": s.active})
    assets = session.exec(select(Asset).where(Asset.blog_id == b.id)).all()
    return {**_blog_dict(b), "legend": legend, "assets": [_asset_dict(a) for a in assets]}


def blog_history(session: Session, slug: str) -> list[dict]:
    any_version = session.exec(select(Blog).where(Blog.slug == slug)).first()
    if not any_version:
        raise LookupError("Blog not found.")
    chain = session.exec(
        select(Blog).where(Blog.blog_key == any_version.blog_key).order_by(Blog.version)).all()
    return [_blog_dict(b, body=False) for b in chain]


# --------------------------------------------------------------- serialisers
def _queue_dict(q: QueueItem) -> dict:
    return {"id": q.id, "url": q.url, "title": q.title, "tier": q.tier, "notes": q.notes,
            "tags": load_tags(q.tags_json), "status": q.status,
            "claimed_at": q.claimed_at.isoformat() if q.claimed_at else None,
            "result_source_id": q.result_source_id, "error": q.error,
            "submitted_by": q.submitted_by, "created_at": q.created_at.isoformat()}


def _topic_dict(t: Topic) -> dict:
    return {"id": t.id, "slug": t.slug, "name": t.name, "parent_id": t.parent_id,
            "description": t.description,
            "capability_ids": json.loads(t.capability_ids_json or "[]"),
            "order": t.order, "tags": load_tags(t.tags_json), "active": t.active,
            "created_at": t.created_at.isoformat()}


def _blog_dict(b: Blog, body: bool = True) -> dict:
    d = {"id": b.id, "blog_key": b.blog_key, "version": b.version, "topic_id": b.topic_id,
         "slug": b.slug, "title": b.title, "summary": b.summary,
         "cited_source_ids": json.loads(b.cited_source_ids_json or "[]"),
         "tags": load_tags(b.tags_json),
         "depth_levels": json.loads(b.depth_levels_json or "[]"),
         "status": b.status, "confidence": b.confidence,
         "ready_to_share": b.ready_to_share, "supersedes_id": b.supersedes_id,
         "active": b.active, "created_at": b.created_at.isoformat()}
    if body:
        d["body_md"] = b.body_md
    return d


def _source_dict(s: Source) -> dict:
    return {"id": s.id, "source_key": s.source_key, "version": s.version,
            "url": s.url, "title": s.title, "tier": s.tier,
            "summary": s.summary, "audience": s.audience,
            "why_it_matters": s.why_it_matters,
            "takeaways": load_list(s.takeaways_json),
            "tags": load_tags(s.tags_json), "active": s.active,
            "created_at": s.created_at.isoformat()}


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
