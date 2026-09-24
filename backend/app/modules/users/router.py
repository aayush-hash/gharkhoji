from fastapi import APIRouter, HTTPException, status

from app.core.deps import CurrentUser, DbSession
from app.modules.users import service
from app.modules.users.schemas import UserOut, UserUpdate

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", response_model=UserOut)
async def read_me(user: CurrentUser) -> UserOut:
    return UserOut.model_validate(user)


@router.patch("/me", response_model=UserOut)
async def update_me(data: UserUpdate, user: CurrentUser, db: DbSession) -> UserOut:
    try:
        updated = await service.update_profile(db, user, data)
    except service.RoleChangeNotAllowed:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "Role can't be changed after onboarding. Contact support."
        ) from None
    return UserOut.model_validate(updated)
