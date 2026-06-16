"""Data model for Fabric Atlas — unified on the canonical Supabase schema.

The schema is owned by the Supabase migrations (supabase/migrations/*): plural tables,
uuid primary keys, real foreign keys, junction tables (topic_capabilities, blog_sources),
a `capabilities` registry table, and array columns (text[]/int[]). These SQLModel classes
MAP onto that schema (explicit __tablename__, server-side uuid defaults), they do not own it.

Versioning is **slug + supersedes_id chains** (no *_key family columns):
  - Source/Blog identity is the unique `slug`; an article update supersedes via supersedes_id.
  - Claim history is the supersedes_id chain; `active` flags the current version.

List columns (tags, takeaways, depth_levels) are native Postgres arrays in production. A
portable JSONList type lets the same models run on the SQLite test DB (JSON-encoded) without
native ARRAY support — the values round-trip as Python lists either way.
"""

from __future__ import annotations
import json
import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import Column, types, JSON
from sqlalchemy.dialects.postgresql import ARRAY, UUID
from sqlmodel import SQLModel, Field


def _uid() -> str:
    return str(uuid.uuid4())


def _now() -> datetime:
    return datetime.now(timezone.utc)


# --------------------------------------------------------------- portable list column
class _JSONList(types.TypeDecorator):
    """List<->JSON text. SQLite fallback for native Postgres array columns so the model
    layer is backend-portable; values are always plain Python lists in app code."""

    impl = types.Text
    cache_ok = True

    def process_bind_param(self, value, dialect):
        return json.dumps(list(value or []))

    def process_result_value(self, value, dialect):
        if value is None:
            return []
        try:
            return list(json.loads(value))
        except (json.JSONDecodeError, TypeError):
            return []


def _str_array() -> Column:
    """text[] on Postgres, JSON text on anything else (the SQLite test DB)."""
    return Column(
        ARRAY(types.Text).with_variant(_JSONList(), "sqlite"),
        nullable=False,
        server_default="{}",
    )


def _int_array() -> Column:
    return Column(
        ARRAY(types.Integer).with_variant(_JSONList(), "sqlite"),
        nullable=False,
        server_default="{}",
    )


def _uuid_pk() -> Column:
    # Stored as uuid on Postgres (server default), as text on SQLite. App ids are str(uuid4()).
    return Column(
        UUID(as_uuid=False).with_variant(types.String(), "sqlite"), primary_key=True
    )


# --------------------------------------------------------------- backward-compat helpers
# Older callers/tests used the *_json string helpers. Lists are now first-class, but keep
# these as identity-ish shims so a tag list passed through them stays a clean list.
def dump_tags(tags) -> list[str]:
    return [str(t).lstrip("#").strip() for t in (tags or []) if str(t).strip()]


def dump_list(items) -> list[str]:
    return [str(x).strip() for x in (items or []) if str(x).strip()]


def load_tags(value) -> list[str]:
    if isinstance(value, str):
        try:
            value = json.loads(value or "[]")
        except json.JSONDecodeError:
            return []
    return [str(x) for x in (value or [])]


def load_list(value) -> list[str]:
    return load_tags(value)


# ---------------------------------------------------------------- registry + taxonomy
class Capability(SQLModel, table=True):
    __tablename__ = "capabilities"
    id: str = Field(primary_key=True)  # e.g. "direct-lake"
    name: str = ""
    description: str = ""
    accent: str = "teal"
    created_at: datetime = Field(default_factory=_now)


class Topic(SQLModel, table=True):
    __tablename__ = "topics"
    # Lovable keys topics by slug (text PK). parent_slug is the adjacency edge.
    slug: str = Field(primary_key=True)
    parent_slug: Optional[str] = Field(default=None, foreign_key="topics.slug")
    name: str = ""
    description: str = ""
    sort_order: int = 0
    active: bool = True
    tags: list[str] = Field(default_factory=list, sa_column=_str_array())
    created_at: datetime = Field(default_factory=_now)


