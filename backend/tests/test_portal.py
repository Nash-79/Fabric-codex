"""Portal layer tests: ingestion queue, topic tree, versioned blogs, blog validation,
and drift flagging blogs that cite changed sources.

Same in-memory SQLite fixture as test_api.py. Run from backend/: pytest
"""

import pytest
from fastapi.testclient import TestClient
from sqlmodel import SQLModel, Session, create_engine
from sqlalchemy.pool import StaticPool

from app.main import app
from app.db import get_session


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


def _ingest(
    client,
    url="https://learn.microsoft.com/fabric/onelake-overview",
    texts=None,
    capability="onelake",
    **kw,
):
    texts = texts or [
        "OneLake is a single logical data lake for the whole Fabric tenant."
    ]
    return client.post(
        "/sources/ingest",
        json={
            "url": url,
            "title": kw.get("title", "OneLake overview"),
            "tier": kw.get("tier", 1),
            "tags": kw.get("tags", ["MicrosoftFabric"]),
            "claims": [
                {
                    "capability_id": capability,
                    "text": t,
                    "depth": kw.get("depth", 1),
                    "type": "fact",
                    "tags": [],
                }
                for t in texts
            ],
            "assets": [],
        },
    ).json()


def _verified_source(client, **kw):
    """Ingest a source and verify all of its claims; return the source id."""
    res = _ingest(client, **kw)
    client.post("/claims/verify-bulk", json={"source_id": res["source_id"]})
    return res["source_id"]


def _topic(client, slug="onelake", name="OneLake", caps=None, parent_id=None):
    r = client.post(
        "/topics",
        json={
            "slug": slug,
            "name": name,
            "capability_ids": caps or ["onelake"],
            "parent_id": parent_id,
        },
    )
    assert r.status_code == 201, r.text
    return r.json()


def _blog_payload(topic_id, sid, slug="onelake-explained", **kw):
    return {
        "topic_id": topic_id,
        "slug": slug,
        "title": kw.get("title", "OneLake, explained"),
        "summary": "What OneLake is and why it matters.",
        "body_md": kw.get("body_md", "OneLake is the tenant-wide lake [S1]."),
        "cited_source_ids": [sid],
        "tags": ["OneLake"],
        "depth_levels": [1, 2],
    }


# ------------------------------------------------------------------ queue
def test_queue_lifecycle(client):
    r = client.post(
        "/queue",
        json={
            "url": "https://example.com/fabric-post",
            "tier": 4,
            "notes": "community deep dive",
        },
    )
    assert r.status_code == 201
    item = r.json()
    assert item["status"] == "queued"

    assert client.post(f"/queue/{item['id']}/claim").json()["status"] == "claimed"
    done = client.post(
        f"/queue/{item['id']}/complete", json={"source_id": "src123"}
    ).json()
    assert done["status"] == "ingested" and done["result_source_id"] == "src123"
    assert client.get("/queue?status=ingested").json()[0]["id"] == item["id"]


def test_queue_rejects_invalid_and_duplicates(client):
    assert client.post("/queue", json={"url": "not-a-url"}).status_code == 400
    assert (
        client.post(
            "/queue", json={"url": "https://example.com/x", "tier": 9}
        ).status_code
        == 400
    )

    client.post("/queue", json={"url": "https://example.com/post"})
    assert (
        client.post("/queue", json={"url": "https://example.com/post"}).status_code
        == 409
    )

    # already in the KB → 409 with the existing source_key
    _ingest(client, url="https://learn.microsoft.com/fabric/known")
    r = client.post("/queue", json={"url": "https://learn.microsoft.com/fabric/known"})
    assert r.status_code == 409
    assert r.json()["detail"]["source_key"]


def test_queue_claim_requires_queued_status(client):
    item = client.post("/queue", json={"url": "https://example.com/a"}).json()
    client.post(f"/queue/{item['id']}/claim")
    assert client.post(f"/queue/{item['id']}/claim").status_code == 409


def test_queue_fail_and_requeue(client):
    item = client.post("/queue", json={"url": "https://example.com/b"}).json()
    client.post(f"/queue/{item['id']}/claim")
    failed = client.post(
        f"/queue/{item['id']}/fail", json={"error": "fetch timed out"}
    ).json()
    assert failed["status"] == "failed" and failed["error"] == "fetch timed out"
    requeued = client.post(f"/queue/{item['id']}/requeue").json()
    assert requeued["status"] == "queued" and requeued["error"] == ""


def test_queue_dismiss(client):
    item = client.post("/queue", json={"url": "https://example.com/c"}).json()
    assert client.post(f"/queue/{item['id']}/dismiss").json()["status"] == "dismissed"


