"""Listing photos: hand out upload URLs, confirm uploads, delete, reorder."""
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.storage import Storage, build_photo_key
from app.modules.listings.models import Listing, ListingStatus
from app.modules.listings.service import ListingError
from app.modules.media.models import ListingPhoto, PhotoStatus
from app.modules.media.schemas import UploadRequest, UploadTicket

# A pending upload that was never finished stops counting against the limit after this long.
PENDING_TTL = timedelta(hours=1)


def _slots_used(listing: Listing) -> int:
    cutoff = datetime.now(UTC) - PENDING_TTL
    return sum(
        1 for p in listing.photos
        if p.status == PhotoStatus.UPLOADED or (p.created_at and p.created_at > cutoff)
    )


def _find_photo(listing: Listing, photo_id: uuid.UUID) -> ListingPhoto:
    for photo in listing.photos:
        if photo.id == photo_id:
            return photo
    raise ListingError("Photo not found", 404)


def _check_editable(listing: Listing) -> None:
    if listing.status in {ListingStatus.RENTED, ListingStatus.REMOVED}:
        raise ListingError(f"Can't change photos of a {listing.status.value} listing", 409)


async def create_upload(
    db: AsyncSession, storage: Storage, listing: Listing, req: UploadRequest
) -> UploadTicket:
    _check_editable(listing)
    if _slots_used(listing) >= settings.MAX_PHOTOS_PER_LISTING:
        raise ListingError(f"A listing can have at most {settings.MAX_PHOTOS_PER_LISTING} photos", 409)

    key = build_photo_key(listing.id, req.content_type)
    next_position = max((p.position for p in listing.photos), default=-1) + 1
    photo = ListingPhoto(
        listing_id=listing.id,
        storage_key=key,
        content_type=req.content_type,
        size_bytes=req.size_bytes,
        position=next_position,
        created_at=datetime.now(UTC),
    )
    db.add(photo)
    await db.commit()

    target = storage.create_upload(key, req.content_type, settings.MAX_PHOTO_BYTES)
    return UploadTicket(
        photo_id=photo.id,
        upload_url=target["url"],
        method=target["method"],
        headers=target["headers"],
        expires_in=settings.UPLOAD_URL_EXPIRE_SECONDS,
    )


async def complete_upload(db: AsyncSession, storage: Storage, listing: Listing, photo_id: uuid.UUID) -> None:
    """Called by the app after the PUT succeeds. We check the file really exists."""
    photo = _find_photo(listing, photo_id)
    if photo.status == PhotoStatus.UPLOADED:
        return
    size = await storage.object_size(photo.storage_key)
    if size is None:
        raise ListingError("Upload not found. Upload the file first, then call complete.", 409)
    if size > settings.MAX_PHOTO_BYTES:
        await storage.delete(photo.storage_key)
        await db.delete(photo)
        await db.commit()
        raise ListingError("Photo is too large (max 10 MB)", 413)
    photo.size_bytes = size
    photo.status = PhotoStatus.UPLOADED
    await db.commit()


async def delete_photo(db: AsyncSession, storage: Storage, listing: Listing, photo_id: uuid.UUID) -> None:
    _check_editable(listing)
    photo = _find_photo(listing, photo_id)
    remaining = [p for p in listing.uploaded_photos if p.id != photo.id]
    if listing.status == ListingStatus.ACTIVE and photo.status == PhotoStatus.UPLOADED and not remaining:
        raise ListingError("A published listing needs at least one photo", 409)
    await storage.delete(photo.storage_key)
    await db.delete(photo)
    await db.commit()


async def reorder(db: AsyncSession, listing: Listing, photo_ids: list[uuid.UUID]) -> None:
    uploaded = {p.id: p for p in listing.uploaded_photos}
    if set(photo_ids) != set(uploaded) or len(photo_ids) != len(uploaded):
        raise ListingError("Send every uploaded photo id exactly once", 422)
    for position, pid in enumerate(photo_ids):
        uploaded[pid].position = position
    await db.commit()
