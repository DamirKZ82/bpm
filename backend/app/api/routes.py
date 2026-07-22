import uuid
from typing import Any

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select

from app.api.deps import CurrentUser, SessionDep
from app.models import Organization, Position, Project
from app.models.enums import ObjectType
from app.services.route_engine import RouteError, build_route, route_to_snapshot

router = APIRouter(prefix="/api")


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


# --- Справочные списки для форм (доступны любому вошедшему) ---

class OrganizationRef(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str


class ProjectRef(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    code: str | None
    organization_id: uuid.UUID | None


@router.get("/refs/organizations", response_model=list[OrganizationRef])
async def ref_organizations(user: CurrentUser, session: SessionDep):
    rows = await session.scalars(
        select(Organization)
        .where(Organization.active.is_(True))
        .order_by(Organization.name)
    )
    return list(rows)


@router.get("/refs/projects", response_model=list[ProjectRef])
async def ref_projects(user: CurrentUser, session: SessionDep):
    rows = await session.scalars(select(Project).order_by(Project.name))
    return list(rows)


class PositionRef(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str


@router.get("/refs/positions", response_model=list[PositionRef])
async def ref_positions(user: CurrentUser, session: SessionDep):
    rows = await session.scalars(
        select(Position).where(Position.active.is_(True)).order_by(Position.name)
    )
    return list(rows)


class RoutePreview(BaseModel):
    ok: bool
    error: str | None = None
    stages: list[dict[str, Any]] = []


@router.get("/route-preview", response_model=RoutePreview)
async def route_preview(
    object_type: ObjectType,
    organization_id: uuid.UUID,
    user: CurrentUser,
    session: SessionDep,
    project_id: uuid.UUID | None = None,
):
    """Предпросмотр маршрута до запуска процесса (тестировщик матрицы,
    ТЗ §4.4): расчёт с конкретными ФИО от имени текущего пользователя."""
    if user.employee_id is None:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Учётная запись не сопоставлена с сотрудником",
        )
    try:
        stages = await build_route(
            session,
            object_type=object_type,
            organization_id=organization_id,
            project_id=project_id,
            initiator_employee_id=user.employee_id,
        )
    except RouteError as exc:
        return RoutePreview(ok=False, error=str(exc))
    return RoutePreview(ok=True, stages=route_to_snapshot(stages)["stages"])
