"""Reports, the admin API, suspensions and listing removal."""
import pytest
from sqlalchemy import update

from app.core.database import SessionLocal
from app.core.redis import redis_client
from app.modules.users.models import User, UserRole
from tests.conftest import TEST_PASSWORD
from tests.test_chat import setup_chat
from tests.test_listings import API, published_listing


async def make_admin(make_user) -> dict:
    admin = await make_user("tenant", "Admin Person")
    async with SessionLocal() as db:
        await db.execute(update(User).where(User.phone == admin["user"]["phone"]).values(role=UserRole.ADMIN))
        await db.commit()
    return admin


async def room_with_report(client, make_user, reason="fake"):
    owner = await make_user("owner", "Ram Owner")
    tenant = await make_user("tenant", "Sita Tenant")
    listing = await published_listing(client, owner["headers"])
    r = await client.post(f"{API}/reports/listings/{listing['id']}", headers=tenant["headers"],
                          json={"reason": reason, "details": "  Photos   are from the internet  "})
    assert r.status_code == 201, r.text
    return owner, tenant, listing


def in_search(results: dict, listing_id: str) -> bool:
    return any(item["id"] == listing_id for item in results["items"])


async def search(client):
    return (await client.get(f"{API}/search/listings", params={"place": "koteshwor", "radius_km": 20})).json()


# ---------- reporting ----------

async def test_report_listing_rules(client, make_user):
    owner, tenant, listing = await room_with_report(client, make_user)
    url = f"{API}/reports/listings/{listing['id']}"
    # Same person again → already reported
    assert (await client.post(url, headers=tenant["headers"], json={"reason": "scam"})).status_code == 409
    # Can't report your own room
    assert (await client.post(url, headers=owner["headers"], json={"reason": "fake"})).status_code == 400
    # Needs login, a known reason, and an existing room
    assert (await client.post(url, json={"reason": "fake"})).status_code == 401
    assert (await client.post(url, headers=tenant["headers"], json={"reason": "ugly"})).status_code == 422
    missing = f"{API}/reports/listings/00000000-0000-0000-0000-000000000000"
    assert (await client.post(missing, headers=tenant["headers"], json={"reason": "fake"})).status_code == 404


async def test_report_rate_limit(client, make_user, monkeypatch):
    from app.core.config import settings

    monkeypatch.setattr(settings, "REPORTS_PER_DAY", 2)
    owner = await make_user("owner")
    tenant = await make_user("tenant")
    rooms = [await published_listing(client, owner["headers"]) for _ in range(3)]
    codes = [(await client.post(f"{API}/reports/listings/{r['id']}", headers=tenant["headers"],
                                json={"reason": "fake"})).status_code for r in rooms]
    assert codes == [201, 201, 429]


# ---------- admin access ----------

@pytest.mark.parametrize("path", ["/admin/stats", "/admin/reports", "/admin/users", "/admin/listings", "/admin/audit"])
async def test_admin_api_is_admin_only(client, make_user, path):
    assert (await client.get(f"{API}{path}")).status_code == 401
    owner = await make_user("owner")
    assert (await client.get(f"{API}{path}", headers=owner["headers"])).status_code == 403


async def test_admin_stats_and_queue(client, make_user):
    owner, tenant, listing = await room_with_report(client, make_user)
    admin = await make_admin(make_user)
    stats = (await client.get(f"{API}/admin/stats", headers=admin["headers"])).json()
    assert stats["open_listing_reports"] == 1 and stats["active_listings"] == 1

    queue = (await client.get(f"{API}/admin/reports", headers=admin["headers"])).json()
    assert len(queue) == 1
    item = queue[0]
    assert item["kind"] == "listing" and item["reason"] == "fake"
    assert item["details"] == "Photos are from the internet"
    assert item["listing_id"] == listing["id"] and item["open_reports_on_listing"] == 1
    assert item["reporter"]["name"] == "Sita Tenant" and item["reported_user"]["name"] == "Ram Owner"


# ---------- actions ----------

async def test_remove_listing_from_report_then_restore(client, make_user):
    owner, tenant, listing = await room_with_report(client, make_user)
    admin = await make_admin(make_user)
    report = (await client.get(f"{API}/admin/reports", headers=admin["headers"])).json()[0]

    r = await client.post(f"{API}/admin/reports/listing/{report['id']}/resolve", headers=admin["headers"],
                          json={"action": "remove_listing", "note": "Fake photos"})
    assert r.status_code == 204
    # Gone for everyone: search, detail, owner's list
    assert not in_search(await search(client), listing["id"])
    assert (await client.get(f"{API}/listings/{listing['id']}")).status_code == 404
    mine = (await client.get(f"{API}/listings/mine", headers=owner["headers"])).json()
    assert all(m["id"] != listing["id"] for m in mine)
    # Owner can't bring it back themselves
    r = await client.post(f"{API}/listings/{listing['id']}/confirm-available", headers=owner["headers"])
    assert r.status_code == 404
    # Report is closed; handling it twice fails
    assert (await client.get(f"{API}/admin/reports", headers=admin["headers"])).json() == []
    closed = (await client.get(f"{API}/admin/reports?state=closed", headers=admin["headers"])).json()
    assert closed[0]["resolution"] == "listing_removed"
    r = await client.post(f"{API}/admin/reports/listing/{report['id']}/resolve", headers=admin["headers"],
                          json={"action": "dismiss"})
    assert r.status_code == 409

    # Moderator restores it
    r = await client.post(f"{API}/admin/listings/{listing['id']}/restore", headers=admin["headers"], json={})
    assert r.status_code == 204
    assert in_search(await search(client), listing["id"])
    audit = (await client.get(f"{API}/admin/audit", headers=admin["headers"])).json()
    assert [a["action"] for a in audit][:2] == ["restore_listing", "remove_listing"]
    assert audit[1]["note"] == "Fake photos" and audit[1]["admin"] == "Admin Person"


