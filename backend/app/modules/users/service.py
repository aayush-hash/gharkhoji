import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.users.models import User, UserRole
from app.modules.users.schemas import UserUpdate


async def get_by_id(db: AsyncSession, user_id: uuid.UUID) -> User | None:
    return await db.get(User, user_id)


async def get_by_phone(db: AsyncSession, phone: str) -> User | None:
    return await db.scalar(select(User).where(User.phone == phone))


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
