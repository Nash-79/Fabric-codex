"""Data model for Fabric Atlas.

Version chain (the load-bearing concept) is unchanged from v0.1 — see docs/data-model.md.
v0.2 adds:
  - free-form `tags` on Source, Claim, Design (e.g. MicrosoftFabric, DataEngineering, PySpark)
  - reader-facing source metadata (`summary`, `audience`, `why_it_matters`, `takeaways_json`)
  - an `Asset` table for images/diagrams, distinguishing:
      kind="referenced"  external source image — URL + caption + attribution only, never re-hosted
      kind="generated"   an original SVG/Mermaid diagram authored by an agent, stored in the repo
v0.3 adds:
  - `ready_to_share` on Design (persisted result of full validation pass with no critical issues)
  - Claim status now also includes "rejected" (human-dismissed pending claim)
v0.4 adds (the portal layer — see docs/data-model.md):
  - `Topic`: n-nested topic tree (adjacency list via parent_id), mapped to >=1 capability.
    Topics organise the reading portal; the flat capability registry stays the spine.
  - `Blog`: a cited long-form article per topic, versioned like Claim/Source
    (blog_key + version + supersedes_id + active) and validated like Design.
  - `QueueItem`: DB-backed ingestion queue — URLs submitted via the frontend,
    consumed by the local knowledge-curator agent (/ingest-batch).
  - `ValidationRun` generalised with target_kind/target_id so blogs reuse the
    design validation machinery; design_id kept for legacy rows.
  - `Asset.blog_id` so generated diagrams can hang off blogs.
"""

from __future__ import annotations
import json
import uuid
from datetime import datetime, timezone
from typing import Optional
from sqlmodel import SQLModel, Field


def _uid() -> str:
    return uuid.uuid4().hex[:12]


def _now() -> datetime:
    return datetime.now(timezone.utc)


def dump_tags(tags) -> str:
    return json.dumps([t.lstrip("#") for t in (tags or [])])


def dump_list(items) -> str:
    return json.dumps([str(x).strip() for x in (items or []) if str(x).strip()])


def load_tags(s: str) -> list[str]:
    try:
        return json.loads(s or "[]")
    except json.JSONDecodeError:
        return []


def load_list(s: str) -> list[str]:
    try:
        data = json.loads(s or "[]")
    except json.JSONDecodeError:
        return []
    return [str(x) for x in data if str(x).strip()]


class Source(SQLModel, table=True):
    id: str = Field(default_factory=_uid, primary_key=True)
    source_key: str = Field(index=True)
    version: int = 1
    url: str = ""
    title: str = ""
    tier: int = 6
    summary: str = ""
    audience: str = ""
    why_it_matters: str = ""
    takeaways_json: str = "[]"
    content_hash: str = ""
    tags_json: str = "[]"
    active: bool = True
    created_at: datetime = Field(default_factory=_now)


class Claim(SQLModel, table=True):
    id: str = Field(default_factory=_uid, primary_key=True)
    claim_key: str = Field(index=True, default_factory=_uid)
    version: int = 1
    capability_id: str = Field(index=True)
    text: str
    depth: int = 1
    type: str = "fact"
    # pending   — newly extracted, awaiting human approval
    # verified  — human-approved
    # rejected  — human-dismissed (incorrect or irrelevant); stored inactive
    # superseded — text changed in a source update; old version kept for history
    # deprecated — claim no longer present in its source
    # duplicate  — near-match of an active claim from another source; awaiting human merge/dismiss
    status: str = Field(default="pending", index=True)
    source_id: str = Field(index=True)
    supersedes_id: Optional[str] = None
    confidence: float = 0.5
    tags_json: str = "[]"
    active: bool = Field(default=True, index=True)
    created_at: datetime = Field(default_factory=_now)


class Asset(SQLModel, table=True):
    """An image or diagram associated with a source, claim, or design."""

    id: str = Field(default_factory=_uid, primary_key=True)
    kind: str = "generated"  # referenced | generated
    url: str = ""  # external image (referenced)
    path: str = ""  # repo path to generated svg/mermaid (generated)
    mime: str = "image/svg+xml"
    caption: str = ""
    attribution: str = ""  # required for referenced assets
    license_note: str = ""
    capability_id: str = ""
    source_id: Optional[str] = Field(default=None, index=True)
    claim_id: Optional[str] = None
    design_id: Optional[str] = Field(default=None, index=True)
    blog_id: Optional[str] = Field(default=None, index=True)
    created_at: datetime = Field(default_factory=_now)


