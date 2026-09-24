"""Phone-OTP login and refresh-token rotation.

Redis keys (all expire on their own):
  otp:code:{phone}      hashed code, TTL = OTP_TTL_SECONDS
  otp:tries:{phone}     wrong attempts for the current code
  otp:cooldown:{phone}  blocks resending for OTP_RESEND_COOLDOWN_SECONDS
  otp:hour:{phone}      codes sent this hour
  otp:hour-ip:{ip}      codes sent from this IP this hour
"""
import logging
import uuid
from datetime import UTC, datetime, timedelta

from redis.asyncio import Redis
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import (
    TokenError,
    create_access_token,
    create_refresh_token,
    decode_token,
    generate_otp,
    hash_otp,
    verify_otp_hash,
)
from app.modules.auth.models import RefreshToken
from app.modules.auth.schemas import TokenPair
from app.modules.users import service as user_service
from app.modules.users.models import User

logger = logging.getLogger("gharkhoji.auth")


class AuthError(Exception):
    def __init__(self, message: str, status_code: int = 400, retry_after: int | None = None):
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.retry_after = retry_after


# ---------- OTP ----------

async def _hit_hourly_limit(redis: Redis, key: str, limit: int) -> bool:
    count = await redis.incr(key)
    if count == 1:
        await redis.expire(key, 3600)
    return count > limit


async def send_sms(phone: str, message: str) -> None:
    """Day 1: print to the console. Later: call Sparrow SMS / Aakash SMS here."""
    if settings.is_production:
        raise NotImplementedError("Configure an SMS provider before going to production")
    logger.warning("📱 SMS to %s: %s", phone, message)


async def request_otp(redis: Redis, phone: str, client_ip: str) -> None:
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
        pipe.set(f"otp:code:{phone}", hash_otp(phone, code), ex=settings.OTP_TTL_SECONDS)
        pipe.delete(f"otp:tries:{phone}")
        pipe.set(cooldown_key, "1", ex=settings.OTP_RESEND_COOLDOWN_SECONDS)
        await pipe.execute()

    minutes = settings.OTP_TTL_SECONDS // 60
    await send_sms(phone, f"Your GharKhoji code is {code}. Valid for {minutes} minutes. Don't share it.")


async def check_otp(redis: Redis, phone: str, code: str) -> None:
    code_key, tries_key = f"otp:code:{phone}", f"otp:tries:{phone}"
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


# ---------- Tokens ----------

async def issue_tokens(db: AsyncSession, user: User, user_agent: str | None) -> TokenPair:
    expires_at = datetime.now(UTC) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    row = RefreshToken(user_id=user.id, expires_at=expires_at, user_agent=(user_agent or "")[:255])
    db.add(row)
    await db.flush()
    return TokenPair(
        access_token=create_access_token(user.id, user.role.value),
        refresh_token=create_refresh_token(user.id, row.jti, expires_at),
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


async def login_with_otp(
    db: AsyncSession, redis: Redis, phone: str, code: str, user_agent: str | None
) -> tuple[User, bool, TokenPair]:
    await check_otp(redis, phone, code)
    user, created = await user_service.get_or_create_by_phone(db, phone)
    if not user.is_active:
        raise AuthError("This account is suspended. Contact support.", 403)
    tokens = await issue_tokens(db, user, user_agent)
    await db.commit()
    await db.refresh(user)
    return user, created, tokens


async def _revoke_all(db: AsyncSession, user_id: uuid.UUID) -> None:
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
        await _revoke_all(db, row.user_id)
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
        await _revoke_all(db, row.user_id)
    elif row.revoked_at is None:
        row.revoked_at = datetime.now(UTC)
    await db.commit()
