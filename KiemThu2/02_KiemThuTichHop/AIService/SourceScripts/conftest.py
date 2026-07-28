"""Fixtures for tests/integration/ — tests that hit the real HTTP endpoints
(ASGI, no live uvicorn process needed) with a real Postgres connection (the
same shared DB configured via DATABASE_* in .env), per the convention in
.claude/rules/workflow.md ("Integration tests (hitting real HTTP endpoints)
-> tests/integration/"). Only the LLM is mocked (see mock_llm in
tests/agent/conftest.py for the equivalent pattern used by the agent-level
integration tests) — DB reads/writes here are real and must be cleaned up by
each test.

Note: unlike tests/agent/conftest.py, this file does NOT force an SSL
context onto asyncpg connections. That patch exists there for the project's
earlier Neon-hosted Postgres (which required SSL); the DB now configured via
DATABASE_* in .env is a plain (non-SSL) staging Postgres
(DATABASE_SSL_ENABLED=false), and forcing SSL against it fails the TLS
handshake outright. Connections here just use asyncpg's defaults.
"""
from __future__ import annotations

import sys
import os

import asyncpg
import httpx
import jwt
import pytest
from httpx import ASGITransport

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from app.config import settings
from app.main import app

# users.id for account finance.seed@student360.test on the shared staging DB
# (backend/.env DATABASE_HOST=103.82.36.202) — the same seed account the
# backend's live e2e suites (business-flows.e2e-spec.ts) log in as via
# EVAL_USER_EMAIL/EVAL_USER_PASSWORD. Resolved via:
#   SELECT u.id FROM users u JOIN accounts a ON a.account_id = u.account_id
#   WHERE a.email = 'finance.seed@student360.test'
# Note: this is NOT the same id as tests/agent/conftest.py's test_user_id
# fixture ("f80eaa47-..."), which was seeded on the project's earlier
# Neon-hosted DB and no longer exists as a `users` row on this staging DB.
TEST_USER_ID = "4f0c1f80-7ab8-4ec6-8a0f-18dee0a78e34"


@pytest.fixture
def test_user_id() -> str:
    return TEST_USER_ID


@pytest.fixture(autouse=True)
def _ensure_predictable_service_secret(monkeypatch):
    # verify_service_token() jwt.decode()s against settings.AI_SERVICE_SECRET;
    # pin it so the token minted below is guaranteed to validate regardless
    # of what's in .env.
    monkeypatch.setattr(settings, "AI_SERVICE_SECRET", "integration-test-secret")


@pytest.fixture
def auth_headers() -> dict:
    token = jwt.encode(
        {"iss": "s360-backend", "exp": 9999999999},
        "integration-test-secret",
        algorithm="HS256",
    )
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.fixture
async def db_conn():
    dsn = (
        settings.DATABASE_URL
        .replace("postgresql+asyncpg://", "postgresql://")
        .replace("postgres+asyncpg://", "postgresql://")
    )
    if "?" in dsn:
        dsn = dsn.split("?")[0]
    conn = await asyncpg.connect(dsn)
    yield conn
    await conn.close()


@pytest.fixture(autouse=True)
async def _cleanup_db_pool():
    """Ensure app.core.database's global pool doesn't leak/interfere between
    tests that patch settings (e.g. AI_SERVICE_SECRET)."""
    from app.core.database import close_pool

    await close_pool()
    yield
    await close_pool()
