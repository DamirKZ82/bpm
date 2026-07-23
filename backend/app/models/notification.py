"""In-app уведомления и обсуждение процессов."""
import uuid
from datetime import datetime

from sqlalchemy import ForeignKey, Index, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, UUIDPKMixin, utcnow


class Notification(UUIDPKMixin, Base):
    __tablename__ = "notifications"
    __table_args__ = (Index("ix_notifications_user_read", "user_id", "read"),)

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    title: Mapped[str] = mapped_column(String(300))
    body: Mapped[str | None] = mapped_column(Text)
    link: Mapped[str | None] = mapped_column(String(300))  # путь во фронтенде
    read: Mapped[bool] = mapped_column(default=False)
    created_at: Mapped[datetime] = mapped_column(
        default=utcnow, server_default=func.now()
    )


class ProcessComment(UUIDPKMixin, Base):
    """Обсуждение по процессу: вопросы согласующих и ответы инициатора
    без формального отклонения."""

    __tablename__ = "process_comments"
    __table_args__ = (Index("ix_process_comments_process", "process_id"),)

    process_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("process_instances.id"))
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    text: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        default=utcnow, server_default=func.now()
    )
