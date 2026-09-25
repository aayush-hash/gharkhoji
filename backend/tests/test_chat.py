"""Chat between room seekers and owners/agents."""
import json
import uuid

import pytest

from app.core.redis import redis_client
from app.modules.chat import realtime
from app.modules.chat.service import looks_like_payment_request
from tests.test_listings import API, published_listing


async def setup_chat(client, make_user, first="Is this room still available?"):
    owner = await make_user("owner", "Ram Owner")
    tenant = await make_user("tenant", "Sita Tenant")
    listing = await published_listing(client, owner["headers"])
    r = await client.post(
        f"{API}/chats", headers=tenant["headers"], json={"listing_id": listing["id"], "body": first}
    )
    assert r.status_code == 201, r.text
    return owner, tenant, listing, r.json()


async def test_start_chat_and_reply(client, make_user):
    owner, tenant, listing, conv = await setup_chat(client, make_user)
    assert conv["my_side"] == "tenant"
    assert conv["other"]["name"] == "Ram Owner"
    assert conv["listing"]["id"] == listing["id"]
    assert conv["last_message_mine"] is True

    # Owner sees it in their inbox with 1 unread
    inbox = (await client.get(f"{API}/chats", headers=owner["headers"])).json()
    assert len(inbox) == 1 and inbox[0]["unread_count"] == 1
    assert inbox[0]["my_side"] == "owner" and inbox[0]["other"]["name"] == "Sita Tenant"
    unread = (await client.get(f"{API}/chats/unread", headers=owner["headers"])).json()
    assert unread == {"unread_conversations": 1, "unread_messages": 1}

    r = await client.post(f"{API}/chats/{conv['id']}/messages", headers=owner["headers"],
                          json={"body": "Yes! Come visit on Saturday."})
    assert r.status_code == 201
    page = (await client.get(f"{API}/chats/{conv['id']}/messages", headers=tenant["headers"])).json()
    assert [m["body"] for m in page["items"]] == ["Yes! Come visit on Saturday.", "Is this room still available?"]
    assert page["has_more"] is False


async def test_second_start_reuses_same_conversation(client, make_user):
    _, tenant, listing, conv = await setup_chat(client, make_user)
    r = await client.post(f"{API}/chats", headers=tenant["headers"],
                          json={"listing_id": listing["id"], "body": "Hello again"})
    assert r.json()["id"] == conv["id"]
    r = await client.get(f"{API}/chats/by-listing/{listing['id']}", headers=tenant["headers"])
    assert r.status_code == 200 and r.json()["id"] == conv["id"]


async def test_read_receipts(client, make_user):
    owner, tenant, _, conv = await setup_chat(client, make_user)
    assert (await client.post(f"{API}/chats/{conv['id']}/read", headers=owner["headers"])).status_code == 204
    inbox = (await client.get(f"{API}/chats", headers=owner["headers"])).json()
    assert inbox[0]["unread_count"] == 0
    # The tenant can now see "Seen"
    mine = (await client.get(f"{API}/chats/{conv['id']}", headers=tenant["headers"])).json()
    assert mine["other_last_read_at"] is not None


async def test_outsiders_cannot_see_or_post(client, make_user):
    _, _, _, conv = await setup_chat(client, make_user)
    stranger = await make_user("tenant", "Stranger")
    for method, path, body in [
        ("get", f"/chats/{conv['id']}", None),
        ("get", f"/chats/{conv['id']}/messages", None),
        ("post", f"/chats/{conv['id']}/messages", {"body": "hi"}),
        ("post", f"/chats/{conv['id']}/read", None),
        ("post", f"/chats/{conv['id']}/block", None),
    ]:
        r = await getattr(client, method)(f"{API}{path}", headers=stranger["headers"],
                                          **({"json": body} if body else {}))
        assert r.status_code == 404, (path, r.status_code)
    assert (await client.get(f"{API}/chats", headers=stranger["headers"])).json() == []


async def test_chat_needs_login(client):
    assert (await client.get(f"{API}/chats")).status_code == 401


