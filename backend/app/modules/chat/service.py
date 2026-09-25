"""Chat rules.

Security:
  - Only the two people in a conversation can see it. Anyone else gets 404, so ids leak nothing.
  - You can only start a chat about an ACTIVE listing, and never with yourself.
  - Rate limits: MESSAGES_PER_MINUTE per user, NEW_CHATS_PER_DAY per user (anti-spam).
  - Block: either side can block; then nobody can send. Reporting also blocks.
  - Messages mentioning up-front payment are flagged, and the app shows a safety warning.
"""
import logging
import re
import uuid
from datetime import UTC, datetime

from redis.asyncio import Redis
from sqlalchemy import and_, case, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.storage import Storage
from app.modules.chat import realtime
from app.modules.chat.models import ChatReport, Conversation, Message
from app.modules.chat.schemas import ChatListing, ChatPerson, ConversationOut, MessageOut
from app.modules.listings.models import Listing, ListingStatus
from app.modules.users.models import User

logger = logging.getLogger("gharkhoji.chat")

MESSAGES_PER_MINUTE = 30
NEW_CHATS_PER_DAY = 30
PAGE_SIZE = 30
_EPOCH = datetime(1970, 1, 1, tzinfo=UTC)

# Common rental-scam patterns in Nepal: paying "advance"/deposit before seeing the room,
# via eSewa / Khalti / IME Pay / bank transfer.
_PAYMENT_WORDS = re.compile(
    r"\b(advance|e-?sewa|khalti|ime ?pay|fonepay|bank transfer|transfer (the )?money|send (the )?money|"
    r"pay (first|before|now)|deposit (first|before|now)|booking (fee|amount)|token money|"
    r"एड्भान्स|अग्रिम|पैसा पठाउ)",
    re.IGNORECASE,
)


class ChatError(Exception):
    def __init__(self, message: str, status_code: int = 400, retry_after: int | None = None):
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.retry_after = retry_after


def looks_like_payment_request(text: str) -> bool:
    return bool(_PAYMENT_WORDS.search(text))


async def _limit(redis: Redis, key: str, limit: int, window: int) -> int | None:
    """Returns seconds to wait if over the limit, else None."""
    count = await redis.incr(key)
    if count == 1:
        await redis.expire(key, window)
    if count > limit:
        return max(1, await redis.ttl(key))
    return None


# ---------- loading ----------

async def get_for_member(db: AsyncSession, conversation_id: uuid.UUID, user: User) -> Conversation:
    conv = await db.get(Conversation, conversation_id)
    if conv is None or not conv.is_member(user.id):
        raise ChatError("Conversation not found", 404)
    return conv


def _unread_expr(user_id: uuid.UUID):
    my_read = case(
        (Conversation.tenant_id == user_id, Conversation.tenant_last_read_at),
        else_=Conversation.owner_last_read_at,
    )
    return (
        select(func.count(Message.id))
        .where(
            Message.conversation_id == Conversation.id,
            Message.sender_id != user_id,
            Message.created_at > func.coalesce(my_read, _EPOCH),
        )
        .correlate(Conversation)
        .scalar_subquery()
    )


