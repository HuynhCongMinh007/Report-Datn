"""Tests for POST /api/v1/classify (app.api.finance.classify.classify).

Priority pipeline: preference table (exact keyword match) -> LLM fallback.
Covers: AIClassify-TC002 (preference match, confidence=1.0), AIClassify-TC003
(confidence below threshold -> suggested_jar_code=None), LLM failure fallback,
and _pick_tag's tag-resolution rules.
"""
from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

# Importing app.main first forces the full module graph (prompts.py <->
# six_jars/__init__.py <-> tools/affordability.py) to resolve in an order
# that avoids a pre-existing circular import — see tests/agent/conftest.py,
# which relies on the same import for the same reason.
import app.main  # noqa: F401
from app.api.finance import classify as classify_module
from app.domains.finance.models.classify import (
    ClassifyRequest,
    ClassifySource,
)


class _AcquireCtx:
    def __init__(self, conn):
        self._conn = conn

    async def __aenter__(self):
        return self._conn

    async def __aexit__(self, exc_type, exc, tb):
        return False


class _FakePool:
    def __init__(self, conn):
        self._conn = conn

    def acquire(self):
        return _AcquireCtx(self._conn)


class _FakeConn:
    """Fake asyncpg connection — `fetch` serves the tags query, `fetchrow`
    serves the preference lookup. Both default to empty/None."""

    def __init__(self, tag_rows: list[dict] | None = None, preference_row: dict | None = None):
        self._tag_rows = tag_rows or []
        self._preference_row = preference_row

    async def fetch(self, *_args, **_kwargs):
        return self._tag_rows

    async def fetchrow(self, *_args, **_kwargs):
        return self._preference_row


def _llm_response(content: str) -> MagicMock:
    resp = MagicMock()
    resp.content = content
    return resp


@pytest.fixture
def mock_llm():
    llm = AsyncMock()
    with patch("app.api.finance.classify.get_llm", return_value=llm):
        yield llm


def _patch_pool(monkeypatch, conn: _FakeConn):
    async def _fake_get_pool():
        return _FakePool(conn)

    monkeypatch.setattr(classify_module, "get_pool", _fake_get_pool)


# ─────────────────────────────────────────────────────────────
# AIClassify-TC002: preference table match — highest priority, no LLM call
# ─────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_classify_uses_saved_preference_without_calling_llm(monkeypatch, mock_llm):
    conn = _FakeConn(
        tag_rows=[{"jar_code": "essentials", "slug": "an-uong", "name": "Ăn uống"}],
        preference_row={"jar_code": "essentials"},
    )
    _patch_pool(monkeypatch, conn)

    req = ClassifyRequest(user_id="user-1", description="cafe sáng")
    result = await classify_module.classify(req)

    assert result.suggested_jar_code == "essentials"
    assert result.confidence == 1.0
    assert result.source == ClassifySource.PREFERENCE
    mock_llm.ainvoke.assert_not_called()


@pytest.mark.asyncio
async def test_classify_preference_match_resolves_default_tag_when_no_slug_saved(monkeypatch, mock_llm):
    # Preference table only stores jar_code, not a tag slug — _pick_tag must
    # fall back to the jar's "khac" tag (or first candidate) automatically.
    conn = _FakeConn(
        tag_rows=[
            {"jar_code": "essentials", "slug": "an-uong", "name": "Ăn uống"},
            {"jar_code": "essentials", "slug": "khac", "name": "Khác"},
        ],
        preference_row={"jar_code": "essentials"},
    )
    _patch_pool(monkeypatch, conn)

    req = ClassifyRequest(user_id="user-1", description="linh tinh")
    result = await classify_module.classify(req)

    assert result.suggested_tag_slug == "khac"
    assert result.suggested_tag_name == "Khác"


