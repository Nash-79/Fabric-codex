"""Data model for Fabric Atlas.

Version chain (the load-bearing concept) is unchanged from v0.1 — see docs/data-model.md.
v0.2 adds:
  - free-form `tags` on Source, Claim, Design (e.g. MicrosoftFabric, DataEngineering, PySpark)
  - an `Asset` table for images/diagrams, distinguishing:
      kind="referenced"  external source image — URL + caption + attribution only, never re-hosted
      kind="generated"   an original SVG/Mermaid diagram authored by an agent, stored in the repo
v0.3 adds:
  - `ready_to_share` on Design (persisted result of full validation pass with no critical issues)
  - Claim status now also includes "rejected" (human-dismissed pending claim)
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


def load_tags(s: str) -> list[str]:
    try:
        return json.loads(s or "[]")
    except json.JSONDecodeError:
        return []


class Source(SQLModel, table=True):
    id: str = Field(default_factory=_uid, primary_key=True)
    source_key: str = Field(index=True)
    version: int = 1
    url: str = ""
    title: str = ""
    tier: int = 6
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
    kind: str = "generated"               # referenced | generated
    url: str = ""                         # external image (referenced)
    path: str = ""                        # repo path to generated svg/mermaid (generated)
    mime: str = "image/svg+xml"
    caption: str = ""
    attribution: str = ""                 # required for referenced assets
    license_note: str = ""
    capability_id: str = ""
    source_id: Optional[str] = Field(default=None, index=True)
    claim_id: Optional[str] = None
    design_id: Optional[str] = Field(default=None, index=True)
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


class ValidationRun(SQLModel, table=True):
    id: str = Field(default_factory=_uid, primary_key=True)
    design_id: str = Field(index=True)
    confidence: float = 1.0
    created_at: datetime = Field(default_factory=_now)


class Issue(SQLModel, table=True):
    id: str = Field(default_factory=_uid, primary_key=True)
    run_id: str = Field(index=True)
    validator: str
    severity: str
    message: str
    ref: str = ""
