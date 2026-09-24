import re

from pydantic import BaseModel, Field, field_validator

from app.modules.users.schemas import UserOut

# Nepali mobile numbers: 10 digits starting with 97 or 98 (NTC, Ncell, etc.)
_NEPAL_MOBILE = re.compile(r"^9[78]\d{8}$")


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


class PhoneIn(BaseModel):
    phone: str = Field(examples=["9812345678"])

    @field_validator("phone")
    @classmethod
    def _normalize(cls, v: str) -> str:
        return normalize_nepal_phone(v)


class OtpRequestOut(BaseModel):
    message: str
    expires_in: int
    resend_after: int


class OtpVerifyIn(PhoneIn):
    code: str = Field(pattern=r"^\d{4,8}$", examples=["123456"])


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int  # seconds until the access token expires


class LoginOut(TokenPair):
    user: UserOut
    is_new_user: bool


class RefreshIn(BaseModel):
    refresh_token: str
