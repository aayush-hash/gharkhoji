import pytest

from app.modules.auth.schemas import normalize_nepal_phone
from tests.conftest import otp_from


@pytest.mark.parametrize(
    "raw",
    ["9812345678", "+977 981-234-5678", "009779812345678", "977 9812345678", "9712345678"],
)
def test_phone_normalization_accepts_nepali_numbers(raw):
    assert normalize_nepal_phone(raw).startswith("+9779")


@pytest.mark.parametrize("raw", ["12345", "9612345678", "98123456789", "abc"])
def test_phone_normalization_rejects_bad_numbers(raw):
    with pytest.raises(ValueError):
        normalize_nepal_phone(raw)


async def test_health(client):
    r = await client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok", "database": "ok", "redis": "ok"}


async def test_full_login_flow_creates_user(login):
    data = await login("9812345678")
    assert data["is_new_user"] is True
    assert data["user"]["phone"] == "+9779812345678"
    assert data["user"]["role"] == "tenant"
    assert data["access_token"] and data["refresh_token"]


async def test_second_login_is_not_new_user(client, login):
    await login("9812345678")
    # Cooldown blocks an immediate resend; clear it to simulate time passing.
    from app.core.redis import redis_client

    await redis_client.delete("otp:cooldown:+9779812345678")
    data = await login("9812345678")
    assert data["is_new_user"] is False


async def test_wrong_code_then_lockout(client, captured_sms):
    await client.post("/api/v1/auth/otp/request", json={"phone": "9812345678"})
    real = otp_from(captured_sms)
    wrong = "000000" if real != "000000" else "111111"
    for attempt in range(4):
        r = await client.post("/api/v1/auth/otp/verify", json={"phone": "9812345678", "code": wrong})
        assert r.status_code == 400
        assert f"{4 - attempt} attempt" in r.json()["detail"]
    r = await client.post("/api/v1/auth/otp/verify", json={"phone": "9812345678", "code": wrong})
    assert r.status_code == 429
    # The code is burned — even the right one no longer works.
    r = await client.post("/api/v1/auth/otp/verify", json={"phone": "9812345678", "code": real})
    assert r.status_code == 400


async def test_code_is_single_use(client, captured_sms):
    await client.post("/api/v1/auth/otp/request", json={"phone": "9812345678"})
    code = otp_from(captured_sms)
    assert (await client.post("/api/v1/auth/otp/verify", json={"phone": "9812345678", "code": code})).status_code == 200
    assert (await client.post("/api/v1/auth/otp/verify", json={"phone": "9812345678", "code": code})).status_code == 400


async def test_resend_cooldown(client, captured_sms):
    assert (await client.post("/api/v1/auth/otp/request", json={"phone": "9812345678"})).status_code == 200
    r = await client.post("/api/v1/auth/otp/request", json={"phone": "9812345678"})
    assert r.status_code == 429
    assert "Retry-After" in r.headers


async def test_invalid_phone_rejected(client):
    r = await client.post("/api/v1/auth/otp/request", json={"phone": "12345"})
    assert r.status_code == 422


async def test_refresh_rotation_and_reuse_detection(client, login):
    tokens = await login()
    old_refresh = tokens["refresh_token"]

    r = await client.post("/api/v1/auth/refresh", json={"refresh_token": old_refresh})
    assert r.status_code == 200
    new_refresh = r.json()["refresh_token"]
    assert new_refresh != old_refresh

    # Reusing the old token = likely theft -> everything is revoked.
    assert (await client.post("/api/v1/auth/refresh", json={"refresh_token": old_refresh})).status_code == 401
    assert (await client.post("/api/v1/auth/refresh", json={"refresh_token": new_refresh})).status_code == 401


async def test_logout_revokes_refresh_token(client, login):
    tokens = await login()
    r = await client.post("/api/v1/auth/logout", json={"refresh_token": tokens["refresh_token"]})
    assert r.status_code == 204
    r = await client.post("/api/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert r.status_code == 401


async def test_access_token_cannot_be_used_as_refresh(client, login):
    tokens = await login()
    r = await client.post("/api/v1/auth/refresh", json={"refresh_token": tokens["access_token"]})
    assert r.status_code == 401
