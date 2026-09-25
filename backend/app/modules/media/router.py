import logging
import uuid

import jwt
from fastapi import APIRouter, HTTPException, Request, status

from app.core.config import settings
from app.core.deps import CurrentUser, DbSession, StorageDep
from app.core.storage import LocalStorage, sniff_image_type
from app.modules.listings import service as listing_service
from app.modules.listings.schemas import OwnerListingOut
from app.modules.media import service
from app.modules.media.schemas import PhotoOrder, UploadRequest, UploadTicket

router = APIRouter(tags=["photos"])
logger = logging.getLogger("gharkhoji.media")


def _http(exc: listing_service.ListingError) -> HTTPException:
    return HTTPException(exc.status_code, exc.message)


@router.post("/listings/{listing_id}/photos/upload-url", response_model=UploadTicket)
async def get_upload_url(
    listing_id: uuid.UUID, body: UploadRequest, user: CurrentUser, db: DbSession, storage: StorageDep
):
    """Step 1 of 3: get a URL to upload one photo to."""
    try:
        listing = await listing_service.get_owned(db, listing_id, user)
        return await service.create_upload(db, storage, listing, body)
    except listing_service.ListingError as exc:
        raise _http(exc) from None


@router.post("/listings/{listing_id}/photos/{photo_id}/complete", response_model=OwnerListingOut)
async def complete_upload(
    listing_id: uuid.UUID, photo_id: uuid.UUID, user: CurrentUser, db: DbSession, storage: StorageDep
):
    """Step 3 of 3: confirm the upload finished. Returns the updated listing."""
    try:
        listing = await listing_service.get_owned(db, listing_id, user)
        await service.complete_upload(db, storage, listing, photo_id)
        listing = await listing_service.reload(db, listing_id)
    except listing_service.ListingError as exc:
        raise _http(exc) from None
    return listing_service.to_out(listing, storage, user)


@router.delete("/listings/{listing_id}/photos/{photo_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_photo(
    listing_id: uuid.UUID, photo_id: uuid.UUID, user: CurrentUser, db: DbSession, storage: StorageDep
) -> None:
    try:
        listing = await listing_service.get_owned(db, listing_id, user)
        await service.delete_photo(db, storage, listing, photo_id)
    except listing_service.ListingError as exc:
        raise _http(exc) from None


@router.put("/listings/{listing_id}/photos/order", response_model=OwnerListingOut)
async def reorder_photos(
    listing_id: uuid.UUID, body: PhotoOrder, user: CurrentUser, db: DbSession, storage: StorageDep
):
    """The first photo becomes the cover photo in search results."""
    try:
        listing = await listing_service.get_owned(db, listing_id, user)
        await service.reorder(db, listing, body.photo_ids)
        listing = await listing_service.reload(db, listing_id)
    except listing_service.ListingError as exc:
        raise _http(exc) from None
    return listing_service.to_out(listing, storage, user)


@router.put("/media/local-upload", status_code=status.HTTP_204_NO_CONTENT, include_in_schema=False)
async def local_upload(token: str, request: Request, storage: StorageDep) -> None:
    """Step 2 of 3 in DEVELOPMENT only. In production the app uploads straight to R2/S3."""
    if not isinstance(storage, LocalStorage):
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    try:
        claims = LocalStorage.decode_upload_token(token)
    except jwt.PyJWTError:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Upload link invalid or expired") from None

    # Note: we don't trust the Content-Type header — the real check is on the file bytes below.
    sent_type = request.headers.get("content-type", "").split(";")[0].strip()

    data = bytearray()
    async for chunk in request.stream():
        data.extend(chunk)
        if len(data) > claims["max"]:
            raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "Photo is too large (max 10 MB)")
    detected = sniff_image_type(bytes(data[:16]))
    if detected != claims["ct"]:
        logger.warning(
            "Upload rejected: expected %s, detected %s, header %r, %d bytes, starts with %r",
            claims["ct"], detected, sent_type, len(data), bytes(data[:8]),
        )
        if not data:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "The upload was empty. Please try again.")
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "File is not a valid image of the declared type")
    storage.write(claims["key"], bytes(data))


def mount_local_files(app) -> None:
    """Serve uploaded photos at /media/files/... when using local storage."""
    if settings.STORAGE_BACKEND == "local":
        from fastapi.staticfiles import StaticFiles

        storage = LocalStorage(settings.MEDIA_ROOT)
        app.mount("/media/files", StaticFiles(directory=storage.root), name="media")
