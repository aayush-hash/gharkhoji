"""Passwords, JWTs and OTP hashing."""
import hashlib
import hmac
import secrets
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any, Literal

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError

from app.core.config import settings

TokenType = Literal["access", "refresh", "verify"]


class TokenError(Exception):
    """Raised when a token is missing, expired, malformed or of the wrong type."""


# ---------- Passwords ----------
# Argon2id is the current best-practice password hash (winner of the Password Hashing
# Competition, recommended by OWASP). Each hash includes its own random salt, and it is
# deliberately slow and memory-hungry so a leaked database can't be cracked quickly.
_hasher = PasswordHasher()  # argon2id, 64 MiB memory, 3 iterations
# Used when the phone number doesn't exist, so a wrong number takes as long as a wrong
# password. Otherwise attackers could time responses to find out who has an account.
_DUMMY_HASH = _hasher.hash("dummy-password-for-timing-safety")


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password: str, password_hash: str | None) -> bool:
    try:
        return _hasher.verify(password_hash or _DUMMY_HASH, password) and password_hash is not None
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False


def password_needs_rehash(password_hash: str) -> bool:
    """True when the hash was made with older/weaker settings — we upgrade it at next login."""
    return _hasher.check_needs_rehash(password_hash)


# ---------- JWTs ----------

def _create_token(subject: str, token_type: TokenType, expires_delta: timedelta, extra: dict[str, Any]) -> str:
    now = datetime.now(UTC)
    payload = {"sub": subject, "type": token_type, "iat": now, "exp": now + expires_delta, **extra}
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def password_version(changed_at: datetime | None) -> int:
    """Stamped into every access token. Changing the password changes it, which instantly
    invalidates all older tokens."""
    if changed_at is None:
        return 0
    return (changed_at - datetime(1970, 1, 1, tzinfo=UTC)) // timedelta(microseconds=1)  # exact integer


def create_access_token(user_id: uuid.UUID, role: str, pwd_version: int = 0) -> str:
    return _create_token(
        str(user_id), "access", timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
        {"role": role, "pv": pwd_version},
    )


def create_refresh_token(user_id: uuid.UUID, jti: uuid.UUID, expires_at: datetime) -> str:
    return _create_token(str(user_id), "refresh", expires_at - datetime.now(UTC), {"jti": str(jti)})


def create_verify_token(phone: str, purpose: str, jti: str) -> str:
    """Proof that this phone number was verified by SMS code, for one sign-up or password reset."""
    return _create_token(
        phone, "verify", timedelta(seconds=settings.VERIFY_TOKEN_TTL_SECONDS), {"purpose": purpose, "jti": jti}
    )


def decode_token(token: str, expected_type: TokenType) -> dict[str, Any]:
    # leeway=60: tolerate up to 1 minute of clock difference between machines
    # (phones, servers and WSL clocks are never perfectly in sync).
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.JWT_ALGORITHM], leeway=60)
    except jwt.PyJWTError as exc:
        raise TokenError("Invalid or expired token") from exc
    if payload.get("type") != expected_type:
        raise TokenError("Wrong token type")
    return payload


# ---------- OTP ----------

def generate_otp() -> str:
    """Cryptographically secure numeric code, e.g. '048213'."""
    return "".join(secrets.choice("0123456789") for _ in range(settings.OTP_LENGTH))


def hash_otp(phone: str, code: str) -> str:
    """We never store the raw code — only a keyed hash tied to the phone number."""
    return hmac.new(settings.SECRET_KEY.encode(), f"{phone}:{code}".encode(), hashlib.sha256).hexdigest()


def verify_otp_hash(phone: str, code: str, stored_hash: str) -> bool:
    return hmac.compare_digest(hash_otp(phone, code), stored_hash)
