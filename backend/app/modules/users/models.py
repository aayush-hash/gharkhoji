import enum
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, TimestampMixin, UUIDPrimaryKeyMixin


class UserRole(str, enum.Enum):
    TENANT = "tenant"
    OWNER = "owner"
    AGENT = "agent"
    ADMIN = "admin"


class Language(str, enum.Enum):
    EN = "en"
    NE = "ne"


def _enum_values(e: type[enum.Enum]) -> list[str]:
    return [m.value for m in e]


class User(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "users"

    phone: Mapped[str] = mapped_column(String(20), unique=True, index=True, nullable=False)
    full_name: Mapped[str | None] = mapped_column(String(120))
    role: Mapped[UserRole] = mapped_column(
        Enum(UserRole, name="user_role", values_callable=_enum_values),
        default=UserRole.TENANT,
        server_default=UserRole.TENANT.value,
        nullable=False,
    )
    language: Mapped[Language] = mapped_column(
        Enum(Language, name="language", values_callable=_enum_values),
        default=Language.EN,
        server_default=Language.EN.value,
        nullable=False,
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true", nullable=False)
    onboarding_completed: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="false", nullable=False
    )
    phone_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Argon2id hash — the real password is never stored. NULL = account made before
    # passwords existed; the owner sets one via "Forgot password" (SMS code).
    password_hash: Mapped[str | None] = mapped_column(String(255))
    # Access tokens issued before this moment stop working (e.g. after a password reset).
    password_changed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    @property
    def has_password(self) -> bool:
        return self.password_hash is not None

    def __repr__(self) -> str:
        return f"<User {self.phone} ({self.role.value})>"
