"""Журнал ошибок: серверные исключения и ошибки фронтенда.

Каждой ошибке присваивается короткий код инцидента (ERR-XXXXXX) —
пользователь видит только его, поддержка находит по нему полный стек.
"""
import uuid
from datetime import datetime

from sqlalchemy import ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, UUIDPKMixin, utcnow


class ErrorLog(UUIDPKMixin, Base):
    __tablename__ = "error_log"

    code: Mapped[str] = mapped_column(String(20), index=True)
    source: Mapped[str] = mapped_column(String(10))  # SERVER | CLIENT
    method: Mapped[str | None] = mapped_column(String(10))
    path: Mapped[str | None] = mapped_column(String(500))
    message: Mapped[str] = mapped_column(Text)
    traceback: Mapped[str | None] = mapped_column(Text)
    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    ip: Mapped[str | None] = mapped_column(String(45))
    created_at: Mapped[datetime] = mapped_column(
        default=utcnow, server_default=func.now()
    )
