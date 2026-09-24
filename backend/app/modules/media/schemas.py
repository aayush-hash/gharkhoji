import uuid
from typing import Literal

from pydantic import BaseModel, Field

from app.core.config import settings


class UploadRequest(BaseModel):
    content_type: Literal["image/jpeg", "image/png", "image/webp"]
    size_bytes: int = Field(gt=0, le=settings.MAX_PHOTO_BYTES, description="File size in bytes")


class UploadTicket(BaseModel):
    photo_id: uuid.UUID
    upload_url: str
    method: str = "PUT"
    headers: dict[str, str]
    expires_in: int


class PhotoOrder(BaseModel):
    photo_ids: list[uuid.UUID] = Field(min_length=1, description="Photo ids in the order to show them")