class TopicCapability(SQLModel, table=True):
    __tablename__ = "topic_capabilities"
    topic_slug: str = Field(foreign_key="topics.slug", primary_key=True)
    capability_id: str = Field(foreign_key="capabilities.id", primary_key=True)


# ---------------------------------------------------------------- knowledge
class Source(SQLModel, table=True):
    __tablename__ = "sources"
    id: str = Field(default_factory=_uid, sa_column=_uuid_pk())
    slug: str = Field(unique=True)
    version: int = 1
    url: str = ""
    title: str = ""
    tier: int = 6
    summary: str = ""
    audience: str = ""
    why_it_matters: str = ""
    takeaways: list[str] = Field(default_factory=list, sa_column=_str_array())
    content_hash: str = ""
    # Raw captured JSON snapshot (claims + diagram refs) for in-DB audit/diff.
    document: dict = Field(
        default_factory=dict,
        sa_column=Column(JSON, nullable=False, server_default="{}"),
    )
    tags: list[str] = Field(default_factory=list, sa_column=_str_array())
    active: bool = True
    created_at: datetime = Field(default_factory=_now)


class Claim(SQLModel, table=True):
    __tablename__ = "claims"
    id: str = Field(default_factory=_uid, sa_column=_uuid_pk())
    source_id: str = Field(foreign_key="sources.id", index=True)
    capability_id: str = Field(foreign_key="capabilities.id", index=True)
    text: str
    depth: int = 1
    type: str = "fact"
    tags: list[str] = Field(default_factory=list, sa_column=_str_array())
    version: int = 1
    supersedes_id: Optional[str] = Field(default=None, foreign_key="claims.id")
    active: bool = True
    # pending | verified | rejected | superseded | deprecated | duplicate
    status: str = "pending"
    confidence: float = 0.5
    created_at: datetime = Field(default_factory=_now)


class ClaimEvent(SQLModel, table=True):
    __tablename__ = "claimevents"
    id: str = Field(default_factory=_uid, sa_column=_uuid_pk())
    claim_id: Optional[str] = Field(default=None, foreign_key="claims.id", index=True)
    capability_id: str = ""
    action: str = ""  # verified | rejected | promoted | dismissed
    prev_status: str = ""
    new_status: str = ""
    text_snippet: str = ""
    actioned_at: datetime = Field(default_factory=_now)


class Asset(SQLModel, table=True):
    __tablename__ = "assets"
    id: str = Field(default_factory=_uid, sa_column=_uuid_pk())
    kind: str = "generated"  # referenced | generated
    url: str = ""
    path: str = ""
    mime: str = "image/svg+xml"
    caption: str = ""
    attribution: str = ""
    license_note: str = ""
    capability_id: str = ""
    source_id: Optional[str] = Field(default=None, foreign_key="sources.id", index=True)
    claim_id: Optional[str] = Field(default=None, foreign_key="claims.id")
    design_id: Optional[str] = Field(default=None, foreign_key="designs.id", index=True)
    blog_id: Optional[str] = Field(default=None, foreign_key="blogs.id", index=True)
    created_at: datetime = Field(default_factory=_now)


# ---------------------------------------------------------------- portal: blogs
class Blog(SQLModel, table=True):
    __tablename__ = "blogs"
    id: str = Field(default_factory=_uid, sa_column=_uuid_pk())
    topic_slug: Optional[str] = Field(
        default=None, foreign_key="topics.slug", index=True
    )
    slug: str = Field(unique=True)
    version: int = 1
    title: str = ""
    summary: str = ""
    body_md: str = ""
    tags: list[str] = Field(default_factory=list, sa_column=_str_array())
    depth_levels: list[int] = Field(default_factory=list, sa_column=_int_array())
    # draft | checked | validated | needs_review | published
    status: str = "draft"
    validation_confidence: Optional[float] = None
    ready_to_share: bool = False
    supersedes_id: Optional[str] = Field(default=None, foreign_key="blogs.id")
    active: bool = True
    content_hash: str = ""
    # Raw captured JSON snapshot (body + cited keys + diagram refs) for audit/diff.
    document: dict = Field(
        default_factory=dict,
        sa_column=Column(JSON, nullable=False, server_default="{}"),
    )
    created_at: datetime = Field(default_factory=_now)


