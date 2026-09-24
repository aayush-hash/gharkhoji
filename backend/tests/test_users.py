def auth(tokens: dict) -> dict:
    return {"Authorization": f"Bearer {tokens['access_token']}"}


async def test_me_requires_auth(client):
    assert (await client.get("/api/v1/users/me")).status_code == 401
    r = await client.get("/api/v1/users/me", headers={"Authorization": "Bearer garbage"})
    assert r.status_code == 401


async def test_refresh_token_cannot_access_api(client, login):
    tokens = await login()
    r = await client.get("/api/v1/users/me", headers={"Authorization": f"Bearer {tokens['refresh_token']}"})
    assert r.status_code == 401


async def test_onboarding_sets_role_language_name(client, login):
    tokens = await login()
    r = await client.patch(
        "/api/v1/users/me",
        headers=auth(tokens),
        json={"full_name": "  Ram Bahadur  ", "role": "owner", "language": "ne"},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["full_name"] == "Ram Bahadur"
    assert body["role"] == "owner"
    assert body["language"] == "ne"
    assert body["onboarding_completed"] is True

    r = await client.get("/api/v1/users/me", headers=auth(tokens))
    assert r.json()["role"] == "owner"


async def test_cannot_make_self_admin(client, login):
    tokens = await login()
    r = await client.patch("/api/v1/users/me", headers=auth(tokens), json={"role": "admin"})
    assert r.status_code == 422


async def test_role_locked_after_onboarding(client, login):
    tokens = await login()
    await client.patch("/api/v1/users/me", headers=auth(tokens), json={"full_name": "Sita", "role": "agent"})
    r = await client.patch("/api/v1/users/me", headers=auth(tokens), json={"role": "owner"})
    assert r.status_code == 409
    # Changing language is still fine
    r = await client.patch("/api/v1/users/me", headers=auth(tokens), json={"language": "ne"})
    assert r.status_code == 200
