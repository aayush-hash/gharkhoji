"""App settings, loaded from environment variables (and a .env file in development)."""
from functools import lru_cache
from typing import Literal

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # General
    PROJECT_NAME: str = "GharKhoji API"
    ENVIRONMENT: Literal["development", "test", "production"] = "development"
    API_V1_PREFIX: str = "/api/v1"
    CORS_ORIGINS: list[str] = ["http://localhost:8081", "http://localhost:19006"]

    # Database / cache
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/gharkhoji"
    REDIS_URL: str = "redis://localhost:6379/0"

    # Security
    SECRET_KEY: str = Field(min_length=32)
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    # OTP
    OTP_LENGTH: int = 6
    OTP_TTL_SECONDS: int = 300          # code valid for 5 minutes
    OTP_RESEND_COOLDOWN_SECONDS: int = 60
    OTP_MAX_PER_HOUR: int = 5           # per phone number
    OTP_MAX_PER_HOUR_PER_IP: int = 20
    OTP_MAX_VERIFY_ATTEMPTS: int = 5

    # Object storage (MinIO locally, Cloudflare R2 in production) — used from Day 2
    S3_ENDPOINT_URL: str = "http://localhost:9000"
    S3_ACCESS_KEY: str = "minioadmin"
    S3_SECRET_KEY: str = "minioadmin"
    S3_PUBLIC_BUCKET: str = "gharkhoji-public"
    S3_PRIVATE_BUCKET: str = "gharkhoji-private"

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT == "production"

    @model_validator(mode="after")
    def _check_production_secrets(self) -> "Settings":
        if self.is_production and "change-me" in self.SECRET_KEY:
            raise ValueError("Set a real random SECRET_KEY in production")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]


settings = get_settings()