class BlogSource(SQLModel, table=True):
    """Junction: a blog's [Sn] citation legend. label is 'S1','S2'…, position orders them."""

    __tablename__ = "blog_sources"
    blog_id: str = Field(foreign_key="blogs.id", primary_key=True)
    label: str = Field(primary_key=True)
    source_id: str = Field(foreign_key="sources.id")
    position: int = 0


# ---------------------------------------------------------------- designs + validation
class Design(SQLModel, table=True):
    __tablename__ = "designs"
    id: str = Field(default_factory=_uid, sa_column=_uuid_pk())
    slug: str = Field(unique=True)
    title: str = ""
    summary: Optional[str] = None
    scenario: str = ""
    constraints: dict = Field(
        default_factory=dict,
        sa_column=Column(JSON, nullable=False, server_default="{}"),
    )
    body_md: str = ""
    tags: list[str] = Field(default_factory=list, sa_column=_str_array())
    # draft | checked | validated | needs_review
    status: str = "draft"
    confidence: Optional[float] = None
    ready_to_share: bool = False
    content_hash: str = ""
    # Raw captured JSON snapshot (scenario + body + cited keys + diagram refs) for audit/diff.
    document: dict = Field(
        default_factory=dict,
        sa_column=Column(JSON, nullable=False, server_default="{}"),
    )
    created_at: datetime = Field(default_factory=_now)


class DesignSource(SQLModel, table=True):
    """Junction: a design's [Sn] citation legend (mirrors BlogSource)."""

    __tablename__ = "design_sources"
    design_id: str = Field(foreign_key="designs.id", primary_key=True)
    label: str = Field(primary_key=True)
    source_id: str = Field(foreign_key="sources.id")
    position: int = 0


class ValidationRun(SQLModel, table=True):
    __tablename__ = "validation_runs"
    id: str = Field(default_factory=_uid, sa_column=_uuid_pk())
    design_id: Optional[str] = Field(default=None, foreign_key="designs.id", index=True)
    target_kind: str = "design"  # design | blog
    target_id: Optional[str] = None
    score: Optional[float] = None
    confidence: Optional[float] = None
    ran_at: datetime = Field(default_factory=_now)


class Issue(SQLModel, table=True):
    __tablename__ = "issues"
    id: str = Field(default_factory=_uid, sa_column=_uuid_pk())
    validation_run_id: str = Field(foreign_key="validation_runs.id", index=True)
    validator: str = ""
    severity: str = "info"
    message: str = ""
    ref: str = ""
    created_at: datetime = Field(default_factory=_now)


# ---------------------------------------------------------------- ingestion queue
class QueueItem(SQLModel, table=True):
    __tablename__ = "queue_items"
    id: str = Field(default_factory=_uid, sa_column=_uuid_pk())
    url: str = ""
    title: str = ""
    tier: int = 6
    note: str = ""  # Lovable's original column
    notes: str = ""  # backend alias (kept in sync on write)
    tags: list[str] = Field(default_factory=list, sa_column=_str_array())
    # queued | claimed | ingested | failed | dismissed
    status: str = "queued"
    claimed_at: Optional[datetime] = None
    result_source_id: Optional[str] = Field(default=None, foreign_key="sources.id")
    error: str = ""
    submitted_by: Optional[str] = (
        None  # auth.users uuid (nullable for agent/CLI submits)
    )
    created_at: datetime = Field(default_factory=_now)
