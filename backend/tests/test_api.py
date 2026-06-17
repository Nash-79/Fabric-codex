"""Backend invariant tests: version chain, drift, dedup, citations, validation.

Each test runs against a fresh in-memory SQLite via FastAPI's dependency override —
no fabric_atlas.db involved. Run from backend/: pytest
"""

import pytest
from fastapi.testclient import TestClient
from sqlmodel import SQLModel, Session, create_engine
from sqlalchemy.pool import StaticPool

from app.main import app
from app.db import get_session
from app.models import Claim


@pytest.fixture()
def client():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    SQLModel.metadata.create_all(engine)

    def override():
        with Session(engine) as session:
            yield session

    app.dependency_overrides[get_session] = override
    with TestClient(app) as c:
        c.engine = engine
        yield c
    app.dependency_overrides.clear()


def _payload(
    url="https://learn.microsoft.com/fabric/onelake-overview", texts=None, **kw
):
    texts = texts or [
        "OneLake is a single logical data lake for the whole Fabric tenant."
    ]
    return {
        "url": url,
        "title": kw.get("title", "OneLake overview"),
        "tier": kw.get("tier", 1),
        "tags": kw.get("tags", ["MicrosoftFabric", "OneLake"]),
        "claims": [
            {
                "capability_id": kw.get("capability", "onelake"),
                "text": t,
                "depth": 1,
                "type": "fact",
                "tags": ["OneLake"],
            }
            for t in texts
        ],
        "assets": kw.get("assets", []),
    }


# ------------------------------------------------------------------ ingest
def test_ingest_creates_pending_claims(client):
    res = client.post("/sources/ingest", json=_payload()).json()
    assert res["claims_added"] == 1 and res["drift"] is False
    claims = client.get("/claims").json()
    assert len(claims) == 1 and claims[0]["status"] == "pending"


def test_ingest_accepts_reader_metadata(client):
    body = _payload()
    body.update(
        {
            "summary": "Original summary for readers.",
            "audience": "Fabric architects",
            "why_it_matters": "It orients readers before they inspect the claims.",
            "takeaways": ["OneLake is tenant-wide.", "Claims remain source-grounded."],
        }
    )
    res = client.post("/sources/ingest", json=body).json()
    assert res["claims_added"] == 1
    source = client.get("/sources").json()[0]
    assert source["summary"] == "Original summary for readers."
    assert source["audience"] == "Fabric architects"
    assert (
        source["why_it_matters"] == "It orients readers before they inspect the claims."
    )
    assert source["takeaways"] == [
        "OneLake is tenant-wide.",
        "Claims remain source-grounded.",
    ]


def test_legacy_ingest_without_reader_metadata_still_works(client):
    body = _payload()
    body.pop("tags")
    res = client.post("/sources/ingest", json=body).json()
    assert res["claims_added"] == 1
    source = client.get("/sources").json()[0]
    assert source["summary"] == ""
    assert source["takeaways"] == []


def test_ingest_without_claims_is_rejected_and_writes_nothing(client):
    body = _payload()
    body["claims"] = None
    r = client.post("/sources/ingest", json=body)
    assert r.status_code == 400
    assert client.get("/sources").json() == []


def test_unknown_capability_is_dropped(client):
    body = _payload()
    body["claims"][0]["capability_id"] = "not-a-capability"
    res = client.post("/sources/ingest", json=body).json()
    assert res["claims_added"] == 0


# ------------------------------------------------------------------ verify
def test_verify_and_bulk_verify(client):
    res = client.post("/sources/ingest", json=_payload(texts=["A.", "B.", "C."])).json()
    sid = res["source_id"]
    one = res["claims"][0]["id"]
    assert client.post(f"/claims/{one}/verify").json()["status"] == "verified"
    bulk = client.post("/claims/verify-bulk", json={"source_id": sid}).json()
    assert (
        bulk["verified"] == 2 and len(bulk["skipped"]) == 1
    )  # already-verified is skipped


