"""Day 2: listings, photos and search."""
import math
from urllib.parse import urlsplit

import pytest

API = "/api/v1"
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 200          # starts like a real PNG
JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 200

BANESHWOR = (27.6915, 85.3420)
KOTESHWOR = (27.6789, 85.3494)   # ~1.6 km from Baneshwor
KALANKI = (27.6935, 85.2810)     # ~6 km from Baneshwor


def listing_body(**overrides) -> dict:
    body = {
        "listing_type": "1bhk",
        "title": "Sunny 1BHK near Baneshwor Chowk",
        "rent": 15000,
        "deposit": 30000,
        "water_charge": 500,
        "waste_charge": 200,
        "internet_charge": 800,
        "parking_charge": 500,
        "amenities": ["water_24h", "bike_parking"],
        "area": "New Baneshwor",
        "landmark": "Near Civil Hospital",
        "lat": BANESHWOR[0],
        "lng": BANESHWOR[1],
    }
    body.update(overrides)
    return body


def meters_between(a: tuple[float, float], b: tuple[float, float]) -> float:
    dlat = (a[0] - b[0]) * 111_320
    dlng = (a[1] - b[1]) * 111_320 * math.cos(math.radians(a[0]))
    return math.hypot(dlat, dlng)


async def create_listing(client, headers, **overrides) -> dict:
    r = await client.post(f"{API}/listings", headers=headers, json=listing_body(**overrides))
    assert r.status_code == 201, r.text
    return r.json()


async def upload_photo(client, headers, listing_id, data=PNG, content_type="image/png") -> dict:
    r = await client.post(
        f"{API}/listings/{listing_id}/photos/upload-url",
        headers=headers,
        json={"content_type": content_type, "size_bytes": len(data)},
    )
    assert r.status_code == 200, r.text
    ticket = r.json()
    r = await client.put(ticket["upload_url"], content=data, headers=ticket["headers"])
    assert r.status_code == 204, r.text
    r = await client.post(f"{API}/listings/{listing_id}/photos/{ticket['photo_id']}/complete", headers=headers)
    assert r.status_code == 200, r.text
    return r.json()


async def published_listing(client, headers, **overrides) -> dict:
    listing = await create_listing(client, headers, **overrides)
    await upload_photo(client, headers, listing["id"])
    r = await client.post(f"{API}/listings/{listing['id']}/publish", headers=headers)
    assert r.status_code == 200, r.text
    return r.json()


# ---------------- create & permissions ----------------

async def test_owner_creates_draft_with_cost_breakdown(client, make_user):
    owner = await make_user("owner")
    listing = await create_listing(client, owner["headers"])
    assert listing["status"] == "draft"
    assert listing["cost"] == {
        "rent": 15000, "water": 500, "waste": 200, "internet": 800, "parking": 500, "total_monthly": 17000,
    }
    assert listing["exact_location"] == {"lat": BANESHWOR[0], "lng": BANESHWOR[1]}
    assert listing["listed_by"]["role"] == "owner"
    assert listing["agent_commission"] is None


async def test_public_location_is_shifted_for_privacy(client, make_user):
    owner = await make_user("owner")
    listing = await create_listing(client, owner["headers"])
    approx = (listing["approx_location"]["lat"], listing["approx_location"]["lng"])
    assert 140 <= meters_between(approx, BANESHWOR) <= 310


async def test_tenant_cannot_create_listing(client, make_user):
    tenant = await make_user("tenant")
    r = await client.post(f"{API}/listings", headers=tenant["headers"], json=listing_body())
    assert r.status_code == 403


async def test_agent_must_state_commission(client, make_user):
    agent = await make_user("agent")
    r = await client.post(f"{API}/listings", headers=agent["headers"], json=listing_body())
    assert r.status_code == 422
    listing = await create_listing(client, agent["headers"], agent_commission=7500)
    assert listing["agent_commission"] == 7500
    assert listing["listed_by"]["role"] == "agent"


async def test_owner_commission_is_ignored(client, make_user):
    owner = await make_user("owner")
    listing = await create_listing(client, owner["headers"], agent_commission=5000)
    assert listing["agent_commission"] is None