class Design(SQLModel, table=True):
    id: str = Field(default_factory=_uid, primary_key=True)
    title: str = ""
    scenario: str = ""
    constraints_json: str = "{}"
    output_md: str = ""
    cited_source_ids_json: str = "[]"
    tags_json: str = "[]"
    # draft | checked (deterministic validators only) | validated (full pass) | needs_review
    status: str = Field(default="draft", index=True)
    confidence: Optional[float] = None
    # True when a full validation pass (grounding/coverage/antipattern) ran with no critical issues
    ready_to_share: bool = Field(default=False)
    created_at: datetime = Field(default_factory=_now)


class ClaimEvent(SQLModel, table=True):
    """Lightweight audit trail for human curation actions on claims.
    One row per action: verified / rejected / promoted / dismissed."""

    id: str = Field(default_factory=_uid, primary_key=True)
    claim_id: str = Field(index=True)
    claim_key: str = Field(index=True, default="")
    capability_id: str = ""
    action: str = ""  # verified | rejected | promoted | dismissed
    prev_status: str = ""  # status before the action
    new_status: str = ""  # status after the action
    text_snippet: str = ""  # first 120 chars of the claim text
    actioned_at: datetime = Field(default_factory=_now)


class ValidationRun(SQLModel, table=True):
    id: str = Field(default_factory=_uid, primary_key=True)
    # design_id kept populated for design runs (legacy readers); target_kind/target_id
    # are the generalised pointer so blogs reuse the same validation machinery.
    design_id: str = Field(index=True, default="")
    target_kind: str = Field(default="design", index=True)  # design | blog
    target_id: str = Field(default="", index=True)
    confidence: float = 1.0
    created_at: datetime = Field(default_factory=_now)


class Issue(SQLModel, table=True):
    id: str = Field(default_factory=_uid, primary_key=True)
    run_id: str = Field(index=True)
    validator: str
    severity: str
    message: str
    ref: str = ""


class Topic(SQLModel, table=True):
    """A node in the n-nested reading taxonomy. Topics organise the portal; each maps
    to one or more capabilities so claims, coverage, and blogs flow from the spine."""

    id: str = Field(default_factory=_uid, primary_key=True)
    slug: str = Field(index=True, unique=True)
    name: str = ""
    parent_id: Optional[str] = Field(default=None, index=True)
    description: str = ""
    capability_ids_json: str = "[]"
    order: int = 0
    tags_json: str = "[]"
    active: bool = True
    created_at: datetime = Field(default_factory=_now)


class Blog(SQLModel, table=True):
    """A cited long-form article for a topic. Versioned like Claim/Source — republishing
    a topic supersedes the prior version; nothing is edited in place. Validated like a
    Design (citation + freshness deterministic checks, agent grounding review)."""

    id: str = Field(default_factory=_uid, primary_key=True)
    blog_key: str = Field(index=True, default_factory=_uid)
    version: int = 1
    topic_id: str = Field(index=True)
    slug: str = Field(index=True)
    title: str = ""
    summary: str = ""
    body_md: str = ""
    cited_source_ids_json: str = "[]"
    tags_json: str = "[]"
    depth_levels_json: str = "[]"  # which L-levels the article covers, e.g. [1,2,3]
    # draft | checked (deterministic validators only) | validated (full pass) | needs_review
    status: str = Field(default="draft", index=True)
    confidence: Optional[float] = None
    ready_to_share: bool = Field(default=False)
    supersedes_id: Optional[str] = None
    active: bool = Field(default=True, index=True)
    created_at: datetime = Field(default_factory=_now)


class QueueItem(SQLModel, table=True):
    """A URL submitted (usually via the frontend) for local agent ingestion.
    The DB queue is user intent, not knowledge — it is not git-tracked; the
    source JSON the curator writes is what gets committed."""

    id: str = Field(default_factory=_uid, primary_key=True)
    url: str = ""
    title: str = ""
    tier: int = 6  # submitter's suggested trust tier
    notes: str = ""
    tags_json: str = "[]"
    status: str = Field(
        default="queued", index=True
    )  # queued|claimed|ingested|failed|dismissed
    claimed_at: Optional[datetime] = None
    result_source_id: Optional[str] = None
    error: str = ""
    submitted_by: str = ""
    created_at: datetime = Field(default_factory=_now)
