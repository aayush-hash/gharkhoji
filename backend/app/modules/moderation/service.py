"""Reports and moderation.

Users report listings (chat reports already exist in the chat module). Admins review both
in one queue and can dismiss, remove the listing, or suspend the person. Every admin action
is written to `admin_actions`, so there is always a record of who did what and why.
"""
import logging
import uuid
from datetime import UTC, datetime, timedelta

from redis.asyncio import Redis
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.core.config import settings
from app.modules.auth.service import revoke_all_sessions
from app.modules.chat.models import ChatReport, Message
from app.modules.listings.models import Listing, ListingStatus
from app.modules.moderation.models import AdminAction, ListingReport
from app.modules.notifications.service import Notification, send_to_user
from app.modules.users.models import User, UserRole

logger = logging.getLogger("gharkhoji.moderation")


class ModerationError(Exception):
    def __init__(self, message: str, status_code: int = 400):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


def _person(user: User | None) -> dict:
    if user is None:
        return {"id": uuid.UUID(int=0), "name": "Deleted user", "phone": "", "role": "tenant", "is_active": False}
    return {"id": user.id, "name": user.full_name, "phone": user.phone, "role": user.role.value,
            "is_active": user.is_active}


async def _audit(db: AsyncSession, admin: User, action: str, target_type: str, target_id: uuid.UUID,
                 note: str | None = None, extra: dict | None = None) -> None:
    db.add(AdminAction(admin_id=admin.id, action=action, target_type=target_type, target_id=target_id,
                       note=note, extra=extra))
    logger.warning("ADMIN %s: %s %s %s (%s)", admin.phone, action, target_type, target_id, note or "-")


async def _notify(db: AsyncSession, user_id: uuid.UUID, title: str, body: str, data: dict | None = None) -> None:
    """Best effort: a failed push never undoes a moderation decision."""
    try:
        await send_to_user(db, user_id, Notification(title=title, body=body, data=data or {}))
    except Exception:  # noqa: BLE001
        logger.exception("Push failed for %s", user_id)


# ---------- user side: report a listing ----------

async def report_listing(
    db: AsyncSession, redis: Redis, listing_id: uuid.UUID, user: User, reason: str, details: str | None
) -> None:
    listing = await db.get(Listing, listing_id)
    if listing is None or listing.status == ListingStatus.REMOVED:
        raise ModerationError("Listing not found", 404)
    if listing.owner_id == user.id:
        raise ModerationError("You can't report your own listing", 400)

    key = f"reports:day:{user.id}"
    count = await redis.incr(key)
    if count == 1:
        await redis.expire(key, 86400)
    if count > settings.REPORTS_PER_DAY:
        raise ModerationError("You've sent a lot of reports today. Please try again tomorrow.", 429)

    already = await db.scalar(select(ListingReport.id).where(
        ListingReport.listing_id == listing_id, ListingReport.reporter_id == user.id,
        ListingReport.status == "open"))
    if already:
        raise ModerationError("You already reported this room. Our team is reviewing it.", 409)

    db.add(ListingReport(listing_id=listing_id, reporter_id=user.id, reason=reason, details=details))
    await db.flush()
    open_count = await db.scalar(select(func.count()).select_from(ListingReport).where(
        ListingReport.listing_id == listing_id, ListingReport.status == "open")) or 0
    await db.commit()
    logger.warning("Listing %s reported (%s) — %s open report(s)", listing_id, reason, open_count)

    if open_count == settings.REPORT_ALERT_THRESHOLD:
        admins = await db.scalars(select(User.id).where(User.role == UserRole.ADMIN, User.is_active.is_(True)))
        for admin_id in admins:
            await _notify(db, admin_id, "⚠️ Listing needs review",
                          f"“{listing.title}” has {open_count} reports.", {"listing_id": str(listing_id)})


# ---------- admin: overview ----------