@pytest.mark.parametrize(
    "bad",
    [
        {"rent": 50},                      # too low
        {"lat": 28.2, "lng": 83.98},       # Pokhara, outside the valley
        {"amenities": ["swimming_pool"]},  # not a known amenity
        {"listing_type": "castle"},
        {"title": "Hi"},
    ],
)
async def test_validation(client, make_user, bad):
    owner = await make_user("owner")
    r = await client.post(f"{API}/listings", headers=owner["headers"], json=listing_body(**bad))
    assert r.status_code == 422


async def test_only_owner_can_edit(client, make_user):
    owner = await make_user("owner")
    other = await make_user("owner")
    listing = await create_listing(client, owner["headers"])

    r = await client.patch(f"{API}/listings/{listing['id']}", headers=other["headers"], json={"rent": 1000})
    assert r.status_code == 403

    r = await client.patch(f"{API}/listings/{listing['id']}", headers=owner["headers"], json={"rent": 16000})
    assert r.status_code == 200
    assert r.json()["cost"]["rent"] == 16000
    assert r.json()["cost"]["total_monthly"] == 18000


async def test_drafts_are_private(client, make_user):
    owner = await make_user("owner")
    listing = await create_listing(client, owner["headers"])
    assert (await client.get(f"{API}/listings/{listing['id']}")).status_code == 404
    assert (await client.get(f"{API}/listings/{listing['id']}", headers=owner["headers"])).status_code == 200


# ---------------- photos ----------------

async def test_photo_upload_flow_and_file_served(client, make_user):
    owner = await make_user("owner")
    listing = await create_listing(client, owner["headers"])
    updated = await upload_photo(client, owner["headers"], listing["id"])
    assert len(updated["photos"]) == 1
    assert updated["photo_slots_left"] == 7

    url = updated["photos"][0]["url"]
    path = urlsplit(url).path  # works whatever PUBLIC_BASE_URL is
    r = await client.get(path)
    assert r.status_code == 200
    assert r.content == PNG


async def test_upload_rejects_fake_image(client, make_user):
    owner = await make_user("owner")
    listing = await create_listing(client, owner["headers"])
    r = await client.post(
        f"{API}/listings/{listing['id']}/photos/upload-url",
        headers=owner["headers"],
        json={"content_type": "image/jpeg", "size_bytes": 100},
    )
    ticket = r.json()
    r = await client.put(ticket["upload_url"], content=b"<script>alert(1)</script>", headers=ticket["headers"])
    assert r.status_code == 400
    # PNG bytes declared as JPEG are also refused
    r = await client.put(ticket["upload_url"], content=PNG, headers=ticket["headers"])
    assert r.status_code == 400


async def test_upload_link_is_signed(client, make_user):
    r = await client.put(f"{API}/media/local-upload?token=forged", content=PNG, headers={"Content-Type": "image/png"})
    assert r.status_code == 403


async def test_complete_before_upload_fails(client, make_user):
    owner = await make_user("owner")
    listing = await create_listing(client, owner["headers"])
    r = await client.post(
        f"{API}/listings/{listing['id']}/photos/upload-url",
        headers=owner["headers"],
        json={"content_type": "image/png", "size_bytes": 100},
    )
    photo_id = r.json()["photo_id"]
    r = await client.post(f"{API}/listings/{listing['id']}/photos/{photo_id}/complete", headers=owner["headers"])
    assert r.status_code == 409


async def test_max_eight_photos(client, make_user):
    owner = await make_user("owner")
    listing = await create_listing(client, owner["headers"])
    for _ in range(8):
        await upload_photo(client, owner["headers"], listing["id"])
    r = await client.post(
        f"{API}/listings/{listing['id']}/photos/upload-url",
        headers=owner["headers"],
        json={"content_type": "image/png", "size_bytes": 100},
    )
    assert r.status_code == 409


async def test_other_user_cannot_add_photos(client, make_user):
    owner = await make_user("owner")
    other = await make_user("owner")
    listing = await create_listing(client, owner["headers"])
    r = await client.post(
        f"{API}/listings/{listing['id']}/photos/upload-url",
        headers=other["headers"],
        json={"content_type": "image/png", "size_bytes": 100},
    )
    assert r.status_code == 403


async def test_reorder_sets_cover_photo(client, make_user):
    owner = await make_user("owner")
    listing = await create_listing(client, owner["headers"])
    await upload_photo(client, owner["headers"], listing["id"])
    updated = await upload_photo(client, owner["headers"], listing["id"], data=JPEG, content_type="image/jpeg")
    first, second = [p["id"] for p in updated["photos"]]
    r = await client.put(
        f"{API}/listings/{listing['id']}/photos/order", headers=owner["headers"], json={"photo_ids": [second, first]}
    )
    assert r.status_code == 200
    assert [p["id"] for p in r.json()["photos"]] == [second, first]


