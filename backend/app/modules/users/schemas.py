import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.modules.users.models import Language, UserRole

# Roles a user may pick for themselves. ADMIN is only ever granted by a script / another admin.
SELF_SELECTABLE_ROLES = {UserRole.TENANT, UserRole.OWNER, UserRole.AGENT}


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    phone: str
    full_name: str | None
    role: UserRole
    language: Language
    onboarding_completed: bool
    has_password: bool
    created_at: datetime


class UserUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=2, max_length=120)
    language: Language | None = None
    role: UserRole | None = None

    @field_validator("full_name")
    @classmethod
    def strip_name(cls, v: str | None) -> str | None:
        return v.strip() if v else v

    @field_validator("role")
    @classmethod
    def role_must_be_selectable(cls, v: UserRole | None) -> UserRole | None:
        if v is not None and v not in SELF_SELECTABLE_ROLES:
            raise ValueError("Role must be tenant, owner or agent")
        return v