async def stats(db: AsyncSession) -> dict:
    now = datetime.now(UTC)

    async def count(stmt) -> int:
        return await db.scalar(stmt) or 0

    return {
        "users": await count(select(func.count()).select_from(User)),
        "new_users_7d": await count(select(func.count()).select_from(User)
                                    .where(User.created_at >= now - timedelta(days=7))),
        "suspended_users": await count(select(func.count()).select_from(User).where(User.is_active.is_(False))),
        "active_listings": await count(select(func.count()).select_from(Listing)
                                       .where(Listing.status == ListingStatus.ACTIVE)),
        "open_listing_reports": await count(select(func.count()).select_from(ListingReport)
                                            .where(ListingReport.status == "open")),
        "open_chat_reports": await count(select(func.count()).select_from(ChatReport)
                                         .where(ChatReport.status == "open")),
        "messages_24h": await count(select(func.count()).select_from(Message)
                                    .where(Message.created_at >= now - timedelta(hours=24))),
    }


async def list_reports(db: AsyncSession, status: str = "open", limit: int = 100) -> list[dict]:
    open_only = status == "open"
    Reporter, Owner = aliased(User), aliased(User)  # noqa: N806

    open_counts = (select(ListingReport.listing_id, func.count().label("n"))
                   .where(ListingReport.status == "open").group_by(ListingReport.listing_id).subquery())
    lr_rows = (await db.execute(
        select(ListingReport, Listing, Reporter, Owner, func.coalesce(open_counts.c.n, 0))
        .join(Listing, Listing.id == ListingReport.listing_id)
        .join(Reporter, Reporter.id == ListingReport.reporter_id)
        .join(Owner, Owner.id == Listing.owner_id)
        .outerjoin(open_counts, open_counts.c.listing_id == Listing.id)
        .where((ListingReport.status == "open") if open_only else (ListingReport.status != "open"))
        .order_by(ListingReport.created_at.desc()).limit(limit)
    )).unique().all()

    items: list[dict] = [{
        "kind": "listing", "id": r.id, "reason": r.reason, "details": r.details, "status": r.status,
        "created_at": r.created_at, "reporter": _person(reporter), "reported_user": _person(owner),
        "listing_id": listing.id, "listing_title": listing.title, "listing_status": listing.status.value,
        "open_reports_on_listing": n, "resolution": r.resolution,
    } for r, listing, reporter, owner, n in lr_rows]

    Reported = aliased(User)  # noqa: N806
    cr_rows = (await db.execute(
        select(ChatReport, Reporter, Reported)
        .join(Reporter, Reporter.id == ChatReport.reporter_id)
        .join(Reported, Reported.id == ChatReport.reported_user_id)
        .where((ChatReport.status == "open") if open_only else (ChatReport.status != "open"))
        .order_by(ChatReport.created_at.desc()).limit(limit)
    )).all()
    for r, reporter, reported in cr_rows:
        msgs = list(await db.scalars(select(Message).where(Message.conversation_id == r.conversation_id)
                                     .order_by(Message.created_at.desc()).limit(12)))
        items.append({
            "kind": "chat", "id": r.id, "reason": r.reason, "details": r.details, "status": r.status,
            "created_at": r.created_at, "reporter": _person(reporter), "reported_user": _person(reported),
            "conversation_id": r.conversation_id,
            "recent_messages": [{"from": "reported" if m.sender_id == reported.id else "reporter",
                                 "body": m.body, "at": m.created_at.isoformat()} for m in reversed(msgs)],
        })

    # Most-reported listings first, then newest
    items.sort(key=lambda i: (-i.get("open_reports_on_listing", 0), -i["created_at"].timestamp()))
    return items


# ---------- admin: actions ----------

