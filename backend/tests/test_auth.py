import pytest
from sqlalchemy import select

from app.core.database import SessionLocal
from app.core.redis import redis_client
from app.modules.auth.schemas import normalize_nepal_phone
from app.modules.users.models import User
from tests.conftest import TEST_PASSWORD, otp_from

PHONE = "9812345678"


def auth(tokens: dict) -> dict:
    return {"Authorization": f"Bearer {tokens['access_token']}"}


async def password_login(client, phone=PHONE, password=TEST_PASSWORD):
    return await client.post("/api/v1/auth/login", json={"phone": phone, "password": password})


# ---------- Phone numbers ----------

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


# ---------- Sign up ----------

async def test_signup_creates_complete_account(register):
    data = await register(PHONE, role="owner", name="  Ram   Shrestha ")
    assert data["is_new_user"] is True
    user = data["user"]
    assert user["phone"] == "+9779812345678"
    assert user["role"] == "owner"
    assert user["full_name"] == "Ram Shrestha"
    assert user["onboarding_completed"] is True
    assert user["has_password"] is True
    assert data["access_token"] and data["refresh_token"]


async def test_password_is_stored_as_argon2_hash(register):
    await register(PHONE, password="my-secret-99")
    async with SessionLocal() as db:
        user = await db.scalar(select(User).where(User.phone == "+9779812345678"))
    assert user.password_hash.startswith("$argon2id$")
    assert "my-secret-99" not in user.password_hash


async def test_cannot_sign_up_twice(client, register):
    await register(PHONE)
    await redis_client.delete("otp:cooldown:+9779812345678")
    r = await client.post("/api/v1/auth/otp/request", json={"phone": PHONE, "purpose": "signup"})
    assert r.status_code == 409


async def test_register_needs_verified_phone(client):
    r = await client.post(
        "/api/v1/auth/register",
        json={"verification_token": "fake", "full_name": "Hacker", "password": "abcdef123"},
    )
    assert r.status_code == 400


async def test_verification_token_is_single_use(client, verify_phone):
    token = await verify_phone(PHONE)
    body = {"verification_token": token, "full_name": "Ram", "password": "abcdef123x"}
    assert (await client.post("/api/v1/auth/register", json=body)).status_code == 201
    assert (await client.post("/api/v1/auth/register", json=body)).status_code == 400


async def test_signup_token_cannot_reset_password(client, register, verify_phone):
    await register("9800000011")
    signup_token = await verify_phone("9811111111", "signup")
    r = await client.post(
        "/api/v1/auth/password/reset", json={"verification_token": signup_token, "password": "newpass999"}
    )
    assert r.status_code == 400


async def test_cannot_register_as_admin(client, verify_phone):
    token = await verify_phone(PHONE)
    r = await client.post(
        "/api/v1/auth/register",
        json={"verification_token": token, "full_name": "Ram", "role": "admin", "password": "abcdef123x"},
    )
    assert r.status_code == 422


@pytest.mark.parametrize(
    "weak", ["short1", "onlyletters", "1234567890", "password123", "aaaaaaa1", "x" * 129 + "1"]
)
async def test_weak_passwords_rejected(client, verify_phone, weak):
    token = await verify_phone(PHONE)
    r = await client.post(
        "/api/v1/auth/register", json={"verification_token": token, "full_name": "Ram", "password": weak}
    )
    assert r.status_code == 422


# ---------- Log in ----------

async def test_login_with_password(client, register):
    await register(PHONE, role="agent")
    r = await password_login(client, "+977 981-234-5678")  # any phone format works
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["user"]["role"] == "agent"
    assert data["is_new_user"] is False
    me = await client.get("/api/v1/users/me", headers=auth(data))
    assert me.status_code == 200


async def test_login_does_not_send_sms(client, register, captured_sms):
    await register(PHONE)
    sent_before = len(captured_sms)
    assert (await password_login(client)).status_code == 200
    assert len(captured_sms) == sent_before


async def test_wrong_password_and_unknown_number_look_the_same(client, register):
    await register(PHONE)
    wrong = await password_login(client, PHONE, "wrong-pass-1")
    unknown = await password_login(client, "9800099999", "wrong-pass-1")
    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json()["detail"] == unknown.json()["detail"] == "Incorrect phone number or password."


async def test_lockout_after_too_many_wrong_passwords(client, register):
    await register(PHONE)
    for _ in range(4):
        assert (await password_login(client, PHONE, "wrong-pass-1")).status_code == 401
    r = await password_login(client, PHONE, "wrong-pass-1")
    assert r.status_code == 429
    assert "Retry-After" in r.headers
    # Even the correct password is refused while locked
    assert (await password_login(client)).status_code == 429


async def test_successful_login_resets_failure_count(client, register):
    await register(PHONE)
    for _ in range(4):
        await password_login(client, PHONE, "wrong-pass-1")
    assert (await password_login(client)).status_code == 200
    for _ in range(4):
        assert (await password_login(client, PHONE, "wrong-pass-1")).status_code == 401


async def test_suspended_account_cannot_log_in(client, register):
    await register(PHONE)
    async with SessionLocal() as db:
        user = await db.scalar(select(User).where(User.phone == "+9779812345678"))
        user.is_active = False
        await db.commit()
    assert (await password_login(client)).status_code == 403


# ---------- Forgot password ----------

