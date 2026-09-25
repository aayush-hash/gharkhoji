import uuid

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert

from app.core.deps import CurrentUser, DbSession, StorageDep
from app.modules.favorites.models import Favorite
from app.modules.listings.models import Listing, ListingStatus
from app.modules.listings.schemas import ListingCard
from app.modules.listings.service import to_card

router = APIRouter(prefix="/favorites", tags=["saved rooms"])


@router.get("", response_model=list[ListingCard])
async def list_saved(user: CurrentUser, db: DbSession, storage: StorageDep):
    """Saved rooms, newest first. Rooms that were rented/removed stay listed with their status
    (so the tenant understands why it's gone) — except removed ones, which are hidden."""
    rows = await db.scalars(
        select(Listing)
        .join(Favorite, Favorite.listing_id == Listing.id)
        .where(Favorite.user_id == user.id, Listing.status != ListingStatus.REMOVED)
        .order_by(Favorite.created_at.desc())
    )
    return [to_card(listing, storage) for listing in rows.unique()]


@router.get("/ids", response_model=list[uuid.UUID])
async def saved_ids(user: CurrentUser, db: DbSession):
    """Just the ids — lets the app draw filled ♥ icons everywhere cheaply."""
    return list(await db.scalars(select(Favorite.listing_id).where(Favorite.user_id == user.id)))


@router.put("/{listing_id}", status_code=status.HTTP_204_NO_CONTENT)
async def save(listing_id: uuid.UUID, user: CurrentUser, db: DbSession) -> None:
    listing = await db.get(Listing, listing_id)
    if listing is None or listing.status != ListingStatus.ACTIVE:
        raise HTTPException(404, "Listing not found")
    await db.execute(
        insert(Favorite).values(user_id=user.id, listing_id=listing_id).on_conflict_do_nothing()
    )
    await db.commit()


@router.delete("/{listing_id}", status_code=status.HTTP_204_NO_CONTENT)
async def unsave(listing_id: uuid.UUID, user: CurrentUser, db: DbSession) -> None:
    await db.execute(delete(Favorite).where(Favorite.user_id == user.id, Favorite.listing_id == listing_id))
    await db.commit()
