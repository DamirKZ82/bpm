"""Жизненный цикл процесса согласования (ТЗ §6).

Снапшот маршрута — источник истины для типов этапов и кворума;
задачи в БД — состояние исполнения. Слот = (stage_no, order_in_stage),
несколько задач в слоте = несколько людей на одной должности,
закрывает любой (ТЗ §5.2).
"""
import uuid
from datetime import UTC, datetime, timedelta

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AuditLog, ProcessInstance, Task, User
from app.models.enums import (
    ObjectType,
    ProcessStatus,
    StageType,
    TaskResult,
    TaskStatus,
)
from app.services.route_engine import RouteStage, build_route, route_to_snapshot

OPEN_TASK_STATUSES = (TaskStatus.PENDING, TaskStatus.ACTIVE)
APPROVED_RESULTS = (TaskResult.APPROVED, TaskResult.AUTO_APPROVED)


def utcnow() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


async def _audit(
    session: AsyncSession,
    *,
    process_id: uuid.UUID,
    action: str,
    user_id: uuid.UUID | None = None,
    task_id: uuid.UUID | None = None,
    payload: dict | None = None,
    ip: str | None = None,
) -> None:
    session.add(
        AuditLog(
            process_id=process_id,
            task_id=task_id,
            user_id=user_id,
            action=action,
            payload=payload,
            ip=ip,
        )
    )


async def start_process(
    session: AsyncSession,
    *,
    object_type: ObjectType,
    object_id: uuid.UUID,
    initiator: User,
    organization_id: uuid.UUID,
    project_id: uuid.UUID | None,
    ip: str | None,
) -> ProcessInstance:
    stages = await build_route(
        session,
        object_type=object_type,
        organization_id=organization_id,
        project_id=project_id,
        initiator_employee_id=initiator.employee_id,
    )

    process = ProcessInstance(
        object_type=object_type,
        object_id=object_id,
        initiator_id=initiator.id,
        organization_id=organization_id,
        project_id=project_id,
        status=ProcessStatus.IN_PROGRESS,
        route_snapshot=route_to_snapshot(stages),
        started_at=utcnow(),
    )
    session.add(process)
    await session.flush()

    for stage in stages:
        for slot in stage.slots:
            if slot.skipped:
                continue
            for assignee in slot.assignees:
                session.add(
                    Task(
                        process_id=process.id,
                        stage_no=stage.stage_no,
                        order_in_stage=slot.order_in_stage,
                        position_id=(
                            uuid.UUID(slot.position_id) if slot.position_id else None
                        ),
                        assignee_id=uuid.UUID(assignee.employee_id),
                        substitute_for_id=(
                            uuid.UUID(assignee.substitute_for_id)
                            if assignee.substitute_for_id
                            else None
                        ),
                        status=TaskStatus.PENDING,
                    )
                )
    await session.flush()

    await _audit(
        session,
        process_id=process.id,
        action="PROCESS_STARTED",
        user_id=initiator.id,
        payload={"object_type": object_type.value, "object_id": str(object_id)},
        ip=ip,
    )

    await _advance(session, process, ip=ip)
    await session.commit()
    await session.refresh(process)
    return process


async def complete_task(
    session: AsyncSession,
    *,
    task: Task,
    user: User,
    approve: bool,
    comment: str | None,
    ip: str | None,
) -> ProcessInstance:
    if task.status != TaskStatus.ACTIVE:
        raise HTTPException(status.HTTP_409_CONFLICT, "Задача не активна")
    if user.employee_id is None or task.assignee_id != user.employee_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Задача назначена не вам")
    if not approve and not (comment and comment.strip()):
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "При отклонении комментарий обязателен",
        )

    process = await session.get(ProcessInstance, task.process_id)
    if process.status != ProcessStatus.IN_PROGRESS:
        raise HTTPException(status.HTTP_409_CONFLICT, "Процесс уже завершён")

    task.status = TaskStatus.COMPLETED
    task.result = TaskResult.APPROVED if approve else TaskResult.REJECTED
    task.comment = comment
    task.completed_at = utcnow()
    await _audit(
        session,
        process_id=process.id,
        task_id=task.id,
        user_id=user.id,
        action="TASK_APPROVED" if approve else "TASK_REJECTED",
        payload={"comment": comment} if comment else None,
        ip=ip,
    )

    if approve:
        await _advance(session, process, ip=ip)
    else:
        # v1: отклонение завершает процесс, повторная отправка = новый
        # процесс с полным сбросом виз (ТЗ §6.3, упрощённый вариант)
        await _close_open_tasks(session, process.id, TaskStatus.CANCELLED)
        process.status = ProcessStatus.REJECTED
        process.completed_at = utcnow()
        await _audit(
            session, process_id=process.id, action="PROCESS_REJECTED", user_id=user.id
        )

    await session.commit()
    await session.refresh(process)
    return process


