import enum
import uuid
from datetime import UTC, date, datetime
from typing import TYPE_CHECKING

from geoalchemy2 import Geography
from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Index,
    Integer,
    SmallInteger,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import ARRAY, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base, TimestampMixin, UUIDPrimaryKeyMixin
from app.modules.users.models import User

if TYPE_CHECKING:
    from app.modules.media.models import ListingPhoto


def _enum_values(e: type[enum.Enum]) -> list[str]:
    return [m.value for m in e]


class ListingType(str, enum.Enum):
    ROOM = "room"
    ONE_BHK = "1bhk"
    TWO_BHK = "2bhk"
    THREE_BHK = "3bhk"
    FLAT = "flat"


class ListingStatus(str, enum.Enum):
    DRAFT = "draft"        # being prepared, not visible in search
    ACTIVE = "active"      # visible in search
    RENTED = "rented"      # owner marked it rented
    EXPIRED = "expired"    # owner stopped confirming availability (Day 4)
    REMOVED = "removed"    # deleted by owner or moderator


class Furnishing(str, enum.Enum):
    UNFURNISHED = "unfurnished"
    SEMI = "semi"
    FULL = "full"


class Amenity(str, enum.Enum):
    WATER_24H = "water_24h"
    DRINKING_WATER = "drinking_water"
    ATTACHED_BATHROOM = "attached_bathroom"
    KITCHEN = "kitchen"
    BALCONY = "balcony"
    SUNLIGHT = "sunlight"
    BIKE_PARKING = "bike_parking"
    CAR_PARKING = "car_parking"
    INTERNET = "internet"
    SEPARATE_METER = "separate_meter"
    HOT_WATER = "hot_water"
    PETS_ALLOWED = "pets_allowed"
    ROAD_ACCESS = "road_access"
    NEAR_PUBLIC_TRANSPORT = "near_public_transport"


class Listing(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "listings"

    owner_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    listing_type: Mapped[ListingType] = mapped_column(
        Enum(ListingType, name="listing_type", values_callable=_enum_values), nullable=False
    )
    status: Mapped[ListingStatus] = mapped_column(
        Enum(ListingStatus, name="listing_status", values_callable=_enum_values),
        default=ListingStatus.DRAFT,
        server_default=ListingStatus.DRAFT.value,
        nullable=False,
    )
    title: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)

    # Money — whole Nepali rupees. Transparent monthly cost is a core promise of the app.
    rent: Mapped[int] = mapped_column(Integer, nullable=False)
    deposit: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    water_charge: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    waste_charge: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    internet_charge: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    parking_charge: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    agent_commission: Mapped[int | None] = mapped_column(Integer)  # required when an agent lists

    amenities: Mapped[list[str]] = mapped_column(ARRAY(String(40)), nullable=False, server_default="{}")
    furnishing: Mapped[Furnishing] = mapped_column(
        Enum(Furnishing, name="furnishing", values_callable=_enum_values),
        default=Furnishing.UNFURNISHED,
        server_default=Furnishing.UNFURNISHED.value,
        nullable=False,
    )
    floor: Mapped[int | None] = mapped_column(SmallInteger)
    max_occupants: Mapped[int | None] = mapped_column(SmallInteger)
    available_from: Mapped[date | None] = mapped_column(Date)

    # Location. `location` is the exact point: used for search, shown only to the owner.
    # Everyone else sees public_lat/public_lng, shifted ~150-300 m for privacy.
    area: Mapped[str] = mapped_column(String(80), nullable=False)
    landmark: Mapped[str | None] = mapped_column(String(120))
    lat: Mapped[float] = mapped_column(Float, nullable=False)
    lng: Mapped[float] = mapped_column(Float, nullable=False)
    location = mapped_column(Geography(geometry_type="POINT", srid=4326, spatial_index=False), nullable=False)
    public_lat: Mapped[float] = mapped_column(Float, nullable=False)
    public_lng: Mapped[float] = mapped_column(Float, nullable=False)

    last_confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    rented_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    expired_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Freshness reminders (Day 4): reset every time the owner confirms
    reminder_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    reminders_sent: Mapped[int] = mapped_column(SmallInteger, nullable=False, server_default="0", default=0)
    # Moderation (Day 5): set when an admin removes the listing (e.g. reported as fake)
    moderated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    moderation_reason: Mapped[str | None] = mapped_column(String(300))

    owner: Mapped[User] = relationship(lazy="joined")
    photos: Mapped[list["ListingPhoto"]] = relationship(
        back_populates="listing",
        order_by="ListingPhoto.position",
        cascade="all, delete-orphan",
        lazy="selectin",
    )

    __table_args__ = (
        CheckConstraint("rent > 0", name="rent_positive"),
        CheckConstraint(
            "deposit >= 0 AND water_charge >= 0 AND waste_charge >= 0 "
            "AND internet_charge >= 0 AND parking_charge >= 0",
            name="charges_non_negative",
        ),
        Index("ix_listings_location", "location", postgresql_using="gist"),
        Index("ix_listings_amenities", "amenities", postgresql_using="gin"),
        Index("ix_listings_status_confirmed", "status", "last_confirmed_at"),
    )

    @property
    def total_monthly_cost(self) -> int:
        return self.rent + self.water_charge + self.waste_charge + self.internet_charge + self.parking_charge

    @property
    def needs_confirmation(self) -> bool:
        """True when the owner should tap 'Still available' (shown in their app)."""
        from app.core.config import settings

        if self.status == ListingStatus.EXPIRED:
            return True
        if self.status != ListingStatus.ACTIVE or self.last_confirmed_at is None:
            return False
        age = datetime.now(UTC) - self.last_confirmed_at
        return age.total_seconds() >= settings.CONFIRM_REMINDER_AFTER_HOURS * 3600

    @property
    def uploaded_photos(self) -> list["ListingPhoto"]:
        from app.modules.media.models import PhotoStatus

        return [p for p in self.photos if p.status == PhotoStatus.UPLOADED]



# Make sure ListingPhoto is always registered whenever Listing is imported (scripts, workers),
# otherwise SQLAlchemy can't resolve the `photos` relationship. Safe: media.models only
# imports Listing for type checking.
from app.modules.media import models as _media_models  # noqa: E402, F401
