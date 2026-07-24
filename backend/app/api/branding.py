"""Брендирование (white-label): название и логотип — из БД, правятся
администратором на «Настройки BPM». Логотип хранится в файловом хранилище
(local/S3), метаданные — в app_settings (ключ "branding").

GET-эндпоинты публичные: логотип и название нужны на странице входа
(до авторизации).
"""
import uuid

from fastapi import APIRouter, File, HTTPException, UploadFile, status
from fastapi.responses import Response
from pydantic import BaseModel, Field

from app.api.deps import CurrentUser, SessionDep
from app.models import AppSetting
from app.models.enums import UserRole
from app.services.storage import get_storage

router = APIRouter(prefix="/api/branding", tags=["branding"])

BRANDING_KEY = "branding"
DEFAULT_APP_NAME = "BPM"
MAX_LOGO_BYTES = 2 * 1024 * 1024  # 2 МБ

_EXT_BY_TYPE = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/svg+xml": "svg",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/x-icon": "ico",
    "image/vnd.microsoft.icon": "ico",
}


async def load_branding(session) -> dict:
    row = await session.get(AppSetting, BRANDING_KEY)
    return dict(row.value) if row and row.value else {}


async def save_branding(session, data: dict) -> None:
    row = await session.get(AppSetting, BRANDING_KEY)
    if row is None:
        session.add(AppSetting(key=BRANDING_KEY, value=data))
    else:
        row.value = data
    await session.commit()


def _require_admin(user) -> None:
    if UserRole.ADMIN not in user.roles:
        raise HTTPException(status.HTTP_403_FORBIDDEN)


def _logo_url(branding: dict) -> str | None:
    if not branding.get("logo_key"):
        return None
    return f"/api/branding/logo?v={branding.get('version', 0)}"


class BrandingRead(BaseModel):
    app_name: str
    logo_url: str | None = None


class AppNameUpdate(BaseModel):
    app_name: str = Field(min_length=1, max_length=60)


@router.get("", response_model=BrandingRead)
async def get_branding(session: SessionDep):
    """Публично: название и ссылка на логотип (нужны и на странице входа)."""
    b = await load_branding(session)
    return BrandingRead(
        app_name=b.get("app_name") or DEFAULT_APP_NAME, logo_url=_logo_url(b)
    )


@router.get("/logo")
async def get_logo(session: SessionDep):
    """Публично: сами байты логотипа из хранилища."""
    b = await load_branding(session)
    key = b.get("logo_key")
    if not key:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    storage = await get_storage(session)
    data = storage.load(key)
    return Response(
        content=data,
        media_type=b.get("logo_content_type") or "image/png",
        headers={"Cache-Control": "public, max-age=300"},
    )


@router.put("", response_model=BrandingRead)
async def set_app_name(payload: AppNameUpdate, user: CurrentUser, session: SessionDep):
    _require_admin(user)
    b = await load_branding(session)
    b["app_name"] = payload.app_name.strip()
    await save_branding(session, b)
    return BrandingRead(app_name=b["app_name"], logo_url=_logo_url(b))


@router.post("/logo", response_model=BrandingRead)
async def upload_logo(
    user: CurrentUser, session: SessionDep, file: UploadFile = File(...)
):
    _require_admin(user)
    content_type = (file.content_type or "").lower()
    if content_type not in _EXT_BY_TYPE:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "Поддерживаются PNG, JPG, SVG, WEBP, GIF, ICO",
        )
    data = await file.read()
    if len(data) > MAX_LOGO_BYTES:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY, "Логотип больше 2 МБ"
        )
    # уникальный ключ, чтобы не конфликтовать со старым в кэше хранилища
    key = f"branding/logo-{uuid.uuid4().hex[:8]}.{_EXT_BY_TYPE[content_type]}"
    storage = await get_storage(session)
    storage.save(key, data)

    b = await load_branding(session)
    old_key = b.get("logo_key")
    if old_key and old_key != key:
        try:
            storage.delete(old_key)
        except Exception:  # noqa: BLE001
            pass
    b["logo_key"] = key
    b["logo_content_type"] = content_type
    b["version"] = int(b.get("version", 0)) + 1
    await save_branding(session, b)
    return BrandingRead(app_name=b.get("app_name") or DEFAULT_APP_NAME, logo_url=_logo_url(b))


@router.delete("/logo", response_model=BrandingRead)
async def delete_logo(user: CurrentUser, session: SessionDep):
    _require_admin(user)
    b = await load_branding(session)
    key = b.get("logo_key")
    if key:
        try:
            (await get_storage(session)).delete(key)
        except Exception:  # noqa: BLE001
            pass
    b.pop("logo_key", None)
    b.pop("logo_content_type", None)
    b["version"] = int(b.get("version", 0)) + 1
    await save_branding(session, b)
    return BrandingRead(app_name=b.get("app_name") or DEFAULT_APP_NAME, logo_url=None)
