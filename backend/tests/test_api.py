"""Backend invariant tests: version chain, drift, dedup, citations, validation.

Each test runs against a fresh in-memory SQLite via FastAPI's dependency override —
no fabric_atlas.db involved. Run from backend/: pytest
"""
import pytest
from fastapi.testclient import TestClient
from sqlmodel import SQLModel, Session, create_engine, select
from sqlalchemy.pool import StaticPool

from app.main import app
from app.db import get_session
from app.models import Source, Claim


@pytest.fixture()
def client():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False},
                           poolclass=StaticPool)
    SQLModel.metadata.create_all(engine)

    def override():
        with Session(engine) as session:
            yield session

    app.dependency_overrides[get_session] = override
    with TestClient(app) as c:
        c.engine = engine
        yield c
    app.dependency_overrides.clear()


def _payload(url="https://learn.microsoft.com/fabric/onelake-overview", texts=None, **kw):
    texts = texts or ["OneLake is a single logical data lake for the whole Fabric tenant."]
    return {
        "url": url, "title": kw.get("title", "OneLake overview"), "tier": kw.get("tier", 1),
        "tags": kw.get("tags", ["MicrosoftFabric", "OneLake"]),
        "claims": [{"capability_id": kw.get("capability", "onelake"), "text": t,
                    "depth": 1, "type": "fact", "tags": ["OneLake"]} for t in texts],
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
    body.update({
        "summary": "Original summary for readers.",
        "audience": "Fabric architects",
        "why_it_matters": "It orients readers before they inspect the claims.",
        "takeaways": ["OneLake is tenant-wide.", "Claims remain source-grounded."],
    })
    res = client.post("/sources/ingest", json=body).json()
    assert res["claims_added"] == 1
    source = client.get("/sources").json()[0]
    assert source["summary"] == "Original summary for readers."
    assert source["audience"] == "Fabric architects"
    assert source["why_it_matters"] == "It orients readers before they inspect the claims."
    assert source["takeaways"] == ["OneLake is tenant-wide.", "Claims remain source-grounded."]


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
    assert bulk["verified"] == 2 and len(bulk["skipped"]) == 1  # already-verified is skipped


def test_verify_inactive_claim_is_rejected(client):
    res = client.post("/sources/ingest", json=_payload()).json()
    cid = res["claims"][0]["id"]
    with Session(client.engine) as s:
        c = s.get(Claim, cid)
        c.active, c.status = False, "deprecated"
        s.add(c)
        s.commit()
    assert client.post(f"/claims/{cid}/verify").status_code == 409


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
    client.post("/sources/ingest", json=_payload(
        texts=["Shortcuts virtualize external data without copying it into OneLake.",
               "This claim disappears in the next revision of the page."]))
    body = _payload(
        texts=["Shortcuts virtualize external data without duplicating it, "
               "mapping remote storage into OneLake."]   # ~0.79 similar = changed band
    )
    body.update({"summary": "New source revision summary.", "takeaways": ["Changed claim."]})
    res = client.post("/sources/ingest", json=body).json()
    assert res["drift"] is True and res["changed"] == 1 and res["removed"] == 1
    active_source = [s for s in client.get("/sources").json() if s["active"]][0]
    assert active_source["summary"] == "New source revision summary."
    assert active_source["takeaways"] == ["Changed claim."]
    history_key = client.get("/claims").json()[0]["claim_key"]
    chain = client.get(f"/claims/{history_key}/history").json()
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
    assert len(sources) == 1 and sources[0]["active"] is True and sources[0]["version"] == 1


def test_reingest_carries_new_tags_and_assets(client):
    client.post("/sources/ingest", json=_payload(texts=["Original claim text here."]))
    body = _payload(texts=["Completely different replacement claim text."],
                    tags=["MicrosoftFabric", "Shortcuts"],
                    assets=[{"kind": "referenced", "url": "https://x/img.png",
                             "caption": "diagram", "attribution": "Microsoft Learn"}])
    res = client.post("/sources/ingest", json=body).json()
    assert res["drift"] is True
    active = [s for s in client.get("/sources").json() if s["active"]][0]
    assert "Shortcuts" in active["tags"]
    assert client.get("/assets", params={"source": active["id"]}).json()


def test_drift_flags_citing_designs(client):
    res = client.post("/sources/ingest", json=_payload(texts=["Fact one."])).json()
    client.post("/designs", json={"scenario": "s", "output_md": "Use OneLake [S1].",
                                  "cited_source_ids": [res["source_id"]]})
    client.post("/sources/ingest", json=_payload(texts=["A wholly new replacement fact."]))
    assert client.get("/designs").json()[0]["status"] == "needs_review"


# ------------------------------------------------------------------- dedup
def test_cross_source_near_duplicate_is_flagged_inactive(client):
    text = "Direct Lake loads column data straight from Delta tables in OneLake."
    client.post("/sources/ingest", json=_payload(capability="direct-lake", texts=[text]))
    res = client.post("/sources/ingest", json=_payload(
        url="https://blog.fabric.microsoft.com/direct-lake-deep-dive",
        title="Direct Lake deep dive", tier=2, capability="direct-lake",
        texts=["Direct Lake loads column data straight from Delta tables in "
               "OneLake storage."])).json()   # ~0.94 similar = duplicate
    assert len(res["duplicates"]) == 1 and res["claims_added"] == 0
    dupes = client.get("/claims", params={"include_inactive": True,
                                          "status": "duplicate"}).json()
    assert len(dupes) == 1 and dupes[0]["active"] is False
    # active retrieval still sees exactly one claim
    assert len(client.get("/claims", params={"capability": "direct-lake"}).json()) == 1


# ----------------------------------------------------------------- designs
def test_design_requires_cited_source_ids(client):
    r = client.post("/designs", json={"scenario": "s", "output_md": "x [S1]"})
    assert r.status_code == 400
    r = client.post("/designs", json={"scenario": "s", "output_md": "x [S1]",
                                      "cited_source_ids": ["nope"]})
    assert r.status_code == 400 and "unknown source" in r.json()["detail"]


def test_validation_statuses(client):
    res = client.post("/sources/ingest", json=_payload()).json()
    did = client.post("/designs", json={
        "scenario": "s", "output_md": "Use OneLake [S1].",
        "cited_source_ids": [res["source_id"]]}).json()["design_id"]

    # deterministic-only run -> "checked", not "validated"
    v = client.post(f"/designs/{did}/validate", json={}).json()
    assert v["full_pass"] is False and v["ready_to_share"] is False
    assert client.get(f"/designs/{did}").json()["status"] == "checked"

    # reviewer posts an explicit empty issue list -> full pass -> "validated"
    v = client.post(f"/designs/{did}/validate", json={"issues": []}).json()
    assert v["full_pass"] is True and v["ready_to_share"] is True
    assert client.get(f"/designs/{did}").json()["status"] == "validated"

    # a critical grounding issue -> needs_review, confidence drops
    v = client.post(f"/designs/{did}/validate", json={"issues": [
        {"validator": "grounding", "severity": "critical", "message": "ungrounded"}]}).json()
    assert v["ready_to_share"] is False and v["confidence"] == 0.6
    assert client.get(f"/designs/{did}").json()["status"] == "needs_review"


def test_validation_flags_missing_and_superseded_sources(client):
    res = client.post("/sources/ingest", json=_payload(texts=["Fact one."])).json()
    did = client.post("/designs", json={
        "scenario": "s", "output_md": "Cited [S1].",
        "cited_source_ids": [res["source_id"]]}).json()["design_id"]
    client.post("/sources/ingest", json=_payload(texts=["Replacement fact entirely."]))
    # a ghost citation can no longer be created via the API; simulate legacy data directly
    import json as _json
    from app.models import Design
    with Session(client.engine) as s:
        d = s.get(Design, did)
        d.cited_source_ids_json = _json.dumps(
            _json.loads(d.cited_source_ids_json) + ["ghost-id"])
        s.add(d)
        s.commit()
    v = client.post(f"/designs/{did}/validate", json={}).json()
    validators = {(i["validator"], i["severity"]) for i in v["issues"]}
    assert ("citation", "critical") in validators      # ghost id
    assert ("freshness", "warning") in validators      # superseded source revision
