import uuid
from datetime import date, datetime

from pydantic import BaseModel, Field, field_validator, model_validator

from app.modules.listings.models import Amenity, Furnishing, ListingStatus, ListingType
from app.modules.users.models import UserRole

# Rough bounding box of Kathmandu Valley. Stops typos like swapped lat/lng.
VALLEY_LAT = (27.55, 27.85)
VALLEY_LNG = (85.15, 85.56)


class _ListingFields(BaseModel):
    """Shared validation for create and update."""

    title: str | None = Field(default=None, min_length=5, max_length=120)
    description: str | None = Field(default=None, max_length=2000)
    rent: int | None = Field(default=None, ge=1000, le=500_000, description="Monthly rent in NPR")
    deposit: int | None = Field(default=None, ge=0, le=2_000_000)
    water_charge: int | None = Field(default=None, ge=0, le=50_000)
    waste_charge: int | None = Field(default=None, ge=0, le=50_000)
    internet_charge: int | None = Field(default=None, ge=0, le=50_000)
    parking_charge: int | None = Field(default=None, ge=0, le=50_000)
    agent_commission: int | None = Field(default=None, ge=0, le=500_000)
    amenities: list[Amenity] | None = Field(default=None, max_length=len(Amenity))
    furnishing: Furnishing | None = None
    floor: int | None = Field(default=None, ge=-2, le=30)
    max_occupants: int | None = Field(default=None, ge=1, le=20)
    available_from: date | None = None
    area: str | None = Field(default=None, min_length=2, max_length=80, examples=["New Baneshwor"])
    landmark: str | None = Field(default=None, max_length=120, examples=["Near Bhatbhateni"])
    lat: float | None = Field(default=None, examples=[27.6915])
    lng: float | None = Field(default=None, examples=[85.3420])

    @field_validator("title", "description", "area", "landmark")
    @classmethod
    def _strip(cls, v: str | None) -> str | None:
        return v.strip() if isinstance(v, str) else v

    @field_validator("amenities")
    @classmethod
    def _unique(cls, v: list[Amenity] | None) -> list[Amenity] | None:
        return list(dict.fromkeys(v)) if v is not None else v

    @field_validator("lat")
    @classmethod
    def _lat_in_valley(cls, v: float | None) -> float | None:
        if v is not None and not VALLEY_LAT[0] <= v <= VALLEY_LAT[1]:
            raise ValueError("Location must be inside Kathmandu Valley")
        return v

    @field_validator("lng")
    @classmethod
    def _lng_in_valley(cls, v: float | None) -> float | None:
        if v is not None and not VALLEY_LNG[0] <= v <= VALLEY_LNG[1]:
            raise ValueError("Location must be inside Kathmandu Valley")
        return v


class ListingCreate(_ListingFields):
    listing_type: ListingType
    title: str = Field(min_length=5, max_length=120, examples=["Sunny 1BHK near Baneshwor Chowk"])
    rent: int = Field(ge=1000, le=500_000, examples=[15000])
    deposit: int = Field(ge=0, le=2_000_000, examples=[30000])
    area: str = Field(min_length=2, max_length=80, examples=["New Baneshwor"])
    lat: float = Field(examples=[27.6915])
    lng: float = Field(examples=[85.3420])
    amenities: list[Amenity] = Field(default_factory=list, examples=[["water_24h", "bike_parking"]])


class ListingUpdate(_ListingFields):
    listing_type: ListingType | None = None

    @model_validator(mode="after")
    def _lat_lng_together(self) -> "ListingUpdate":
        if (self.lat is None) != (self.lng is None):
            raise ValueError("Send lat and lng together")
        return self


# ---------- Responses ----------

class CostBreakdown(BaseModel):
    rent: int
    water: int
    waste: int
    internet: int
    parking: int
    total_monthly: int


class PhotoOut(BaseModel):
    id: uuid.UUID
    url: str
    position: int


class LatLng(BaseModel):
    lat: float
    lng: float


class ListedBy(BaseModel):
    name: str | None
    role: UserRole
    phone_verified: bool


class ListingOut(BaseModel):
    id: uuid.UUID
    listing_type: ListingType
    status: ListingStatus
    title: str
    description: str | None
    deposit: int
    cost: CostBreakdown
    agent_commission: int | None
    amenities: list[Amenity]
    furnishing: Furnishing
    floor: int | None
    max_occupants: int | None
    available_from: date | None
    area: str
    landmark: str | None
    approx_location: LatLng
    photos: list[PhotoOut]
    listed_by: ListedBy
    last_confirmed_at: datetime | None
    published_at: datetime | None
    created_at: datetime


class OwnerListingOut(ListingOut):
    """What the owner sees: includes the exact location."""

    exact_location: LatLng
    photo_slots_left: int


class ListingCard(BaseModel):
    """Compact version for search results and lists."""

    id: uuid.UUID
    listing_type: ListingType
    title: str
    rent: int
    total_monthly_cost: int
    deposit: int
    area: str
    landmark: str | None
    amenities: list[Amenity]
    cover_photo_url: str | None
    photo_count: int
    approx_location: LatLng
    listed_by_role: UserRole
    last_confirmed_at: datetime | None
    distance_m: int | None = None


class ListingMeta(BaseModel):
    listing_types: list[ListingType]
    amenities: list[Amenity]
    furnishing: list[Furnishing]
    max_photos: int
