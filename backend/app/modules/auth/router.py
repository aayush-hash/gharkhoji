"""Account endpoints.

Sign up (once):      POST /otp/request {purpose:"signup"} → POST /otp/verify → POST /register
Log in (every time): POST /login {phone, password}
Forgot password:     POST /otp/request {purpose:"reset"}  → POST /otp/verify → POST /password/reset
Change password:     POST /password/change (logged in)
"""
from fastapi import APIRouter, HTTPException, Request, status

from app.core.config import settings
from app.core.deps import CurrentUser, DbSession, RedisClient
from app.modules.auth import service
from app.modules.auth.schemas import (
    ChangePasswordIn,
    LoginIn,
    LoginOut,
    OtpRequestIn,
    OtpRequestOut,
    OtpVerifyIn,
    RefreshIn,
    RegisterIn,
    ResetPasswordIn,
    TokenPair,
    VerifiedOut,
)
from app.modules.users.schemas import UserOut

router = APIRouter(prefix="/auth", tags=["auth"])


def _to_http(exc: service.AuthError) -> HTTPException:
    headers = {"Retry-After": str(exc.retry_after)} if exc.retry_after else None
    return HTTPException(exc.status_code, exc.message, headers=headers)


def _ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def _ua(request: Request) -> str | None:
    return request.headers.get("user-agent")


@router.post("/otp/request", response_model=OtpRequestOut)
async def request_otp(body: OtpRequestIn, request: Request, db: DbSession, redis: RedisClient) -> OtpRequestOut:
    """Send a 6-digit SMS code — only to create an account or reset a forgotten password."""
    try:
        await service.request_otp(db, redis, body.phone, body.purpose, _ip(request))
    except service.AuthError as exc:
        raise _to_http(exc) from None
    return OtpRequestOut(
        message="Code sent",
        expires_in=settings.OTP_TTL_SECONDS,
        resend_after=settings.OTP_RESEND_COOLDOWN_SECONDS,
    )


@router.post("/otp/verify", response_model=VerifiedOut)
async def verify_otp(body: OtpVerifyIn, redis: RedisClient) -> VerifiedOut:
    try:
        token = await service.verify_phone(redis, body.phone, body.code, body.purpose)
    except service.AuthError as exc:
        raise _to_http(exc) from None
    return VerifiedOut(
        verification_token=token, purpose=body.purpose, expires_in=settings.VERIFY_TOKEN_TTL_SECONDS
    )


@router.post("/register", response_model=LoginOut, status_code=status.HTTP_201_CREATED)
async def register(body: RegisterIn, request: Request, db: DbSession, redis: RedisClient) -> LoginOut:
    try:
        user, tokens = await service.register(
            db, redis, body.verification_token, body.full_name, body.role, body.password, _ua(request)
        )
    except service.AuthError as exc:
        raise _to_http(exc) from None
    return LoginOut(**tokens.model_dump(), user=UserOut.model_validate(user), is_new_user=True)


@router.post("/login", response_model=LoginOut)
async def login(body: LoginIn, request: Request, db: DbSession, redis: RedisClient) -> LoginOut:
    try:
        user, tokens = await service.login_with_password(
            db, redis, body.phone, body.password, _ip(request), _ua(request)
        )
    except service.AuthError as exc:
        raise _to_http(exc) from None
    return LoginOut(**tokens.model_dump(), user=UserOut.model_validate(user))


@router.post("/password/reset", response_model=LoginOut)
async def reset_password(body: ResetPasswordIn, request: Request, db: DbSession, redis: RedisClient) -> LoginOut:
    """Set a new password after verifying the phone by SMS. Logs out every other device."""
    try:
        user, tokens = await service.reset_password(
            db, redis, body.verification_token, body.password, _ua(request)
        )
    except service.AuthError as exc:
        raise _to_http(exc) from None
    return LoginOut(**tokens.model_dump(), user=UserOut.model_validate(user))


@router.post("/password/change", response_model=TokenPair)
async def change_password(
    body: ChangePasswordIn, request: Request, user: CurrentUser, db: DbSession, redis: RedisClient
) -> TokenPair:
    """Returns fresh tokens for this device; every other device is logged out."""
    try:
        return await service.change_password(
            db, redis, user, body.current_password, body.password, _ip(request), _ua(request)
        )
    except service.AuthError as exc:
        raise _to_http(exc) from None


@router.post("/refresh", response_model=TokenPair)
async def refresh(body: RefreshIn, request: Request, db: DbSession) -> TokenPair:
    try:
        return await service.rotate_refresh_token(db, body.refresh_token, _ua(request))
    except service.AuthError as exc:
        raise _to_http(exc) from None


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(body: RefreshIn, db: DbSession, everywhere: bool = False) -> None:
    await service.logout(db, body.refresh_token, everywhere)