async def remove_listing(db: AsyncSession, admin: User, listing: Listing, note: str | None,
                         commit: bool = True) -> None:
    if listing.status == ListingStatus.REMOVED:
        raise ModerationError("This listing is already removed", 409)
    listing.status = ListingStatus.REMOVED
    listing.moderated_at = datetime.now(UTC)
    listing.moderation_reason = note or "It doesn't follow GharKhoji's listing rules."
    await _audit(db, admin, "remove_listing", "listing", listing.id, note)
    if commit:
        await db.commit()
    await _notify(db, listing.owner_id, "Your listing was removed",
                  f"“{listing.title}”: {listing.moderation_reason} Contact support if you think this is a mistake.")


async def restore_listing(db: AsyncSession, admin: User, listing: Listing, note: str | None) -> None:
    if listing.status != ListingStatus.REMOVED or listing.moderated_at is None:
        raise ModerationError("Only listings removed by a moderator can be restored", 409)
    now = datetime.now(UTC)
    listing.status = ListingStatus.ACTIVE
    listing.moderated_at = None
    listing.moderation_reason = None
    listing.expired_at = None
    listing.last_confirmed_at = now
    listing.reminder_sent_at = None
    listing.reminders_sent = 0
    await _audit(db, admin, "restore_listing", "listing", listing.id, note)
    await db.commit()


async def suspend_user(db: AsyncSession, admin: User, user: User, note: str | None, commit: bool = True) -> None:
    if user.id == admin.id:
        raise ModerationError("You can't suspend yourself", 400)
    if user.role == UserRole.ADMIN:
        raise ModerationError("Admins can't be suspended here", 400)
    if not user.is_active:
        raise ModerationError("This account is already suspended", 409)
    user.is_active = False
    await revoke_all_sessions(db, user.id)  # logged out on every phone
    await _audit(db, admin, "suspend_user", "user", user.id, note)
    if commit:
        await db.commit()


async def unsuspend_user(db: AsyncSession, admin: User, user: User, note: str | None) -> None:
    if user.is_active:
        raise ModerationError("This account isn't suspended", 409)
    user.is_active = True
    await _audit(db, admin, "unsuspend_user", "user", user.id, note)
    await db.commit()


async def _close_listing_reports(db: AsyncSession, admin: User, listing_id: uuid.UUID, resolution: str) -> None:
    rows = await db.scalars(select(ListingReport).where(
        ListingReport.listing_id == listing_id, ListingReport.status == "open"))
    now = datetime.now(UTC)
    for r in rows:
        r.status, r.resolution, r.resolved_at, r.resolved_by_id = "resolved", resolution, now, admin.id


async def resolve_report(db: AsyncSession, admin: User, kind: str, report_id: uuid.UUID,
                         action: str, note: str | None) -> None:
    if kind == "listing":
        report = await db.get(ListingReport, report_id)
        if report is None:
            raise ModerationError("Report not found", 404)
        if report.status != "open":
            raise ModerationError("This report was already handled", 409)
        listing = await db.get(Listing, report.listing_id)
        if action == "dismiss":
            report.status, report.resolution = "dismissed", "dismissed"
            report.resolved_at, report.resolved_by_id = datetime.now(UTC), admin.id
            await _audit(db, admin, "dismiss_report", "report", report.id, note)
            await db.commit()
        elif action == "remove_listing":
            await _close_listing_reports(db, admin, listing.id, "listing_removed")
            await remove_listing(db, admin, listing, note)  # commits
        else:  # suspend_user = the person who posted it
            owner = await db.get(User, listing.owner_id)
            await suspend_user(db, admin, owner, note, commit=False)
            await _close_listing_reports(db, admin, listing.id, "user_suspended")
            await db.commit()
        return

    report = await db.get(ChatReport, report_id)
    if report is None:
        raise ModerationError("Report not found", 404)
    if report.status != "open":
        raise ModerationError("This report was already handled", 409)
    if action == "remove_listing":
        raise ModerationError("Chat reports can be dismissed or the person suspended", 400)
    if action == "dismiss":
        report.status = "dismissed"
        await _audit(db, admin, "dismiss_chat_report", "report", report.id, note)
    else:
        reported = await db.get(User, report.reported_user_id)
        await suspend_user(db, admin, reported, note, commit=False)
        report.status = "resolved"
        # Close every other open chat report against the same person too
        others = await db.scalars(select(ChatReport).where(
            ChatReport.reported_user_id == reported.id, ChatReport.status == "open"))
        for other in others:
            other.status = "resolved"
    await db.commit()