async def serialize(
    db: AsyncSession, redis: Redis, storage: Storage, user: User, rows: list[tuple[Conversation, int]]
) -> list[ConversationOut]:
    """Builds ConversationOut for many conversations with 2 extra queries (not one per row)."""
    if not rows:
        return []
    listing_ids = {c.listing_id for c, _ in rows if c.listing_id}
    other_ids = {c.other_id(user.id) for c, _ in rows}
    listings = {
        x.id: x for x in (await db.scalars(select(Listing).where(Listing.id.in_(listing_ids)))).unique()
    } if listing_ids else {}
    people = {u.id: u for u in await db.scalars(select(User).where(User.id.in_(other_ids)))}

    out = []
    for conv, unread in rows:
        other = people[conv.other_id(user.id)]
        listing = listings.get(conv.listing_id) if conv.listing_id else None
        chat_listing = None
        if listing is not None and listing.status != ListingStatus.REMOVED:
            photos = listing.uploaded_photos
            chat_listing = ChatListing(
                id=listing.id,
                title=listing.title,
                area=listing.area,
                total_monthly_cost=listing.total_monthly_cost,
                cover_photo_url=storage.public_url(photos[0].storage_key) if photos else None,
                status=listing.status,
            )
        out.append(
            ConversationOut(
                id=conv.id,
                listing=chat_listing,
                listing_title=conv.listing_title,
                other=ChatPerson(
                    id=other.id,
                    name=other.full_name,
                    role=other.role,
                    phone_verified=other.phone_verified_at is not None,
                    online=await realtime.is_online(redis, other.id),
                ),
                my_side="tenant" if user.id == conv.tenant_id else "owner",
                last_message_preview=conv.last_message_preview,
                last_message_at=conv.last_message_at,
                last_message_mine=conv.last_sender_id == user.id,
                unread_count=unread,
                other_last_read_at=conv.last_read_at(other.id),
                blocked=conv.blocked_by_id is not None,
                blocked_by_me=conv.blocked_by_id == user.id,
                created_at=conv.created_at,
            )
        )
    return out


async def list_conversations(
    db: AsyncSession, redis: Redis, storage: Storage, user: User
) -> list[ConversationOut]:
    rows = await db.execute(
        select(Conversation, _unread_expr(user.id))
        .where(
            or_(Conversation.tenant_id == user.id, Conversation.owner_id == user.id),
            Conversation.last_message_at.is_not(None),
        )
        .order_by(Conversation.last_message_at.desc())
        .limit(200)
    )
    return await serialize(db, redis, storage, user, [(c, n) for c, n in rows.all()])


async def one_conversation(
    db: AsyncSession, redis: Redis, storage: Storage, user: User, conv: Conversation
) -> ConversationOut:
    unread = await db.scalar(
        select(_unread_expr(user.id)).select_from(Conversation).where(Conversation.id == conv.id)
    )
    return (await serialize(db, redis, storage, user, [(conv, unread or 0)]))[0]


async def unread_totals(db: AsyncSession, user: User) -> tuple[int, int]:
    unread = _unread_expr(user.id)
    rows = (
        await db.execute(
            select(unread).where(or_(Conversation.tenant_id == user.id, Conversation.owner_id == user.id))
        )
    ).scalars().all()
    return sum(1 for n in rows if n), sum(rows)


async def find_for_listing(db: AsyncSession, user: User, listing_id: uuid.UUID) -> Conversation | None:
    return await db.scalar(
        select(Conversation).where(Conversation.listing_id == listing_id, Conversation.tenant_id == user.id)
    )


async def list_messages(
    db: AsyncSession, conv: Conversation, before: datetime | None, limit: int = PAGE_SIZE
) -> tuple[list[Message], bool]:
    stmt = select(Message).where(Message.conversation_id == conv.id)
    if before is not None:
        stmt = stmt.where(Message.created_at < before)
    rows = list(await db.scalars(stmt.order_by(Message.created_at.desc(), Message.id.desc()).limit(limit + 1)))
    return rows[:limit], len(rows) > limit


# ---------- actions ----------

async def start_conversation(
    db: AsyncSession, redis: Redis, user: User, listing_id: uuid.UUID, body: str, client_id: uuid.UUID | None
) -> tuple[Conversation, Message]:
    listing = await db.get(Listing, listing_id)
    if listing is None or listing.status != ListingStatus.ACTIVE:
        raise ChatError("This room is no longer available", 404)
    if listing.owner_id == user.id:
        raise ChatError("This is your own listing", 400)

    conv = await find_for_listing(db, user, listing_id)
    if conv is None:
        wait = await _limit(redis, f"chat:new:{user.id}", NEW_CHATS_PER_DAY, 86400)
        if wait:
            raise ChatError("You've started a lot of chats today. Try again tomorrow.", 429, wait)
        conv = Conversation(
            listing_id=listing.id, listing_title=listing.title[:120], tenant_id=user.id, owner_id=listing.owner_id
        )
        db.add(conv)
        try:
            await db.flush()
        except IntegrityError:  # two taps at once created it in parallel
            await db.rollback()
            conv = await find_for_listing(db, user, listing_id)
            assert conv is not None
    message = await send_message(db, redis, conv, user, body, client_id)
    return conv, message


