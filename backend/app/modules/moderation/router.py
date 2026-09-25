"""Reports (any logged-in user) and the admin API (admins only).

The admin web panel itself is a single page served at /admin (see admin_page.py).
"""
import uuid
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.core.deps import CurrentUser, DbSession, RedisClient, require_roles
from app.modules.listings.models import Listing
from app.modules.moderation import service
from app.modules.moderation.schemas import (
    AdminListingOut,
    AdminUserOut,
    AuditOut,
    ListingReportIn,
    NoteIn,
    ReportCreatedOut,
    ReportOut,
    ResolveIn,
    StatsOut,
)
from app.modules.users.models import User, UserRole

router = APIRouter(tags=["reports & admin"])
Admin = Annotated[User, Depends(require_roles(UserRole.ADMIN))]


def _http(exc: service.ModerationError) -> HTTPException:
    return HTTPException(exc.status_code, exc.message)


# ---------- users ----------

@router.post("/reports/listings/{listing_id}", response_model=ReportCreatedOut, status_code=status.HTTP_201_CREATED)
async def report_listing(listing_id: uuid.UUID, body: ListingReportIn, user: CurrentUser,
                         db: DbSession, redis: RedisClient) -> ReportCreatedOut:
    try:
        await service.report_listing(db, redis, listing_id, user, body.reason, body.details)
    except service.ModerationError as exc:
        raise _http(exc) from None
    return ReportCreatedOut(message="Thanks — our team will review this room.")


# ---------- admin ----------

@router.get("/admin/stats", response_model=StatsOut)
async def admin_stats(_: Admin, db: DbSession) -> StatsOut:
    return StatsOut(**await service.stats(db))


@router.get("/admin/reports", response_model=list[ReportOut])
async def admin_reports(_: Admin, db: DbSession, state: Literal["open", "closed"] = "open"):
    return await service.list_reports(db, state)


@router.post("/admin/reports/{kind}/{report_id}/resolve", status_code=status.HTTP_204_NO_CONTENT)
async def admin_resolve(kind: Literal["listing", "chat"], report_id: uuid.UUID, body: ResolveIn,
                        admin: Admin, db: DbSession) -> None:
    try:
        await service.resolve_report(db, admin, kind, report_id, body.action, body.note)
    except service.ModerationError as exc:
        raise _http(exc) from None


@router.get("/admin/users", response_model=list[AdminUserOut])
async def admin_users(_: Admin, db: DbSession, q: str | None = Query(None, max_length=60),
                      state: Literal["active", "suspended"] | None = None,
                      limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0)):
    return await service.list_users(db, q, state, limit, offset)


async def _user(db: DbSession, user_id: uuid.UUID) -> User:
    user = await db.get(User, user_id)
    if user is None:
        raise HTTPException(404, "User not found")
    return user


@router.post("/admin/users/{user_id}/suspend", status_code=status.HTTP_204_NO_CONTENT)
async def admin_suspend(user_id: uuid.UUID, body: NoteIn, admin: Admin, db: DbSession) -> None:
    try:
        await service.suspend_user(db, admin, await _user(db, user_id), body.note)
    except service.ModerationError as exc:
        raise _http(exc) from None


@router.post("/admin/users/{user_id}/unsuspend", status_code=status.HTTP_204_NO_CONTENT)
async def admin_unsuspend(user_id: uuid.UUID, body: NoteIn, admin: Admin, db: DbSession) -> None:
    try:
        await service.unsuspend_user(db, admin, await _user(db, user_id), body.note)
    except service.ModerationError as exc:
        raise _http(exc) from None


@router.get("/admin/listings", response_model=list[AdminListingOut])
async def admin_listings(_: Admin, db: DbSession, q: str | None = Query(None, max_length=60),
                         state: Literal["draft", "active", "rented", "expired", "removed"] | None = None,
                         limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0)):
    return await service.list_listings(db, q, state, limit, offset)


async def _listing(db: DbSession, listing_id: uuid.UUID) -> Listing:
    listing = await db.get(Listing, listing_id)
    if listing is None:
        raise HTTPException(404, "Listing not found")
    return listing


@router.post("/admin/listings/{listing_id}/remove", status_code=status.HTTP_204_NO_CONTENT)
async def admin_remove_listing(listing_id: uuid.UUID, body: NoteIn, admin: Admin, db: DbSession) -> None:
    try:
        await service.remove_listing(db, admin, await _listing(db, listing_id), body.note)
    except service.ModerationError as exc:
        raise _http(exc) from None


@router.post("/admin/listings/{listing_id}/restore", status_code=status.HTTP_204_NO_CONTENT)
async def admin_restore_listing(listing_id: uuid.UUID, body: NoteIn, admin: Admin, db: DbSession) -> None:
    try:
        await service.restore_listing(db, admin, await _listing(db, listing_id), body.note)
    except service.ModerationError as exc:
        raise _http(exc) from None


@router.get("/admin/audit", response_model=list[AuditOut])
async def admin_audit(_: Admin, db: DbSession, limit: int = Query(100, ge=1, le=500)):
    return await service.audit_log(db, limit)
