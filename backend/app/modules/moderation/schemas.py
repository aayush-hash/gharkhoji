import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

ListingReportReason = Literal[
    "fake",            # photos or details are fake / misleading
    "already_rented",  # still shown but not available
    "wrong_price",     # real cost differs from the listing
    "scam",            # asks for money before a visit
    "broker",          # agent pretending to be the owner
    "offensive",       # offensive text or photos
    "other",
]


def _clean(v: str | None) -> str | None:
    if v is None:
        return None
    v = " ".join(v.split())
    return v or None


class ListingReportIn(BaseModel):
    reason: ListingReportReason
    details: str | None = Field(default=None, max_length=500)

    @field_validator("details")
    @classmethod
    def _tidy(cls, v: str | None) -> str | None:
        return _clean(v)


class ReportCreatedOut(BaseModel):
    message: str


# ---------- admin ----------

class StatsOut(BaseModel):
    users: int
    new_users_7d: int
    suspended_users: int
    active_listings: int
    open_listing_reports: int
    open_chat_reports: int
    messages_24h: int


class PersonOut(BaseModel):
    id: uuid.UUID
    name: str | None
    phone: str
    role: str
    is_active: bool


class ReportOut(BaseModel):
    kind: Literal["listing", "chat"]
    id: uuid.UUID
    reason: str
    details: str | None
    status: str
    created_at: datetime
    reporter: PersonOut
    reported_user: PersonOut
    # listing reports
    listing_id: uuid.UUID | None = None
    listing_title: str | None = None
    listing_status: str | None = None
    open_reports_on_listing: int = 0
    # chat reports: the last messages, so the moderator can judge
    conversation_id: uuid.UUID | None = None
    recent_messages: list[dict] = []
    resolution: str | None = None


class ResolveIn(BaseModel):
    action: Literal["dismiss", "remove_listing", "suspend_user"]
    note: str | None = Field(default=None, max_length=500)

    @field_validator("note")
    @classmethod
    def _tidy(cls, v: str | None) -> str | None:
        return _clean(v)


class NoteIn(BaseModel):
    note: str | None = Field(default=None, max_length=500)

    @field_validator("note")
    @classmethod
    def _tidy(cls, v: str | None) -> str | None:
        return _clean(v)


class AdminUserOut(PersonOut):
    created_at: datetime
    last_login_at: datetime | None
    listings: int
    reports_against: int


class AdminListingOut(BaseModel):
    id: uuid.UUID
    title: str
    area: str
    status: str
    total_monthly_cost: int
    owner: PersonOut
    open_reports: int
    created_at: datetime
    moderation_reason: str | None


class AuditOut(BaseModel):
    id: uuid.UUID
    admin: str | None
    action: str
    target_type: str
    target_id: uuid.UUID
    note: str | None
    created_at: datetime