async def send_message(
    db: AsyncSession, redis: Redis, conv: Conversation, sender: User, body: str, client_id: uuid.UUID | None
) -> Message:
    if not conv.is_member(sender.id):
        raise ChatError("Conversation not found", 404)
    if conv.blocked_by_id is not None:
        if conv.blocked_by_id == sender.id:
            raise ChatError("You blocked this person. Unblock them to send messages.", 403)
        raise ChatError("You can't reply to this conversation.", 403)

    if client_id is not None:  # a retry of a message that already arrived
        existing = await db.scalar(
            select(Message).where(Message.sender_id == sender.id, Message.client_id == client_id)
        )
        if existing is not None:
            if existing.conversation_id != conv.id:
                raise ChatError("Invalid message id", 400)
            await db.commit()
            return existing

    wait = await _limit(redis, f"chat:rate:{sender.id}", MESSAGES_PER_MINUTE, 60)
    if wait:
        raise ChatError("You're sending messages too fast. Wait a moment.", 429, wait)

    now = datetime.now(UTC)
    message = Message(
        conversation_id=conv.id,
        sender_id=sender.id,
        body=body,
        client_id=client_id,
        flagged=looks_like_payment_request(body),
        created_at=now,
    )
    db.add(message)
    conv.last_message_at = now
    conv.last_message_preview = body[:140]
    conv.last_sender_id = sender.id
    conv.set_last_read(sender.id, now)  # your own messages count as read
    await db.commit()
    await db.refresh(message)

    event = {"type": "message", "conversation_id": str(conv.id),
             "message": MessageOut.model_validate(message).model_dump(mode="json")}
    for member in (conv.tenant_id, conv.owner_id):
        await realtime.publish(redis, member, event)
    return message


async def mark_read(db: AsyncSession, redis: Redis, conv: Conversation, user: User) -> datetime:
    now = datetime.now(UTC)
    conv.set_last_read(user.id, now)
    await db.commit()
    await realtime.publish(
        redis, conv.other_id(user.id),
        {"type": "read", "conversation_id": str(conv.id), "reader_id": str(user.id), "read_at": now.isoformat()},
    )
    return now


async def set_blocked(db: AsyncSession, redis: Redis, conv: Conversation, user: User, blocked: bool) -> None:
    if blocked:
        if conv.blocked_by_id is None:
            conv.blocked_by_id = user.id
    elif conv.blocked_by_id == user.id:  # only the person who blocked can unblock
        conv.blocked_by_id = None
    elif conv.blocked_by_id is not None:
        raise ChatError("Only the person who blocked can unblock", 403)
    await db.commit()
    for member in (conv.tenant_id, conv.owner_id):
        await realtime.publish(redis, member, {"type": "conversation", "conversation_id": str(conv.id)})


async def report(
    db: AsyncSession, redis: Redis, conv: Conversation, user: User, reason: str, details: str | None
) -> None:
    db.add(ChatReport(conversation_id=conv.id, reporter_id=user.id, reported_user_id=conv.other_id(user.id),
                      reason=reason, details=(details or "").strip()[:500] or None))
    if conv.blocked_by_id is None:
        conv.blocked_by_id = user.id  # reporting also blocks, so the reporter is safe right away
    await db.commit()
    logger.warning("Chat %s reported by %s: %s", conv.id, user.id, reason)
    for member in (conv.tenant_id, conv.owner_id):
        await realtime.publish(redis, member, {"type": "conversation", "conversation_id": str(conv.id)})


def is_participant_filter(user_id: uuid.UUID):
    return or_(Conversation.tenant_id == user_id, Conversation.owner_id == user_id)


async def can_type_in(db: AsyncSession, conversation_id: uuid.UUID, user_id: uuid.UUID) -> uuid.UUID | None:
    """For typing indicators: returns the other member's id if the user may send there."""
    conv = await db.scalar(
        select(Conversation).where(
            and_(Conversation.id == conversation_id, is_participant_filter(user_id),
                 Conversation.blocked_by_id.is_(None))
        )
    )
    return conv.other_id(user_id) if conv else None