# ---------------- publish / lifecycle ----------------

async def test_publish_requires_photo(client, make_user):
    owner = await make_user("owner")
    listing = await create_listing(client, owner["headers"])
    r = await client.post(f"{API}/listings/{listing['id']}/publish", headers=owner["headers"])
    assert r.status_code == 422


async def test_publish_makes_listing_public_without_exact_location(client, make_user):
    owner = await make_user("owner")
    listing = await published_listing(client, owner["headers"])
    assert listing["status"] == "active"
    assert listing["last_confirmed_at"] is not None

    r = await client.get(f"{API}/listings/{listing['id']}")  # not logged in
    assert r.status_code == 200
    body = r.json()
    assert "exact_location" not in body
    assert body["approx_location"]["lat"] != BANESHWOR[0]


async def test_cannot_delete_last_photo_of_active_listing(client, make_user):
    owner = await make_user("owner")
    listing = await published_listing(client, owner["headers"])
    photo_id = listing["photos"][0]["id"]
    r = await client.delete(f"{API}/listings/{listing['id']}/photos/{photo_id}", headers=owner["headers"])
    assert r.status_code == 409


async def test_mark_rented_hides_from_search_and_blocks_edits(client, make_user):
    owner = await make_user("owner")
    listing = await published_listing(client, owner["headers"])
    r = await client.post(f"{API}/listings/{listing['id']}/mark-rented", headers=owner["headers"])
    assert r.json()["status"] == "rented"

    r = await client.get(f"{API}/search/listings", params={"place": "new-baneshwor"})
    assert r.json()["total"] == 0
    r = await client.patch(f"{API}/listings/{listing['id']}", headers=owner["headers"], json={"rent": 9000})
    assert r.status_code == 409
    # Owner can list it again when it's free
    r = await client.post(f"{API}/listings/{listing['id']}/publish", headers=owner["headers"])
    assert r.json()["status"] == "active"


async def test_delete_is_soft_and_hides_listing(client, make_user):
    owner = await make_user("owner")
    listing = await published_listing(client, owner["headers"])
    r = await client.delete(f"{API}/listings/{listing['id']}", headers=owner["headers"])
    assert r.status_code == 204
    assert (await client.get(f"{API}/listings/{listing['id']}", headers=owner["headers"])).status_code == 404
    assert (await client.get(f"{API}/listings/mine", headers=owner["headers"])).json() == []


# ---------------- search ----------------

async def test_radius_search(client, make_user):
    owner = await make_user("owner")
    near = await published_listing(client, owner["headers"], title="Room in Koteshwor",
                                   lat=KOTESHWOR[0], lng=KOTESHWOR[1], area="Koteshwor")
    far = await published_listing(client, owner["headers"], title="Room in Kalanki",
                                  lat=KALANKI[0], lng=KALANKI[1], area="Kalanki")

    r = await client.get(f"{API}/search/listings",
                         params={"lat": BANESHWOR[0], "lng": BANESHWOR[1], "radius_km": 2})
    ids = [i["id"] for i in r.json()["items"]]
    assert near["id"] in ids and far["id"] not in ids
    item = r.json()["items"][0]
    assert 1200 < item["distance_m"] < 2000
    assert item["cover_photo_url"]

    r = await client.get(f"{API}/search/listings",
                         params={"lat": BANESHWOR[0], "lng": BANESHWOR[1], "radius_km": 10, "sort": "distance"})
    assert [i["id"] for i in r.json()["items"]] == [near["id"], far["id"]]


async def test_search_by_place_and_filters(client, make_user):
    owner = await make_user("owner")
    cheap = await published_listing(client, owner["headers"], listing_type="room", rent=7000,
                                    amenities=["water_24h"])
    await published_listing(client, owner["headers"], listing_type="2bhk", rent=25000,
                            amenities=["water_24h", "car_parking"])

    r = await client.get(f"{API}/search/listings", params={"place": "koteshwor", "radius_km": 3, "max_rent": 10000})
    assert r.json()["center"]["place"] == "Koteshwor"
    assert [i["id"] for i in r.json()["items"]] == [cheap["id"]]

    r = await client.get(f"{API}/search/listings", params=[("amenity", "water_24h"), ("amenity", "car_parking")])
    assert r.json()["total"] == 1

    r = await client.get(f"{API}/search/listings", params=[("type", "room"), ("type", "1bhk")])
    assert [i["id"] for i in r.json()["items"]] == [cheap["id"]]

    r = await client.get(f"{API}/search/listings", params={"sort": "price_high"})
    assert r.json()["items"][0]["rent"] == 25000


