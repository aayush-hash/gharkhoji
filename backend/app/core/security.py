"""JWT creation/decoding and OTP hashing helpers."""
import hashlib
import hmac
import secrets
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any, Literal

import jwt

from app.core.config import settings

TokenType = Literal["access", "refresh"]


class TokenError(Exception):
    """Raised when a token is missing, expired, malformed or of the wrong type."""


def _create_token(subject: str, token_type: TokenType, expires_delta: timedelta, extra: dict[str, Any]) -> str:
    now = datetime.now(UTC)
    payload = {"sub": subject, "type": token_type, "iat": now, "exp": now + expires_delta, **extra}
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def create_access_token(user_id: uuid.UUID, role: str) -> str:
    return _create_token(
        str(user_id), "access", timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES), {"role": role}
    )


def create_refresh_token(user_id: uuid.UUID, jti: uuid.UUID, expires_at: datetime) -> str:
    return _create_token(str(user_id), "refresh", expires_at - datetime.now(UTC), {"jti": str(jti)})


def decode_token(token: str, expected_type: TokenType) -> dict[str, Any]:
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.JWT_ALGORITHM], leeway=60)
    except jwt.PyJWTError as exc:
        raise TokenError("Invalid or expired token") from exc
    if payload.get("type") != expected_type:
        raise TokenError("Wrong token type")
    return payload


def generate_otp() -> str:
    """Cryptographically secure numeric code, e.g. '048213'."""
    return "".join(secrets.choice("0123456789") for _ in range(settings.OTP_LENGTH))


def hash_otp(phone: str, code: str) -> str:
    """We never store the raw code — only a keyed hash tied to the phone number."""
    return hmac.new(settings.SECRET_KEY.encode(), f"{phone}:{code}".encode(), hashlib.sha256).hexdigest()


def verify_otp_hash(phone: str, code: str, stored_hash: str) -> bool:
    return hmac.compare_digest(hash_otp(phone, code), stored_hash)
