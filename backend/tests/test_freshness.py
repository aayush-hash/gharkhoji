"""Day 4: freshness worker (remind at 48h, expire at 72h) and push tokens."""
import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select, update

from app.core.database import SessionLocal
from app.modules.listings.models import Listing
from app.modules.notifications.models import PushToken
from app.workers import availability
from tests.test_listings import API, published_listing

TOKEN = "ExponentPushToken[abcdefghijklmnopqrstuv]"


@pytest.fixture
def sent(monkeypatch):
    """Capture notifications instead of calling Expo's servers."""
    captured: list[tuple[uuid.UUID, availability.Notification]] = []

    async def fake_send(db, user_id, note):
        captured.append((user_id, note))
        return 1

    monkeypatch.setattr(availability, "send_to_user", fake_send)
    return captured


async def set_confirmed_hours_ago(listing_id: str, hours: float) -> None:
    async with SessionLocal() as db:
        await db.execute(
            update(Listing)
            .where(Listing.id == uuid.UUID(listing_id))
            .values(last_confirmed_at=datetime.now(UTC) - timedelta(hours=hours))
        )
        await db.commit()


async def run_cycle(now: datetime | None = None):
    async with SessionLocal() as db:
        return await availability.run_cycle(db, now)


async def test_fresh_listing_is_left_alone(client, make_user, sent):
    owner = await make_user("owner")
    await published_listing(client, owner["headers"])
    result = await run_cycle()
    assert (result.expired, result.reminded) == (0, 0)
    assert sent == []


async def test_reminder_after_48_hours(client, make_user, sent):
    owner = await make_user("owner")
    listing = await published_listing(client, owner["headers"])
    await set_confirmed_hours_ago(listing["id"], 50)

    result = await run_cycle()
    assert result.reminded == 1
    assert sent[0][1].data == {"type": "confirm_availability", "listing_id": listing["id"]}
    assert str(sent[0][0]) == owner["user"]["id"]

    # Still visible in search, but the owner's app shows "needs confirmation"
    r = await client.get(f"{API}/search/listings")
    assert r.json()["total"] == 1
    mine = (await client.get(f"{API}/listings/mine", headers=owner["headers"])).json()
    assert mine[0]["needs_confirmation"] is True
    assert mine[0]["status"] == "active"


async def test_reminder_not_repeated_too_often(client, make_user, sent):
    owner = await make_user("owner")
    listing = await published_listing(client, owner["headers"])
    await set_confirmed_hours_ago(listing["id"], 50)

    await run_cycle()
    await run_cycle()  # 10 minutes later: no spam
    assert len(sent) == 1

    later = datetime.now(UTC) + timedelta(hours=13)  # after REMINDER_REPEAT_HOURS
    await run_cycle(later)
    assert len(sent) >= 2


async def test_expires_after_72_hours_and_hides_from_search(client, make_user, sent):
    owner = await make_user("owner")
    listing = await published_listing(client, owner["headers"])
    await set_confirmed_hours_ago(listing["id"], 73)

    result = await run_cycle()
    assert result.expired == 1
    assert sent[0][1].data["type"] == "listing_expired"

    assert (await client.get(f"{API}/search/listings")).json()["total"] == 0
    assert (await client.get(f"{API}/listings/{listing['id']}")).status_code == 404  # public can't see it
    mine = (await client.get(f"{API}/listings/mine", headers=owner["headers"])).json()
    assert mine[0]["status"] == "expired" and mine[0]["needs_confirmation"] is True


async def test_confirming_brings_expired_listing_back(client, make_user, sent):
    owner = await make_user("owner")
    listing = await published_listing(client, owner["headers"])
    await set_confirmed_hours_ago(listing["id"], 80)
    await run_cycle()

    r = await client.post(f"{API}/listings/{listing['id']}/confirm-available", headers=owner["headers"])
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "active" and body["needs_confirmation"] is False
    assert (await client.get(f"{API}/search/listings")).json()["total"] == 1

    # Reminder counters were reset, so the next cycle does nothing
    sent.clear()
    await run_cycle()
    assert sent == []


async def test_rented_and_draft_listings_are_ignored(client, make_user, sent):
    owner = await make_user("owner")
    rented = await published_listing(client, owner["headers"])
    await client.post(f"{API}/listings/{rented['id']}/mark-rented", headers=owner["headers"])
    await set_confirmed_hours_ago(rented["id"], 100)
    result = await run_cycle()
    assert (result.expired, result.reminded) == (0, 0)


# ---------------- push tokens ----------------

async def test_register_and_remove_push_token(client, make_user):
    owner = await make_user("owner")
    r = await client.post(f"{API}/notifications/push-token", headers=owner["headers"],
                          json={"token": TOKEN, "platform": "ios"})
    assert r.status_code == 204
    # registering again is fine (idempotent)
    r = await client.post(f"{API}/notifications/push-token", headers=owner["headers"], json={"token": TOKEN})
    assert r.status_code == 204
    async with SessionLocal() as db:
        rows = (await db.scalars(select(PushToken))).all()
        assert len(rows) == 1 and str(rows[0].user_id) == owner["user"]["id"]

    r = await client.request(
        "DELETE", f"{API}/notifications/push-token", headers=owner["headers"], json={"token": TOKEN}
    )
    assert r.status_code == 204
    async with SessionLocal() as db:
        assert (await db.scalars(select(PushToken))).all() == []


async def test_token_moves_to_new_account_on_same_phone(client, make_user):
    first = await make_user("owner")
    second = await make_user("tenant")
    await client.post(f"{API}/notifications/push-token", headers=first["headers"], json={"token": TOKEN})
    await client.post(f"{API}/notifications/push-token", headers=second["headers"], json={"token": TOKEN})
    async with SessionLocal() as db:
        rows = (await db.scalars(select(PushToken))).all()
        assert len(rows) == 1 and str(rows[0].user_id) == second["user"]["id"]


async def test_rejects_non_expo_token(client, make_user):
    owner = await make_user("owner")
    r = await client.post(f"{API}/notifications/push-token", headers=owner["headers"], json={"token": "hello"})
    assert r.status_code == 422


async def test_push_token_requires_login(client):
    r = await client.post(f"{API}/notifications/push-token", json={"token": TOKEN})
    assert r.status_code == 401