# ------------------------------------------------------------------ topics
def test_topic_tree_and_counts(client):
    root = _topic(client, slug="storage", name="Storage", caps=["onelake", "lakehouse"])
    child = _topic(
        client, slug="onelake", name="OneLake", caps=["onelake"], parent_id=root["id"]
    )
    grandchild = _topic(
        client,
        slug="shortcuts",
        name="Shortcuts",
        caps=["onelake"],
        parent_id=child["id"],
    )

    detail = client.get("/topics/onelake").json()
    assert detail["parent_id"] == root["id"]
    assert [c["slug"] for c in detail["children"]] == ["shortcuts"]
    assert grandchild["parent_id"] == child["id"]

    _verified_source(client)
    listed = client.get("/topics?include_counts=true").json()
    by_slug = {t["slug"]: t for t in listed}
    assert by_slug["onelake"]["verified_claims"] == 1
    assert by_slug["onelake"]["blog"] is None


def test_topic_validation(client):
    assert (
        client.post(
            "/topics", json={"slug": "x", "name": "X", "capability_ids": []}
        ).status_code
        == 400
    )
    assert (
        client.post(
            "/topics", json={"slug": "x", "name": "X", "capability_ids": ["nope"]}
        ).status_code
        == 400
    )
    _topic(client, slug="dup", caps=["onelake"])
    assert (
        client.post(
            "/topics",
            json={"slug": "dup", "name": "Dup", "capability_ids": ["onelake"]},
        ).status_code
        == 400
    )


def test_topic_patch(client):
    t = _topic(client)
    r = client.patch(
        f"/topics/{t['id']}",
        json={"description": "The lake.", "capability_ids": ["onelake", "lakehouse"]},
    )
    assert r.json()["description"] == "The lake."
    # capability mapping is a set (topic_capabilities junction has no inherent order)
    assert set(r.json()["capability_ids"]) == {"onelake", "lakehouse"}


# ------------------------------------------------------------------ blogs
def test_blog_requires_citations_to_verified_sources(client):
    t = _topic(client)
    res = _ingest(client)  # claims left pending — not verified
    body = _blog_payload(t["id"], res["source_id"])
    assert client.post("/blogs", json=body).status_code == 400  # all claims pending

    body["cited_source_ids"] = []
    assert client.post("/blogs", json=body).status_code == 400  # no citations at all

    body["cited_source_ids"] = ["doesnotexist"]
    assert client.post("/blogs", json=body).status_code == 400  # unknown source


def test_blog_create_supersede_and_history(client):
    t = _topic(client)
    sid = _verified_source(client)

    v1 = client.post("/blogs", json=_blog_payload(t["id"], sid)).json()
    assert v1["version"] == 1 and v1["status"] == "draft"

    v2 = client.post(
        "/blogs",
        json=_blog_payload(
            t["id"], sid, body_md="OneLake is the tenant-wide lake, revised [S1]."
        ),
    ).json()
    assert v2["version"] == 2 and v2["supersedes_id"] == v1["id"]

    # History walks the supersedes_id chain (slug+supersedes model, no blog_key family).
    chain = client.get("/blogs/onelake-explained/history").json()
    assert [b["version"] for b in chain] == [1, 2]
    assert chain[0]["active"] is False and chain[1]["active"] is True

    active = client.get("/blogs/onelake-explained").json()
    assert active["id"] == v2["id"]
    assert active["legend"][0]["tag"] == "S1" and active["legend"][0]["tier"] == 1
    assert client.get("/blogs").json()[0]["id"] == v2["id"]  # only active listed


def test_blog_validation_statuses(client):
    t = _topic(client)
    sid = _verified_source(client)
    blog = client.post("/blogs", json=_blog_payload(t["id"], sid)).json()

    # deterministic only → checked, not ready to share
    r1 = client.post(f"/blogs/{blog['id']}/validate", json={}).json()
    assert r1["full_pass"] is False and r1["ready_to_share"] is False
    assert client.get("/blogs/onelake-explained").json()["status"] == "checked"

    # agent review with no issues → validated + ready_to_share
    r2 = client.post(f"/blogs/{blog['id']}/validate", json={"issues": []}).json()
    assert r2["full_pass"] is True and r2["ready_to_share"] is True
    assert client.get("/blogs/onelake-explained").json()["status"] == "validated"

    # critical grounding issue → needs_review
    r3 = client.post(
        f"/blogs/{blog['id']}/validate",
        json={
            "issues": [
                {
                    "validator": "grounding",
                    "severity": "critical",
                    "message": "Statement not supported by any cited claim.",
                }
            ]
        },
    ).json()
    assert r3["ready_to_share"] is False
    assert client.get("/blogs/onelake-explained").json()["status"] == "needs_review"

    runs = client.get(f"/blogs/{blog['id']}/validations").json()
    assert len(runs) == 3 and runs[0]["target_kind"] == "blog"


