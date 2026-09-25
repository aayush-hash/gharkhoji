import re
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

from app.modules.users.models import UserRole
from app.modules.users.schemas import SELF_SELECTABLE_ROLES, UserOut

# Nepali mobile numbers: 10 digits starting with 97 or 98 (NTC, Ncell, etc.)
_NEPAL_MOBILE = re.compile(r"^9[78]\d{8}$")

PASSWORD_MIN, PASSWORD_MAX = 8, 128
# The most-used passwords that still pass the letter+number rule. Kept short on purpose:
# the real protection is slow hashing + login lockout.
_COMMON_PASSWORDS = {
    "password1", "password123", "passw0rd", "abc12345", "abcd1234", "qwerty123", "qwerty12",
    "iloveyou1", "welcome1", "admin123", "letmein1", "nepal123", "kathmandu1", "gharkhoji1",
    "1q2w3e4r", "asdf1234", "zxcv1234", "test1234", "hello123", "pass1234",
}

OtpPurpose = Literal["signup", "reset"]


def normalize_nepal_phone(raw: str) -> str:
    """Accepts '9812345678', '+977 981-234-5678', '009779812345678' -> '+9779812345678'."""
    digits = re.sub(r"\D", "", raw)
    if digits.startswith("00977"):
        digits = digits[5:]
    elif digits.startswith("977") and len(digits) == 13:
        digits = digits[3:]
    if not _NEPAL_MOBILE.match(digits):
        raise ValueError("Enter a valid Nepali mobile number (e.g. 98XXXXXXXX)")
    return f"+977{digits}"


def check_password_strength(password: str) -> str:
    if len(password) < PASSWORD_MIN:
        raise ValueError(f"Password must be at least {PASSWORD_MIN} characters")
    if len(password) > PASSWORD_MAX:
        raise ValueError(f"Password must be at most {PASSWORD_MAX} characters")
    if not re.search(r"[A-Za-z]", password) or not re.search(r"\d", password):
        raise ValueError("Password must contain at least one letter and one number")
    if password.lower() in _COMMON_PASSWORDS or len(set(password)) < 4:
        raise ValueError("This password is too easy to guess. Choose another one.")
    return password


class PhoneIn(BaseModel):
    phone: str = Field(examples=["9812345678"])

    @field_validator("phone")
    @classmethod
    def _normalize(cls, v: str) -> str:
        return normalize_nepal_phone(v)


class OtpRequestIn(PhoneIn):
    # signup = verify a new number; reset = forgot password
    purpose: OtpPurpose = "signup"


class OtpRequestOut(BaseModel):
    message: str
    expires_in: int
    resend_after: int


class OtpVerifyIn(OtpRequestIn):
    code: str = Field(pattern=r"^\d{4,8}$", examples=["123456"])


class VerifiedOut(BaseModel):
    """One-time ticket proving the phone was verified. Send it to /auth/register or /auth/password/reset."""
    verification_token: str
    purpose: OtpPurpose
    expires_in: int


class _NewPassword(BaseModel):
    password: str = Field(min_length=1, max_length=PASSWORD_MAX, examples=["mysecret42"])

    @field_validator("password")
    @classmethod
    def _strong(cls, v: str) -> str:
        return check_password_strength(v)


class RegisterIn(_NewPassword):
    verification_token: str
    full_name: str = Field(min_length=2, max_length=120)
    role: UserRole = UserRole.TENANT

    @field_validator("full_name")
    @classmethod
    def _strip(cls, v: str) -> str:
        v = " ".join(v.split())
        if len(v) < 2:
            raise ValueError("Enter your full name")
        return v

    @field_validator("role")
    @classmethod
    def _selectable(cls, v: UserRole) -> UserRole:
        if v not in SELF_SELECTABLE_ROLES:
            raise ValueError("Role must be tenant, owner or agent")
        return v


class LoginIn(PhoneIn):
    password: str = Field(min_length=1, max_length=PASSWORD_MAX)


class ResetPasswordIn(_NewPassword):
    verification_token: str


class ChangePasswordIn(_NewPassword):
    current_password: str = Field(min_length=1, max_length=PASSWORD_MAX)

    @model_validator(mode="after")
    def _different(self) -> "ChangePasswordIn":
        if self.current_password == self.password:
            raise ValueError("New password must be different from the current one")
        return self


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int  # seconds until the access token expires


class LoginOut(TokenPair):
    user: UserOut
    is_new_user: bool = False


class RefreshIn(BaseModel):
    refresh_token: str