def test_verify_inactive_claim_is_rejected(client):
    res = client.post("/sources/ingest", json=_payload()).json()
    cid = res["claims"][0]["id"]
    with Session(client.engine) as s:
        c = s.get(Claim, cid)
        c.active, c.status = False, "deprecated"
        s.add(c)
        s.commit()
    assert client.post(f"/claims/{cid}/verify").status_code == 409


def test_supersede_claim_creates_append_only_version(client):
    res = client.post("/sources/ingest", json=_payload()).json()
    old_id = res["claims"][0]["id"]
    r = client.post(
        f"/claims/{old_id}/supersede",
        json={
            "new_text": "OneLake is represented as a single logical data lake across a Fabric tenant.",
            "depth": 2,
            "type": "fact",
            "tags": ["OneLake", "Tenant"],
        },
    )
    assert r.status_code == 200
    new = r.json()
    assert new["id"] != old_id
    assert new["version"] == 2
    assert new["supersedes_id"] == old_id
    assert new["active"] is True
    assert new["status"] == "pending"
    chain = client.get(f"/claims/{new['id']}/history").json()
    assert [c["id"] for c in chain] == [old_id, new["id"]]
    assert chain[0]["active"] is False
    assert chain[0]["status"] == "superseded"


# ------------------------------------------------------------------- drift
def test_reingest_same_claims_is_noop_even_reordered(client):
    client.post("/sources/ingest", json=_payload(texts=["First fact.", "Second fact."]))
    body = _payload(texts=["Second fact.", "First fact."])  # reordered only
    res = client.post("/sources/ingest", json=body).json()
    assert res["drift"] is False and res.get("reason") == "content unchanged"
    assert len(client.get("/sources").json()) == 1


def test_reingest_same_claims_can_backfill_reader_metadata(client):
    client.post("/sources/ingest", json=_payload(texts=["First fact.", "Second fact."]))
    body = _payload(texts=["Second fact.", "First fact."])
    body.update({"summary": "Backfilled summary.", "takeaways": ["A", "B"]})
    res = client.post("/sources/ingest", json=body).json()
    assert res["drift"] is False and res["metadata_updated"] is True
    source = client.get("/sources").json()[0]
    assert source["summary"] == "Backfilled summary."
    assert source["takeaways"] == ["A", "B"]


def test_drift_supersedes_changed_and_deprecates_removed(client):
    client.post(
        "/sources/ingest",
        json=_payload(
            texts=[
                "Shortcuts virtualize external data without copying it into OneLake.",
                "This claim disappears in the next revision of the page.",
            ]
        ),
    )
    body = _payload(
        texts=[
            "Shortcuts virtualize external data without duplicating it, "
            "mapping remote storage into OneLake."
        ]  # ~0.79 similar = changed band
    )
    body.update(
        {"summary": "New source revision summary.", "takeaways": ["Changed claim."]}
    )
    res = client.post("/sources/ingest", json=body).json()
    assert res["drift"] is True and res["changed"] == 1 and res["removed"] == 1
    active_source = [s for s in client.get("/sources").json() if s["active"]][0]
    assert active_source["summary"] == "New source revision summary."
    assert active_source["takeaways"] == ["Changed claim."]
    # history is by claim id now (slug+supersedes model); the active claim is v2.
    active_claim = client.get("/claims").json()[0]["id"]
    chain = client.get(f"/claims/{active_claim}/history").json()
    assert [c["version"] for c in chain] == [1, 2]
    assert chain[0]["active"] is False and chain[0]["status"] == "superseded"
    assert chain[1]["active"] is True and chain[1]["status"] == "pending"
    assert chain[1]["supersedes_id"] == chain[0]["id"]


def test_drift_without_claims_does_not_corrupt_source(client):
    client.post("/sources/ingest", json=_payload())
    key = client.get("/sources").json()[0]["source_key"]
    r = client.post(f"/sources/{key}/drift", json={"claims": None, "content": ""})
    # hash of empty payload differs, so it reaches claim resolution — must fail cleanly
    assert r.status_code == 400
    sources = client.get("/sources").json()
    assert (
        len(sources) == 1
        and sources[0]["active"] is True
        and sources[0]["version"] == 1
    )


