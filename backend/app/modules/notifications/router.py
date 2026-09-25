from typing import Literal

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from app.core.deps import CurrentUser, DbSession
from app.modules.notifications import service

router = APIRouter(prefix="/notifications", tags=["notifications"])


class PushTokenIn(BaseModel):
    token: str = Field(max_length=255, examples=["ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]"])
    platform: Literal["ios", "android"] | None = None


@router.post("/push-token", status_code=status.HTTP_204_NO_CONTENT)
async def register_push_token(body: PushTokenIn, user: CurrentUser, db: DbSession) -> None:
    """Called by the app after login, so we can remind owners to confirm availability."""
    if not service.is_expo_token(body.token):
        raise HTTPException(422, "Not an Expo push token")
    await service.save_token(db, user.id, body.token, body.platform)


@router.delete("/push-token", status_code=status.HTTP_204_NO_CONTENT)
async def unregister_push_token(body: PushTokenIn, user: CurrentUser, db: DbSession) -> None:
    """Called on logout so this phone stops getting this account's notifications."""
    await service.remove_token(db, user.id, body.token)
