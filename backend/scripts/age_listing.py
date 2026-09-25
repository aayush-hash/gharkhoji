"""Testing helper: pretend a listing was last confirmed N hours ago.

    docker compose exec api python -m scripts.age_listing <listing_id> 50   # → reminder is due
    docker compose exec api python -m scripts.age_listing <listing_id> 80   # → will expire
    docker compose exec api python -m scripts.age_listing all 50            # every active listing

Then run the worker once:  docker compose exec api python -m app.workers.main --once
"""
import asyncio
import sys
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import update

from app.core.config import settings
from app.core.database import SessionLocal
from app.modules.listings.models import Listing, ListingStatus


async def main(target: str, hours: float) -> None:
    if settings.is_production:
        sys.exit("Refusing to run in production")
    when = datetime.now(UTC) - timedelta(hours=hours)
    stmt = update(Listing).values(last_confirmed_at=when, reminder_sent_at=None, reminders_sent=0)
    if target == "all":
        stmt = stmt.where(Listing.status == ListingStatus.ACTIVE)
    else:
        stmt = stmt.where(Listing.id == uuid.UUID(target))
    async with SessionLocal() as db:
        result = await db.execute(stmt)
        await db.commit()
    print(f"✅ {result.rowcount} listing(s) now look confirmed {hours:g} hours ago")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    asyncio.run(main(sys.argv[1], float(sys.argv[2])))
