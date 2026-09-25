"""Live delivery through Redis pub/sub.

Every connected phone subscribes to its own user's channel. Publishing goes through Redis
(not in-process memory), so it keeps working with several API workers or servers.

Presence ("Active now"): each open WebSocket writes a heartbeat into a Redis hash.
A user is online if any of their connections sent a heartbeat in the last ONLINE_SECONDS.
"""
import json
import time
import uuid
from typing import Any

from redis.asyncio import Redis

ONLINE_SECONDS = 70  # the app pings every 25 s


def user_channel(user_id: uuid.UUID | str) -> str:
    return f"chat:user:{user_id}"


def _presence_key(user_id: uuid.UUID | str) -> str:
    return f"chat:online:{user_id}"


async def publish(redis: Redis, user_id: uuid.UUID | str, event: dict[str, Any]) -> None:
    await redis.publish(user_channel(user_id), json.dumps(event, default=str))


async def mark_online(redis: Redis, user_id: uuid.UUID | str, connection_id: str) -> None:
    key = _presence_key(user_id)
    async with redis.pipeline(transaction=False) as pipe:
        pipe.hset(key, connection_id, int(time.time()))
        pipe.expire(key, ONLINE_SECONDS * 2)
        await pipe.execute()


async def mark_offline(redis: Redis, user_id: uuid.UUID | str, connection_id: str) -> None:
    await redis.hdel(_presence_key(user_id), connection_id)


async def is_online(redis: Redis, user_id: uuid.UUID | str) -> bool:
    beats = await redis.hvals(_presence_key(user_id))
    cutoff = time.time() - ONLINE_SECONDS
    return any(int(b) >= cutoff for b in beats)