def test_reingest_carries_new_tags_and_assets(client):
    client.post("/sources/ingest", json=_payload(texts=["Original claim text here."]))
    body = _payload(
        texts=["Completely different replacement claim text."],
        tags=["MicrosoftFabric", "Shortcuts"],
        assets=[
            {
                "kind": "referenced",
                "url": "https://x/img.png",
                "caption": "diagram",
                "attribution": "Microsoft Learn",
            }
        ],
    )
    res = client.post("/sources/ingest", json=body).json()
    assert res["drift"] is True
    active = [s for s in client.get("/sources").json() if s["active"]][0]
    assert "Shortcuts" in active["tags"]
    assert client.get("/assets", params={"source": active["id"]}).json()


def test_drift_flags_citing_designs(client):
    res = client.post("/sources/ingest", json=_payload(texts=["Fact one."])).json()
    client.post(
        "/designs",
        json={
            "scenario": "s",
            "output_md": "Use OneLake [S1].",
            "cited_source_ids": [res["source_id"]],
        },
    )
    client.post(
        "/sources/ingest", json=_payload(texts=["A wholly new replacement fact."])
    )
    assert client.get("/designs").json()[0]["status"] == "needs_review"


# ------------------------------------------------------------------- dedup
def test_cross_source_near_duplicate_is_flagged_inactive(client):
    text = "Direct Lake loads column data straight from Delta tables in OneLake."
    client.post(
        "/sources/ingest", json=_payload(capability="direct-lake", texts=[text])
    )
    res = client.post(
        "/sources/ingest",
        json=_payload(
            url="https://blog.fabric.microsoft.com/direct-lake-deep-dive",
            title="Direct Lake deep dive",
            tier=2,
            capability="direct-lake",
            texts=[
                "Direct Lake loads column data straight from Delta tables in "
                "OneLake storage."
            ],
        ),
    ).json()  # ~0.94 similar = duplicate
    assert len(res["duplicates"]) == 1 and res["claims_added"] == 0
    dupes = client.get(
        "/claims", params={"include_inactive": True, "status": "duplicate"}
    ).json()
    assert len(dupes) == 1 and dupes[0]["active"] is False
    # active retrieval still sees exactly one claim
    assert len(client.get("/claims", params={"capability": "direct-lake"}).json()) == 1


# ----------------------------------------------------------------- designs
def test_design_requires_cited_source_ids(client):
    r = client.post("/designs", json={"scenario": "s", "output_md": "x [S1]"})
    assert r.status_code == 400
    r = client.post(
        "/designs",
        json={"scenario": "s", "output_md": "x [S1]", "cited_source_ids": ["nope"]},
    )
    assert r.status_code == 400 and "unknown source" in r.json()["detail"]


def test_design_idempotent_by_slug(client):
    """Re-posting the same slug updates in place (no duplicate row); unchanged body is a no-op."""
    res = client.post("/sources/ingest", json=_payload()).json()
    body = {
        "scenario": "s",
        "slug": "my-design",
        "title": "My Design",
        "output_md": "Use OneLake [S1].",
        "cited_source_ids": [res["source_id"]],
    }
    first = client.post("/designs", json=body).json()
    assert first.get("drift") is False
    # Same body again -> no-op, same design id, still one design.
    again = client.post("/designs", json=body).json()
    assert again["design_id"] == first["design_id"]
    assert len(client.get("/designs").json()) == 1
    # Changed body -> updates in place, still one design row.
    changed = client.post(
        "/designs", json={**body, "output_md": "Use the lakehouse [S1]."}
    ).json()
    assert changed["design_id"] == first["design_id"] and changed.get("drift") is True
    assert len(client.get("/designs").json()) == 1


def test_document_snapshot_persisted(client):
    """The raw captured JSON passed as `document` is stored on the source row."""
    from app.models import Source

    body = {**_payload(), "document": {"hello": "world", "n": 1}}
    res = client.post("/sources/ingest", json=body).json()
    with Session(client.engine) as s:
        src = s.get(Source, res["source_id"])
        assert src.document == {"hello": "world", "n": 1}


