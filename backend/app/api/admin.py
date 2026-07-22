"""Админ-CRUD справочников для локальной работы без 1С.

Когда появится синхронизация (этапы 1–2 внедрения), эти данные будет
писать sync-слой, а ручное редактирование останется для внутренних
сущностей (правила маршрутов, назначения на проекты, замещения).
"""
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy import func, select

from app.api.deps import SessionDep, require_roles
from app.models import (
    Absence,
    Department,
    Employee,
    Employment,
    Organization,
    Position,
    Project,
    ProjectAssignment,
    RouteRule,
    Substitution,
    User,
)
from app.models.enums import UserRole, UserStatus
from app.schemas.auth import UserRead
from app.schemas.directory import (
    AbsenceCreate,
    AbsenceRead,
    AbsenceUpdate,
    DepartmentCreate,
    DepartmentRead,
    DepartmentUpdate,
    EmployeeCreate,
    EmployeeRead,
    EmployeeUpdate,
    EmploymentCreate,
    EmploymentRead,
    EmploymentUpdate,
    OrganizationCreate,
    OrganizationRead,
    OrganizationUpdate,
    PositionCreate,
    PositionRead,
    PositionUpdate,
    ProjectCreate,
    ProjectRead,
    ProjectUpdate,
)
from app.schemas.routing import (
    ProjectAssignmentCreate,
    ProjectAssignmentRead,
    ProjectAssignmentUpdate,
    RouteRuleCreate,
    RouteRuleRead,
    RouteRuleUpdate,
    SubstitutionCreate,
    SubstitutionRead,
    SubstitutionUpdate,
)

router = APIRouter(prefix="/api/admin", tags=["admin"])


def _crud_router(
    *,
    model,
    prefix: str,
    create_schema,
    update_schema,
    read_schema,
    roles: tuple[UserRole, ...] = (),
) -> APIRouter:
    """Однотипный CRUD: list / get / post / patch / delete."""
    sub = APIRouter(
        prefix=prefix,
        dependencies=[Depends(require_roles(*roles))],
    )

    @sub.get("", response_model=list[read_schema])
    async def list_items(session: SessionDep, limit: int = 500, offset: int = 0):
        rows = await session.scalars(select(model).limit(limit).offset(offset))
        return list(rows)

    @sub.get("/{item_id}", response_model=read_schema)
    async def get_item(item_id: uuid.UUID, session: SessionDep):
        obj = await session.get(model, item_id)
        if obj is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND)
        return obj

    @sub.post("", response_model=read_schema, status_code=status.HTTP_201_CREATED)
    async def create_item(payload: create_schema, session: SessionDep):  # type: ignore[valid-type]
        obj = model(**payload.model_dump())
        session.add(obj)
        await session.commit()
        await session.refresh(obj)
        return obj

    @sub.patch("/{item_id}", response_model=read_schema)
    async def update_item(item_id: uuid.UUID, payload: update_schema, session: SessionDep):  # type: ignore[valid-type]
        obj = await session.get(model, item_id)
        if obj is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND)
        for key, value in payload.model_dump(exclude_unset=True).items():
            setattr(obj, key, value)
        await session.commit()
        await session.refresh(obj)
        return obj

    @sub.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
    async def delete_item(item_id: uuid.UUID, session: SessionDep):
        obj = await session.get(model, item_id)
        if obj is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND)
        await session.delete(obj)
        await session.commit()

    return sub


_ADMIN_ONLY: tuple[UserRole, ...] = ()  # require_roles() без ролей = только ADMIN

for _model, _prefix, _c, _u, _r, _roles in [
    (Organization, "/organizations", OrganizationCreate, OrganizationUpdate, OrganizationRead, _ADMIN_ONLY),
    (Position, "/positions", PositionCreate, PositionUpdate, PositionRead, _ADMIN_ONLY),
    (Department, "/departments", DepartmentCreate, DepartmentUpdate, DepartmentRead, _ADMIN_ONLY),
    (Employee, "/employees", EmployeeCreate, EmployeeUpdate, EmployeeRead, _ADMIN_ONLY),
    (Employment, "/employments", EmploymentCreate, EmploymentUpdate, EmploymentRead, _ADMIN_ONLY),
    (Absence, "/absences", AbsenceCreate, AbsenceUpdate, AbsenceRead, _ADMIN_ONLY),
    (Project, "/projects", ProjectCreate, ProjectUpdate, ProjectRead, _ADMIN_ONLY),
    (ProjectAssignment, "/project-assignments", ProjectAssignmentCreate, ProjectAssignmentUpdate, ProjectAssignmentRead, _ADMIN_ONLY),
    (Substitution, "/substitutions", SubstitutionCreate, SubstitutionUpdate, SubstitutionRead, _ADMIN_ONLY),
]:
    router.include_router(
        _crud_router(
            model=_model,
            prefix=_prefix,
            create_schema=_c,
            update_schema=_u,
            read_schema=_r,
            roles=_roles,
        )
    )


# --- Матрица маршрутов: отдельный роутер ---
# «№ в этапе» назначается автоматически; тип этапа и кворум — свойство
# этапа целиком: при сохранении строки применяются ко всем её соседям,
# смешение последовательного и параллельного внутри этапа невозможно.

route_rules_router = APIRouter(
    prefix="/route-rules",
    dependencies=[Depends(require_roles(UserRole.MATRIX_EDITOR))],
)


def _stage_clause(object_type, organization_id, project_id, stage_no):
    return (
        RouteRule.object_type == object_type,
        RouteRule.organization_id == organization_id
        if organization_id is not None
        else RouteRule.organization_id.is_(None),
        RouteRule.project_id == project_id
        if project_id is not None
        else RouteRule.project_id.is_(None),
        RouteRule.stage_no == stage_no,
    )


