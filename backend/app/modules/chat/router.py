"""Chat endpoints.

REST (reliable, rate-limited): start a chat, send, list, read receipts, block, report.
WebSocket /chats/ws (live): new messages, "seen", typing indicator, online status.
Messages are always SENT over REST; the socket only delivers events.
"""
import asyncio
import contextlib
import json
import logging
import secrets
import time
import uuid
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, HTTPException, Query, WebSocket, WebSocketDisconnect, status

from app.core.database import SessionLocal
from app.core.deps import CurrentUser, DbSession, RedisClient, StorageDep, user_from_access_token
from app.core.redis import redis_client
from app.core.security import TokenError, decode_token
from app.modules.chat import realtime, service
from app.modules.chat.models import Conversation, Message
from app.modules.chat.schemas import (
    ConversationOut,
    MessageOut,
    MessagePage,
    ReportIn,
    SendIn,
    StartIn,
    UnreadOut,
)
from app.modules.notifications.service import Notification, send_to_user
from app.modules.users.models import User

logger = logging.getLogger("gharkhoji.chat")
router = APIRouter(prefix="/chats", tags=["chat"])


def _http(exc: service.ChatError) -> HTTPException:
    headers = {"Retry-After": str(exc.retry_after)} if exc.retry_after else None
    return HTTPException(exc.status_code, exc.message, headers=headers)


async def _push_if_offline(conversation_id: uuid.UUID, message_id: uuid.UUID) -> None:
    """Runs after the response is sent. Push only if the recipient doesn't have the app open."""
    try:
        async with SessionLocal() as db:
            conv = await db.get(Conversation, conversation_id)
            msg = await db.get(Message, message_id)
            if conv is None or msg is None:
                return
            recipient = conv.other_id(msg.sender_id)
            if await realtime.is_online(redis_client, recipient):
                return
            sender = await db.get(User, msg.sender_id)
            preview = msg.body if len(msg.body) <= 100 else msg.body[:97] + "…"
            await send_to_user(db, recipient, Notification(
                title=(sender.full_name if sender and sender.full_name else "GharKhoji"),
                body=preview,
                data={"type": "chat", "conversation_id": str(conversation_id)},
            ))
    except Exception:  # a failed push must never break chat
        logger.exception("Chat push failed")


# ---------- REST ----------

@router.get("", response_model=list[ConversationOut])
async def my_conversations(user: CurrentUser, db: DbSession, redis: RedisClient, storage: StorageDep):
    """Your chats, most recent first."""
    return await service.list_conversations(db, redis, storage, user)


@router.get("/unread", response_model=UnreadOut)
async def unread(user: CurrentUser, db: DbSession) -> UnreadOut:
    conversations, messages = await service.unread_totals(db, user)
    return UnreadOut(unread_conversations=conversations, unread_messages=messages)


@router.get("/by-listing/{listing_id}", response_model=ConversationOut)
async def for_listing(
    listing_id: uuid.UUID, user: CurrentUser, db: DbSession, redis: RedisClient, storage: StorageDep
):
    """Your existing chat about this room, if any (404 if you haven't messaged yet)."""
    conv = await service.find_for_listing(db, user, listing_id)
    if conv is None:
        raise HTTPException(404, "No chat yet")
    return await service.one_conversation(db, redis, storage, user, conv)


@router.post("", response_model=ConversationOut, status_code=status.HTTP_201_CREATED)
async def start(
    body: StartIn, background: BackgroundTasks, user: CurrentUser, db: DbSession, redis: RedisClient,
    storage: StorageDep,
):
    """Message the owner/agent of a room. Reuses the existing chat if you already have one."""
    try:
        conv, message = await service.start_conversation(db, redis, user, body.listing_id, body.body, body.client_id)
    except service.ChatError as exc:
        raise _http(exc) from None
    background.add_task(_push_if_offline, conv.id, message.id)
    return await service.one_conversation(db, redis, storage, user, conv)


@router.get("/{conversation_id}", response_model=ConversationOut)
async def get_conversation(
    conversation_id: uuid.UUID, user: CurrentUser, db: DbSession, redis: RedisClient, storage: StorageDep
):
    try:
        conv = await service.get_for_member(db, conversation_id, user)
    except service.ChatError as exc:
        raise _http(exc) from None
    return await service.one_conversation(db, redis, storage, user, conv)


@router.get("/{conversation_id}/messages", response_model=MessagePage)
async def messages(
    conversation_id: uuid.UUID, user: CurrentUser, db: DbSession,
    before: Annotated[datetime | None, Query(description="Load messages older than this time")] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = service.PAGE_SIZE,
) -> MessagePage:
    try:
        conv = await service.get_for_member(db, conversation_id, user)
    except service.ChatError as exc:
        raise _http(exc) from None
    rows, has_more = await service.list_messages(db, conv, before, limit)
    return MessagePage(items=[MessageOut.model_validate(m) for m in rows], has_more=has_more)


@router.post("/{conversation_id}/messages", response_model=MessageOut, status_code=status.HTTP_201_CREATED)
async def send(
    conversation_id: uuid.UUID, body: SendIn, background: BackgroundTasks, user: CurrentUser, db: DbSession,
    redis: RedisClient,
):
    try:
        conv = await service.get_for_member(db, conversation_id, user)
        message = await service.send_message(db, redis, conv, user, body.body, body.client_id)
    except service.ChatError as exc:
        raise _http(exc) from None
    background.add_task(_push_if_offline, conv.id, message.id)
    return message


