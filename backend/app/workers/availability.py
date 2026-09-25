"""The freshness system — GharKhoji's core promise: "confirmed available X hours ago".

Every few minutes:
  1. EXPIRE   active listings not confirmed for EXPIRE_AFTER_HOURS (72h)  → hidden from search
  2. REMIND   active listings not confirmed for CONFIRM_REMINDER_AFTER_HOURS (48h)
              → push "Is it still available?" (repeated every REMINDER_REPEAT_HOURS)

The owner taps "Still available" (POST /listings/{id}/confirm-available) and the clock resets.
An expired listing comes back the moment the owner confirms it.

Everything here is safe to run twice: each step only touches rows that still need it.
"""
import logging
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import and_, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.modules.listings.models import Listing, ListingStatus
from app.modules.notifications.service import Notification, send_to_user

logger = logging.getLogger("gharkhoji.worker")


@dataclass
class CycleResult:
    expired: int = 0
    reminded: int = 0


async def expire_stale(db: AsyncSession, now: datetime) -> int:
    cutoff = now - timedelta(hours=settings.EXPIRE_AFTER_HOURS)
    rows = (
        await db.execute(
            update(Listing)
            .where(Listing.status == ListingStatus.ACTIVE, Listing.last_confirmed_at < cutoff)
            .values(status=ListingStatus.EXPIRED, expired_at=now)
            .returning(Listing.id, Listing.owner_id, Listing.title)
        )
    ).all()
    await db.commit()

    for listing_id, owner_id, title in rows:
        await send_to_user(
            db,
            owner_id,
            Notification(
                title="Listing hidden from search",
                body=f"“{title}” wasn't confirmed for 3 days. Tap to confirm it's still available.",
                data={"type": "listing_expired", "listing_id": str(listing_id)},
            ),
        )
    return len(rows)


async def send_reminders(db: AsyncSession, now: datetime) -> int:
    due = now - timedelta(hours=settings.CONFIRM_REMINDER_AFTER_HOURS)
    repeat = now - timedelta(hours=settings.REMINDER_REPEAT_HOURS)
    listings = (
        await db.scalars(
            select(Listing).where(
                Listing.status == ListingStatus.ACTIVE,
                Listing.last_confirmed_at < due,
                or_(
                    Listing.reminder_sent_at.is_(None),
                    Listing.reminder_sent_at < repeat,
                    # confirmed again since the last reminder → start fresh
                    and_(Listing.reminder_sent_at.is_not(None), Listing.reminder_sent_at < Listing.last_confirmed_at),
                ),
            )
        )
    ).unique().all()

    for listing in listings:
        listing.reminder_sent_at = now
        listing.reminders_sent += 1
    await db.commit()

    for listing in listings:
        await send_to_user(
            db,
            listing.owner_id,
            Notification(
                title="Is your room still available?",
                body=f"“{listing.title}” — tap Yes or Rented. Unconfirmed listings are hidden after 3 days.",
                data={"type": "confirm_availability", "listing_id": str(listing.id)},
            ),
        )
    return len(listings)


async def run_cycle(db: AsyncSession, now: datetime | None = None) -> CycleResult:
    now = now or datetime.now(UTC)
    result = CycleResult()
    result.expired = await expire_stale(db, now)  # expire first, so we don't also "remind" those
    result.reminded = await send_reminders(db, now)
    if result.expired or result.reminded:
        logger.info("Freshness cycle: %d expired, %d reminded", result.expired, result.reminded)
    return result
