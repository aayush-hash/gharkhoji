from fastapi import APIRouter, HTTPException, Request, status

from app.core.config import settings
from app.core.deps import DbSession, RedisClient
from app.modules.auth import service
from app.modules.auth.schemas import (
    LoginOut,
    OtpRequestOut,
    OtpVerifyIn,
    PhoneIn,
    RefreshIn,
    TokenPair,
)
from app.modules.users.schemas import UserOut

router = APIRouter(prefix="/auth", tags=["auth"])


def _to_http(exc: service.AuthError) -> HTTPException:
    headers = {"Retry-After": str(exc.retry_after)} if exc.retry_after else None
    return HTTPException(exc.status_code, exc.message, headers=headers)


@router.post("/otp/request", response_model=OtpRequestOut)
async def request_otp(body: PhoneIn, request: Request, redis: RedisClient) -> OtpRequestOut:
    client_ip = request.client.host if request.client else "unknown"
    try:
        await service.request_otp(redis, body.phone, client_ip)
    except service.AuthError as exc:
        raise _to_http(exc) from None
    return OtpRequestOut(
        message="Code sent",
        expires_in=settings.OTP_TTL_SECONDS,
        resend_after=settings.OTP_RESEND_COOLDOWN_SECONDS,
    )


@router.post("/otp/verify", response_model=LoginOut)
async def verify_otp(body: OtpVerifyIn, request: Request, db: DbSession, redis: RedisClient) -> LoginOut:
    try:
        user, created, tokens = await service.login_with_otp(
            db, redis, body.phone, body.code, request.headers.get("user-agent")
        )
    except service.AuthError as exc:
        raise _to_http(exc) from None
    return LoginOut(**tokens.model_dump(), user=UserOut.model_validate(user), is_new_user=created)


@router.post("/refresh", response_model=TokenPair)
async def refresh(body: RefreshIn, request: Request, db: DbSession) -> TokenPair:
    try:
        return await service.rotate_refresh_token(db, body.refresh_token, request.headers.get("user-agent"))
    except service.AuthError as exc:
        raise _to_http(exc) from None


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(body: RefreshIn, db: DbSession, everywhere: bool = False) -> None:
    await service.logout(db, body.refresh_token, everywhere)