async def test_cannot_chat_about_own_listing(client, make_user):
    owner = await make_user("owner")
    listing = await published_listing(client, owner["headers"])
    r = await client.post(f"{API}/chats", headers=owner["headers"], json={"listing_id": listing["id"], "body": "hi"})
    assert r.status_code == 400


async def test_cannot_start_chat_on_unavailable_room(client, make_user):
    owner = await make_user("owner")
    tenant = await make_user("tenant")
    listing = await published_listing(client, owner["headers"])
    await client.post(f"{API}/listings/{listing['id']}/mark-rented", headers=owner["headers"])
    r = await client.post(f"{API}/chats", headers=tenant["headers"], json={"listing_id": listing["id"], "body": "hi"})
    assert r.status_code == 404
    r = await client.post(f"{API}/chats", headers=tenant["headers"],
                          json={"listing_id": str(uuid.uuid4()), "body": "hi"})
    assert r.status_code == 404


@pytest.mark.parametrize("body", ["", "   \n  ", "x" * 2001, "​​"])
async def test_bad_messages_rejected(client, make_user, body):
    _, tenant, _, conv = await setup_chat(client, make_user)
    r = await client.post(f"{API}/chats/{conv['id']}/messages", headers=tenant["headers"], json={"body": body})
    assert r.status_code == 422


async def test_message_is_cleaned(client, make_user):
    _, tenant, _, conv = await setup_chat(client, make_user)
    r = await client.post(f"{API}/chats/{conv['id']}/messages", headers=tenant["headers"],
                          json={"body": "  Hello‮\n\n\n\n\nthere\x07  "})
    assert r.json()["body"] == "Hello\n\nthere"


async def test_retry_with_same_client_id_does_not_duplicate(client, make_user):
    _, tenant, _, conv = await setup_chat(client, make_user)
    body = {"body": "Can I visit tomorrow?", "client_id": str(uuid.uuid4())}
    a = await client.post(f"{API}/chats/{conv['id']}/messages", headers=tenant["headers"], json=body)
    b = await client.post(f"{API}/chats/{conv['id']}/messages", headers=tenant["headers"], json=body)
    assert a.json()["id"] == b.json()["id"]
    page = (await client.get(f"{API}/chats/{conv['id']}/messages", headers=tenant["headers"])).json()
    assert len(page["items"]) == 2


async def test_block_stops_both_sides_and_unblock(client, make_user):
    owner, tenant, _, conv = await setup_chat(client, make_user)
    assert (await client.post(f"{API}/chats/{conv['id']}/block", headers=owner["headers"])).status_code == 204
    for who in (owner, tenant):
        r = await client.post(f"{API}/chats/{conv['id']}/messages", headers=who["headers"], json={"body": "hi"})
        assert r.status_code == 403
    view = (await client.get(f"{API}/chats/{conv['id']}", headers=tenant["headers"])).json()
    assert view["blocked"] is True and view["blocked_by_me"] is False
    # Only the blocker can unblock
    assert (await client.post(f"{API}/chats/{conv['id']}/unblock", headers=tenant["headers"])).status_code == 403
    assert (await client.post(f"{API}/chats/{conv['id']}/unblock", headers=owner["headers"])).status_code == 204
    r = await client.post(f"{API}/chats/{conv['id']}/messages", headers=tenant["headers"], json={"body": "hi"})
    assert r.status_code == 201


async def test_report_also_blocks(client, make_user):
    owner, tenant, _, conv = await setup_chat(client, make_user)
    r = await client.post(f"{API}/chats/{conv['id']}/report", headers=tenant["headers"],
                          json={"reason": "scam", "details": "Asked for advance on eSewa"})
    assert r.status_code == 204
    view = (await client.get(f"{API}/chats/{conv['id']}", headers=tenant["headers"])).json()
    assert view["blocked_by_me"] is True
    r = await client.post(f"{API}/chats/{conv['id']}/messages", headers=owner["headers"], json={"body": "pay now"})
    assert r.status_code == 403