async def test_search_sorts_by_freshness(client, make_user):
    owner = await make_user("owner")
    older = await published_listing(client, owner["headers"], title="Older listing here")
    newer = await published_listing(client, owner["headers"], title="Newer listing here")
    r = await client.get(f"{API}/search/listings")
    assert [i["id"] for i in r.json()["items"]] == [newer["id"], older["id"]]

    # Owner re-confirms the older one → it jumps to the top
    await client.post(f"{API}/listings/{older['id']}/confirm-available", headers=owner["headers"])
    r = await client.get(f"{API}/search/listings")
    assert [i["id"] for i in r.json()["items"]] == [older["id"], newer["id"]]


async def test_search_pagination(client, make_user):
    owner = await make_user("owner")
    for i in range(3):
        await published_listing(client, owner["headers"], title=f"Listing number {i}")
    r = await client.get(f"{API}/search/listings", params={"page_size": 2})
    assert r.json()["total"] == 3 and r.json()["has_more"] is True
    r = await client.get(f"{API}/search/listings", params={"page_size": 2, "page": 2})
    assert len(r.json()["items"]) == 1 and r.json()["has_more"] is False


async def test_search_errors(client):
    assert (await client.get(f"{API}/search/listings", params={"place": "atlantis"})).status_code == 404
    assert (await client.get(f"{API}/search/listings", params={"sort": "distance"})).status_code == 422
    assert (await client.get(f"{API}/search/listings", params={"lat": 27.7})).status_code == 422


async def test_places_endpoint(client):
    r = await client.get(f"{API}/search/places", params={"q": "baneshwor"})
    slugs = [p["slug"] for p in r.json()]
    assert "new-baneshwor" in slugs and "baneshwor-chowk" in slugs
    r = await client.get(f"{API}/search/places", params={"q": "ठमेल"})
    assert r.json()[0]["slug"] == "thamel"


async def test_meta_endpoint(client):
    r = await client.get(f"{API}/listings/meta")
    assert "1bhk" in r.json()["listing_types"]
    assert r.json()["max_photos"] == 8


async def test_upload_judged_by_bytes_not_header(client, make_user):
    """Some phone uploaders change/drop Content-Type; the real check is the file content."""
    owner = await make_user("owner")
    listing = await create_listing(client, owner["headers"])
    r = await client.post(
        f"{API}/listings/{listing['id']}/photos/upload-url",
        headers=owner["headers"],
        json={"content_type": "image/png", "size_bytes": len(PNG)},
    )
    ticket = r.json()
    r = await client.put(ticket["upload_url"], content=PNG, headers={"Content-Type": "application/octet-stream"})
    assert r.status_code == 204


async def test_empty_upload_has_clear_message(client, make_user):
    owner = await make_user("owner")
    listing = await create_listing(client, owner["headers"])
    r = await client.post(
        f"{API}/listings/{listing['id']}/photos/upload-url",
        headers=owner["headers"],
        json={"content_type": "image/jpeg", "size_bytes": 100},
    )
    r = await client.put(r.json()["upload_url"], content=b"", headers={"Content-Type": "image/jpeg"})
    assert r.status_code == 400
    assert "empty" in r.json()["detail"]


async def test_failed_upload_can_be_discarded_to_free_slot(client, make_user):
    owner = await make_user("owner")
    listing = await create_listing(client, owner["headers"])
    r = await client.post(
        f"{API}/listings/{listing['id']}/photos/upload-url",
        headers=owner["headers"],
        json={"content_type": "image/jpeg", "size_bytes": 100},
    )
    photo_id = r.json()["photo_id"]
    r = await client.delete(f"{API}/listings/{listing['id']}/photos/{photo_id}", headers=owner["headers"])
    assert r.status_code == 204
    detail = (await client.get(f"{API}/listings/{listing['id']}", headers=owner["headers"])).json()
    assert detail["photo_slots_left"] == 8
