import math
import random
import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.storage import Storage
from app.modules.listings.models import Listing, ListingStatus
from app.modules.listings.schemas import (
    CostBreakdown,
    LatLng,
    ListedBy,
    ListingCard,
    ListingCreate,
    ListingOut,
    ListingUpdate,
    OwnerListingOut,
    PhotoOut,
)
from app.modules.users.models import User, UserRole


class ListingError(Exception):
    def __init__(self, message: str, status_code: int = 400):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


EDITABLE = {ListingStatus.DRAFT, ListingStatus.ACTIVE, ListingStatus.EXPIRED}


# ---------- location helpers ----------

def point_wkt(lat: float, lng: float) -> str:
    return f"SRID=4326;POINT({lng} {lat})"  # WKT is (longitude latitude)


def jitter(lat: float, lng: float, min_m: float = 150, max_m: float = 300) -> tuple[float, float]:
    """Move a point randomly 150-300 m so the public map never shows the exact house."""
    distance = random.uniform(min_m, max_m)
    bearing = random.uniform(0, 2 * math.pi)
    dlat = distance * math.cos(bearing) / 111_320
    dlng = distance * math.sin(bearing) / (111_320 * math.cos(math.radians(lat)))
    return round(lat + dlat, 6), round(lng + dlng, 6)


def _set_location(listing: Listing, lat: float, lng: float) -> None:
    listing.lat, listing.lng = lat, lng
    listing.location = point_wkt(lat, lng)
    listing.public_lat, listing.public_lng = jitter(lat, lng)


# ---------- queries ----------

async def get(db: AsyncSession, listing_id: uuid.UUID) -> Listing | None:
    return await db.get(Listing, listing_id)


async def get_visible(db: AsyncSession, listing_id: uuid.UUID, viewer: User | None) -> Listing:
    """Anyone can see active listings; owners and admins can also see their own non-active ones."""
    listing = await get(db, listing_id)
    if listing is None or listing.status == ListingStatus.REMOVED:
        raise ListingError("Listing not found", 404)
    if listing.status != ListingStatus.ACTIVE and not _can_manage(listing, viewer):
        raise ListingError("Listing not found", 404)
    return listing


async def get_owned(db: AsyncSession, listing_id: uuid.UUID, user: User) -> Listing:
    listing = await get(db, listing_id)
    if listing is None or listing.status == ListingStatus.REMOVED:
        raise ListingError("Listing not found", 404)
    if not _can_manage(listing, user):
        raise ListingError("Only the person who posted this listing can change it", 403)
    return listing


def _can_manage(listing: Listing, user: User | None) -> bool:
    return user is not None and (listing.owner_id == user.id or user.role == UserRole.ADMIN)


async def list_mine(db: AsyncSession, user: User) -> list[Listing]:
    result = await db.scalars(
        select(Listing)
        .where(Listing.owner_id == user.id, Listing.status != ListingStatus.REMOVED)
        .order_by(Listing.created_at.desc())
    )
    return list(result.unique())


# ---------- commands ----------

def _check_commission(user: User, commission: int | None) -> int | None:
    """Agents must show their commission up front. Owners never charge one."""
    if user.role == UserRole.AGENT:
        if commission is None:
            raise ListingError("Agents must state their commission (use 0 if none)", 422)
        return commission
    return None


async def create(db: AsyncSession, user: User, data: ListingCreate) -> Listing:
    fields = data.model_dump(exclude={"lat", "lng", "agent_commission"})
    fields["amenities"] = [a.value for a in data.amenities]
    listing = Listing(owner_id=user.id, **fields)
    listing.agent_commission = _check_commission(user, data.agent_commission)
    _set_location(listing, data.lat, data.lng)
    db.add(listing)
    await db.commit()
    return await reload(db, listing.id)


async def update(db: AsyncSession, listing: Listing, user: User, data: ListingUpdate) -> Listing:
    if listing.status not in EDITABLE:
        raise ListingError(f"A {listing.status.value} listing can't be edited", 409)
    changes = data.model_dump(exclude_unset=True, exclude={"lat", "lng"})
    for field in ("title", "rent", "deposit", "area", "listing_type"):
        if field in changes and changes[field] is None:
            raise ListingError(f"{field} can't be empty", 422)
    if "amenities" in changes and changes["amenities"] is not None:
        changes["amenities"] = [a.value for a in data.amenities]
    if "agent_commission" in changes:
        owner = listing.owner
        changes["agent_commission"] = _check_commission(owner, changes["agent_commission"])
    for field, value in changes.items():
        setattr(listing, field, value)
    if data.lat is not None and data.lng is not None:
        _set_location(listing, data.lat, data.lng)
    await db.commit()
    return await reload(db, listing.id)


