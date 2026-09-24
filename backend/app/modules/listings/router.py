import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.config import settings
from app.core.deps import CurrentUser, DbSession, OptionalUser, StorageDep, require_roles
from app.modules.listings import service
from app.modules.listings.models import Amenity, Furnishing, ListingType
from app.modules.listings.schemas import (
    ListingCard,
    ListingCreate,
    ListingMeta,
    ListingOut,
    ListingUpdate,
    OwnerListingOut,
)
from app.modules.users.models import User, UserRole

router = APIRouter(prefix="/listings", tags=["listings"])

Poster = Annotated[User, Depends(require_roles(UserRole.OWNER, UserRole.AGENT, UserRole.ADMIN))]


def _http(exc: service.ListingError) -> HTTPException:
    return HTTPException(exc.status_code, exc.message)


@router.get("/meta", response_model=ListingMeta)
async def listing_meta() -> ListingMeta:
    """Options for the app's listing form and filters."""
    return ListingMeta(
        listing_types=list(ListingType),
        amenities=list(Amenity),
        furnishing=list(Furnishing),
        max_photos=settings.MAX_PHOTOS_PER_LISTING,
    )


@router.post("", response_model=OwnerListingOut, status_code=status.HTTP_201_CREATED)
async def create_listing(data: ListingCreate, user: Poster, db: DbSession, storage: StorageDep):
    """Creates a DRAFT. Upload photos, then call /publish to make it visible."""
    try:
        listing = await service.create(db, user, data)
    except service.ListingError as exc:
        raise _http(exc) from None
    return service.to_out(listing, storage, user)


@router.get("/mine", response_model=list[ListingCard])
async def my_listings(user: CurrentUser, db: DbSession, storage: StorageDep):
    return [service.to_card(item, storage) for item in await service.list_mine(db, user)]


@router.get("/{listing_id}", response_model=OwnerListingOut | ListingOut)
async def get_listing(listing_id: uuid.UUID, viewer: OptionalUser, db: DbSession, storage: StorageDep):
    try:
        listing = await service.get_visible(db, listing_id, viewer)
    except service.ListingError as exc:
        raise _http(exc) from None
    return service.to_out(listing, storage, viewer)


@router.patch("/{listing_id}", response_model=OwnerListingOut)
async def update_listing(
    listing_id: uuid.UUID, data: ListingUpdate, user: CurrentUser, db: DbSession, storage: StorageDep
):
    try:
        listing = await service.get_owned(db, listing_id, user)
        listing = await service.update(db, listing, user, data)
    except service.ListingError as exc:
        raise _http(exc) from None
    return service.to_out(listing, storage, user)


async def _action(action, listing_id: uuid.UUID, user: User, db, storage):
    try:
        listing = await service.get_owned(db, listing_id, user)
        listing = await action(db, listing)
    except service.ListingError as exc:
        raise _http(exc) from None
    return service.to_out(listing, storage, user)


@router.post("/{listing_id}/publish", response_model=OwnerListingOut)
async def publish_listing(listing_id: uuid.UUID, user: CurrentUser, db: DbSession, storage: StorageDep):
    """Needs at least one uploaded photo."""
    return await _action(service.publish, listing_id, user, db, storage)


@router.post("/{listing_id}/confirm-available", response_model=OwnerListingOut)
async def confirm_available(listing_id: uuid.UUID, user: CurrentUser, db: DbSession, storage: StorageDep):
    """Owner taps 'Still available' → resets the freshness clock."""
    return await _action(service.confirm_available, listing_id, user, db, storage)


@router.post("/{listing_id}/mark-rented", response_model=OwnerListingOut)
async def mark_rented(listing_id: uuid.UUID, user: CurrentUser, db: DbSession, storage: StorageDep):
    return await _action(service.mark_rented, listing_id, user, db, storage)


@router.delete("/{listing_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_listing(listing_id: uuid.UUID, user: CurrentUser, db: DbSession) -> None:
    try:
        listing = await service.get_owned(db, listing_id, user)
        await service.remove(db, listing)
    except service.ListingError as exc:
        raise _http(exc) from None
