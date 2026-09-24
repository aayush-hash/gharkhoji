from typing import Annotated

from fastapi import APIRouter, HTTPException, Query

from app.core.deps import DbSession, StorageDep
from app.modules.listings.models import Amenity, Furnishing, ListingType
from app.modules.listings.schemas import VALLEY_LAT, VALLEY_LNG
from app.modules.listings.service import to_card
from app.modules.search.places import find_place, search_places
from app.modules.search.schemas import PlaceOut, SearchCenter, SearchResults
from app.modules.search.service import SearchParams, SortOption, search_listings

router = APIRouter(prefix="/search", tags=["search"])


@router.get("/places", response_model=list[PlaceOut])
async def places(q: Annotated[str | None, Query(description="e.g. 'baneshwor' or 'बानेश्वर'")] = None):
    """Areas and landmarks for the home screen chips and the 'near…' search box."""
    return [PlaceOut(**p.__dict__) for p in search_places(q)]


@router.get("/listings", response_model=SearchResults)
async def search(
    db: DbSession,
    storage: StorageDep,
    place: Annotated[str | None, Query(description="Place slug from /search/places, e.g. koteshwor")] = None,
    lat: Annotated[float | None, Query(ge=VALLEY_LAT[0], le=VALLEY_LAT[1])] = None,
    lng: Annotated[float | None, Query(ge=VALLEY_LNG[0], le=VALLEY_LNG[1])] = None,
    radius_km: Annotated[float, Query(gt=0, le=20)] = 2.0,
    min_rent: Annotated[int | None, Query(ge=0)] = None,
    max_rent: Annotated[int | None, Query(ge=0)] = None,
    types: Annotated[list[ListingType] | None, Query(alias="type")] = None,
    amenities: Annotated[list[Amenity] | None, Query(alias="amenity")] = None,
    furnishing: Furnishing | None = None,
    q: Annotated[str | None, Query(max_length=80, description="Text in title, area or landmark")] = None,
    sort: SortOption = "freshness",
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=50)] = 20,
) -> SearchResults:
    """Search active listings.

    Location: pass either `place` (a slug) or `lat` + `lng` (e.g. the phone's GPS),
    plus `radius_km`. Repeat `type` / `amenity` for several values:
    `?type=room&type=1bhk&amenity=water_24h&amenity=bike_parking`
    """
    place_name = None
    if place:
        found = find_place(place)
        if found is None:
            raise HTTPException(404, f"Unknown place '{place}'. See /search/places")
        lat, lng, place_name = found.lat, found.lng, found.name
    if (lat is None) != (lng is None):
        raise HTTPException(422, "Send lat and lng together")
    if sort == "distance" and lat is None:
        raise HTTPException(422, "Sorting by distance needs a location (place or lat/lng)")
    if min_rent is not None and max_rent is not None and min_rent > max_rent:
        raise HTTPException(422, "min_rent can't be more than max_rent")

    params = SearchParams(
        lat=lat, lng=lng, radius_km=radius_km, min_rent=min_rent, max_rent=max_rent,
        types=types or [], amenities=amenities or [], furnishing=furnishing, text=q,
        sort=sort, page=page, page_size=page_size,
    )
    rows, total = await search_listings(db, params)
    return SearchResults(
        items=[to_card(listing, storage, dist) for listing, dist in rows],
        total=total,
        page=page,
        page_size=page_size,
        has_more=page * page_size < total,
        center=SearchCenter(lat=lat, lng=lng, radius_km=radius_km, place=place_name) if lat is not None else None,
    )
