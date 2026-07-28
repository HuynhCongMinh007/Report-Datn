"""Integration test for GET/PATCH /api/v1/anomalies against the real HTTP
stack (FastAPI routing + verify_service_token + real Postgres). Each test
inserts its own row into ai_anomaly_alerts for TEST_USER_ID and deletes it in
a finally block, so re-running this file never accumulates data — same
convention as the backend's live e2e suites.

Previously this file used a fully mocked asyncpg pool (_FakePool/_FakeConn),
which meant `tests/integration/` and `tests/unit/` overlapped in name only.
Per .claude/rules/workflow.md ("Integration tests (hitting real HTTP
endpoints) -> tests/integration/"), this file now exercises the real
endpoint end-to-end; the equivalent mocked-pool unit coverage still exists in
tests/unit/test_classify_api.py style tests elsewhere.
"""
from __future__ import annotations

import uuid

import pytest

pytestmark = pytest.mark.asyncio


async def _insert_alert(db_conn, *, user_id: str, module_type="finance", alert_type="spike_expense",
                         description="[integration-test] anomalies", is_read=False) -> str:
    alert_id = str(uuid.uuid4())
    await db_conn.execute(
        """
        INSERT INTO ai_anomaly_alerts (id, user_id, module_type, alert_type, description, is_read)
        VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6)
        """,
        alert_id,
        user_id,
        module_type,
        alert_type,
        description,
        is_read,
    )
    return alert_id


async def _delete_alert(db_conn, alert_id: str) -> None:
    await db_conn.execute("DELETE FROM ai_anomaly_alerts WHERE id = $1::uuid", alert_id)


async def test_get_anomaly_alerts_returns_the_real_row(client, db_conn, auth_headers, test_user_id):
    alert_id = await _insert_alert(db_conn, user_id=test_user_id, alert_type="spike_expense")
    try:
        res = await client.get(
            "/api/v1/anomalies",
            params={"user_id": test_user_id, "module_type": "finance"},
            headers=auth_headers,
        )
        assert res.status_code == 200
        body = res.json()
        matching = [a for a in body if a["id"] == alert_id]
        assert len(matching) == 1
        assert matching[0]["alert_type"] == "spike_expense"
        assert matching[0]["is_read"] is False
    finally:
        await _delete_alert(db_conn, alert_id)


async def test_get_anomaly_alerts_is_read_filter_excludes_unread(client, db_conn, auth_headers, test_user_id):
    alert_id = await _insert_alert(db_conn, user_id=test_user_id, is_read=False)
    try:
        res = await client.get(
            "/api/v1/anomalies",
            params={"user_id": test_user_id, "is_read": "true"},
            headers=auth_headers,
        )
        assert res.status_code == 200
        assert alert_id not in [a["id"] for a in res.json()]
    finally:
        await _delete_alert(db_conn, alert_id)


async def test_get_anomaly_alerts_scoped_to_user_id_does_not_leak_other_users(client, db_conn, auth_headers, test_user_id):
    other_user_alert = await _insert_alert(db_conn, user_id=test_user_id, description="[integration-test] should not leak")
    try:
        res = await client.get(
            "/api/v1/anomalies",
            params={"user_id": "00000000-0000-4000-8000-000000000000"},
            headers=auth_headers,
        )
        assert res.status_code == 200
        assert other_user_alert not in [a["id"] for a in res.json()]
    finally:
        await _delete_alert(db_conn, other_user_alert)


async def test_get_anomaly_alerts_rejects_missing_auth(client, test_user_id):
    res = await client.get("/api/v1/anomalies", params={"user_id": test_user_id})
    assert res.status_code == 401  # HTTPBearer with no Authorization header


async def test_get_anomaly_alerts_rejects_invalid_token(client, test_user_id, auth_headers):
    res = await client.get(
        "/api/v1/anomalies",
        params={"user_id": test_user_id},
        headers={"Authorization": "Bearer not-a-real-token"},
    )
    assert res.status_code == 401


async def test_mark_alert_read_updates_the_real_row(client, db_conn, auth_headers, test_user_id):
    alert_id = await _insert_alert(db_conn, user_id=test_user_id, is_read=False)
    try:
        res = await client.patch(
            f"/api/v1/anomalies/{alert_id}/read",
            params={"user_id": test_user_id},
            headers=auth_headers,
        )
        assert res.status_code == 204

        row = await db_conn.fetchrow("SELECT is_read FROM ai_anomaly_alerts WHERE id = $1::uuid", alert_id)
        assert row["is_read"] is True
    finally:
        await _delete_alert(db_conn, alert_id)


async def test_mark_alert_read_raises_404_when_alert_does_not_exist(client, auth_headers, test_user_id):
    res = await client.patch(
        f"/api/v1/anomalies/{uuid.uuid4()}/read",
        params={"user_id": test_user_id},
        headers=auth_headers,
    )
    assert res.status_code == 404


async def test_mark_alert_read_raises_404_when_user_id_does_not_own_the_alert(client, db_conn, auth_headers, test_user_id):
    alert_id = await _insert_alert(db_conn, user_id=test_user_id, is_read=False)
    try:
        res = await client.patch(
            f"/api/v1/anomalies/{alert_id}/read",
            params={"user_id": "00000000-0000-4000-8000-000000000000"},
            headers=auth_headers,
        )
        assert res.status_code == 404

        # Ownership check must be a no-op, not a partial update.
        row = await db_conn.fetchrow("SELECT is_read FROM ai_anomaly_alerts WHERE id = $1::uuid", alert_id)
        assert row["is_read"] is False
    finally:
        await _delete_alert(db_conn, alert_id)
