"""Reports from users and the moderators' audit log."""
import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String, func, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, UUIDPrimaryKeyMixin


class ListingReport(UUIDPrimaryKeyMixin, Base):
    """A user flagged a listing ("fake", "already rented", "asks for money before visiting"…)."""

    __tablename__ = "listing_reports"
    __table_args__ = (
        # One open report per person per listing — reporting twice doesn't add weight.
        Index(
            "uq_listing_reports_open", "listing_id", "reporter_id",
            unique=True, postgresql_where=text("status = 'open'"),
        ),
        Index("ix_listing_reports_status_created", "status", "created_at"),
    )

    listing_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("listings.id", ondelete="CASCADE"), index=True, nullable=False
    )
    reporter_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    reason: Mapped[str] = mapped_column(String(30), nullable=False)
    details: Mapped[str | None] = mapped_column(String(500))
    status: Mapped[str] = mapped_column(String(20), default="open", server_default="open", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    resolved_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    resolution: Mapped[str | None] = mapped_column(String(30))  # dismissed | listing_removed | user_suspended


class AdminAction(UUIDPrimaryKeyMixin, Base):
    """Every moderator action is recorded: who did what, to what, and why. Never edited or deleted."""

    __tablename__ = "admin_actions"

    admin_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    action: Mapped[str] = mapped_column(String(40), nullable=False)
    target_type: Mapped[str] = mapped_column(String(20), nullable=False)  # listing | user | report
    target_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    note: Mapped[str | None] = mapped_column(String(500))
    extra: Mapped[dict | None] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )
