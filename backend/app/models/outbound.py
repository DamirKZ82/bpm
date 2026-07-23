"""Очередь исходящих сообщений (email / Telegram) — ТЗ §11:
отправка асинхронно воркером, не в момент действия пользователя."""
import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import Index, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, UUIDPKMixin, utcnow


class OutboundMessage(UUIDPKMixin, Base):
    __tablename__ = "outbound_messages"
    __table_args__ = (Index("ix_outbound_status", "status"),)

    channel: Mapped[str] = mapped_column(String(10))  # EMAIL | TELEGRAM
    recipient: Mapped[str] = mapped_column(String(300))  # email или chat_id
    subject: Mapped[str | None] = mapped_column(String(300))
    body: Mapped[str] = mapped_column(Text)
    html_body: Mapped[str | None] = mapped_column(Text)  # для email с кнопками
    # inline-кнопки Telegram: [{"text": ..., "callback_data": ...}]
    buttons: Mapped[list[Any] | None] = mapped_column(JSONB)
    status: Mapped[str] = mapped_column(String(10), default="PENDING")
    attempts: Mapped[int] = mapped_column(default=0)
    last_error: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        default=utcnow, server_default=func.now()
    )
    sent_at: Mapped[datetime | None]