# ---------- admin: browse ----------

async def list_users(db: AsyncSession, q: str | None, status: str | None, limit: int, offset: int) -> list[dict]:
    listings = (select(Listing.owner_id, func.count().label("n"))
                .where(Listing.status != ListingStatus.REMOVED).group_by(Listing.owner_id).subquery())
    chat_reports = (select(ChatReport.reported_user_id.label("uid"), func.count().label("n"))
                    .group_by(ChatReport.reported_user_id).subquery())
    listing_reports = (select(Listing.owner_id.label("uid"), func.count().label("n"))
                       .join(ListingReport, ListingReport.listing_id == Listing.id)
                       .group_by(Listing.owner_id).subquery())
    stmt = (select(User, func.coalesce(listings.c.n, 0), func.coalesce(chat_reports.c.n, 0)
                   + func.coalesce(listing_reports.c.n, 0))
            .outerjoin(listings, listings.c.owner_id == User.id)
            .outerjoin(chat_reports, chat_reports.c.uid == User.id)
            .outerjoin(listing_reports, listing_reports.c.uid == User.id))
    if q:
        like = f"%{q.strip()}%"
        stmt = stmt.where(or_(User.phone.ilike(like), User.full_name.ilike(like)))
    if status == "suspended":
        stmt = stmt.where(User.is_active.is_(False))
    elif status == "active":
        stmt = stmt.where(User.is_active.is_(True))
    rows = (await db.execute(stmt.order_by(User.created_at.desc()).limit(limit).offset(offset))).all()
    return [{**_person(u), "created_at": u.created_at, "last_login_at": u.last_login_at,
             "listings": n_listings, "reports_against": n_reports} for u, n_listings, n_reports in rows]


async def list_listings(db: AsyncSession, q: str | None, status: str | None, limit: int, offset: int) -> list[dict]:
    open_counts = (select(ListingReport.listing_id, func.count().label("n"))
                   .where(ListingReport.status == "open").group_by(ListingReport.listing_id).subquery())
    stmt = (select(Listing, func.coalesce(open_counts.c.n, 0))
            .outerjoin(open_counts, open_counts.c.listing_id == Listing.id))
    if q:
        like = f"%{q.strip()}%"
        stmt = stmt.where(or_(Listing.title.ilike(like), Listing.area.ilike(like)))
    if status:
        stmt = stmt.where(Listing.status == ListingStatus(status))
    rows = (await db.execute(
        stmt.order_by(func.coalesce(open_counts.c.n, 0).desc(), Listing.created_at.desc()).limit(limit).offset(offset)
    )).unique().all()
    return [{"id": listing.id, "title": listing.title, "area": listing.area, "status": listing.status.value,
             "total_monthly_cost": listing.total_monthly_cost, "owner": _person(listing.owner),
             "open_reports": n, "created_at": listing.created_at,
             "moderation_reason": listing.moderation_reason} for listing, n in rows]


async def audit_log(db: AsyncSession, limit: int = 100) -> list[dict]:
    rows = (await db.execute(
        select(AdminAction, User).outerjoin(User, User.id == AdminAction.admin_id)
        .order_by(AdminAction.created_at.desc()).limit(limit)
    )).all()
    return [{"id": a.id, "admin": (u.full_name or u.phone) if u else None, "action": a.action,
             "target_type": a.target_type, "target_id": a.target_id, "note": a.note,
             "created_at": a.created_at} for a, u in rows]
