"""File storage with two interchangeable backends.

The phone app always does the same three steps, whichever backend is active:
  1. ask the API for an upload URL
  2. PUT the photo bytes to that URL
  3. tell the API the upload is complete

- LocalStorage (development): the "upload URL" points back at this API, protected by a
  short-lived signed token, and files are written to MEDIA_ROOT.
- S3Storage (production): the upload URL is a real presigned S3/R2 URL, so photo bytes
  go straight to the bucket and never pass through our server.
"""
import asyncio
import uuid
from datetime import UTC, datetime, timedelta
from functools import lru_cache
from pathlib import Path
from typing import Protocol

import jwt

from app.core.config import settings

ALLOWED_IMAGE_TYPES = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}


class UploadTarget(dict):
    """{'url': ..., 'method': 'PUT', 'headers': {...}}"""


class Storage(Protocol):
    def create_upload(self, key: str, content_type: str, max_bytes: int) -> UploadTarget: ...
    async def object_size(self, key: str) -> int | None: ...
    async def delete(self, key: str) -> None: ...
    def public_url(self, key: str) -> str: ...


def build_photo_key(listing_id: uuid.UUID, content_type: str) -> str:
    return f"listings/{listing_id}/{uuid.uuid4().hex}.{ALLOWED_IMAGE_TYPES[content_type]}"


def sniff_image_type(head: bytes) -> str | None:
    """Detect the real image type from its first bytes (never trust the file name)."""
    if head.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if head.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return "image/webp"
    return None


# ---------------- Local disk (development) ----------------

class LocalStorage:
    def __init__(self, root: str):
        self.root = Path(root).resolve()
        self.root.mkdir(parents=True, exist_ok=True)

    def _path(self, key: str) -> Path:
        path = (self.root / key).resolve()
        if self.root not in path.parents:
            raise ValueError("Invalid storage key")
        return path

    def create_upload(self, key: str, content_type: str, max_bytes: int) -> UploadTarget:
        token = jwt.encode(
            {
                "type": "upload",
                "key": key,
                "ct": content_type,
                "max": max_bytes,
                "exp": datetime.now(UTC) + timedelta(seconds=settings.UPLOAD_URL_EXPIRE_SECONDS),
            },
            settings.SECRET_KEY,
            algorithm=settings.JWT_ALGORITHM,
        )
        url = f"{settings.PUBLIC_BASE_URL}{settings.API_V1_PREFIX}/media/local-upload?token={token}"
        return UploadTarget(url=url, method="PUT", headers={"Content-Type": content_type})

    @staticmethod
    def decode_upload_token(token: str) -> dict:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.JWT_ALGORITHM], leeway=60)
        if payload.get("type") != "upload":
            raise jwt.InvalidTokenError("wrong token type")
        return payload

    def write(self, key: str, data: bytes) -> None:
        path = self._path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)

    async def object_size(self, key: str) -> int | None:
        path = self._path(key)
        return path.stat().st_size if path.is_file() else None

    async def delete(self, key: str) -> None:
        self._path(key).unlink(missing_ok=True)

    def public_url(self, key: str) -> str:
        return f"{settings.PUBLIC_BASE_URL}/media/files/{key}"


# ---------------- S3 / Cloudflare R2 (production) ----------------

class S3Storage:
    def __init__(self) -> None:
        import boto3
        from botocore.config import Config

        self.bucket = settings.S3_PUBLIC_BUCKET
        self.client = boto3.client(
            "s3",
            endpoint_url=settings.S3_ENDPOINT_URL or None,
            region_name=settings.S3_REGION,
            aws_access_key_id=settings.S3_ACCESS_KEY,
            aws_secret_access_key=settings.S3_SECRET_KEY,
            config=Config(signature_version="s3v4"),
        )

    def create_upload(self, key: str, content_type: str, max_bytes: int) -> UploadTarget:
        url = self.client.generate_presigned_url(
            "put_object",
            Params={"Bucket": self.bucket, "Key": key, "ContentType": content_type},
            ExpiresIn=settings.UPLOAD_URL_EXPIRE_SECONDS,
        )
        return UploadTarget(url=url, method="PUT", headers={"Content-Type": content_type})

    async def object_size(self, key: str) -> int | None:
        from botocore.exceptions import ClientError

        try:
            head = await asyncio.to_thread(self.client.head_object, Bucket=self.bucket, Key=key)
        except ClientError:
            return None
        return int(head["ContentLength"])

    async def delete(self, key: str) -> None:
        await asyncio.to_thread(self.client.delete_object, Bucket=self.bucket, Key=key)

    def public_url(self, key: str) -> str:
        return f"{settings.S3_PUBLIC_BASE_URL.rstrip('/')}/{key}"


@lru_cache
def get_storage() -> Storage:
    if settings.STORAGE_BACKEND == "s3":
        return S3Storage()
    return LocalStorage(settings.MEDIA_ROOT)