@router.post("/{conversation_id}/read", status_code=status.HTTP_204_NO_CONTENT)
async def read(conversation_id: uuid.UUID, user: CurrentUser, db: DbSession, redis: RedisClient) -> None:
    try:
        conv = await service.get_for_member(db, conversation_id, user)
    except service.ChatError as exc:
        raise _http(exc) from None
    await service.mark_read(db, redis, conv, user)


@router.post("/{conversation_id}/block", status_code=status.HTTP_204_NO_CONTENT)
async def block(conversation_id: uuid.UUID, user: CurrentUser, db: DbSession, redis: RedisClient) -> None:
    try:
        conv = await service.get_for_member(db, conversation_id, user)
        await service.set_blocked(db, redis, conv, user, True)
    except service.ChatError as exc:
        raise _http(exc) from None


@router.post("/{conversation_id}/unblock", status_code=status.HTTP_204_NO_CONTENT)
async def unblock(conversation_id: uuid.UUID, user: CurrentUser, db: DbSession, redis: RedisClient) -> None:
    try:
        conv = await service.get_for_member(db, conversation_id, user)
        await service.set_blocked(db, redis, conv, user, False)
    except service.ChatError as exc:
        raise _http(exc) from None


@router.post("/{conversation_id}/report", status_code=status.HTTP_204_NO_CONTENT)
async def report(
    conversation_id: uuid.UUID, body: ReportIn, user: CurrentUser, db: DbSession, redis: RedisClient
) -> None:
    """Report the other person (scam, harassment…). Also blocks them."""
    try:
        conv = await service.get_for_member(db, conversation_id, user)
    except service.ChatError as exc:
        raise _http(exc) from None
    await service.report(db, redis, conv, user, body.reason, body.details)


# ---------- WebSocket ----------
# Protocol (JSON text frames):
#   app → server  {"type":"auth","token":"<access token>"}     must be the first frame, within 10 s
#   app → server  {"type":"ping"}                               every ~25 s (keeps "Active now")
#   app → server  {"type":"typing","conversation_id":"…"}
#   server → app  {"type":"ready"} | {"type":"pong"} | message | read | typing | conversation events
# The token travels inside the socket, never in the URL (URLs end up in logs).
# Close codes: 4401 = log in again / token expired, 4408 = too slow to authenticate.

AUTH_TIMEOUT = 10
MAX_FRAME = 4096
TYPING_EVERY = 2.0  # seconds between typing events per conversation


@router.websocket("/ws")
async def chat_socket(ws: WebSocket) -> None:
    await ws.accept()
    try:
        first = json.loads(await asyncio.wait_for(ws.receive_text(), AUTH_TIMEOUT))
        token = first.get("token") if isinstance(first, dict) and first.get("type") == "auth" else None
    except (TimeoutError, ValueError, WebSocketDisconnect):
        with contextlib.suppress(Exception):
            await ws.close(code=4408)
        return

    user_id: uuid.UUID | None = None
    token_exp = 0.0
    if isinstance(token, str):
        async with SessionLocal() as db:
            user = await user_from_access_token(db, token)
        if user is not None:
            user_id = user.id
            with contextlib.suppress(TokenError):
                token_exp = float(decode_token(token, "access")["exp"])
    if user_id is None:
        await ws.close(code=4401)
        return

    connection_id = secrets.token_hex(8)
    pubsub = redis_client.pubsub()
    await pubsub.subscribe(realtime.user_channel(user_id))
    await realtime.mark_online(redis_client, user_id, connection_id)
    await ws.send_text(json.dumps({"type": "ready", "user_id": str(user_id)}))

    async def forward_events() -> None:
        async for item in pubsub.listen():
            if item.get("type") == "message":
                await ws.send_text(item["data"])

    async def expire_session() -> None:
        # When the access token expires, ask the app to reconnect with a fresh one.
        await asyncio.sleep(max(1.0, token_exp - time.time()))
        await ws.close(code=4401)

    async def receive_frames() -> None:
        last_typing: dict[str, float] = {}
        while True:
            raw = await ws.receive_text()
            if len(raw) > MAX_FRAME:
                await ws.close(code=1009)
                return
            try:
                frame = json.loads(raw)
            except ValueError:
                continue
            kind = frame.get("type") if isinstance(frame, dict) else None
            if kind == "ping":
                await realtime.mark_online(redis_client, user_id, connection_id)
                await ws.send_text('{"type":"pong"}')
            elif kind == "typing":
                conv_id = str(frame.get("conversation_id", ""))
                now = asyncio.get_running_loop().time()
                if now - last_typing.get(conv_id, 0) < TYPING_EVERY:
                    continue
                last_typing[conv_id] = now
                try:
                    conv_uuid = uuid.UUID(conv_id)
                except ValueError:
                    continue
                async with SessionLocal() as db:
                    other = await service.can_type_in(db, conv_uuid, user_id)
                if other is not None:
                    await realtime.publish(redis_client, other, {
                        "type": "typing", "conversation_id": conv_id, "user_id": str(user_id)})

    tasks = [asyncio.create_task(t()) for t in (forward_events, receive_frames, expire_session)]
    try:
        await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
    finally:
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        await realtime.mark_offline(redis_client, user_id, connection_id)
        with contextlib.suppress(Exception):
            await pubsub.unsubscribe()
            await pubsub.aclose()
        with contextlib.suppress(Exception):
            await ws.close()
