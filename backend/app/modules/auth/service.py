"""Accounts: sign up (phone verified once by SMS code), password login, forgot password,
change password, and refresh-token rotation.

Redis keys (all expire on their own):
  otp:code:{purpose}:{phone}   hashed code, TTL = OTP_TTL_SECONDS
  otp:tries:{purpose}:{phone}  wrong attempts for the current code
  otp:cooldown:{phone}         blocks resending for OTP_RESEND_COOLDOWN_SECONDS
  otp:hour:{phone}             codes sent this hour
  otp:hour-ip:{ip}             codes sent from this IP this hour
  verify:{jti}                 one-time "phone verified" ticket (deleted when used)
  login:fails:{phone}          wrong passwords in a row
  login:lock:{phone}           number temporarily locked after too many wrong passwords
  login:fails-ip:{ip}          wrong passwords from this IP this hour
"""
import logging
import secrets
import uuid
from datetime import UTC, datetime, timedelta

from redis.asyncio import Redis
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import sms
from app.core.config import settings
from app.core.security import (
    TokenError,
    create_access_token,
    create_refresh_token,
    create_verify_token,
    decode_token,
    generate_otp,
    hash_otp,
    hash_password,
    password_needs_rehash,
    password_version,
    verify_otp_hash,
    verify_password,
)
from app.modules.auth.models import RefreshToken
from app.modules.auth.schemas import TokenPair
from app.modules.users import service as user_service
from app.modules.users.models import User, UserRole

logger = logging.getLogger("gharkhoji.auth")

WRONG_LOGIN = "Incorrect phone number or password"


class AuthError(Exception):
    def __init__(self, message: str, status_code: int = 400, retry_after: int | None = None):
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.retry_after = retry_after


# ---------- SMS codes ----------

async def _hit_hourly_limit(redis: Redis, key: str, limit: int) -> bool:
    count = await redis.incr(key)
    if count == 1:
        await redis.expire(key, 3600)
    return count > limit


async def send_sms(phone: str, message: str) -> None:
    """Console in development, Sparrow/Aakash SMS in production (see app/core/sms.py)."""
    await sms.send_sms(phone, message)


async def request_otp(db: AsyncSession, redis: Redis, phone: str, purpose: str, client_ip: str) -> None:
    user = await user_service.get_by_phone(db, phone)
    if purpose == "signup" and user is not None and user.has_password:
        raise AuthError("This number already has an account. Log in instead.", 409)
    if purpose == "reset" and user is None:
        raise AuthError("No account uses this number. Create an account instead.", 404)

    cooldown_key = f"otp:cooldown:{phone}"
    ttl = await redis.ttl(cooldown_key)
    if ttl > 0:
        raise AuthError(f"Please wait {ttl}s before requesting a new code", 429, retry_after=ttl)

    if await _hit_hourly_limit(redis, f"otp:hour:{phone}", settings.OTP_MAX_PER_HOUR):
        raise AuthError("Too many codes requested for this number. Try again later.", 429, 3600)
    if await _hit_hourly_limit(redis, f"otp:hour-ip:{client_ip}", settings.OTP_MAX_PER_HOUR_PER_IP):
        raise AuthError("Too many requests. Try again later.", 429, 3600)

    code = generate_otp()
    async with redis.pipeline(transaction=True) as pipe:
        pipe.set(f"otp:code:{purpose}:{phone}", hash_otp(phone, code), ex=settings.OTP_TTL_SECONDS)
        pipe.delete(f"otp:tries:{purpose}:{phone}")
        pipe.set(cooldown_key, "1", ex=settings.OTP_RESEND_COOLDOWN_SECONDS)
        await pipe.execute()

    minutes = settings.OTP_TTL_SECONDS // 60
    try:
        await send_sms(phone, f"Your GharKhoji code is {code}. Valid for {minutes} minutes. Don't share it.")
    except sms.SmsError:
        # The code never arrived: forget it and let the person try again straight away.
        await redis.delete(f"otp:code:{purpose}:{phone}", cooldown_key)
        raise AuthError("We couldn't send the SMS right now. Please try again in a minute.", 503) from None


async def check_otp(redis: Redis, phone: str, code: str, purpose: str) -> None:
    code_key, tries_key = f"otp:code:{purpose}:{phone}", f"otp:tries:{purpose}:{phone}"
    stored = await redis.get(code_key)
    if stored is None:
        raise AuthError("Code expired or not requested. Please request a new one.", 400)

    if not verify_otp_hash(phone, code, stored):
        tries = await redis.incr(tries_key)
        await redis.expire(tries_key, settings.OTP_TTL_SECONDS)
        remaining = settings.OTP_MAX_VERIFY_ATTEMPTS - tries
        if remaining <= 0:
            await redis.delete(code_key, tries_key)  # burn the code
            raise AuthError("Too many wrong attempts. Please request a new code.", 429)
        raise AuthError(f"Incorrect code. {remaining} attempt(s) left.", 400)

    await redis.delete(code_key, tries_key)  # one-time use


