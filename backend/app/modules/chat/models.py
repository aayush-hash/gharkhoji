"""Chat between a room seeker and the person who listed the room.

One conversation per (listing, seeker). If the listing is later deleted, the conversation
stays (listing_id becomes NULL) and keeps a copy of the listing title.
"""
import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, TimestampMixin, UUIDPrimaryKeyMixin


class Conversation(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "conversations"
    __table_args__ = (
        UniqueConstraint("listing_id", "tenant_id", name="uq_conversations_listing_tenant"),
        CheckConstraint("tenant_id <> owner_id", name="not_self"),
    )

    listing_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("listings.id", ondelete="SET NULL"), index=True
    )
    listing_title: Mapped[str] = mapped_column(String(120), nullable=False)
    # tenant = the person who asked about the room; owner = whoever listed it (owner or agent)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    owner_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    last_message_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_message_preview: Mapped[str | None] = mapped_column(String(140))
    last_sender_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    tenant_last_read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    owner_last_read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Either side can block. While blocked, nobody can send messages.
    blocked_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )

    def is_member(self, user_id: uuid.UUID) -> bool:
        return user_id in (self.tenant_id, self.owner_id)

    def other_id(self, user_id: uuid.UUID) -> uuid.UUID:
        return self.owner_id if user_id == self.tenant_id else self.tenant_id

    def last_read_at(self, user_id: uuid.UUID) -> datetime | None:
        return self.tenant_last_read_at if user_id == self.tenant_id else self.owner_last_read_at

    def set_last_read(self, user_id: uuid.UUID, when: datetime) -> None:
        if user_id == self.tenant_id:
            self.tenant_last_read_at = when
        else:
            self.owner_last_read_at = when


class Message(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "messages"
    __table_args__ = (
        # Newest-first paging inside one conversation
        Index("ix_messages_conversation_created", "conversation_id", "created_at"),
        # The app sends a random client_id with each message, so a retry after a bad
        # network never creates a duplicate.
        UniqueConstraint("sender_id", "client_id", name="uq_messages_sender_client"),
    )

    conversation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False
    )
    sender_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    body: Mapped[str] = mapped_column(Text, nullable=False)
    client_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    # True when the text talks about paying money up front — the app shows a safety warning.
    flagged: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false", nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class ChatReport(UUIDPrimaryKeyMixin, Base):
    """A user reported a conversation (scam, harassment…). Reviewed in the admin panel (Day 5)."""

    __tablename__ = "chat_reports"

    conversation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("conversations.id", ondelete="CASCADE"), index=True, nullable=False
    )
    reporter_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    reported_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    reason: Mapped[str] = mapped_column(String(30), nullable=False)
    details: Mapped[str | None] = mapped_column(String(500))
    status: Mapped[str] = mapped_column(String(20), default="open", server_default="open", nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
