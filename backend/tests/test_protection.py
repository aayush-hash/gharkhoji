"""Security headers, request size limits, rate limits and production settings checks."""
import pytest

from app.core.config import Settings, settings

API = "/api/v1"


async def test_security_headers_on_api(client):
    r = await client.get(f"{API}/search/places")
    assert r.headers["x-content-type-options"] == "nosniff"
    assert r.headers["x-frame-options"] == "DENY"
    assert r.headers["referrer-policy"] == "no-referrer"
    assert "default-src 'none'" in r.headers["content-security-policy"]
    assert "strict-transport-security" not in r.headers  # HTTPS-only header, production only


async def test_admin_page_has_its_own_strict_csp(client):
    r = await client.get("/admin")
    assert r.status_code == 200 and "GharKhoji Admin" in r.text
    csp = r.headers["content-security-policy"]
    assert "script-src 'self'" in csp and "frame-ancestors 'none'" in csp
    assert r.headers["x-robots-tag"] == "noindex, nofollow"
    assert (await client.get("/admin/app.js")).status_code == 200


async def test_large_json_body_rejected(client, login):
    tokens = await login()
    big = "x" * (settings.MAX_BODY_BYTES + 10)
    r = await client.patch(f"{API}/users/me", headers={"Authorization": f"Bearer {tokens['access_token']}"},
                           json={"full_name": big})
    assert r.status_code == 413


async def test_rate_limit_per_user(client, login, monkeypatch):
    tokens = await login()
    monkeypatch.setattr(settings, "RATE_LIMIT_USER_PER_MINUTE", 5)
    headers = {"Authorization": f"Bearer {tokens['access_token']}"}
    codes = [(await client.get(f"{API}/users/me", headers=headers)).status_code for _ in range(7)]
    assert codes[:5] == [200] * 5 and codes[5:] == [429, 429]
    r = await client.get(f"{API}/users/me", headers=headers)
    assert int(r.headers["retry-after"]) <= 60
    assert r.headers["x-content-type-options"] == "nosniff"  # blocked responses are protected too


async def test_rate_limit_per_ip_for_guests(client, monkeypatch):
    monkeypatch.setattr(settings, "RATE_LIMIT_IP_PER_MINUTE", 3)
    codes = [(await client.get(f"{API}/search/places")).status_code for _ in range(4)]
    assert codes == [200, 200, 200, 429]
    # Health checks are never limited (the server monitor must always get through)
    assert (await client.get("/health")).status_code == 200


async def test_fake_token_does_not_get_user_limit(client, monkeypatch):
    """A made-up token is treated as a guest, so attackers can't dodge the IP limit."""
    monkeypatch.setattr(settings, "RATE_LIMIT_IP_PER_MINUTE", 2)
    headers = {"Authorization": "Bearer not-a-real-token"}
    codes = [(await client.get(f"{API}/search/places", headers=headers)).status_code for _ in range(3)]
    assert codes[-1] == 429


def prod(**overrides) -> dict:
    base = dict(
        SECRET_KEY="k" * 48, ENVIRONMENT="production", SMS_PROVIDER="aakash", AAKASH_TOKEN="t",
        DATABASE_URL="postgresql+asyncpg://gharkhoji_app:long-random@db/gharkhoji",
        REDIS_URL="redis://:long-random@redis:6379/0", CORS_ORIGINS=["https://gharkhoji.com"],
        ALLOWED_HOSTS=["api.gharkhoji.com"], PUBLIC_BASE_URL="https://api.gharkhoji.com",
    )
    return {**base, **overrides}


def test_valid_production_settings():
    assert Settings(**prod()).is_production


@pytest.mark.parametrize("bad", [
    {"CORS_ORIGINS": ["*"]},
    {"ALLOWED_HOSTS": ["*"]},
    {"PUBLIC_BASE_URL": "http://api.gharkhoji.com"},
    {"SMS_PROVIDER": "console"},
    {"DATABASE_URL": "postgresql+asyncpg://postgres:postgres@db/gharkhoji"},
    {"REDIS_URL": "redis://redis:6379/0"},
    {"SECRET_KEY": "change-me-" + "x" * 40},
])
def test_unsafe_production_settings_refused(bad):
    with pytest.raises(ValueError):
        Settings(**prod(**bad))
