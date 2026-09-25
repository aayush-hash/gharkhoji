"""Shared FastAPI dependencies: DB session, Redis, current user, role checks."""
import uuid
from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.redis import get_redis
from app.core.security import TokenError, decode_token, password_version
from app.core.storage import Storage, get_storage
from app.modules.users.models import User, UserRole

DbSession = Annotated[AsyncSession, Depends(get_db)]
RedisClient = Annotated[Redis, Depends(get_redis)]

_bearer = HTTPBearer(auto_error=False)


async def user_from_access_token(db: AsyncSession, token: str) -> User | None:
    """The one place an access token is turned into a user (HTTP requests and the chat WebSocket)."""
    try:
        payload = decode_token(token, expected_type="access")
        user_id = uuid.UUID(payload["sub"])
        token_pv = int(payload.get("pv", 0))
    except (TokenError, KeyError, ValueError, TypeError):
        return None
    user = await db.get(User, user_id)
    if user is None or not user.is_active:
        return None
    # Password changed/reset after this token was issued → it no longer counts.
    if token_pv != password_version(user.password_changed_at):
        return None
    return user


async def get_current_user(
    db: DbSession,
    creds: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> User:
    unauthorized = HTTPException(
        status.HTTP_401_UNAUTHORIZED, "Not authenticated", headers={"WWW-Authenticate": "Bearer"}
    )
    if creds is None:
        raise unauthorized
    user = await user_from_access_token(db, creds.credentials)
    if user is None:
        raise unauthorized
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


async def get_optional_user(
    db: DbSession,
    creds: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> User | None:
    """For public endpoints: browsing never requires login, but we use the user if logged in."""
    if creds is None:
        return None
    try:
        return await get_current_user(db, creds)
    except HTTPException:
        return None


OptionalUser = Annotated[User | None, Depends(get_optional_user)]
StorageDep = Annotated[Storage, Depends(get_storage)]


def require_roles(*roles: UserRole):
    """Usage: `Depends(require_roles(UserRole.OWNER, UserRole.AGENT))`."""

    async def checker(user: CurrentUser) -> User:
        if user.role not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "You don't have permission for this")
        return user

    return checker
