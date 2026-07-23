"""In-app уведомления и счётчики для колокольчика/бейджей."""
import uuid
from datetime import datetime

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy import func, select, update

from app.api.deps import CurrentUser, SessionDep
from app.models import Notification, Task
from app.models.enums import TaskStatus
from app.services.process_service import utcnow

router = APIRouter(prefix="/api", tags=["notifications"])


class NotificationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    body: str | None
    link: str | None
    read: bool
    created_at: datetime


class Counters(BaseModel):
    active_tasks: int = 0
    overdue_tasks: int = 0
    unread_notifications: int = 0


@router.get("/my/counters", response_model=Counters)
async def my_counters(user: CurrentUser, session: SessionDep):
    counters = Counters()
    counters.unread_notifications = (
        await session.scalar(
            select(func.count()).where(
                Notification.user_id == user.id, Notification.read.is_(False)
            )
        )
        or 0
    )
    if user.employee_id is not None:
        counters.active_tasks = (
            await session.scalar(
                select(func.count()).where(
                    Task.assignee_id == user.employee_id,
                    Task.status == TaskStatus.ACTIVE,
                )
            )
            or 0
        )
        counters.overdue_tasks = (
            await session.scalar(
                select(func.count()).where(
                    Task.assignee_id == user.employee_id,
                    Task.status == TaskStatus.ACTIVE,
                    Task.due_at.is_not(None),
                    Task.due_at < utcnow(),
                )
            )
            or 0
        )
    return counters


@router.get("/notifications", response_model=list[NotificationRead])
async def list_notifications(user: CurrentUser, session: SessionDep):
    rows = await session.scalars(
        select(Notification)
        .where(Notification.user_id == user.id)
        .order_by(Notification.created_at.desc())
        .limit(50)
    )
    return list(rows)


@router.post("/notifications/read-all", status_code=status.HTTP_204_NO_CONTENT)
async def read_all(user: CurrentUser, session: SessionDep):
    await session.execute(
        update(Notification)
        .where(Notification.user_id == user.id, Notification.read.is_(False))
        .values(read=True)
    )
    await session.commit()


@router.post("/notifications/{notification_id}/read",
             status_code=status.HTTP_204_NO_CONTENT)
async def read_one(
    notification_id: uuid.UUID, user: CurrentUser, session: SessionDep
):
    notification = await session.get(Notification, notification_id)
    if notification is None or notification.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    notification.read = True
    await session.commit()


# --- Привязка Telegram ---

_bot_username: str | None = None


async def _get_bot_username() -> str | None:
    global _bot_username
    from app.core.config import settings

    if not settings.telegram_bot_token:
        return None
    if _bot_username is None:
        from app.services.notify_delivery import telegram_api

        result = await telegram_api("getMe", {}, timeout=15)
        if result.get("ok"):
            _bot_username = result["result"]["username"]
    return _bot_username


class TelegramStatus(BaseModel):
    enabled: bool
    linked: bool
    bot_username: str | None = None


@router.get("/my/telegram-status", response_model=TelegramStatus)
async def telegram_status(user: CurrentUser, session: SessionDep):
    from app.core.config import settings

    fresh = await session.get(type(user), user.id)
    return TelegramStatus(
        enabled=bool(settings.telegram_bot_token),
        linked=fresh.telegram_chat_id is not None,
        bot_username=await _get_bot_username(),
    )


class TelegramLink(BaseModel):
    code: str
    bot_link: str | None


@router.post("/my/telegram-link", response_model=TelegramLink)
async def telegram_link(user: CurrentUser, session: SessionDep):
    code = uuid.uuid4().hex[:8].upper()
    fresh = await session.get(type(user), user.id)
    fresh.telegram_link_code = code
    await session.commit()
    username = await _get_bot_username()
    return TelegramLink(
        code=code,
        bot_link=f"https://t.me/{username}?start={code}" if username else None,
    )


@router.post("/my/telegram-unlink", status_code=status.HTTP_204_NO_CONTENT)
async def telegram_unlink(user: CurrentUser, session: SessionDep):
    fresh = await session.get(type(user), user.id)
    fresh.telegram_chat_id = None
    fresh.telegram_link_code = None
    await session.commit()
