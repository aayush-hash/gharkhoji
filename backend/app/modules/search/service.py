"""Listing search: filters, radius search with PostGIS, sorting."""
from dataclasses import dataclass, field
from typing import Literal

from geoalchemy2 import Geography
from sqlalchemy import cast, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.listings.models import Amenity, Furnishing, Listing, ListingStatus, ListingType

SortOption = Literal["freshness", "price_low", "price_high", "distance", "newest"]


@dataclass
class SearchParams:
    lat: float | None = None
    lng: float | None = None
    radius_km: float = 2.0
    min_rent: int | None = None
    max_rent: int | None = None
    types: list[ListingType] = field(default_factory=list)
    amenities: list[Amenity] = field(default_factory=list)
    furnishing: Furnishing | None = None
    text: str | None = None
    sort: SortOption = "freshness"
    page: int = 1
    page_size: int = 20


async def search_listings(db: AsyncSession, p: SearchParams) -> tuple[list[tuple[Listing, float | None]], int]:
    total_cost = (
        Listing.rent + Listing.water_charge + Listing.waste_charge + Listing.internet_charge + Listing.parking_charge
    )
    conditions = [Listing.status == ListingStatus.ACTIVE]

    distance = None
    if p.lat is not None and p.lng is not None:
        center = cast(func.ST_SetSRID(func.ST_MakePoint(p.lng, p.lat), 4326), Geography)
        # ST_DWithin uses the GiST index on `location`, so this stays fast with many listings.
        conditions.append(func.ST_DWithin(Listing.location, center, p.radius_km * 1000))
        distance = func.ST_Distance(Listing.location, center)

    if p.min_rent is not None:
        conditions.append(Listing.rent >= p.min_rent)
    if p.max_rent is not None:
        conditions.append(Listing.rent <= p.max_rent)
    if p.types:
        conditions.append(Listing.listing_type.in_(p.types))
    if p.amenities:
        # "has ALL of these amenities" — uses the GIN index on the array column
        conditions.append(Listing.amenities.contains([a.value for a in p.amenities]))
    if p.furnishing:
        conditions.append(Listing.furnishing == p.furnishing)
    if p.text:
        like = f"%{p.text.strip()}%"
        conditions.append(or_(Listing.title.ilike(like), Listing.area.ilike(like), Listing.landmark.ilike(like)))

    total = await db.scalar(select(func.count()).select_from(Listing).where(*conditions)) or 0

    order_by = {
        "freshness": [Listing.last_confirmed_at.desc().nulls_last()],
        "newest": [Listing.published_at.desc().nulls_last()],
        "price_low": [total_cost.asc()],
        "price_high": [total_cost.desc()],
        "distance": [distance.asc()] if distance is not None else [],
    }[p.sort]

    columns = [Listing, distance.label("distance_m")] if distance is not None else [Listing]
    query = (
        select(*columns)
        .where(*conditions)
        .order_by(*order_by, Listing.id)  # id = stable tie-breaker for pagination
        .offset((p.page - 1) * p.page_size)
        .limit(p.page_size)
    )
    rows = (await db.execute(query)).unique().all()
    results = [(row[0], row[1] if distance is not None else None) for row in rows]
    return results, total
