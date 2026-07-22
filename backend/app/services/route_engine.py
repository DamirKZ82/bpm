"""Расчёт маршрута по матрице и разрешение исполнителей (ТЗ §4–5).

Алгоритм §5.1: отбор правил по контексту → победившая группа по priority →
разрешение исполнителей по resolver_type → замещения → блокировка запуска,
если обязательный исполнитель не найден.
"""
import uuid
from dataclasses import asdict, dataclass, field
from datetime import date

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Absence,
    Employee,
    Employment,
    Position,
    ProjectAssignment,
    RouteRule,
    Substitution,
)
from app.models.enums import (
    EmployeeStatus,
    ResolverType,
    RuleMandatory,
    StageType,
)


class RouteError(Exception):
    """Ошибка расчёта маршрута — запуск процесса блокируется (ТЗ §5.1 шаг 5)."""


@dataclass
class ResolvedAssignee:
    employee_id: str
    full_name: str
    substitute_for_id: str | None = None
    substitute_for_name: str | None = None


@dataclass
class RouteSlot:
    order_in_stage: int
    resolver_type: str
    position_id: str | None
    position_name: str | None
    mandatory: str
    deadline_hours: int | None
    assignees: list[ResolvedAssignee] = field(default_factory=list)
    skipped: bool = False


@dataclass
class RouteStage:
    stage_no: int
    stage_type: str
    quorum_count: int | None
    slots: list[RouteSlot] = field(default_factory=list)


def route_to_snapshot(stages: list[RouteStage]) -> dict:
    return {"stages": [asdict(stage) for stage in stages]}


async def build_route(
    session: AsyncSession,
    *,
    object_type: str,
    organization_id: uuid.UUID,
    project_id: uuid.UUID | None,
    initiator_employee_id: uuid.UUID,
) -> list[RouteStage]:
    today = date.today()

    rules = (
        await session.scalars(
            select(RouteRule)
            .where(
                RouteRule.object_type == object_type,
                or_(
                    RouteRule.organization_id == organization_id,
                    RouteRule.organization_id.is_(None),
                ),
                or_(
                    RouteRule.project_id == project_id,
                    RouteRule.project_id.is_(None),
                ),
                or_(RouteRule.valid_from.is_(None), RouteRule.valid_from <= today),
                or_(RouteRule.valid_to.is_(None), RouteRule.valid_to >= today),
            )
            .order_by(RouteRule.stage_no, RouteRule.order_in_stage)
        )
    ).all()

    if not rules:
        raise RouteError(
            f"Маршрут не настроен: нет правил для вида объекта «{object_type}» "
            "в этом контексте"
        )

    # Модель замещения (§4.3): побеждает одна группа правил с наименьшим
    # priority, правила из проигравших групп не дополняют маршрут
    winning_priority = min(rule.priority for rule in rules)
    rules = [rule for rule in rules if rule.priority == winning_priority]

    position_names = dict(
        (
            await session.execute(
                select(Position.id, Position.name).where(
                    Position.id.in_({r.position_id for r in rules if r.position_id})
                )
            )
        ).all()
    )

    stages: dict[int, RouteStage] = {}
    for rule in rules:
        stage = stages.setdefault(
            rule.stage_no,
            RouteStage(
                stage_no=rule.stage_no,
                stage_type=rule.stage_type.value,
                quorum_count=rule.quorum_count,
            ),
        )
        assignees = await _resolve_rule(
            session,
            rule,
            organization_id=organization_id,
            project_id=project_id,
            initiator_employee_id=initiator_employee_id,
            today=today,
        )
        position_name = (
            position_names.get(rule.position_id) if rule.position_id else None
        )
        slot = RouteSlot(
            order_in_stage=rule.order_in_stage,
            resolver_type=rule.resolver_type.value,
            position_id=str(rule.position_id) if rule.position_id else None,
            position_name=position_name,
            mandatory=rule.mandatory.value,
            deadline_hours=rule.deadline_hours,
            assignees=assignees,
        )
        if not assignees:
            if rule.mandatory == RuleMandatory.REQUIRED:
                raise RouteError(
                    "Не определён исполнитель для должности "
                    f"«{position_name or rule.resolver_type}» — запуск заблокирован"
                )
            slot.skipped = True
        stage.slots.append(slot)

    result = [stages[no] for no in sorted(stages)]
    if all(slot.skipped for stage in result for slot in stage.slots):
        raise RouteError("Все этапы маршрута пусты — некому согласовывать")
    return result


