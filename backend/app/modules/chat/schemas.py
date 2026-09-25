import re
import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

from app.modules.listings.models import ListingStatus
from app.modules.users.models import UserRole

MAX_MESSAGE_CHARS = 2000
_CONTROL_CHARS = re.compile(r"[\x00-\x08\x0b-\x1f\x7f​-‏‪-‮⁦-⁩]")


def clean_message(text: str) -> str:
    """Strip invisible/control characters (used for spoofing), trim, and cap blank lines."""
    text = _CONTROL_CHARS.sub("", text.replace("\r\n", "\n")).strip()
    text = re.sub(r"\n{3,}", "\n\n", text)
    if not text:
        raise ValueError("Message can't be empty")
    if len(text) > MAX_MESSAGE_CHARS:
        raise ValueError(f"Message is too long (max {MAX_MESSAGE_CHARS} characters)")
    return text


class SendIn(BaseModel):
    body: str = Field(min_length=1, max_length=MAX_MESSAGE_CHARS * 2)
    # Random id made by the app. Sending the same one twice (e.g. a retry) is harmless.
    client_id: uuid.UUID | None = None

    @field_validator("body")
    @classmethod
    def _clean(cls, v: str) -> str:
        return clean_message(v)


class StartIn(SendIn):
    listing_id: uuid.UUID


class ReportIn(BaseModel):
    reason: Literal["scam", "harassment", "fake_listing", "spam", "other"]
    details: str | None = Field(default=None, max_length=500)


class MessageOut(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    conversation_id: uuid.UUID
    sender_id: uuid.UUID
    body: str
    client_id: uuid.UUID | None
    flagged: bool
    created_at: datetime


class ChatListing(BaseModel):
    id: uuid.UUID
    title: str
    area: str
    total_monthly_cost: int
    cover_photo_url: str | None
    status: ListingStatus


class ChatPerson(BaseModel):
    id: uuid.UUID
    name: str | None
    role: UserRole
    phone_verified: bool
    online: bool


class ConversationOut(BaseModel):
    id: uuid.UUID
    listing: ChatListing | None  # None if the listing was deleted
    listing_title: str
    other: ChatPerson
    my_side: Literal["tenant", "owner"]
    last_message_preview: str | None
    last_message_at: datetime | None
    last_message_mine: bool
    unread_count: int
    # For "Seen" ticks on my messages
    other_last_read_at: datetime | None
    blocked: bool
    blocked_by_me: bool
    created_at: datetime


class MessagePage(BaseModel):
    items: list[MessageOut]  # newest first
    has_more: bool


class UnreadOut(BaseModel):
    unread_conversations: int
    unread_messages: int
