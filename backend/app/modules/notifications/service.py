"""Push notifications through Expo's push service (works for both iOS and Android).

In development, every notification is also written to the log, so you can see what
would have been sent even when your phone can't receive push (e.g. inside Expo Go).
"""
import logging
import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

import httpx
from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.modules.notifications.models import PushToken

logger = logging.getLogger("gharkhoji.push")


@dataclass
class Notification:
    title: str
    body: str
    data: dict[str, Any] = field(default_factory=dict)


def is_expo_token(token: str) -> bool:
    return token.startswith(("ExponentPushToken[", "ExpoPushToken[")) and token.endswith("]")


async def save_token(db: AsyncSession, user_id: uuid.UUID, token: str, platform: str | None) -> None:
    """Insert or move a token to this user (a phone can change accounts)."""
    stmt = insert(PushToken).values(user_id=user_id, token=token, platform=platform)
    stmt = stmt.on_conflict_do_update(
        index_elements=[PushToken.token],
        set_={"user_id": user_id, "platform": platform, "last_seen_at": datetime.now(UTC)},
    )
    await db.execute(stmt)
    await db.commit()


async def remove_token(db: AsyncSession, user_id: uuid.UUID, token: str) -> None:
    await db.execute(delete(PushToken).where(PushToken.user_id == user_id, PushToken.token == token))
    await db.commit()


async def send_to_user(db: AsyncSession, user_id: uuid.UUID, note: Notification) -> int:
    """Returns how many devices the message was handed to."""
    tokens = list(await db.scalars(select(PushToken.token).where(PushToken.user_id == user_id)))
    logger.info("🔔 Push to user %s (%d device(s)): %s — %s", user_id, len(tokens), note.title, note.body)
    if not tokens or not settings.PUSH_ENABLED:
        return 0

    messages = [{"to": t, "title": note.title, "body": note.body, "data": note.data, "sound": "default"}
                for t in tokens]
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            res = await client.post(settings.EXPO_PUSH_URL, json=messages)
            res.raise_for_status()
            tickets = res.json().get("data", [])
    except (httpx.HTTPError, ValueError) as exc:
        logger.warning("Push send failed: %s", exc)
        return 0

    # Remove tokens for uninstalled apps so we stop sending to them.
    dead = [
        tokens[i] for i, ticket in enumerate(tickets)
        if ticket.get("status") == "error" and ticket.get("details", {}).get("error") == "DeviceNotRegistered"
    ]
    if dead:
        await db.execute(delete(PushToken).where(PushToken.token.in_(dead)))
        await db.commit()
    return len(tokens) - len(dead)