async def _stage_siblings(session, rule: RouteRule) -> list[RouteRule]:
    stmt = select(RouteRule).where(
        *_stage_clause(
            rule.object_type, rule.organization_id, rule.project_id, rule.stage_no
        )
    )
    if rule.id is not None:  # у новой строки id появится только при flush
        stmt = stmt.where(RouteRule.id != rule.id)
    return list(await session.scalars(stmt))


def _sync_stage(rule: RouteRule, siblings: list[RouteRule]) -> None:
    from app.models.enums import StageType

    if rule.stage_type != StageType.QUORUM:
        rule.quorum_count = None
    for sibling in siblings:
        sibling.stage_type = rule.stage_type
        sibling.quorum_count = rule.quorum_count


@route_rules_router.get("", response_model=list[RouteRuleRead])
async def list_route_rules(session: SessionDep, limit: int = 500, offset: int = 0):
    rows = await session.scalars(
        select(RouteRule)
        .order_by(RouteRule.object_type, RouteRule.priority, RouteRule.stage_no,
                  RouteRule.order_in_stage)
        .limit(limit)
        .offset(offset)
    )
    return list(rows)


@route_rules_router.get("/{rule_id}", response_model=RouteRuleRead)
async def get_route_rule(rule_id: uuid.UUID, session: SessionDep):
    rule = await session.get(RouteRule, rule_id)
    if rule is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    return rule


@route_rules_router.post(
    "", response_model=RouteRuleRead, status_code=status.HTTP_201_CREATED
)
async def create_route_rule(payload: RouteRuleCreate, session: SessionDep):
    rule = RouteRule(**payload.model_dump())
    siblings = await _stage_siblings(session, rule)
    rule.order_in_stage = max((s.order_in_stage for s in siblings), default=0) + 1
    _sync_stage(rule, siblings)
    session.add(rule)
    await session.commit()
    await session.refresh(rule)
    return rule


@route_rules_router.patch("/{rule_id}", response_model=RouteRuleRead)
async def update_route_rule(
    rule_id: uuid.UUID, payload: RouteRuleUpdate, session: SessionDep
):
    rule = await session.get(RouteRule, rule_id)
    if rule is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    updates = payload.model_dump(exclude_unset=True)
    stage_changed = any(
        key in updates and updates[key] != getattr(rule, key)
        for key in ("object_type", "organization_id", "project_id", "stage_no")
    )
    for key, value in updates.items():
        setattr(rule, key, value)
    siblings = await _stage_siblings(session, rule)
    if stage_changed:
        # перенос в другой этап — в конец этого этапа
        rule.order_in_stage = max((s.order_in_stage for s in siblings), default=0) + 1
    _sync_stage(rule, siblings)
    await session.commit()
    await session.refresh(rule)
    return rule


@route_rules_router.delete("/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_route_rule(rule_id: uuid.UUID, session: SessionDep):
    rule = await session.get(RouteRule, rule_id)
    if rule is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    await session.delete(rule)
    await session.commit()


router.include_router(route_rules_router)


# --- Пользователи: отдельный роутер (генерация guid, роли, привязка) ---

class UserCreate(BaseModel):
    username: str
    display_name: str | None = None
    email: str | None = None
    roles: list[UserRole] = [UserRole.INITIATOR]
    employee_id: uuid.UUID | None = None


class UserUpdate(BaseModel):
    model_config = ConfigDict(use_enum_values=True)

    display_name: str | None = None
    email: str | None = None
    roles: list[UserRole] | None = None
    employee_id: uuid.UUID | None = None
    status: UserStatus | None = None


users_router = APIRouter(
    prefix="/users", dependencies=[Depends(require_roles())]
)


@users_router.get("", response_model=list[UserRead])
async def list_users(session: SessionDep):
    rows = await session.scalars(select(User).order_by(User.ad_sam_account_name))
    return list(rows)


@users_router.post("", response_model=UserRead, status_code=status.HTTP_201_CREATED)
async def create_user(payload: UserCreate, session: SessionDep):
    exists = await session.scalar(
        select(func.count()).where(User.ad_sam_account_name == payload.username)
    )
    if exists:
        raise HTTPException(status.HTTP_409_CONFLICT, "Пользователь уже существует")
    # Локальный (тестовый) пользователь без AD: guid генерируем сами,
    # при подключении AD реальные учётки придут со своим objectGUID
    user = User(
        ad_object_guid=uuid.uuid4(),
        ad_sam_account_name=payload.username,
        display_name=payload.display_name,
        email=payload.email,
        roles=[r.value for r in payload.roles],
        employee_id=payload.employee_id,
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return user


@users_router.patch("/{user_id}", response_model=UserRead)
async def update_user(user_id: uuid.UUID, payload: UserUpdate, session: SessionDep):
    user = await session.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(user, key, value)
    await session.commit()
    await session.refresh(user)
    return user


router.include_router(users_router)


@router.get("/settings-info", dependencies=[Depends(require_roles())])
async def settings_info():
    """Текущая конфигурация для страницы «Настройки BPM» (только чтение;
    изменение — через backend/.env)."""
    from app.core.config import settings

    return {
        "auth_mode": settings.auth_mode,
        "storage_backend": settings.storage_backend,
        "storage_local_path": settings.storage_local_path,
        "s3_endpoint_url": settings.s3_endpoint_url or None,
        "s3_bucket": settings.s3_bucket,
        "max_upload_mb": settings.max_upload_mb,
    }