async def cancel_process(
    session: AsyncSession, *, process: ProcessInstance, user: User, ip: str | None
) -> ProcessInstance:
    """Отзыв инициатором до финальной визы (ТЗ §6.4)."""
    if process.initiator_id != user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Отозвать может только инициатор")
    if process.status != ProcessStatus.IN_PROGRESS:
        raise HTTPException(status.HTTP_409_CONFLICT, "Процесс уже завершён")
    await _close_open_tasks(session, process.id, TaskStatus.CANCELLED)
    process.status = ProcessStatus.CANCELLED
    process.completed_at = utcnow()
    await _audit(
        session, process_id=process.id, action="PROCESS_CANCELLED", user_id=user.id, ip=ip
    )
    await session.commit()
    await session.refresh(process)
    return process


async def force_close_process(
    session: AsyncSession,
    *,
    process: ProcessInstance,
    user: User,
    comment: str,
    ip: str | None,
) -> ProcessInstance:
    """Принудительное завершение администратором, комментарий обязателен (ТЗ §6.4)."""
    if process.status not in (ProcessStatus.IN_PROGRESS, ProcessStatus.PENDING_EXPORT):
        raise HTTPException(status.HTTP_409_CONFLICT, "Процесс уже завершён")
    await _close_open_tasks(session, process.id, TaskStatus.CANCELLED)
    process.status = ProcessStatus.FORCE_CLOSED
    process.completed_at = utcnow()
    await _audit(
        session,
        process_id=process.id,
        action="PROCESS_FORCE_CLOSED",
        user_id=user.id,
        payload={"comment": comment},
        ip=ip,
    )
    await session.commit()
    await session.refresh(process)
    return process


async def _close_open_tasks(
    session: AsyncSession, process_id: uuid.UUID, new_status: TaskStatus
) -> None:
    tasks = await session.scalars(
        select(Task).where(
            Task.process_id == process_id, Task.status.in_(OPEN_TASK_STATUSES)
        )
    )
    for task in tasks:
        task.status = new_status


# --- Движок продвижения процесса ---


def _snapshot_stages(process: ProcessInstance) -> list[dict]:
    return process.route_snapshot["stages"]


def _slot_key(task: Task) -> tuple[int, int]:
    return (task.stage_no, task.order_in_stage)