async def verify_phone(redis: Redis, phone: str, code: str, purpose: str) -> str:
    """Checks the SMS code and returns a one-time ticket for sign-up or password reset."""
    await check_otp(redis, phone, code, purpose)
    jti = secrets.token_urlsafe(16)
    await redis.set(f"verify:{jti}", f"{purpose}:{phone}", ex=settings.VERIFY_TOKEN_TTL_SECONDS)
    return create_verify_token(phone, purpose, jti)


async def _consume_verify_token(redis: Redis, token: str, purpose: str) -> str:
    """Returns the verified phone number. Each ticket works exactly once."""
    expired = AuthError("Verification expired. Please verify your number again.", 400)
    try:
        payload = decode_token(token, expected_type="verify")
    except TokenError:
        raise expired from None
    if payload.get("purpose") != purpose:
        raise AuthError("Invalid verification", 400)
    stored = await redis.getdel(f"verify:{payload.get('jti')}")
    if stored != f"{purpose}:{payload['sub']}":
        raise expired
    return payload["sub"]


# ---------- Passwords ----------

async def _check_not_locked(redis: Redis, phone: str, client_ip: str) -> None:
    ttl = await redis.ttl(f"login:lock:{phone}")
    if ttl > 0:
        minutes = max(1, round(ttl / 60))
        raise AuthError(
            f"Too many wrong passwords. Try again in {minutes} min, or reset your password.", 429, ttl
        )
    fails_ip = int(await redis.get(f"login:fails-ip:{client_ip}") or 0)
    if fails_ip >= settings.LOGIN_MAX_FAILS_PER_IP_PER_HOUR:
        raise AuthError("Too many failed logins from this network. Try again later.", 429, 3600)


async def _record_failed_login(redis: Redis, phone: str, client_ip: str) -> int:
    """Returns how many attempts are left before the number is locked."""
    await _hit_hourly_limit(redis, f"login:fails-ip:{client_ip}", settings.LOGIN_MAX_FAILS_PER_IP_PER_HOUR)
    lock_seconds = settings.LOGIN_LOCK_MINUTES * 60
    fails = await redis.incr(f"login:fails:{phone}")
    await redis.expire(f"login:fails:{phone}", lock_seconds)
    remaining = settings.LOGIN_MAX_FAILED_ATTEMPTS - fails
    if remaining <= 0:
        await redis.set(f"login:lock:{phone}", "1", ex=lock_seconds)
        await redis.delete(f"login:fails:{phone}")
        logger.warning("Login locked for %s after %s wrong passwords", phone, fails)
    return remaining


async def _clear_login_failures(redis: Redis, phone: str) -> None:
    await redis.delete(f"login:fails:{phone}", f"login:lock:{phone}")


def _set_password(user: User, password: str) -> None:
    user.password_hash = hash_password(password)
    user.password_changed_at = datetime.now(UTC)


async def register(
    db: AsyncSession, redis: Redis, verification_token: str, full_name: str, role: UserRole,
    password: str, user_agent: str | None,
) -> tuple[User, TokenPair]:
    phone = await _consume_verify_token(redis, verification_token, "signup")
    now = datetime.now(UTC)
    user = await user_service.get_by_phone(db, phone)
    if user is not None and user.has_password:
        raise AuthError("This number already has an account. Log in instead.", 409)
    if user is None:  # (an existing user without a password — from before passwords — is completed here)
        user = User(phone=phone)
        db.add(user)
    user.full_name = full_name
    user.role = role
    user.onboarding_completed = True
    user.phone_verified_at = now
    user.last_login_at = now
    _set_password(user, password)
    await db.flush()
    tokens = await issue_tokens(db, user, user_agent)
    await db.commit()
    await db.refresh(user)
    logger.info("New account %s (%s)", phone, role.value)
    return user, tokens


async def login_with_password(
    db: AsyncSession, redis: Redis, phone: str, password: str, client_ip: str, user_agent: str | None
) -> tuple[User, TokenPair]:
    await _check_not_locked(redis, phone, client_ip)
    user = await user_service.get_by_phone(db, phone)

    # verify_password always does the slow hash — even for unknown numbers — so response
    # time doesn't reveal whether an account exists.
    ok = verify_password(password, user.password_hash if user else None)
    if not ok:
        if user is not None and not user.has_password:
            raise AuthError(
                "This account doesn't have a password yet. Tap 'Forgot password' to create one.", 409
            )
        remaining = await _record_failed_login(redis, phone, client_ip)
        if remaining <= 0:
            raise AuthError(
                f"Too many wrong passwords. Try again in {settings.LOGIN_LOCK_MINUTES} min, "
                "or reset your password.", 429, settings.LOGIN_LOCK_MINUTES * 60,
            )
        hint = f" {remaining} attempt(s) left." if remaining <= 2 else ""
        raise AuthError(WRONG_LOGIN + "." + hint, 401)

    assert user is not None
    if not user.is_active:
        raise AuthError("This account is suspended. Contact support.", 403)

    await _clear_login_failures(redis, phone)
    if password_needs_rehash(user.password_hash):  # type: ignore[arg-type]
        user.password_hash = hash_password(password)
    user.last_login_at = datetime.now(UTC)
    tokens = await issue_tokens(db, user, user_agent)
    await db.commit()
    await db.refresh(user)
    return user, tokens


