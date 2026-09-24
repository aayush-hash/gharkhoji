from pydantic import BaseModel

from app.modules.listings.schemas import ListingCard


class PlaceOut(BaseModel):
    slug: str
    name: str
    name_ne: str
    kind: str
    lat: float
    lng: float


class SearchCenter(BaseModel):
    lat: float
    lng: float
    radius_km: float
    place: str | None = None


class SearchResults(BaseModel):
    items: list[ListingCard]
    total: int
    page: int
    page_size: int
    has_more: bool
    center: SearchCenter | None
