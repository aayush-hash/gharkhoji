import os

# Point the app at the TEST database and a separate Redis DB *before* importing it.
os.environ["ENVIRONMENT"] = "test"
os.environ.setdefault(
    "TEST_DATABASE_URL", "postgresql+asyncpg://postgres:postgres@localhost:5432/gharkhoji_test"
)
os.environ["DATABASE_URL"] = os.environ["TEST_DATABASE_URL"]
os.environ["REDIS_URL"] = os.environ.get("TEST_REDIS_URL", "redis://localhost:6379/15")
os.environ.setdefault("SECRET_KEY", "test-secret-key-that-is-long-enough-1234567890")

import pytest  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402
from sqlalchemy import text  # noqa: E402

from app.core.database import engine  # noqa: E402
from app.core.redis import redis_client  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Base  # noqa: E402


@pytest.fixture(scope="session", autouse=True)
async def _create_schema():
    async with engine.begin() as conn:
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS postgis"))
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest.fixture(autouse=True)
async def _clean_state():
    await redis_client.flushdb()
    async with engine.begin() as conn:
        tables = ", ".join(t.name for t in reversed(Base.metadata.sorted_tables))
        await conn.execute(text(f"TRUNCATE {tables} CASCADE"))
    yield


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


@pytest.fixture
def captured_sms(monkeypatch):
    """Captures 'sent' SMS messages so tests can read the OTP code."""
    from app.modules.auth import service

    sent: list[tuple[str, str]] = []

    async def fake_send(phone: str, message: str) -> None:
        sent.append((phone, message))

    monkeypatch.setattr(service, "send_sms", fake_send)
    return sent


def otp_from(sms: list[tuple[str, str]]) -> str:
    import re

    return re.search(r"\b(\d{6})\b", sms[-1][1]).group(1)


@pytest.fixture
async def login(client, captured_sms):
    """Returns a function that logs a phone number in and gives back the JSON response."""

    async def _login(phone: str = "9812345678") -> dict:
        r = await client.post("/api/v1/auth/otp/request", json={"phone": phone})
        assert r.status_code == 200, r.text
        r = await client.post("/api/v1/auth/otp/verify", json={"phone": phone, "code": otp_from(captured_sms)})
        assert r.status_code == 200, r.text
        return r.json()

    return _login
