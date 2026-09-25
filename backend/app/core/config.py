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

    # Base URL the phone uses to reach this API. On Day 3 set it to your laptop's
    # Wi-Fi IP (e.g. http://192.168.1.10:8000) so the phone can load photos.
    PUBLIC_BASE_URL: str = "http://localhost:8000"

    # Photo storage: "local" = files on disk (development), "s3" = Cloudflare R2 / AWS S3 (production)
    STORAGE_BACKEND: Literal["local", "s3"] = "local"
    MEDIA_ROOT: str = "media_uploads"
    UPLOAD_URL_EXPIRE_SECONDS: int = 600
    MAX_PHOTOS_PER_LISTING: int = 8
    MAX_PHOTO_BYTES: int = 10 * 1024 * 1024  # 10 MB

    # Freshness system: owners confirm their listing is still available
    CONFIRM_REMINDER_AFTER_HOURS: int = 48   # start asking "still available?" after this
    REMINDER_REPEAT_HOURS: int = 12          # ask again this often while unanswered
    EXPIRE_AFTER_HOURS: int = 72             # hide from search if not confirmed by then
    WORKER_INTERVAL_SECONDS: int = 600       # how often the background worker runs

    # Push notifications (Expo push service)
    EXPO_PUSH_URL: str = "https://exp.host/--/api/v2/push/send"
    PUSH_ENABLED: bool = True

    S3_ENDPOINT_URL: str = ""          # R2: https://<account_id>.r2.cloudflarestorage.com
    S3_REGION: str = "auto"
    S3_ACCESS_KEY: str = ""
    S3_SECRET_KEY: str = ""
    S3_PUBLIC_BUCKET: str = "gharkhoji-public"
    S3_PUBLIC_BASE_URL: str = ""       # public URL where bucket files are served (R2 custom domain)

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
