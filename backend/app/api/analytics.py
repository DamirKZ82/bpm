"""Аналитика и process mining (ТЗ §6.5): метрики по процессам и задачам.

Считается из журнала задач и процессов «на лету» — детальный аудит с
таймстампами (activated_at/completed_at/due_at) делает это возможным
без отдельного хранилища метрик.
"""
import uuid
from datetime import timedelta

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import Float, cast, func, select

from app.api.deps import SessionDep
from app.api.admin import require_roles
from app.models import DocumentType, Position, ProcessInstance, Task
from app.models.enums import TaskStatus, UserRole
from app.services.process_service import utcnow

router = APIRouter(
    prefix="/api/analytics",
    tags=["analytics"],
    dependencies=[Depends(require_roles(UserRole.ADMIN))],
)

_HOUR = 3600.0


class CycleItem(BaseModel):
    object_type: str
    label: str
    avg_hours: float
    count: int


class Bottleneck(BaseModel):
    position_id: uuid.UUID | None
    position_name: str
    count: int
    avg_hours: float
    overdue: int


class ProcessStats(BaseModel):
    total: int
    by_status: dict[str, int]
    started_30d: int
    completed_30d: int


class TaskStats(BaseModel):
    active: int
    active_overdue: int
    completed_with_deadline: int
    on_time_rate: float | None


class AnalyticsSummary(BaseModel):
    processes: ProcessStats
    tasks: TaskStats
    cycle_time: list[CycleItem]
    bottlenecks: list[Bottleneck]


def _hours(delta_col):
    """Разница двух DateTime → часы (PostgreSQL interval → epoch)."""
    return cast(func.extract("epoch", delta_col), Float) / _HOUR


@router.get("/summary", response_model=AnalyticsSummary)
async def summary(session: SessionDep):
    now = utcnow()
    month_ago = now - timedelta(days=30)

    # --- Процессы по статусам ---
    status_rows = (
        await session.execute(
            select(ProcessInstance.status, func.count()).group_by(
                ProcessInstance.status
            )
        )
    ).all()
    by_status = {str(status): count for status, count in status_rows}
    total = sum(by_status.values())
    started_30d = await session.scalar(
        select(func.count()).where(ProcessInstance.started_at >= month_ago)
    )
    completed_30d = await session.scalar(
        select(func.count()).where(ProcessInstance.completed_at >= month_ago)
    )

    # --- Время цикла по видам документов (завершённые процессы) ---
    cycle_rows = (
        await session.execute(
            select(
                ProcessInstance.object_type,
                func.avg(
                    _hours(ProcessInstance.completed_at - ProcessInstance.started_at)
                ),
                func.count(),
            )
            .where(
                ProcessInstance.completed_at.is_not(None),
                ProcessInstance.started_at.is_not(None),
            )
            .group_by(ProcessInstance.object_type)
        )
    ).all()
    type_names = dict(
        (
            await session.execute(select(DocumentType.code, DocumentType.name))
        ).all()
    )
    cycle_time = [
        CycleItem(
            object_type=code,
            label=type_names.get(code, code),
            avg_hours=round(avg or 0, 1),
            count=count,
        )
        for code, avg, count in sorted(cycle_rows, key=lambda r: -(r[1] or 0))
    ]

    # --- Задачи: активные, просроченные, соблюдение срока ---
    active = await session.scalar(
        select(func.count()).where(Task.status == TaskStatus.ACTIVE)
    )
    active_overdue = await session.scalar(
        select(func.count()).where(
            Task.status == TaskStatus.ACTIVE,
            Task.due_at.is_not(None),
            Task.due_at < now,
        )
    )
    completed_with_deadline = await session.scalar(
        select(func.count()).where(
            Task.status == TaskStatus.COMPLETED,
            Task.due_at.is_not(None),
            Task.completed_at.is_not(None),
        )
    )
    on_time = await session.scalar(
        select(func.count()).where(
            Task.status == TaskStatus.COMPLETED,
            Task.due_at.is_not(None),
            Task.completed_at.is_not(None),
            Task.completed_at <= Task.due_at,
        )
    )
    on_time_rate = (
        round(on_time / completed_with_deadline, 3)
        if completed_with_deadline
        else None
    )

    # --- Узкие места по должностям (среднее время на задаче) ---
    bottleneck_rows = (
        await session.execute(
            select(
                Task.position_id,
                func.avg(_hours(Task.completed_at - Task.activated_at)),
                func.count(),
                func.count()
                .filter(
                    Task.due_at.is_not(None), Task.completed_at > Task.due_at
                ),
            )
            .where(
                Task.status == TaskStatus.COMPLETED,
                Task.activated_at.is_not(None),
                Task.completed_at.is_not(None),
            )
            .group_by(Task.position_id)
        )
    ).all()
    position_names = dict(
        (
            await session.execute(
                select(Position.id, Position.name).where(
                    Position.id.in_(
                        {r[0] for r in bottleneck_rows if r[0] is not None}
                    )
                )
            )
        ).all()
    )
    bottlenecks = [
        Bottleneck(
            position_id=pos_id,
            position_name=(
                position_names.get(pos_id, "—") if pos_id else "Добавленные на лету"
            ),
            count=count,
            avg_hours=round(avg or 0, 1),
            overdue=overdue or 0,
        )
        for pos_id, avg, count, overdue in sorted(
            bottleneck_rows, key=lambda r: -(r[1] or 0)
        )
    ]

    return AnalyticsSummary(
        processes=ProcessStats(
            total=total,
            by_status=by_status,
            started_30d=started_30d or 0,
            completed_30d=completed_30d or 0,
        ),
        tasks=TaskStats(
            active=active or 0,
            active_overdue=active_overdue or 0,
            completed_with_deadline=completed_with_deadline or 0,
            on_time_rate=on_time_rate,
        ),
        cycle_time=cycle_time,
        bottlenecks=bottlenecks,
    )