async def test_forgot_password_flow(client, register, verify_phone):
    old = await register(PHONE)
    token = await verify_phone(PHONE, "reset")
    r = await client.post("/api/v1/auth/password/reset", json={"verification_token": token, "password": "brand-new-7"})
    assert r.status_code == 200, r.text
    assert r.json()["access_token"]  # logged straight in

    assert (await password_login(client, PHONE, TEST_PASSWORD)).status_code == 401
    assert (await password_login(client, PHONE, "brand-new-7")).status_code == 200
    # Every old session is logged out: refresh token revoked, access token rejected
    assert (await client.post("/api/v1/auth/refresh", json={"refresh_token": old["refresh_token"]})).status_code == 401
    assert (await client.get("/api/v1/users/me", headers=auth(old))).status_code == 401


async def test_reset_unlocks_account(client, register, verify_phone):
    await register(PHONE)
    for _ in range(5):
        await password_login(client, PHONE, "wrong-pass-1")
    assert (await password_login(client)).status_code == 429
    token = await verify_phone(PHONE, "reset")
    await client.post("/api/v1/auth/password/reset", json={"verification_token": token, "password": "brand-new-7"})
    assert (await password_login(client, PHONE, "brand-new-7")).status_code == 200


async def test_reset_for_unknown_number(client):
    r = await client.post("/api/v1/auth/otp/request", json={"phone": PHONE, "purpose": "reset"})
    assert r.status_code == 404


async def test_old_account_without_password_sets_one_via_reset(client, verify_phone):
    async with SessionLocal() as db:  # account made before passwords existed
        db.add(User(phone="+9779812345678", full_name="Old User"))
        await db.commit()
    r = await password_login(client)
    assert r.status_code == 409
    assert "Forgot password" in r.json()["detail"]

    token = await verify_phone(PHONE, "reset")
    r = await client.post("/api/v1/auth/password/reset", json={"verification_token": token, "password": "brand-new-7"})
    assert r.status_code == 200
    assert r.json()["user"]["has_password"] is True
    assert (await password_login(client, PHONE, "brand-new-7")).status_code == 200


# ---------- Change password ----------

async def test_change_password(client, register):
    first = await register(PHONE)
    second_device = (await password_login(client)).json()

    r = await client.post(
        "/api/v1/auth/password/change",
        headers=auth(first),
        json={"current_password": TEST_PASSWORD, "password": "changed-pass-5"},
    )
    assert r.status_code == 200, r.text
    fresh = r.json()
    assert (await client.get("/api/v1/users/me", headers=auth(fresh))).status_code == 200
    # The other phone is logged out
    assert (await client.get("/api/v1/users/me", headers=auth(second_device))).status_code == 401
    assert (
        await client.post("/api/v1/auth/refresh", json={"refresh_token": second_device["refresh_token"]})
    ).status_code == 401
    assert (await password_login(client, PHONE, "changed-pass-5")).status_code == 200


async def test_change_password_needs_current_password(client, register):
    tokens = await register(PHONE)
    r = await client.post(
        "/api/v1/auth/password/change",
        headers=auth(tokens),
        json={"current_password": "not-my-pass-1", "password": "changed-pass-5"},
    )
    assert r.status_code == 400
    r = await client.post(
        "/api/v1/auth/password/change",
        json={"current_password": TEST_PASSWORD, "password": "changed-pass-5"},
    )
    assert r.status_code == 401


# ---------- SMS codes ----------

async def test_wrong_code_then_lockout(client, captured_sms):
    await client.post("/api/v1/auth/otp/request", json={"phone": PHONE})
    real = otp_from(captured_sms)
    wrong = "000000" if real != "000000" else "111111"
    for attempt in range(4):
        r = await client.post("/api/v1/auth/otp/verify", json={"phone": PHONE, "code": wrong})
        assert r.status_code == 400
        assert f"{4 - attempt} attempt" in r.json()["detail"]
    r = await client.post("/api/v1/auth/otp/verify", json={"phone": PHONE, "code": wrong})
    assert r.status_code == 429
    # The code is burned — even the right one no longer works.
    r = await client.post("/api/v1/auth/otp/verify", json={"phone": PHONE, "code": real})
    assert r.status_code == 400


async def test_code_is_single_use(client, captured_sms):
    await client.post("/api/v1/auth/otp/request", json={"phone": PHONE})
    code = otp_from(captured_sms)
    assert (await client.post("/api/v1/auth/otp/verify", json={"phone": PHONE, "code": code})).status_code == 200
    assert (await client.post("/api/v1/auth/otp/verify", json={"phone": PHONE, "code": code})).status_code == 400


async def test_signup_code_cannot_be_used_for_reset(client, captured_sms):
    await client.post("/api/v1/auth/otp/request", json={"phone": PHONE, "purpose": "signup"})
    code = otp_from(captured_sms)
    r = await client.post("/api/v1/auth/otp/verify", json={"phone": PHONE, "code": code, "purpose": "reset"})
    assert r.status_code == 400


async def test_resend_cooldown(client, captured_sms):
    assert (await client.post("/api/v1/auth/otp/request", json={"phone": PHONE})).status_code == 200
    r = await client.post("/api/v1/auth/otp/request", json={"phone": PHONE})
    assert r.status_code == 429
    assert "Retry-After" in r.headers


async def test_invalid_phone_rejected(client):
    r = await client.post("/api/v1/auth/otp/request", json={"phone": "12345"})
    assert r.status_code == 422


# ---------- Sessions ----------

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


async def test_token_survives_small_clock_skew(client, login):
    """A token 'issued' 45 seconds in the future (clock drift) must still work."""
    from datetime import UTC, datetime, timedelta

    import jwt

    from app.core.config import settings

    data = await login()
    payload = jwt.decode(data["access_token"], options={"verify_signature": False})
    now = datetime.now(UTC) + timedelta(seconds=45)
    payload.update(iat=now, exp=now + timedelta(minutes=15))
    skewed = jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
    r = await client.get("/api/v1/users/me", headers={"Authorization": f"Bearer {skewed}"})
    assert r.status_code == 200
