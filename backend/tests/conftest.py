import os
import tempfile

# Point the app at the TEST database and a separate Redis DB *before* importing it.
os.environ["ENVIRONMENT"] = "test"
os.environ.setdefault(
    "TEST_DATABASE_URL", "postgresql+asyncpg://postgres:postgres@localhost:5432/gharkhoji_test"
)
os.environ["DATABASE_URL"] = os.environ["TEST_DATABASE_URL"]
os.environ["REDIS_URL"] = os.environ.get("TEST_REDIS_URL", "redis://localhost:6379/15")
os.environ.setdefault("SECRET_KEY", "test-secret-key-that-is-long-enough-1234567890")
os.environ["STORAGE_BACKEND"] = "local"
# Tests must not depend on your laptop's .env (e.g. your Wi-Fi IP in PUBLIC_BASE_URL)
os.environ["PUBLIC_BASE_URL"] = "http://localhost:8000"
os.environ["MEDIA_ROOT"] = tempfile.mkdtemp(prefix="gharkhoji-test-media-")

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


TEST_PASSWORD = "safe-pass-123"


@pytest.fixture
async def verify_phone(client, captured_sms):
    """SMS-code step: returns the one-time verification token for signup/reset."""

    async def _verify(phone: str, purpose: str = "signup") -> str:
        from app.core.redis import redis_client

        await redis_client.delete(f"otp:cooldown:{normalize(phone)}")  # simulate waiting between tests
        r = await client.post("/api/v1/auth/otp/request", json={"phone": phone, "purpose": purpose})
        assert r.status_code == 200, r.text
        r = await client.post(
            "/api/v1/auth/otp/verify", json={"phone": phone, "purpose": purpose, "code": otp_from(captured_sms)}
        )
        assert r.status_code == 200, r.text
        return r.json()["verification_token"]

    return _verify


def normalize(phone: str) -> str:
    from app.modules.auth.schemas import normalize_nepal_phone

    return normalize_nepal_phone(phone)


@pytest.fixture
async def register(client, verify_phone):
    """Creates an account the real way (SMS code → register). Returns the login JSON."""

    async def _register(
        phone: str = "9812345678", role: str = "tenant", name: str = "Test User", password: str = TEST_PASSWORD
    ) -> dict:
        token = await verify_phone(phone, "signup")
        r = await client.post(
            "/api/v1/auth/register",
            json={"verification_token": token, "full_name": name, "role": role, "password": password},
        )
        assert r.status_code == 201, r.text
        return r.json()

    return _register


@pytest.fixture
async def login(register):
    """A signed-up tenant, logged in. Returns the login JSON (tokens + user)."""

    async def _login(phone: str = "9812345678") -> dict:
        return await register(phone)

    return _login


@pytest.fixture
async def make_user(register):
    """Creates a logged-in user with a role. Returns {"headers": ..., "user": ...}."""
    counter = iter(range(10_000_000, 99_999_999))

    async def _make(role: str = "owner", name: str = "Test User") -> dict:
        data = await register(f"98{next(counter)}", role=role, name=name)
        return {"headers": {"Authorization": f"Bearer {data['access_token']}"}, "user": data["user"]}

    return _make