async def test_dismiss_keeps_listing(client, make_user):
    _, _, listing = await room_with_report(client, make_user)
    admin = await make_admin(make_user)
    report = (await client.get(f"{API}/admin/reports", headers=admin["headers"])).json()[0]
    r = await client.post(f"{API}/admin/reports/listing/{report['id']}/resolve", headers=admin["headers"],
                          json={"action": "dismiss"})
    assert r.status_code == 204
    assert in_search(await search(client), listing["id"])


async def test_suspend_owner_from_report(client, make_user):
    owner, _, listing = await room_with_report(client, make_user, reason="scam")
    admin = await make_admin(make_user)
    report = (await client.get(f"{API}/admin/reports", headers=admin["headers"])).json()[0]
    r = await client.post(f"{API}/admin/reports/listing/{report['id']}/resolve", headers=admin["headers"],
                          json={"action": "suspend_user", "note": "Asked for advance payment"})
    assert r.status_code == 204

    phone = owner["user"]["phone"]
    # Logged out everywhere and can't log back in
    assert (await client.get(f"{API}/users/me", headers=owner["headers"])).status_code == 401
    r = await client.post(f"{API}/auth/login", json={"phone": phone, "password": TEST_PASSWORD})
    assert r.status_code == 403
    # Their rooms disappear
    assert not in_search(await search(client), listing["id"])
    assert (await client.get(f"{API}/listings/{listing['id']}")).status_code == 404

    users = (await client.get(f"{API}/admin/users?state=suspended", headers=admin["headers"])).json()
    assert [u["phone"] for u in users] == [phone]
    assert users[0]["reports_against"] == 1 and users[0]["listings"] == 1

    # Unsuspend → everything comes back
    r = await client.post(f"{API}/admin/users/{users[0]['id']}/unsuspend", headers=admin["headers"], json={})
    assert r.status_code == 204
    await redis_client.delete(f"login:fails:{phone}")
    r = await client.post(f"{API}/auth/login", json={"phone": phone, "password": TEST_PASSWORD})
    assert r.status_code == 200
    assert in_search(await search(client), listing["id"])


async def test_chat_report_in_queue_and_suspend(client, make_user):
    owner, tenant, _, conv = await setup_chat(client, make_user)
    await client.post(f"{API}/chats/{conv['id']}/messages", headers=owner["headers"],
                      json={"body": "Send Rs 5000 advance on eSewa first"})
    r = await client.post(f"{API}/chats/{conv['id']}/report", headers=tenant["headers"], json={"reason": "scam"})
    assert r.status_code in (200, 201, 204), r.text
    admin = await make_admin(make_user)
    queue = (await client.get(f"{API}/admin/reports", headers=admin["headers"])).json()
    chat = next(i for i in queue if i["kind"] == "chat")
    assert chat["reported_user"]["name"] == "Ram Owner"
    assert chat["recent_messages"][-1] == {**chat["recent_messages"][-1], "from": "reported",
                                           "body": "Send Rs 5000 advance on eSewa first"}
    # Chat reports can't "remove listing"
    r = await client.post(f"{API}/admin/reports/chat/{chat['id']}/resolve", headers=admin["headers"],
                          json={"action": "remove_listing"})
    assert r.status_code == 400
    r = await client.post(f"{API}/admin/reports/chat/{chat['id']}/resolve", headers=admin["headers"],
                          json={"action": "suspend_user"})
    assert r.status_code == 204
    assert (await client.get(f"{API}/users/me", headers=owner["headers"])).status_code == 401


async def test_admin_cannot_suspend_self_or_other_admins(client, make_user):
    admin = await make_admin(make_user)
    other = await make_admin(make_user)
    for target in (admin, other):
        r = await client.post(f"{API}/admin/users/{target['user']['id']}/suspend", headers=admin["headers"], json={})
        assert r.status_code == 400


async def test_admin_listing_search_and_remove(client, make_user):
    owner = await make_user("owner")
    listing = await published_listing(client, owner["headers"])
    admin = await make_admin(make_user)
    found = (await client.get(f"{API}/admin/listings", params={"q": listing["title"][:6]},
                              headers=admin["headers"])).json()
    assert any(item["id"] == listing["id"] for item in found)
    r = await client.post(f"{API}/admin/listings/{listing['id']}/remove", headers=admin["headers"],
                          json={"note": "Duplicate listing"})
    assert r.status_code == 204
    r = await client.post(f"{API}/admin/listings/{listing['id']}/remove", headers=admin["headers"], json={})
    assert r.status_code == 409
    removed = (await client.get(f"{API}/admin/listings?state=removed", headers=admin["headers"])).json()
    assert removed[0]["moderation_reason"] == "Duplicate listing"
