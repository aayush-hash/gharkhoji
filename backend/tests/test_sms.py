"""SMS gateways — real HTTP calls are replaced by a fake transport, so no SMS is ever sent."""
from urllib.parse import parse_qs

import httpx
import pytest

from app.core import sms
from app.core.config import settings


def fake_gateway(status: int, body: dict, seen: list):
    def handler(request: httpx.Request) -> httpx.Response:
        seen.append({"url": str(request.url), **{k: v[0] for k, v in parse_qs(request.content.decode()).items()}})
        return httpx.Response(status, json=body)
    return httpx.MockTransport(handler)


@pytest.fixture
def sparrow(monkeypatch):
    monkeypatch.setattr(settings, "SMS_PROVIDER", "sparrow")
    monkeypatch.setattr(settings, "SPARROW_TOKEN", "tok123")
    monkeypatch.setattr(settings, "SPARROW_FROM", "GharKhoji")


@pytest.fixture
def aakash(monkeypatch):
    monkeypatch.setattr(settings, "SMS_PROVIDER", "aakash")
    monkeypatch.setattr(settings, "AAKASH_TOKEN", "ak-tok")


async def test_sparrow_success(sparrow):
    seen: list = []
    ok = {"count": 1, "response_code": 200, "response": "1 mesages has been queued for delivery"}
    await sms.send_sms("+9779812345678", "Your code is 123456", transport=fake_gateway(200, ok, seen))
    assert seen == [{"url": settings.SPARROW_API_URL, "token": "tok123", "from": "GharKhoji",
                     "to": "9812345678", "text": "Your code is 123456"}]


async def test_sparrow_error(sparrow):
    bad = {"response_code": 1013, "response": "Insufficient credits"}
    with pytest.raises(sms.SmsError):
        await sms.send_sms("+9779812345678", "hi", transport=fake_gateway(403, bad, []))


async def test_aakash_success_and_errors(aakash):
    seen: list = []
    ok = {"error": False, "message": "1 messages has been queued for delivery.", "data": {"valid": [{}], "invalid": []}}
    await sms.send_sms("+9779812345678", "hello", transport=fake_gateway(200, ok, seen))
    assert seen[0]["auth_token"] == "ak-tok" and seen[0]["to"] == "9812345678"

    for body in ({"error": True, "message": "Not enough balance", "data": []},
                 {"error": False, "message": "", "data": {"valid": [], "invalid": [{"mobile": "98"}]}}):
        with pytest.raises(sms.SmsError):
            await sms.send_sms("+9779812345678", "hello", transport=fake_gateway(200, body, []))


async def test_network_failure_becomes_sms_error(sparrow):
    def boom(request):
        raise httpx.ConnectTimeout("timeout")
    with pytest.raises(sms.SmsError):
        await sms.send_sms("+9779812345678", "hi", transport=httpx.MockTransport(boom))


async def test_failed_sms_lets_user_retry_immediately(client, monkeypatch):
    from app.modules.auth import service

    async def broken(phone, message):
        raise sms.SmsError("gateway down")

    monkeypatch.setattr(service, "send_sms", broken)
    r = await client.post("/api/v1/auth/otp/request", json={"phone": "9812345678", "purpose": "signup"})
    assert r.status_code == 503
    assert "try again" in r.json()["detail"]
    # No 60-second cooldown was left behind
    sent: list = []

    async def working(phone, message):
        sent.append(message)

    monkeypatch.setattr(service, "send_sms", working)
    r = await client.post("/api/v1/auth/otp/request", json={"phone": "9812345678", "purpose": "signup"})
    assert r.status_code == 200 and len(sent) == 1


def test_settings_require_credentials():
    from app.core.config import Settings

    with pytest.raises(ValueError):
        Settings(SECRET_KEY="x" * 40, SMS_PROVIDER="sparrow")
    with pytest.raises(ValueError):
        Settings(SECRET_KEY="x" * 40, SMS_PROVIDER="aakash")
    with pytest.raises(ValueError):
        Settings(SECRET_KEY="x" * 40, ENVIRONMENT="production")  # console SMS not allowed


async def test_message_text_never_logged(sparrow, caplog):
    bad = {"response_code": 1002, "response": "Invalid token"}
    with pytest.raises(sms.SmsError):
        await sms.send_sms("+9779812345678", "code 987654", transport=fake_gateway(403, bad, []))
    # Only a masked number, never the code, full number or token
    assert "981****678" in caplog.text
    assert "987654" not in caplog.text and "9812345678" not in caplog.text and "tok123" not in caplog.text
