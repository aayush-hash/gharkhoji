import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.users.models import User, UserRole
from app.modules.users.schemas import UserUpdate


async def get_by_id(db: AsyncSession, user_id: uuid.UUID) -> User | None:
    return await db.get(User, user_id)


async def get_by_phone(db: AsyncSession, phone: str) -> User | None:
    return await db.scalar(select(User).where(User.phone == phone))


async def get_or_create_by_phone(db: AsyncSession, phone: str) -> tuple[User, bool]:
    """Returns (user, created). Called after a successful OTP check."""
    now = datetime.now(UTC)
    user = await get_by_phone(db, phone)
    created = user is None
    if user is None:
        user = User(phone=phone, phone_verified_at=now)
        db.add(user)
    user.last_login_at = now
    await db.flush()
    return user, created


class RoleChangeNotAllowed(Exception):
    pass


async def update_profile(db: AsyncSession, user: User, data: UserUpdate) -> User:
    changes = data.model_dump(exclude_unset=True, exclude_none=True)

    # Role is chosen once during onboarding. Later changes (e.g. agent -> owner) will go
    # through verification, so the platform can't be gamed by brokers posing as owners.
    if "role" in changes and user.onboarding_completed and changes["role"] != user.role:
        raise RoleChangeNotAllowed()

    for field, value in changes.items():
        setattr(user, field, value)

    if user.full_name and user.role in {UserRole.TENANT, UserRole.OWNER, UserRole.AGENT}:
        user.onboarding_completed = True

    await db.commit()
    await db.refresh(user)
    return user
