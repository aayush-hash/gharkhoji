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


async def test_profile_update_name_and_language(client, register):
    tokens = await register(role="owner")
    r = await client.patch(
        "/api/v1/users/me", headers=auth(tokens), json={"full_name": "  Ram Bahadur  ", "language": "ne"}
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["full_name"] == "Ram Bahadur"
    assert body["language"] == "ne"
    assert body["role"] == "owner"
    assert body["has_password"] is True
    assert "password_hash" not in body  # never leaves the server


async def test_cannot_make_self_admin(client, login):
    tokens = await login()
    r = await client.patch("/api/v1/users/me", headers=auth(tokens), json={"role": "admin"})
    assert r.status_code == 422


async def test_role_locked_after_signup(client, register):
    tokens = await register(role="agent")
    r = await client.patch("/api/v1/users/me", headers=auth(tokens), json={"role": "owner"})
    assert r.status_code == 409
    # Changing language is still fine
    r = await client.patch("/api/v1/users/me", headers=auth(tokens), json={"language": "ne"})
    assert r.status_code == 200
