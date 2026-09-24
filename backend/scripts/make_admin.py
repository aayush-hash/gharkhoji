"""Promote an existing user to admin.

Usage (the user must have logged in once first):
    docker compose exec api python -m scripts.make_admin 98XXXXXXXX
"""
import asyncio
import sys

from app.core.database import SessionLocal
from app.modules.auth.schemas import normalize_nepal_phone
from app.modules.users.models import UserRole
from app.modules.users.service import get_by_phone


async def main(raw_phone: str) -> None:
    phone = normalize_nepal_phone(raw_phone)
    async with SessionLocal() as db:
        user = await get_by_phone(db, phone)
        if user is None:
            sys.exit(f"No user with phone {phone}. Log in with it once first.")
        user.role = UserRole.ADMIN
        await db.commit()
        print(f"✅ {phone} is now an admin")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    asyncio.run(main(sys.argv[1]))