def test_blog_flags_missing_diagram(client):
    t = _topic(client)
    sid = _verified_source(client)
    blog = client.post(
        "/blogs",
        json=_blog_payload(
            t["id"],
            sid,
            body_md="OneLake [S1].\n\n![arch](/content/diagrams/does-not-exist.svg)",
        ),
    ).json()
    res = client.post(f"/blogs/{blog['id']}/validate", json={"issues": []}).json()
    miss = [i for i in res["issues"] if "does-not-exist.svg" in i["message"]]
    # a broken embedded diagram is a critical, ready-blocking failure
    assert miss and miss[0]["severity"] == "critical"
    assert res["ready_to_share"] is False
    assert client.get(f"/blogs/{blog['slug']}").json()["status"] == "needs_review"


# ------------------------------------------------------------------ advisor chat
def test_advisor_chat_returns_context_without_key(client):
    """No server-side key (the default local model): the advisor returns the grounded
    retrieval payload for client-side generation, not a server-generated answer."""
    _verified_source(client)
    res = client.post(
        "/advisor/chat",
        json={"message": "What is OneLake?", "capabilities": ["onelake"]},
    ).json()
    assert res["mode"] == "context"
    assert res["grounded"] is True and res["claim_count"] >= 1
    assert "[S1]" in res["context"] and res["legend"].startswith("S1 = ")
    assert (
        res["server_generation"] is False and res["system"]
    )  # grounding handed to the client


def test_advisor_chat_empty_kb(client):
    res = client.post("/advisor/chat", json={"message": "anything"}).json()
    assert res["mode"] == "empty" and res["grounded"] is False


def test_advisor_chat_requires_message(client):
    assert client.post("/advisor/chat", json={"message": "  "}).status_code == 400


# ------------------------------------------------------------------ search
def test_search_hits_all_kinds(client):
    t = _topic(client, slug="onelake", name="OneLake")
    sid = _verified_source(
        client, texts=["Shortcuts virtualize external data into OneLake."]
    )
    client.post(
        "/blogs",
        json=_blog_payload(
            t["id"], sid, body_md="OneLake shortcuts explained in depth [S1]."
        ),
    )

    res = client.get("/search?q=shortcuts").json()
    assert len(res["claims"]) == 1 and "<b>" in res["claims"][0]["snippet"]
    assert len(res["blogs"]) == 1 and res["blogs"][0]["ref"] == "onelake-explained"

    res = client.get("/search?q=onelake").json()
    assert len(res["topics"]) == 1 and res["topics"][0]["ref"] == "onelake"
    assert len(res["sources"]) == 1

    # kind filter narrows to one group
    res = client.get("/search?q=onelake&kind=topic").json()
    assert (
        res["topics"] and not res["claims"] and not res["sources"] and not res["blogs"]
    )


def test_search_excludes_superseded_versions(client):
    t = _topic(client)
    sid = _verified_source(client)
    client.post(
        "/blogs", json=_blog_payload(t["id"], sid, body_md="First draft body [S1].")
    )
    client.post(
        "/blogs", json=_blog_payload(t["id"], sid, body_md="Second revision body [S1].")
    )
    res = client.get("/search?q=body").json()
    assert len(res["blogs"]) == 1  # only the active version surfaces
    assert client.get("/search?q=draft").json()["blogs"] == []  # v1 text is history


def test_search_tag_filter_and_empty_query(client):
    _verified_source(client)
    assert client.get("/search?q=").json() == {
        "blogs": [],
        "topics": [],
        "claims": [],
        "sources": [],
    }
    res = client.get("/search?q=onelake&tag=MicrosoftFabric").json()
    assert len(res["sources"]) == 1
    assert client.get("/search?q=onelake&tag=NoSuchTag").json()["sources"] == []


def test_search_rebuild(client):
    _verified_source(client)
    # The search_doc tsvector index is Postgres-only; on the SQLite test DB rebuild is a
    # documented no-op (search falls back to a live LIKE scan, which still finds the source).
    res = client.post("/search/rebuild").json()
    assert res["rebuilt"] is False
    assert client.get("/search?q=onelake").json()["sources"]


def test_drift_flags_citing_blog_needs_review(client):
    t = _topic(client)
    url = "https://learn.microsoft.com/fabric/drifting"
    sid = _verified_source(
        client,
        url=url,
        texts=["Shortcuts virtualize external data without copying it into OneLake."],
    )
    blog = client.post("/blogs", json=_blog_payload(t["id"], sid)).json()
    client.post(f"/blogs/{blog['id']}/validate", json={"issues": []})
    assert client.get("/blogs/onelake-explained").json()["ready_to_share"] is True

    drift = _ingest(
        client,
        url=url,
        texts=[
            "Shortcuts virtualize external data without duplicating it, "
            "mapping remote storage into OneLake."
        ],
    )
    assert drift["drift"] is True
    assert drift["affected_blogs"][0]["blog_id"] == blog["id"]
    after = client.get("/blogs/onelake-explained").json()
    assert after["status"] == "needs_review" and after["ready_to_share"] is False
