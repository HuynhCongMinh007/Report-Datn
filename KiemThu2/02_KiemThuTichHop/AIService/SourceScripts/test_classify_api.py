"""Integration test for POST /api/v1/classify and /api/v1/classify/override
against the real HTTP stack (FastAPI routing + verify_service_token + real
Postgres `ai_user_preferences_6jars` table). Only the LLM fallback path
(Step 2) is mocked — see tests/unit/test_classify_api.py for the fully
mocked-DB unit coverage of the same branches (preference match, confidence
threshold, LLM failure fallback, _pick_tag).

Each test writes its own row (a unique keyword, scoped to the real seed
user) and deletes it in a finally block.
"""
from __future__ import annotations

import uuid

import pytest

from app.api.finance import classify as classify_module

pytestmark = pytest.mark.asyncio


async def _delete_preference(db_conn, user_id: str, keyword: str) -> None:
    await db_conn.execute(
        "DELETE FROM ai_user_preferences_6jars WHERE user_id = $1 AND keyword = $2",
        user_id,
        keyword,
    )


async def test_classify_uses_preference_table_when_keyword_matches(client, db_conn, auth_headers, test_user_id):
    keyword = f"integration-test-keyword-{uuid.uuid4().hex[:8]}"
    await db_conn.execute(
        "INSERT INTO ai_user_preferences_6jars (user_id, keyword, jar_code, count) VALUES ($1, $2, $3, 1)",
        test_user_id,
        keyword,
        "education",
    )
    try:
        res = await client.post(
            "/api/v1/classify",
            json={"user_id": test_user_id, "description": keyword},
            headers=auth_headers,
        )
        assert res.status_code == 200
        body = res.json()
        assert body["suggested_jar_code"] == "education"
        assert body["confidence"] == 1.0
        assert body["source"] == "preference"
    finally:
        await _delete_preference(db_conn, test_user_id, keyword)


async def test_classify_falls_back_to_llm_when_no_preference_matches(client, auth_headers, test_user_id, monkeypatch):
    class _FakeLLM:
        async def ainvoke(self, messages):
            class _Resp:
                content = '{"jar_code": "enjoyment", "tag_slug": null, "confidence": 0.9}'
            return _Resp()

    monkeypatch.setattr(classify_module, "get_llm", lambda: _FakeLLM())

    description = f"unmatched description {uuid.uuid4().hex[:8]}"
    res = await client.post(
        "/api/v1/classify",
        json={"user_id": test_user_id, "description": description},
        headers=auth_headers,
    )
    assert res.status_code == 200
    body = res.json()
    assert body["suggested_jar_code"] == "enjoyment"
    assert body["confidence"] == 0.9
    assert body["source"] == "ai"


async def test_classify_returns_no_suggestion_when_llm_confidence_is_below_threshold(client, auth_headers, test_user_id, monkeypatch):
    class _FakeLLM:
        async def ainvoke(self, messages):
            class _Resp:
                content = '{"jar_code": "enjoyment", "tag_slug": null, "confidence": 0.2}'
            return _Resp()

    monkeypatch.setattr(classify_module, "get_llm", lambda: _FakeLLM())

    description = f"low-confidence description {uuid.uuid4().hex[:8]}"
    res = await client.post(
        "/api/v1/classify",
        json={"user_id": test_user_id, "description": description},
        headers=auth_headers,
    )
    assert res.status_code == 200
    body = res.json()
    assert body["suggested_jar_code"] is None
    assert body["confidence"] == 0.2
    assert body["source"] == "ai"


async def test_classify_falls_back_to_essentials_when_llm_call_raises(client, auth_headers, test_user_id, monkeypatch):
    class _FailingLLM:
        async def ainvoke(self, messages):
            raise RuntimeError("LLM provider unavailable")

    monkeypatch.setattr(classify_module, "get_llm", lambda: _FailingLLM())

    description = f"llm-down description {uuid.uuid4().hex[:8]}"
    res = await client.post(
        "/api/v1/classify",
        json={"user_id": test_user_id, "description": description},
        headers=auth_headers,
    )
    assert res.status_code == 200
    body = res.json()
    assert body["suggested_jar_code"] == "essentials"
    assert body["confidence"] == 0.0
    assert body["source"] == "ai"


async def test_classify_rejects_missing_auth(client, test_user_id):
    res = await client.post(
        "/api/v1/classify",
        json={"user_id": test_user_id, "description": "x"},
    )
    assert res.status_code == 401


async def test_classify_override_creates_a_new_preference_row(client, db_conn, auth_headers, test_user_id):
    keyword = f"integration-test-override-{uuid.uuid4().hex[:8]}"
    try:
        res = await client.post(
            "/api/v1/classify/override",
            json={"user_id": test_user_id, "keyword": keyword, "jar_code": "investment"},
            headers=auth_headers,
        )
        assert res.status_code == 204

        row = await db_conn.fetchrow(
            "SELECT jar_code, count FROM ai_user_preferences_6jars WHERE user_id = $1 AND keyword = $2",
            test_user_id,
            keyword,
        )
        assert row is not None
        assert row["jar_code"] == "investment"
        assert row["count"] == 1
    finally:
        await _delete_preference(db_conn, test_user_id, keyword)


async def test_classify_override_increments_count_on_repeated_confirmation(client, db_conn, auth_headers, test_user_id):
    keyword = f"integration-test-repeat-{uuid.uuid4().hex[:8]}"
    try:
        for _ in range(3):
            res = await client.post(
                "/api/v1/classify/override",
                json={"user_id": test_user_id, "keyword": keyword, "jar_code": "sharing"},
                headers=auth_headers,
            )
            assert res.status_code == 204

        row = await db_conn.fetchrow(
            "SELECT jar_code, count FROM ai_user_preferences_6jars WHERE user_id = $1 AND keyword = $2",
            test_user_id,
            keyword,
        )
        assert row["jar_code"] == "sharing"
        assert row["count"] == 3
    finally:
        await _delete_preference(db_conn, test_user_id, keyword)


async def test_classify_override_lowercases_and_trims_the_keyword(client, db_conn, auth_headers, test_user_id):
    raw_keyword = f"  Integration-Test-CASE-{uuid.uuid4().hex[:8]}  "
    normalized_keyword = raw_keyword.lower().strip()
    try:
        res = await client.post(
            "/api/v1/classify/override",
            json={"user_id": test_user_id, "keyword": raw_keyword, "jar_code": "reserve"},
            headers=auth_headers,
        )
        assert res.status_code == 204

        row = await db_conn.fetchrow(
            "SELECT jar_code FROM ai_user_preferences_6jars WHERE user_id = $1 AND keyword = $2",
            test_user_id,
            normalized_keyword,
        )
        assert row is not None
        assert row["jar_code"] == "reserve"
    finally:
        await _delete_preference(db_conn, test_user_id, normalized_keyword)