async def test_payment_requests_are_flagged(client, make_user):
    owner, _, _, conv = await setup_chat(client, make_user)
    r = await client.post(f"{API}/chats/{conv['id']}/messages", headers=owner["headers"],
                          json={"body": "Send 5000 advance on eSewa to book it"})
    assert r.json()["flagged"] is True
    r = await client.post(f"{API}/chats/{conv['id']}/messages", headers=owner["headers"],
                          json={"body": "Come see it on Saturday at 10"})
    assert r.json()["flagged"] is False


@pytest.mark.parametrize("text,flag", [
    ("Please pay first via Khalti", True), ("Bank transfer the deposit", True),
    ("एड्भान्स पठाउनुहोस्", True), ("The deposit is 2 months, paid when you move in", False),
    ("Is the water supply good?", False),
])
def test_payment_detector(text, flag):
    assert looks_like_payment_request(text) is flag


async def test_rate_limit(client, make_user, monkeypatch):
    from app.modules.chat import service

    monkeypatch.setattr(service, "MESSAGES_PER_MINUTE", 3)
    _, tenant, _, conv = await setup_chat(client, make_user)  # message 1
    for _ in range(2):
        r = await client.post(f"{API}/chats/{conv['id']}/messages", headers=tenant["headers"], json={"body": "hi"})
        assert r.status_code == 201
    r = await client.post(f"{API}/chats/{conv['id']}/messages", headers=tenant["headers"], json={"body": "hi"})
    assert r.status_code == 429 and "Retry-After" in r.headers


async def test_pagination(client, make_user):
    owner, tenant, _, conv = await setup_chat(client, make_user)
    for i in range(5):
        await client.post(f"{API}/chats/{conv['id']}/messages", headers=owner["headers"], json={"body": f"m{i}"})
    page1 = (await client.get(f"{API}/chats/{conv['id']}/messages", headers=tenant["headers"],
                              params={"limit": 4})).json()
    assert [m["body"] for m in page1["items"]] == ["m4", "m3", "m2", "m1"] and page1["has_more"]
    page2 = (await client.get(f"{API}/chats/{conv['id']}/messages", headers=tenant["headers"],
                              params={"limit": 4, "before": page1["items"][-1]["created_at"]})).json()
    assert [m["body"] for m in page2["items"]] == ["m0", "Is this room still available?"]
    assert page2["has_more"] is False


async def test_live_event_published_to_both_members(client, make_user):
    owner, tenant, _, conv = await setup_chat(client, make_user)
    pubsub = redis_client.pubsub()
    await pubsub.subscribe(realtime.user_channel(owner["user"]["id"]))
    await pubsub.get_message(timeout=1)  # subscription confirmation
    await client.post(f"{API}/chats/{conv['id']}/messages", headers=tenant["headers"], json={"body": "Ping!"})
    msg = await pubsub.get_message(ignore_subscribe_messages=True, timeout=2)
    await pubsub.aclose()
    event = json.loads(msg["data"])
    assert event["type"] == "message" and event["message"]["body"] == "Ping!"


async def test_presence(client):
    uid = str(uuid.uuid4())
    assert await realtime.is_online(redis_client, uid) is False
    await realtime.mark_online(redis_client, uid, "conn1")
    assert await realtime.is_online(redis_client, uid) is True
    await realtime.mark_offline(redis_client, uid, "conn1")
    assert await realtime.is_online(redis_client, uid) is False


async def test_deleted_listing_keeps_chat(client, make_user):
    owner, tenant, listing, conv = await setup_chat(client, make_user)
    await client.post(f"{API}/listings/{listing['id']}/mark-rented", headers=owner["headers"])
    r = await client.delete(f"{API}/listings/{listing['id']}", headers=owner["headers"])
    assert r.status_code in (200, 204)
    view = (await client.get(f"{API}/chats/{conv['id']}", headers=tenant["headers"])).json()
    assert view["listing"] is None and view["listing_title"] == listing["title"]
