"""Unit tests for the ingestion-boundary text normalizer.

These call services.normalize_text directly — no DB, no fixtures — because the
function's whole job is to repair incoming text before it becomes a persisted,
versioned row. Run from backend/: pytest
"""

from app.services import normalize_text


def test_repairs_apostrophe():
    assert normalize_text("OneLakeâ€™s store") == "OneLake's store"


def test_repairs_dashes_quotes_bullet():
    assert normalize_text("â€œDirect Lakeâ€") == '"Direct Lake"'
    assert normalize_text("import â€” no copy") == "import — no copy"
    assert normalize_text("L1â€“L5") == "L1–L5"
    assert normalize_text("â€¢ point") == "• point"


def test_clean_text_is_unchanged():
    clean = "Lakehouse stores Delta tables in OneLake."
    assert normalize_text(clean) is clean  # short-circuits, returns same object


def test_handles_empty_and_none():
    assert normalize_text("") == ""
    assert normalize_text(None) is None