# ─────────────────────────────────────────────────────────────
# AIClassify-TC003: LLM confidence below threshold -> no suggestion
# ─────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_classify_returns_no_suggestion_when_llm_confidence_below_threshold(monkeypatch, mock_llm):
    conn = _FakeConn(tag_rows=[], preference_row=None)
    _patch_pool(monkeypatch, conn)
    mock_llm.ainvoke.return_value = _llm_response(
        '{"jar_code": "essentials", "tag_slug": "an-uong", "confidence": 0.4}'
    )

    req = ClassifyRequest(user_id="user-1", description="chi tiêu linh tinh")
    result = await classify_module.classify(req)

    assert result.suggested_jar_code is None
    assert result.suggested_tag_slug is None
    assert result.suggested_tag_name is None
    assert result.confidence == 0.4
    assert result.source == ClassifySource.AI


@pytest.mark.asyncio
async def test_classify_returns_suggestion_when_llm_confidence_meets_threshold(monkeypatch, mock_llm):
    conn = _FakeConn(
        tag_rows=[{"jar_code": "essentials", "slug": "an-uong", "name": "Ăn uống"}],
        preference_row=None,
    )
    _patch_pool(monkeypatch, conn)
    mock_llm.ainvoke.return_value = _llm_response(
        '{"jar_code": "essentials", "tag_slug": "an-uong", "confidence": 0.6}'
    )

    req = ClassifyRequest(user_id="user-1", description="ăn trưa 50k", amount=50000)
    result = await classify_module.classify(req)

    assert result.suggested_jar_code == "essentials"
    assert result.suggested_tag_slug == "an-uong"
    assert result.confidence == 0.6
    assert result.source == ClassifySource.AI


# ─────────────────────────────────────────────────────────────
# AIClassify-TC004: AI Service (LLM call) fails/timeouts -> safe fallback,
# no suggestion forced onto the user, tracked via confidence=0.0
# ─────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_classify_falls_back_safely_when_llm_call_raises(monkeypatch, mock_llm):
    conn = _FakeConn(tag_rows=[], preference_row=None)
    _patch_pool(monkeypatch, conn)
    mock_llm.ainvoke.side_effect = RuntimeError("AI service timeout")

    req = ClassifyRequest(user_id="user-1", description="mua đồ")
    result = await classify_module.classify(req)

    assert result.suggested_jar_code == "essentials"
    assert result.confidence == 0.0
    assert result.source == ClassifySource.AI


@pytest.mark.asyncio
async def test_classify_handles_malformed_llm_json_response(monkeypatch, mock_llm):
    conn = _FakeConn(tag_rows=[], preference_row=None)
    _patch_pool(monkeypatch, conn)
    mock_llm.ainvoke.return_value = _llm_response("khong phai la json hop le")

    req = ClassifyRequest(user_id="user-1", description="abc")
    result = await classify_module.classify(req)

    # Falls through to default jar_code/confidence when no JSON block is found
    # in the LLM's raw text; confidence 0.0 < threshold -> no suggestion.
    assert result.suggested_jar_code is None
    assert result.confidence == 0.0


# ─────────────────────────────────────────────────────────────
# _pick_tag — pure helper: resolves the tag slug/name for a jar
# ─────────────────────────────────────────────────────────────


class TestPickTag:
    def test_returns_none_when_jar_has_no_tags(self):
        slug, name = classify_module._pick_tag({}, "essentials", "an-uong")
        assert slug is None
        assert name is None

    def test_returns_matching_tag_when_slug_is_found(self):
        tags_by_jar = {
            "essentials": [
                {"slug": "an-uong", "name": "Ăn uống"},
                {"slug": "khac", "name": "Khác"},
            ]
        }
        slug, name = classify_module._pick_tag(tags_by_jar, "essentials", "an-uong")
        assert (slug, name) == ("an-uong", "Ăn uống")

    def test_falls_back_to_khac_tag_when_slug_not_found(self):
        tags_by_jar = {
            "essentials": [
                {"slug": "an-uong", "name": "Ăn uống"},
                {"slug": "khac", "name": "Khác"},
            ]
        }
        slug, name = classify_module._pick_tag(tags_by_jar, "essentials", "unknown-slug")
        assert (slug, name) == ("khac", "Khác")

    def test_falls_back_to_first_candidate_when_no_khac_tag_exists(self):
        tags_by_jar = {"essentials": [{"slug": "an-uong", "name": "Ăn uống"}]}
        slug, name = classify_module._pick_tag(tags_by_jar, "essentials", None)
        assert (slug, name) == ("an-uong", "Ăn uống")
