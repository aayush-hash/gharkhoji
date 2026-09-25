"""Sending SMS: prints to the console in development, uses a Nepali SMS gateway in production.

Choose with SMS_PROVIDER in backend/.env:
    console  → prints "📱 SMS to …" in the API logs (development only)
    sparrow  → Sparrow SMS  (https://sparrowsms.com)   needs SPARROW_TOKEN and SPARROW_FROM
    aakash   → Aakash SMS   (https://aakashsms.com)    needs AAKASH_TOKEN

Both gateways accept 10-digit Nepali numbers (98XXXXXXXX). A failed send raises SmsError;
the caller tells the user to try again. The message text and token are never logged.
"""
import logging

import httpx

from app.core.config import settings

logger = logging.getLogger("gharkhoji.sms")


class SmsError(Exception):
    """The SMS could not be handed to the gateway."""


def _local_number(phone: str) -> str:
    """+9779812345678 → 9812345678"""
    digits = "".join(ch for ch in phone if ch.isdigit())
    return digits[-10:]


def _masked(phone: str) -> str:
    n = _local_number(phone)
    return f"{n[:3]}****{n[-3:]}"


async def _post(url: str, data: dict, *, transport: httpx.AsyncBaseTransport | None = None) -> httpx.Response:
    async with httpx.AsyncClient(timeout=settings.SMS_TIMEOUT_SECONDS, transport=transport) as client:
        return await client.post(url, data=data)


async def _send_sparrow(phone: str, text: str, transport=None) -> None:
    r = await _post(settings.SPARROW_API_URL, {
        "token": settings.SPARROW_TOKEN, "from": settings.SPARROW_FROM, "to": _local_number(phone), "text": text,
    }, transport=transport)
    body = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
    if r.status_code != 200 or body.get("response_code") != 200:
        raise SmsError(f"Sparrow SMS refused ({r.status_code}): {body.get('response_code')} {body.get('response')}")


async def _send_aakash(phone: str, text: str, transport=None) -> None:
    r = await _post(settings.AAKASH_API_URL, {
        "auth_token": settings.AAKASH_TOKEN, "to": _local_number(phone), "text": text,
    }, transport=transport)
    body = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
    if r.status_code != 200 or body.get("error") is not False:
        raise SmsError(f"Aakash SMS refused ({r.status_code}): {body.get('message')}")
    if body.get("data", {}).get("invalid"):
        raise SmsError("Aakash SMS rejected the number")


async def send_sms(phone: str, text: str, *, transport: httpx.AsyncBaseTransport | None = None) -> None:
    provider = settings.SMS_PROVIDER
    if provider == "console":
        if settings.is_production:
            raise SmsError("SMS_PROVIDER=console is not allowed in production")
        logger.warning("📱 SMS to %s: %s", phone, text)
        return
    try:
        if provider == "sparrow":
            await _send_sparrow(phone, text, transport)
        elif provider == "aakash":
            await _send_aakash(phone, text, transport)
        else:  # pragma: no cover - settings validation prevents this
            raise SmsError(f"Unknown SMS provider {provider}")
    except httpx.HTTPError as exc:
        logger.error("SMS to %s failed: network error %s", _masked(phone), type(exc).__name__)
        raise SmsError("SMS gateway unreachable") from exc
    except SmsError as exc:
        logger.error("SMS to %s failed: %s", _masked(phone), exc)
        raise
    logger.info("SMS sent to %s via %s", _masked(phone), provider)