async def reset_password(
    db: AsyncSession, redis: Redis, verification_token: str, password: str, user_agent: str | None
) -> tuple[User, TokenPair]:
    phone = await _consume_verify_token(redis, verification_token, "reset")
    user = await user_service.get_by_phone(db, phone)
    if user is None:
        raise AuthError("No account uses this number.", 404)
    if not user.is_active:
        raise AuthError("This account is suspended. Contact support.", 403)
    _set_password(user, password)
    user.phone_verified_at = user.phone_verified_at or datetime.now(UTC)
    user.last_login_at = datetime.now(UTC)
    await revoke_all_sessions(db, user.id)  # log out every other phone
    await _clear_login_failures(redis, phone)
    tokens = await issue_tokens(db, user, user_agent)
    await db.commit()
    await db.refresh(user)
    logger.info("Password reset for %s — all other sessions logged out", phone)
    return user, tokens


async def change_password(
    db: AsyncSession, redis: Redis, user: User, current: str, new: str, client_ip: str, user_agent: str | None
) -> TokenPair:
    await _check_not_locked(redis, user.phone, client_ip)
    if not verify_password(current, user.password_hash):
        remaining = await _record_failed_login(redis, user.phone, client_ip)
        if remaining <= 0:
            raise AuthError("Too many wrong passwords. Try again later.", 429, settings.LOGIN_LOCK_MINUTES * 60)
        raise AuthError("Current password is incorrect", 400)
    await _clear_login_failures(redis, user.phone)
    _set_password(user, new)
    await revoke_all_sessions(db, user.id)
    tokens = await issue_tokens(db, user, user_agent)
    await db.commit()
    return tokens


# ---------- Tokens ----------

async def issue_tokens(db: AsyncSession, user: User, user_agent: str | None) -> TokenPair:
    expires_at = datetime.now(UTC) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    row = RefreshToken(user_id=user.id, expires_at=expires_at, user_agent=(user_agent or "")[:255])
    db.add(row)
    await db.flush()
    return TokenPair(
        access_token=create_access_token(
            user.id, user.role.value, password_version(user.password_changed_at)
        ),
        refresh_token=create_refresh_token(user.id, row.jti, expires_at),
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


async def revoke_all_sessions(db: AsyncSession, user_id: uuid.UUID) -> None:
    """Logs a user out on every device (used by password reset/change and by moderators)."""
    await db.execute(
        update(RefreshToken)
        .where(RefreshToken.user_id == user_id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=datetime.now(UTC))
    )


async def _load_refresh_row(db: AsyncSession, refresh_token: str) -> RefreshToken:
    try:
        payload = decode_token(refresh_token, expected_type="refresh")
        jti = uuid.UUID(payload["jti"])
    except (TokenError, KeyError, ValueError):
        raise AuthError("Invalid refresh token", 401) from None
    row = await db.get(RefreshToken, jti, with_for_update=True)
    if row is None:
        raise AuthError("Invalid refresh token", 401)
    return row


async def rotate_refresh_token(db: AsyncSession, refresh_token: str, user_agent: str | None) -> TokenPair:
    """Each refresh token works exactly once. Reusing an old one means it was probably
    stolen, so every session for that user is logged out."""
    row = await _load_refresh_row(db, refresh_token)

    if row.revoked_at is not None:
        await revoke_all_sessions(db, row.user_id)
        await db.commit()
        logger.warning("Refresh token reuse detected for user %s — all sessions revoked", row.user_id)
        raise AuthError("Session expired. Please log in again.", 401)

    user = await db.get(User, row.user_id)
    if user is None or not user.is_active:
        raise AuthError("Invalid refresh token", 401)

    row.revoked_at = datetime.now(UTC)
    tokens = await issue_tokens(db, user, user_agent)
    await db.commit()
    return tokens


async def logout(db: AsyncSession, refresh_token: str, everywhere: bool = False) -> None:
    try:
        row = await _load_refresh_row(db, refresh_token)
    except AuthError:
        return  # logging out with a bad token is a no-op
    if everywhere:
        await revoke_all_sessions(db, row.user_id)
    elif row.revoked_at is None:
        row.revoked_at = datetime.now(UTC)
    await db.commit()
