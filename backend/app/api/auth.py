from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.api.deps import CurrentUser, SessionDep
from app.core.config import settings
from app.core.security import create_access_token
from app.models import User
from app.models.enums import UserStatus
from app.schemas.auth import (
    DevLoginRequest,
    PreferencesUpdate,
    TokenResponse,
    UserRead,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/dev-login", response_model=TokenResponse)
async def dev_login(body: DevLoginRequest, session: SessionDep):
    """Вход без пароля по имени пользователя — только dev-режим.
    В проде заменяется на Keycloak OIDC (ТЗ §3.1)."""
    if settings.auth_mode != "dev":
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    user = await session.scalar(
        select(User).where(User.ad_sam_account_name == body.username)
    )
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Пользователь не найден")
    if user.status != UserStatus.ACTIVE:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Учётная запись отключена")
    user.last_login_at = datetime.now(UTC).replace(tzinfo=None)
    await session.commit()
    return TokenResponse(
        access_token=create_access_token(user.id, user.roles),
        user=UserRead.model_validate(user),
    )


@router.get("/me", response_model=UserRead)
async def me(user: CurrentUser):
    return user


@router.patch("/preferences", response_model=UserRead)
async def update_preferences(
    body: PreferencesUpdate, user: CurrentUser, session: SessionDep
):
    """Личные настройки интерфейса: язык (uz/ru/en) и тема (light/dark)."""
    if body.locale is not None:
        if body.locale not in ("uz", "ru", "en"):
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Неизвестный язык")
        user.locale = body.locale
    if body.theme is not None:
        if body.theme not in ("light", "dark"):
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Неизвестная тема")
        user.theme = body.theme
    await session.commit()
    await session.refresh(user)
    return user
