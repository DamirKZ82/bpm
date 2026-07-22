"""Матрица маршрутов и вспомогательные назначения (ТЗ §4, §9.2)."""
import uuid
from datetime import date

from sqlalchemy import ForeignKey, Index
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, UUIDPKMixin
from app.models.enums import ObjectType, ResolverType, RuleMandatory, StageType


class ProjectAssignment(UUIDPKMixin, Base):
    """Назначение сотрудника на должность в проекте — для
    POSITION_IN_PROJECT и PROJECT_MANAGER."""

    __tablename__ = "project_assignments"

    project_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("projects.id"))
    position_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("positions.id"))
    employee_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("employees.id"))
    valid_from: Mapped[date | None]
    valid_to: Mapped[date | None]


class Substitution(UUIDPKMixin, Base):
    __tablename__ = "substitutions"

    employee_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("employees.id"))
    substitute_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("employees.id"))
    valid_from: Mapped[date]
    valid_to: Mapped[date]


class RouteRule(UUIDPKMixin, Base):
    """Одна строка = один участник одного этапа (ТЗ §4.1).

    NULL в organization_id/project_id = «любая». Конфликты решает priority
    (меньше = выше), модель замещения: побеждает одна группа правил (§4.3).
    """

    __tablename__ = "route_rules"
    __table_args__ = (
        Index("ix_route_rules_context", "object_type", "organization_id", "project_id"),
    )

    object_type: Mapped[ObjectType]
    organization_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("organizations.id")
    )
    project_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("projects.id"))
    stage_no: Mapped[int]
    order_in_stage: Mapped[int] = mapped_column(default=1)
    resolver_type: Mapped[ResolverType]
    position_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("positions.id"))
    stage_type: Mapped[StageType] = mapped_column(default=StageType.SEQUENTIAL)
    quorum_count: Mapped[int | None]
    deadline_hours: Mapped[int | None]
    mandatory: Mapped[RuleMandatory] = mapped_column(default=RuleMandatory.REQUIRED)
    priority: Mapped[int]
    valid_from: Mapped[date | None]
    valid_to: Mapped[date | None]
