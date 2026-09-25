"""Saved rooms (♥)."""
from tests.test_listings import API, published_listing


async def test_save_list_unsave(client, make_user):
    owner = await make_user("owner")
    tenant = await make_user("tenant")
    listing = await published_listing(client, owner["headers"])

    r = await client.put(f"{API}/favorites/{listing['id']}", headers=tenant["headers"])
    assert r.status_code == 204
    r = await client.put(f"{API}/favorites/{listing['id']}", headers=tenant["headers"])  # idempotent
    assert r.status_code == 204

    ids = (await client.get(f"{API}/favorites/ids", headers=tenant["headers"])).json()
    assert ids == [listing["id"]]
    saved = (await client.get(f"{API}/favorites", headers=tenant["headers"])).json()
    assert [s["id"] for s in saved] == [listing["id"]]
    assert saved[0]["cover_photo_url"]

    r = await client.delete(f"{API}/favorites/{listing['id']}", headers=tenant["headers"])
    assert r.status_code == 204
    assert (await client.get(f"{API}/favorites/ids", headers=tenant["headers"])).json() == []


async def test_saved_rented_room_shows_status(client, make_user):
    owner = await make_user("owner")
    tenant = await make_user("tenant")
    listing = await published_listing(client, owner["headers"])
    await client.put(f"{API}/favorites/{listing['id']}", headers=tenant["headers"])
    await client.post(f"{API}/listings/{listing['id']}/mark-rented", headers=owner["headers"])
    saved = (await client.get(f"{API}/favorites", headers=tenant["headers"])).json()
    assert saved[0]["status"] == "rented"


async def test_cannot_save_draft_or_missing(client, make_user):
    tenant = await make_user("tenant")
    r = await client.put(f"{API}/favorites/00000000-0000-0000-0000-000000000000", headers=tenant["headers"])
    assert r.status_code == 404


async def test_favorites_need_login(client):
    assert (await client.get(f"{API}/favorites")).status_code == 401