async def _advance(
    session: AsyncSession, process: ProcessInstance, *, ip: str | None
) -> None:
    """Продвигает процесс: активирует этапы/слоты, автосогласует совпадения,
    проверяет условия завершения этапов. Цикл — потому что автосогласование
    может закрыть этап целиком и открыть следующий."""
    initiator_employee_id = await session.scalar(
        select(User.employee_id).where(User.id == process.initiator_id)
    )

    while True:
        tasks = list(
            await session.scalars(select(Task).where(Task.process_id == process.id))
        )
        current = _current_stage(process, tasks)
        if current is None:
            process.status = ProcessStatus.APPROVED
            process.completed_at = utcnow()
            await _audit(session, process_id=process.id, action="PROCESS_APPROVED")
            return

        stage_meta, stage_tasks = current
        stage_done = _evaluate_stage(stage_meta, stage_tasks)
        if stage_done:
            # закрыть лишние открытые задачи этапа (PARALLEL_ANY/QUORUM)
            for task in stage_tasks:
                if task.status in OPEN_TASK_STATUSES:
                    task.status = TaskStatus.SKIPPED
            continue

        activated = _activate_tasks(stage_meta, stage_tasks)
        if not activated:
            return  # этап ждёт решений людей

        auto_approved = False
        approvers = {
            t.assignee_id
            for t in tasks
            if t.result in APPROVED_RESULTS and t.stage_no < stage_meta["stage_no"]
        }
        for task in activated:
            # Совпадение исполнителей: автосогласование, чтобы люди
            # не кликали одно и то же дважды (ТЗ §5.2)
            if task.assignee_id == initiator_employee_id:
                reason = "Совпадение с инициатором"
            elif task.assignee_id in approvers:
                reason = "Совпадение с предыдущим этапом"
            else:
                continue
            task.status = TaskStatus.COMPLETED
            task.result = TaskResult.AUTO_APPROVED
            task.comment = reason
            task.completed_at = utcnow()
            auto_approved = True
            await _audit(
                session,
                process_id=process.id,
                task_id=task.id,
                action="TASK_AUTO_APPROVED",
                payload={"reason": reason},
                ip=ip,
            )
        if not auto_approved:
            return
        await session.flush()


def _current_stage(
    process: ProcessInstance, tasks: list[Task]
) -> tuple[dict, list[Task]] | None:
    """Первый незавершённый этап; None = все этапы пройдены."""
    by_stage: dict[int, list[Task]] = {}
    for task in tasks:
        by_stage.setdefault(task.stage_no, []).append(task)

    for stage_meta in sorted(_snapshot_stages(process), key=lambda s: s["stage_no"]):
        stage_tasks = by_stage.get(stage_meta["stage_no"], [])
        if not stage_tasks:
            continue  # этап целиком пропущен при расчёте маршрута
        if not _evaluate_stage(stage_meta, stage_tasks) or any(
            t.status in OPEN_TASK_STATUSES for t in stage_tasks
        ):
            return stage_meta, stage_tasks
    return None


def _slot_states(stage_tasks: list[Task]) -> dict[tuple[int, int], str]:
    """approved / open / dead для каждого слота этапа."""
    states: dict[tuple[int, int], str] = {}
    for task in stage_tasks:
        key = _slot_key(task)
        state = states.get(key)
        if task.result in APPROVED_RESULTS:
            states[key] = "approved"
        elif task.status in OPEN_TASK_STATUSES and state != "approved":
            states[key] = "open"
        elif state is None:
            states[key] = "dead"
    return states


def _evaluate_stage(stage_meta: dict, stage_tasks: list[Task]) -> bool:
    states = _slot_states(stage_tasks)
    approved = sum(1 for s in states.values() if s == "approved")
    total = len(states)
    stage_type = stage_meta["stage_type"]
    if stage_type == StageType.PARALLEL_ANY:
        return approved >= 1
    if stage_type == StageType.QUORUM:
        return approved >= (stage_meta.get("quorum_count") or total)
    return approved == total  # SEQUENTIAL и PARALLEL_ALL: все слоты


def _activate_tasks(stage_meta: dict, stage_tasks: list[Task]) -> list[Task]:
    """Переводит нужные PENDING-задачи в ACTIVE; возвращает активированные."""
    deadline_by_slot = {
        (stage_meta["stage_no"], slot["order_in_stage"]): slot.get("deadline_hours")
        for slot in stage_meta["slots"]
    }

    if stage_meta["stage_type"] == StageType.SEQUENTIAL:
        states = _slot_states(stage_tasks)
        target_slots = [
            key
            for key in sorted(states)
            if states[key] == "open"
        ][:1]
    else:
        target_slots = [
            _slot_key(t) for t in stage_tasks if t.status in OPEN_TASK_STATUSES
        ]

    activated = []
    for task in stage_tasks:
        if task.status == TaskStatus.PENDING and _slot_key(task) in target_slots:
            task.status = TaskStatus.ACTIVE
            hours = deadline_by_slot.get(_slot_key(task))
            if hours:
                task.due_at = utcnow() + timedelta(hours=hours)
            activated.append(task)
    return activated