async def _resolve_rule(
    session: AsyncSession,
    rule: RouteRule,
    *,
    organization_id: uuid.UUID,
    project_id: uuid.UUID | None,
    initiator_employee_id: uuid.UUID,
    today: date,
) -> list[ResolvedAssignee]:
    if rule.resolver_type == ResolverType.INITIATOR:
        employee_ids = [initiator_employee_id]
    elif rule.resolver_type == ResolverType.POSITION_IN_ORG:
        employee_ids = list(
            await session.scalars(
                select(Employment.employee_id).where(
                    Employment.position_id == rule.position_id,
                    Employment.organization_id == organization_id,
                    or_(
                        Employment.valid_from.is_(None),
                        Employment.valid_from <= today,
                    ),
                    or_(Employment.valid_to.is_(None), Employment.valid_to >= today),
                )
            )
        )
    elif rule.resolver_type == ResolverType.POSITION_IN_PROJECT:
        if project_id is None:
            raise RouteError(
                "Правило адресует по должности в проекте, но проект не указан"
            )
        employee_ids = list(
            await session.scalars(
                select(ProjectAssignment.employee_id).where(
                    ProjectAssignment.position_id == rule.position_id,
                    ProjectAssignment.project_id == project_id,
                    or_(
                        ProjectAssignment.valid_from.is_(None),
                        ProjectAssignment.valid_from <= today,
                    ),
                    or_(
                        ProjectAssignment.valid_to.is_(None),
                        ProjectAssignment.valid_to >= today,
                    ),
                )
            )
        )
    else:
        # INITIATOR_MANAGER и PROJECT_MANAGER — следующая итерация:
        # требуют иерархии подразделений / признака руководящей должности
        raise RouteError(
            f"Способ адресации {rule.resolver_type} пока не поддерживается"
        )

    resolved: list[ResolvedAssignee] = []
    seen: set[uuid.UUID] = set()
    for employee_id in employee_ids:
        if employee_id in seen:
            continue
        seen.add(employee_id)
        assignee = await _apply_absence_and_status(session, employee_id, today)
        if assignee is not None and uuid.UUID(assignee.employee_id) not in {
            uuid.UUID(a.employee_id) for a in resolved
        }:
            resolved.append(assignee)
    return resolved


async def _apply_absence_and_status(
    session: AsyncSession, employee_id: uuid.UUID, today: date
) -> ResolvedAssignee | None:
    """Шаги 3–4 алгоритма §5.1: отсутствия/замещения и проверка статуса."""
    employee = await session.get(Employee, employee_id)
    if employee is None or employee.status != EmployeeStatus.ACTIVE:
        # двойная деактивация, признак №2: уволенному задачи не назначаются
        return None

    absent = await session.scalar(
        select(Absence.id).where(
            Absence.employee_id == employee_id,
            Absence.date_from <= today,
            Absence.date_to >= today,
        )
    )
    if absent is None:
        return ResolvedAssignee(str(employee.id), employee.full_name)

    substitute_id = await session.scalar(
        select(Substitution.substitute_id).where(
            Substitution.employee_id == employee_id,
            Substitution.valid_from <= today,
            Substitution.valid_to >= today,
        )
    )
    if substitute_id is None:
        return None
    substitute = await session.get(Employee, substitute_id)
    if substitute is None or substitute.status != EmployeeStatus.ACTIVE:
        return None
    return ResolvedAssignee(
        employee_id=str(substitute.id),
        full_name=substitute.full_name,
        substitute_for_id=str(employee.id),
        substitute_for_name=employee.full_name,
    )
