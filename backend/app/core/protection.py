"""Protection that applies to every request (Day 5 security hardening).

1. SecurityHeaders  - browser safety headers on every response (HSTS in production).
2. RequestGuard     - request body size limits + a rate limit on every API call:
     logged-in users: RATE_LIMIT_USER_PER_MINUTE per user
     everyone else:   RATE_LIMIT_IP_PER_MINUTE per IP address (high, because many phones in
                      Nepal share one mobile-network IP)
   Sensitive actions (login, SMS codes, chat, reports) have their own stricter limits too.

Written as plain ASGI middleware: fast, and it leaves the chat WebSocket untouched.
"""
import json
import logging
import time

import jwt

from app.core.config import settings
from app.core.redis import redis_client

logger = logging.getLogger("gharkhoji.protection")

BASE_HEADERS = [
    (b"x-content-type-options", b"nosniff"),
    (b"x-frame-options", b"DENY"),
    (b"referrer-policy", b"no-referrer"),
    (b"permissions-policy", b"camera=(), microphone=(), geolocation=(), payment=()"),
    (b"cross-origin-opener-policy", b"same-origin"),
]
# JSON API responses never need to load anything
API_CSP = (b"content-security-policy", b"default-src 'none'; frame-ancestors 'none'")
HSTS = (b"strict-transport-security", b"max-age=31536000; includeSubDomains")
NO_CSP_PATHS = ("/docs", "/redoc", "/openapi.json")  # Swagger UI loads its own scripts (dev only)


class SecurityHeaders:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        path = scope.get("path", "")

        async def send_with_headers(message):
            if message["type"] == "http.response.start":
                headers = list(message.get("headers", []))
                present = {k.lower() for k, _ in headers}
                for key, value in BASE_HEADERS:
                    if key not in present:
                        headers.append((key, value))
                if b"content-security-policy" not in present and not path.startswith(NO_CSP_PATHS):
                    headers.append(API_CSP)
                if settings.is_production:
                    headers.append(HSTS)
                message["headers"] = headers
            await send(message)

        await self.app(scope, receive, send_with_headers)


def _json_response(status: int, detail: str, extra_headers: list | None = None):
    body = json.dumps({"detail": detail}).encode()
    headers = [(b"content-type", b"application/json"), (b"content-length", str(len(body)).encode())]
    return status, headers + (extra_headers or []), body


async def _reply(send, status: int, detail: str, extra_headers: list | None = None) -> None:
    status, headers, body = _json_response(status, detail, extra_headers)
    await send({"type": "http.response.start", "status": status, "headers": headers})
    await send({"type": "http.response.body", "body": body})


class _TooLarge(Exception):
    pass


class RequestGuard:
    def __init__(self, app):
        self.app = app
        self.api_prefix = settings.API_V1_PREFIX
        self.upload_path = f"{settings.API_V1_PREFIX}/media/local-upload"

    def _identity(self, scope) -> tuple[str, int]:
        """Rate-limit key and limit: the user (if a valid token is sent) or the IP address."""
        for key, value in scope.get("headers", []):
            if key == b"authorization" and value[:7].lower() == b"bearer ":
                try:
                    payload = jwt.decode(value[7:].decode(), settings.SECRET_KEY,
                                         algorithms=[settings.JWT_ALGORITHM], leeway=60)
                    if payload.get("type") == "access":
                        return f"u:{payload['sub']}", settings.RATE_LIMIT_USER_PER_MINUTE
                except (jwt.PyJWTError, KeyError, UnicodeDecodeError):
                    pass
                break
        client = scope.get("client") or ("unknown", 0)
        return f"ip:{client[0]}", settings.RATE_LIMIT_IP_PER_MINUTE

    async def _over_limit(self, ident: str, limit: int) -> int:
        """Returns seconds to wait, or 0 when allowed. Fails open if Redis is down."""
        window = int(time.time() // 60)
        key = f"rl:{ident}:{window}"
        try:
            async with redis_client.pipeline(transaction=False) as pipe:
                pipe.incr(key)
                pipe.expire(key, 70)
                count, _ = await pipe.execute()
        except Exception:  # noqa: BLE001 - never take the API down because Redis blinked
            logger.exception("Rate limiter unavailable")
            return 0
        return 0 if count <= limit else 60 - int(time.time() % 60)

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        path = scope.get("path", "")
        if not path.startswith(self.api_prefix):
            return await self.app(scope, receive, send)  # /health, /admin page, photos

        # ---- body size ----
        max_body = settings.MAX_PHOTO_BYTES + 64 * 1024 if path == self.upload_path else settings.MAX_BODY_BYTES
        for key, value in scope.get("headers", []):
            if key == b"content-length":
                try:
                    if int(value) > max_body:
                        return await _reply(send, 413, "Request is too large")
                except ValueError:
                    return await _reply(send, 400, "Bad Content-Length")

        # ---- rate limit ----
        ident, limit = self._identity(scope)
        wait = await self._over_limit(ident, limit)
        if wait:
            logger.warning("Rate limit hit: %s %s", ident, path)
            return await _reply(send, 429, "Too many requests. Please slow down.",
                                [(b"retry-after", str(wait).encode())])

        # Bodies sent without Content-Length (chunked) are counted as they arrive
        received = 0
        started = False

        async def counted_receive():
            nonlocal received
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > max_body:
                    raise _TooLarge()
            return message

        async def tracking_send(message):
            nonlocal started
            if message["type"] == "http.response.start":
                started = True
            await send(message)

        try:
            await self.app(scope, counted_receive, tracking_send)
        except _TooLarge:
            if not started:
                await _reply(send, 413, "Request is too large")