def test_commission_diagram_enqueues_and_filters_by_kind(client):
    r = client.post("/queue/diagram", json={"target_slug": "onelake", "title": "OneLake diagram"})
    assert r.status_code == 200
    item = r.json()
    assert item["kind"] == "diagram" and item["target_slug"] == "onelake"
    # kind filter isolates diagram commissions from source ingests.
    diagrams = client.get("/queue", params={"kind": "diagram"}).json()
    assert len(diagrams) == 1 and diagrams[0]["kind"] == "diagram"
    sources = client.get("/queue", params={"kind": "source"}).json()
    assert sources == []
    # Duplicate open commission for the same target is rejected.
    assert client.post("/queue/diagram", json={"target_slug": "onelake"}).status_code == 409


def test_commission_diagram_future_schedule_hidden_by_due_only(client):
    client.post(
        "/queue/diagram",
        json={"target_slug": "lakehouse", "scheduled_at": "2099-01-01T00:00:00"},
    )
    # Visible without due_only, hidden when only due items are requested.
    assert len(client.get("/queue", params={"kind": "diagram"}).json()) == 1
    due = client.get("/queue", params={"kind": "diagram", "due_only": True}).json()
    assert due == []


def test_diagram_coverage_reports_gaps(client):
    cov = client.get("/coverage/diagrams").json()
    assert isinstance(cov, list)
    for row in cov:
        assert {"slug", "name", "diagram_count", "has_diagram", "commission_open"} <= set(row)


def test_validation_statuses(client):
    res = client.post("/sources/ingest", json=_payload()).json()
    did = client.post(
        "/designs",
        json={
            "scenario": "s",
            "output_md": "Use OneLake [S1].",
            "cited_source_ids": [res["source_id"]],
        },
    ).json()["design_id"]

    # deterministic-only run -> "checked", not "validated"
    v = client.post(f"/designs/{did}/validate", json={}).json()
    assert v["full_pass"] is False and v["ready_to_share"] is False
    assert client.get(f"/designs/{did}").json()["status"] == "checked"

    # reviewer posts an explicit empty issue list -> full pass -> "validated"
    v = client.post(f"/designs/{did}/validate", json={"issues": []}).json()
    assert v["full_pass"] is True and v["ready_to_share"] is True
    assert client.get(f"/designs/{did}").json()["status"] == "validated"

    # a critical grounding issue -> needs_review, confidence drops
    v = client.post(
        f"/designs/{did}/validate",
        json={
            "issues": [
                {
                    "validator": "grounding",
                    "severity": "critical",
                    "message": "ungrounded",
                }
            ]
        },
    ).json()
    assert v["ready_to_share"] is False and v["confidence"] == 0.6
    assert client.get(f"/designs/{did}").json()["status"] == "needs_review"


# ------------------------------------------------------------------- reject
def test_reject_happy_path(client):
    res = client.post("/sources/ingest", json=_payload()).json()
    cid = res["claims"][0]["id"]
    r = client.post(f"/claims/{cid}/reject")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "rejected"
    assert body["active"] is False


def test_reject_inactive_claim_returns_409(client):
    res = client.post("/sources/ingest", json=_payload()).json()
    cid = res["claims"][0]["id"]
    with Session(client.engine) as s:
        c = s.get(Claim, cid)
        c.active, c.status = False, "deprecated"
        s.add(c)
        s.commit()
    assert client.post(f"/claims/{cid}/reject").status_code == 409


def test_reject_verified_claim_returns_409(client):
    res = client.post("/sources/ingest", json=_payload()).json()
    cid = res["claims"][0]["id"]
    client.post(f"/claims/{cid}/verify")
    assert client.post(f"/claims/{cid}/reject").status_code == 409


def test_reject_not_found_returns_404(client):
    assert client.post("/claims/nonexistent-id/reject").status_code == 404


# ---------------------------------------------------------------- reject-bulk
def test_reject_bulk_by_source_id(client):
    res = client.post("/sources/ingest", json=_payload(texts=["A.", "B.", "C."])).json()
    sid = res["source_id"]
    r = client.post("/claims/reject-bulk", json={"source_id": sid}).json()
    assert r["rejected"] == 3
    assert len(r["skipped"]) == 0
    active = client.get("/claims").json()
    assert active == []


