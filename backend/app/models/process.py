"""Процессы согласования, задачи, аудит (ТЗ §6, §9.2)."""
import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import ForeignKey, Index, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, UUIDPKMixin, utcnow
from app.models.enums import ProcessStatus, TaskResult, TaskStatus


class ProcessInstance(UUIDPKMixin, Base):
    __tablename__ = "process_instances"

    # code вида документа из document_types
    object_type: Mapped[str] = mapped_column(String(50))
    object_id: Mapped[uuid.UUID]
    initiator_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id"))
    project_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("projects.id"))
    status: Mapped[ProcessStatus] = mapped_column(default=ProcessStatus.DRAFT)
    # Маршрут фиксируется на момент старта: изменение матрицы
    # не влияет на запущенные процессы (ТЗ §4.5)
    route_snapshot: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    started_at: Mapped[datetime | None]
    completed_at: Mapped[datetime | None]


class Task(UUIDPKMixin, Base):
    """Задача привязана к должности, исполнитель — снимок на момент
    назначения (увольнение не должно блокировать процесс — ТЗ §14)."""

    __tablename__ = "tasks"
    __table_args__ = (Index("ix_tasks_assignee_status", "assignee_id", "status"),)

    process_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("process_instances.id"))
    stage_no: Mapped[int]
    order_in_stage: Mapped[int] = mapped_column(default=1)
    position_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("positions.id"))
    # вид задания на момент создания (из снапшота маршрута)
    task_kind: Mapped[str] = mapped_column(
        String(20), default="APPROVAL", server_default="APPROVAL"
    )
    assignee_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("employees.id"))
    # Заполнено, если сработало замещение: кого замещает (ТЗ §5.1 шаг 3)
    substitute_for_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("employees.id")
    )
    status: Mapped[TaskStatus] = mapped_column(default=TaskStatus.PENDING)
    result: Mapped[TaskResult | None]
    comment: Mapped[str | None] = mapped_column(Text)
    due_at: Mapped[datetime | None]
    completed_at: Mapped[datetime | None]


class AuditLog(UUIDPKMixin, Base):
    """Полный аудит: кто, когда, что, комментарий, IP (ТЗ §6.4).
    Структурированно, не текстом — иначе не будет аналитики (§6.5)."""

    __tablename__ = "audit_log"

    process_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("process_instances.id")
    )
    task_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("tasks.id"))
    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    action: Mapped[str] = mapped_column(String(100))
    payload: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    ip: Mapped[str | None] = mapped_column(String(45))
    created_at: Mapped[datetime] = mapped_column(
        default=utcnow, server_default=func.now()
    )