async def publish(db: AsyncSession, listing: Listing) -> Listing:
    if listing.status not in {ListingStatus.DRAFT, ListingStatus.EXPIRED, ListingStatus.RENTED}:
        raise ListingError(f"A {listing.status.value} listing can't be published", 409)
    if not listing.uploaded_photos:
        raise ListingError("Add at least one photo before publishing", 422)
    now = datetime.now(UTC)
    listing.status = ListingStatus.ACTIVE
    listing.published_at = listing.published_at or now
    listing.last_confirmed_at = now
    listing.rented_at = None
    _reset_freshness(listing)
    await db.commit()
    return await reload(db, listing.id)


def _reset_freshness(listing: Listing) -> None:
    listing.expired_at = None
    listing.reminder_sent_at = None
    listing.reminders_sent = 0


async def confirm_available(db: AsyncSession, listing: Listing) -> Listing:
    """The owner taps 'Still available'. Used by the freshness system on Day 4."""
    if listing.status not in {ListingStatus.ACTIVE, ListingStatus.EXPIRED}:
        raise ListingError("Only published listings can be confirmed", 409)
    listing.status = ListingStatus.ACTIVE
    listing.last_confirmed_at = datetime.now(UTC)
    _reset_freshness(listing)
    await db.commit()
    return await reload(db, listing.id)


async def mark_rented(db: AsyncSession, listing: Listing) -> Listing:
    if listing.status not in {ListingStatus.ACTIVE, ListingStatus.EXPIRED}:
        raise ListingError("Only published listings can be marked as rented", 409)
    listing.status = ListingStatus.RENTED
    listing.rented_at = datetime.now(UTC)
    await db.commit()
    return await reload(db, listing.id)


async def remove(db: AsyncSession, listing: Listing) -> None:
    listing.status = ListingStatus.REMOVED  # soft delete: keeps history for reports/moderation
    await db.commit()


async def reload(db: AsyncSession, listing_id: uuid.UUID) -> Listing:
    db.expire_all()
    listing = await db.get(Listing, listing_id)
    assert listing is not None
    return listing


# ---------- response builders ----------

def _cost(listing: Listing) -> CostBreakdown:
    return CostBreakdown(
        rent=listing.rent,
        water=listing.water_charge,
        waste=listing.waste_charge,
        internet=listing.internet_charge,
        parking=listing.parking_charge,
        total_monthly=listing.total_monthly_cost,
    )


def _photos(listing: Listing, storage: Storage) -> list[PhotoOut]:
    return [PhotoOut(id=p.id, url=storage.public_url(p.storage_key), position=p.position)
            for p in listing.uploaded_photos]


def to_out(listing: Listing, storage: Storage, viewer: User | None) -> ListingOut | OwnerListingOut:
    base = {
        "id": listing.id,
        "listing_type": listing.listing_type,
        "status": listing.status,
        "title": listing.title,
        "description": listing.description,
        "deposit": listing.deposit,
        "cost": _cost(listing),
        "agent_commission": listing.agent_commission,
        "amenities": listing.amenities,
        "furnishing": listing.furnishing,
        "floor": listing.floor,
        "max_occupants": listing.max_occupants,
        "available_from": listing.available_from,
        "area": listing.area,
        "landmark": listing.landmark,
        "approx_location": LatLng(lat=listing.public_lat, lng=listing.public_lng),
        "photos": _photos(listing, storage),
        "listed_by": ListedBy(
            name=listing.owner.full_name,
            role=listing.owner.role,
            phone_verified=listing.owner.phone_verified_at is not None,
        ),
        "last_confirmed_at": listing.last_confirmed_at,
        "published_at": listing.published_at,
        "created_at": listing.created_at,
    }
    if _can_manage(listing, viewer):
        return OwnerListingOut(
            **base,
            exact_location=LatLng(lat=listing.lat, lng=listing.lng),
            photo_slots_left=max(0, settings.MAX_PHOTOS_PER_LISTING - len(listing.photos)),
            needs_confirmation=listing.needs_confirmation,
        )
    return ListingOut(**base)


def to_card(listing: Listing, storage: Storage, distance_m: float | None = None) -> ListingCard:
    photos = listing.uploaded_photos
    return ListingCard(
        id=listing.id,
        listing_type=listing.listing_type,
        title=listing.title,
        rent=listing.rent,
        total_monthly_cost=listing.total_monthly_cost,
        deposit=listing.deposit,
        area=listing.area,
        landmark=listing.landmark,
        amenities=listing.amenities,
        cover_photo_url=storage.public_url(photos[0].storage_key) if photos else None,
        photo_count=len(photos),
        approx_location=LatLng(lat=listing.public_lat, lng=listing.public_lng),
        listed_by_role=listing.owner.role,
        last_confirmed_at=listing.last_confirmed_at,
        distance_m=round(distance_m) if distance_m is not None else None,
        status=listing.status,
        needs_confirmation=listing.needs_confirmation,
    )