def test_reject_bulk_by_claim_ids(client):
    res = client.post("/sources/ingest", json=_payload(texts=["X.", "Y.", "Z."])).json()
    all_ids = [c["id"] for c in res["claims"]]
    ids_to_reject = all_ids[:2]
    r = client.post("/claims/reject-bulk", json={"claim_ids": ids_to_reject}).json()
    assert r["rejected"] == 2
    assert len(r["rejected_ids"]) == 2
    remaining = client.get("/claims").json()
    assert len(remaining) == 1


def test_reject_bulk_skips_non_pending(client):
    res = client.post("/sources/ingest", json=_payload(texts=["P.", "Q."])).json()
    sid = res["source_id"]
    cids = [c["id"] for c in res["claims"]]
    client.post(f"/claims/{cids[0]}/verify")
    r = client.post("/claims/reject-bulk", json={"source_id": sid}).json()
    assert r["rejected"] == 1
    assert len(r["skipped"]) == 1


# ------------------------------------------------------------------- promote
def test_promote_duplicate_to_pending(client):
    text = "Direct Lake loads column data straight from Delta tables in OneLake."
    client.post(
        "/sources/ingest", json=_payload(capability="direct-lake", texts=[text])
    )
    res = client.post(
        "/sources/ingest",
        json=_payload(
            url="https://blog.fabric.microsoft.com/direct-lake-deep-dive",
            title="Direct Lake deep dive",
            tier=2,
            capability="direct-lake",
            texts=[
                "Direct Lake loads column data straight from Delta tables in "
                "OneLake storage."
            ],
        ),
    ).json()
    assert len(res["duplicates"]) == 1
    dup_id = res["duplicates"][0]["claim_id"]
    r = client.post(f"/claims/{dup_id}/promote")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "pending"
    assert body["active"] is True


def test_promote_non_duplicate_returns_409(client):
    res = client.post("/sources/ingest", json=_payload()).json()
    cid = res["claims"][0]["id"]
    assert client.post(f"/claims/{cid}/promote").status_code == 409


def test_promote_not_found_returns_404(client):
    assert client.post("/claims/nonexistent-id/promote").status_code == 404


def test_validation_flags_missing_and_superseded_sources(client):
    res = client.post("/sources/ingest", json=_payload(texts=["Fact one."])).json()
    did = client.post(
        "/designs",
        json={
            "scenario": "s",
            "output_md": "Cited [S1].",
            "cited_source_ids": [res["source_id"]],
        },
    ).json()["design_id"]
    # Re-ingesting drifts the source: it updates IN PLACE and supersedes the changed claim,
    # so the cited source stays active but has a superseded claim (freshness "info").
    client.post("/sources/ingest", json=_payload(texts=["Replacement fact entirely."]))
    # a ghost citation can no longer be created via the API; inject one as a junction row.
    from app.models import DesignSource

    with Session(client.engine) as s:
        s.add(DesignSource(design_id=did, label="S9", source_id="ghost-id", position=9))
        s.commit()
    v = client.post(f"/designs/{did}/validate", json={}).json()
    validators = {(i["validator"], i["severity"]) for i in v["issues"]}
    assert ("citation", "critical") in validators  # ghost id does not exist
    assert ("freshness", "info") in validators  # cited source has a superseded claim


# ------------------------------------------------------------------- advisor
def test_advisor_chat_returns_key_optional_context_fallback(client, monkeypatch):
    from app import services

    res = client.post("/sources/ingest", json=_payload()).json()
    client.post(f"/claims/{res['claims'][0]['id']}/verify")

    monkeypatch.setattr(services, "LLM_MODE", "local")
    monkeypatch.setattr(services, "ANTHROPIC_API_KEY", "")

    r = client.post("/advisor/chat", json={"message": "What is OneLake?"})
    assert r.status_code == 200
    body = r.json()
    assert body["mode"] == "context"
    assert body["fallback_reason"] == "local_mode"
    assert body["server_generation"] is False
    assert "Server-side Advisor generation is disabled" in body["answer"]
    assert "[S1]" in body["context"]
    assert "OneLake overview" in body["legend"]
    assert body["grounded"] is True
