import enum
import uuid
from typing import TYPE_CHECKING

from sqlalchemy import Enum, ForeignKey, Integer, SmallInteger, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base, TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.modules.listings.models import Listing


class PhotoStatus(str, enum.Enum):
    PENDING = "pending"    # upload URL handed out, file not confirmed yet
    UPLOADED = "uploaded"  # file checked and visible


class ListingPhoto(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "listing_photos"

    listing_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("listings.id", ondelete="CASCADE"), index=True, nullable=False
    )
    storage_key: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    content_type: Mapped[str] = mapped_column(String(40), nullable=False)
    size_bytes: Mapped[int | None] = mapped_column(Integer)
    position: Mapped[int] = mapped_column(SmallInteger, nullable=False, server_default="0")
    status: Mapped[PhotoStatus] = mapped_column(
        Enum(PhotoStatus, name="photo_status", values_callable=lambda e: [m.value for m in e]),
        default=PhotoStatus.PENDING,
        server_default=PhotoStatus.PENDING.value,
        nullable=False,
    )

    listing: Mapped["Listing"] = relationship(back_populates="photos")
