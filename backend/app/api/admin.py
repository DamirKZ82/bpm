"""Админ-CRUD справочников для локальной работы без 1С.

Когда появится синхронизация (этапы 1–2 внедрения), эти данные будет
писать sync-слой, а ручное редактирование останется для внутренних
сущностей (правила маршрутов, назначения на проекты, замещения).
"""
import uuid
from datetime import date as Date

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import func, select

from app.api.deps import SessionDep, require_roles
from app.models import (
    Absence,
    Department,
    Dictionary,
    DictionaryItem,
    Document,
    DocumentType,
    DocumentTypeField,
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
from app.models.enums import (
    FieldType,
    RefTarget,
    ResolverType,
    RuleMandatory,
    StageType,
    UserRole,
    UserStatus,
)
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


# --- Маршрут целиком: карточка «объект + этапы» одной операцией ---
# GET собирает строки route_rules в маршруты по контексту
# (вид объекта × организация × проект), POST атомарно заменяет группу.
# Запущенные процессы не затрагиваются: маршрут зафиксирован
# в route_snapshot (ТЗ §4.5).

class MatrixParticipant(BaseModel):
    resolver_type: ResolverType
    position_id: uuid.UUID | None = None
    deadline_hours: int | None = None
    mandatory: RuleMandatory = RuleMandatory.REQUIRED

    @model_validator(mode="after")
    def check_position(self):
        needs_position = self.resolver_type in (
            ResolverType.POSITION_IN_ORG,
            ResolverType.POSITION_IN_PROJECT,
        )
        if needs_position and self.position_id is None:
            raise ValueError("Для адресации по должности укажите должность")
        return self


class MatrixStage(BaseModel):
    stage_type: StageType = StageType.SEQUENTIAL
    quorum_count: int | None = None
    participants: list[MatrixParticipant] = Field(min_length=1)

    @model_validator(mode="after")
    def check_quorum(self):
        if self.stage_type == StageType.QUORUM and not self.quorum_count:
            raise ValueError("Для кворума укажите количество")
        if self.stage_type != StageType.QUORUM:
            self.quorum_count = None
        return self


class MatrixContext(BaseModel):
    object_type: str  # code вида документа
    organization_id: uuid.UUID | None = None
    project_id: uuid.UUID | None = None


class MatrixRoute(MatrixContext):
    priority: int = 100
    valid_from: Date | None = None
    valid_to: Date | None = None
    stages: list[MatrixStage] = Field(min_length=1)
    # при редактировании со сменой контекста — прежний контекст для удаления
    original: MatrixContext | None = None


def _context_clause(object_type, organization_id, project_id):
    return (
        RouteRule.object_type == object_type,
        RouteRule.organization_id == organization_id
        if organization_id is not None
        else RouteRule.organization_id.is_(None),
        RouteRule.project_id == project_id
        if project_id is not None
        else RouteRule.project_id.is_(None),
    )


async def _delete_context_rules(session, context: MatrixContext) -> None:
    rows = await session.scalars(
        select(RouteRule).where(
            *_context_clause(
                context.object_type, context.organization_id, context.project_id
            )
        )
    )
    for rule in rows:
        await session.delete(rule)


matrix_router = APIRouter(
    prefix="/route-matrix",
    dependencies=[Depends(require_roles(UserRole.MATRIX_EDITOR))],
)


@matrix_router.get("", response_model=list[MatrixRoute])
async def list_matrix_routes(session: SessionDep):
    rules = list(
        await session.scalars(
            select(RouteRule).order_by(
                RouteRule.object_type,
                RouteRule.priority,
                RouteRule.stage_no,
                RouteRule.order_in_stage,
            )
        )
    )
    groups: dict[tuple, dict] = {}
    for rule in rules:
        key = (rule.object_type, rule.organization_id, rule.project_id)
        group = groups.setdefault(key, {"meta": rule, "stages": {}})
        stage = group["stages"].setdefault(
            rule.stage_no,
            {
                "stage_type": rule.stage_type,
                "quorum_count": rule.quorum_count,
                "participants": [],
            },
        )
        stage["participants"].append(
            MatrixParticipant(
                resolver_type=rule.resolver_type,
                position_id=rule.position_id,
                deadline_hours=rule.deadline_hours,
                mandatory=rule.mandatory,
            )
        )
    result = []
    for group in groups.values():
        meta = group["meta"]
        result.append(
            MatrixRoute(
                object_type=meta.object_type,
                organization_id=meta.organization_id,
                project_id=meta.project_id,
                priority=meta.priority,
                valid_from=meta.valid_from,
                valid_to=meta.valid_to,
                stages=[
                    MatrixStage(**group["stages"][no])
                    for no in sorted(group["stages"])
                ],
            )
        )
    return result


@matrix_router.post("", response_model=MatrixRoute)
async def save_matrix_route(payload: MatrixRoute, session: SessionDep):
    type_exists = await session.scalar(
        select(DocumentType.id).where(DocumentType.code == payload.object_type)
    )
    if type_exists is None:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY, "Вид документа не найден"
        )
    if payload.original is not None:
        await _delete_context_rules(session, payload.original)
    await _delete_context_rules(
        session,
        MatrixContext(
            object_type=payload.object_type,
            organization_id=payload.organization_id,
            project_id=payload.project_id,
        ),
    )
    for stage_index, stage in enumerate(payload.stages, start=1):
        for participant_index, participant in enumerate(stage.participants, start=1):
            session.add(
                RouteRule(
                    object_type=payload.object_type,
                    organization_id=payload.organization_id,
                    project_id=payload.project_id,
                    stage_no=stage_index,
                    order_in_stage=participant_index,
                    resolver_type=participant.resolver_type,
                    position_id=participant.position_id,
                    stage_type=stage.stage_type,
                    quorum_count=stage.quorum_count,
                    deadline_hours=participant.deadline_hours,
                    mandatory=participant.mandatory,
                    priority=payload.priority,
                    valid_from=payload.valid_from,
                    valid_to=payload.valid_to,
                )
            )
    await session.commit()
    payload.original = None
    return payload


@matrix_router.post("/delete", status_code=status.HTTP_204_NO_CONTENT)
async def delete_matrix_route(context: MatrixContext, session: SessionDep):
    await _delete_context_rules(session, context)
    await session.commit()


router.include_router(matrix_router)


# --- Конструктор видов документов ---
# Вид = стандартная шапка + настраиваемые поля; поля редактируются
# вместе с видом одной формой (замена списка с сохранением id).

_FIELD_TYPES = {t.value for t in FieldType}
_REF_TARGETS = {t.value for t in RefTarget}


class TypeFieldIn(BaseModel):
    id: uuid.UUID | None = None
    code: str = Field(min_length=1, max_length=50, pattern=r"^[a-z0-9_]+$")
    name: str = Field(min_length=1, max_length=200)
    field_type: str
    ref_target: str | None = None
    dictionary_id: uuid.UUID | None = None
    required: bool = False

    @model_validator(mode="after")
    def check(self):
        if self.field_type not in _FIELD_TYPES:
            raise ValueError(f"Неизвестный тип поля: {self.field_type}")
        if self.field_type == FieldType.REF:
            if self.ref_target not in _REF_TARGETS:
                raise ValueError("Для ссылочного поля укажите справочник")
            if self.ref_target == RefTarget.DICTIONARY and self.dictionary_id is None:
                raise ValueError("Укажите пользовательский справочник")
        else:
            self.ref_target = None
            self.dictionary_id = None
        return self


class DocumentTypeIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    prefix: str = Field(min_length=1, max_length=10)
    active: bool = True
    fields: list[TypeFieldIn] = []

    @model_validator(mode="after")
    def check_codes(self):
        codes = [f.code for f in self.fields]
        if len(codes) != len(set(codes)):
            raise ValueError("Коды полей должны быть уникальны")
        return self


class TypeFieldRead(TypeFieldIn):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    sort_order: int = 0


class DocumentTypeRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    code: str
    name: str
    prefix: str
    is_system: bool
    active: bool
    last_number: int
    fields: list[TypeFieldRead] = []


doc_types_router = APIRouter(
    prefix="/document-types", dependencies=[Depends(require_roles())]
)


async def _type_read(session, doc_type: DocumentType) -> DocumentTypeRead:
    result = DocumentTypeRead.model_validate(doc_type)
    rows = await session.scalars(
        select(DocumentTypeField)
        .where(DocumentTypeField.document_type_id == doc_type.id)
        .order_by(DocumentTypeField.sort_order)
    )
    result.fields = [TypeFieldRead.model_validate(f) for f in rows]
    return result


@doc_types_router.get("", response_model=list[DocumentTypeRead])
async def list_document_types(session: SessionDep):
    types = await session.scalars(
        select(DocumentType).order_by(DocumentType.created_at)
    )
    return [await _type_read(session, t) for t in types]


async def _apply_fields(
    session, doc_type: DocumentType, fields: list[TypeFieldIn]
) -> None:
    existing = {
        f.id: f
        for f in await session.scalars(
            select(DocumentTypeField).where(
                DocumentTypeField.document_type_id == doc_type.id
            )
        )
    }
    keep: set[uuid.UUID] = set()
    for order, field in enumerate(fields):
        if field.id is not None and field.id in existing:
            row = existing[field.id]
            row.code = field.code
            row.name = field.name
            row.field_type = field.field_type
            row.ref_target = field.ref_target
            row.dictionary_id = field.dictionary_id
            row.required = field.required
            row.sort_order = order
            keep.add(row.id)
        else:
            session.add(
                DocumentTypeField(
                    document_type_id=doc_type.id,
                    code=field.code,
                    name=field.name,
                    field_type=field.field_type,
                    ref_target=field.ref_target,
                    dictionary_id=field.dictionary_id,
                    required=field.required,
                    sort_order=order,
                )
            )
    for row_id, row in existing.items():
        if row_id not in keep:
            await session.delete(row)


@doc_types_router.post(
    "", response_model=DocumentTypeRead, status_code=status.HTTP_201_CREATED
)
async def create_document_type(payload: DocumentTypeIn, session: SessionDep):
    doc_type = DocumentType(
        code=f"DOC_{uuid.uuid4().hex[:8].upper()}",
        name=payload.name,
        prefix=payload.prefix,
        active=payload.active,
    )
    session.add(doc_type)
    await session.flush()
    await _apply_fields(session, doc_type, payload.fields)
    await session.commit()
    return await _type_read(session, doc_type)


@doc_types_router.put("/{type_id}", response_model=DocumentTypeRead)
async def update_document_type(
    type_id: uuid.UUID, payload: DocumentTypeIn, session: SessionDep
):
    doc_type = await session.get(DocumentType, type_id)
    if doc_type is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    doc_type.name = payload.name
    doc_type.prefix = payload.prefix
    doc_type.active = payload.active
    await _apply_fields(session, doc_type, payload.fields)
    await session.commit()
    return await _type_read(session, doc_type)


@doc_types_router.delete("/{type_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document_type(type_id: uuid.UUID, session: SessionDep):
    doc_type = await session.get(DocumentType, type_id)
    if doc_type is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    if doc_type.is_system:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "Системный вид удалить нельзя"
        )
    has_documents = await session.scalar(
        select(Document.id).where(Document.type_code == doc_type.code).limit(1)
    )
    if has_documents is not None:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "По виду уже есть документы — деактивируйте его вместо удаления",
        )
    rules = await session.scalars(
        select(RouteRule).where(RouteRule.object_type == doc_type.code)
    )
    for rule in rules:
        await session.delete(rule)
    await session.delete(doc_type)
    await session.commit()


router.include_router(doc_types_router)


# --- Пользовательские справочники ---

class DictionaryItemIn(BaseModel):
    id: uuid.UUID | None = None
    name: str = Field(min_length=1, max_length=500)
    active: bool = True


class DictionaryIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    active: bool = True
    items: list[DictionaryItemIn] = []


class DictionaryItemRead(DictionaryItemIn):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID


class DictionaryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    active: bool
    items: list[DictionaryItemRead] = []


dictionaries_router = APIRouter(
    prefix="/dictionaries", dependencies=[Depends(require_roles())]
)


async def _dictionary_read(session, dictionary: Dictionary) -> DictionaryRead:
    result = DictionaryRead.model_validate(dictionary)
    rows = await session.scalars(
        select(DictionaryItem)
        .where(DictionaryItem.dictionary_id == dictionary.id)
        .order_by(DictionaryItem.sort_order, DictionaryItem.name)
    )
    result.items = [DictionaryItemRead.model_validate(i) for i in rows]
    return result


@dictionaries_router.get("", response_model=list[DictionaryRead])
async def list_dictionaries(session: SessionDep):
    dictionaries = await session.scalars(select(Dictionary).order_by(Dictionary.name))
    return [await _dictionary_read(session, d) for d in dictionaries]


async def _apply_items(
    session, dictionary: Dictionary, items: list[DictionaryItemIn]
) -> None:
    existing = {
        i.id: i
        for i in await session.scalars(
            select(DictionaryItem).where(
                DictionaryItem.dictionary_id == dictionary.id
            )
        )
    }
    keep: set[uuid.UUID] = set()
    for order, item in enumerate(items):
        if item.id is not None and item.id in existing:
            row = existing[item.id]
            row.name = item.name
            row.active = item.active
            row.sort_order = order
            keep.add(row.id)
        else:
            session.add(
                DictionaryItem(
                    dictionary_id=dictionary.id,
                    name=item.name,
                    active=item.active,
                    sort_order=order,
                )
            )
    for row_id, row in existing.items():
        if row_id not in keep:
            await session.delete(row)


@dictionaries_router.post(
    "", response_model=DictionaryRead, status_code=status.HTTP_201_CREATED
)
async def create_dictionary(payload: DictionaryIn, session: SessionDep):
    dictionary = Dictionary(name=payload.name, active=payload.active)
    session.add(dictionary)
    await session.flush()
    await _apply_items(session, dictionary, payload.items)
    await session.commit()
    return await _dictionary_read(session, dictionary)


@dictionaries_router.put("/{dictionary_id}", response_model=DictionaryRead)
async def update_dictionary(
    dictionary_id: uuid.UUID, payload: DictionaryIn, session: SessionDep
):
    dictionary = await session.get(Dictionary, dictionary_id)
    if dictionary is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    dictionary.name = payload.name
    dictionary.active = payload.active
    await _apply_items(session, dictionary, payload.items)
    await session.commit()
    return await _dictionary_read(session, dictionary)


@dictionaries_router.delete(
    "/{dictionary_id}", status_code=status.HTTP_204_NO_CONTENT
)
async def delete_dictionary(dictionary_id: uuid.UUID, session: SessionDep):
    dictionary = await session.get(Dictionary, dictionary_id)
    if dictionary is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    used = await session.scalar(
        select(DocumentTypeField.id)
        .where(DocumentTypeField.dictionary_id == dictionary_id)
        .limit(1)
    )
    if used is not None:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Справочник используется в полях видов документов",
        )
    await session.delete(dictionary)
    await session.commit()


router.include_router(dictionaries_router)


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
    """Информация о конфигурации для страницы «Настройки BPM»."""
    from app.core.config import settings

    return {"auth_mode": settings.auth_mode}


# --- Настройки хранилища файлов: хранятся в БД, правятся из UI ---

class StorageSettingsUpdate(BaseModel):
    storage_backend: str  # local | s3
    storage_local_path: str = "storage"
    max_upload_mb: int = 50
    s3_endpoint_url: str = ""
    s3_bucket: str = ""
    s3_access_key: str = ""
    # None = оставить прежний секрет (в GET секрет не возвращается)
    s3_secret_key: str | None = None
    s3_region: str = "us-east-1"


def _storage_settings_response(config) -> dict:
    data = config.model_dump()
    data["s3_secret_set"] = bool(data.pop("s3_secret_key"))
    return data


@router.get("/settings/storage", dependencies=[Depends(require_roles())])
async def get_storage_settings(session: SessionDep):
    from app.services.storage import load_storage_config

    return _storage_settings_response(await load_storage_config(session))


@router.put("/settings/storage", dependencies=[Depends(require_roles())])
async def update_storage_settings(
    payload: StorageSettingsUpdate, session: SessionDep
):
    from app.services.storage import (
        StorageConfig,
        load_storage_config,
        save_storage_config,
    )

    if payload.storage_backend not in ("local", "s3"):
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY, "Способ хранения: local или s3"
        )
    current = await load_storage_config(session)
    data = payload.model_dump()
    if data["s3_secret_key"] is None:
        data["s3_secret_key"] = current.s3_secret_key
    config = StorageConfig(**data)
    await save_storage_config(session, config)
    return _storage_settings_response(config)
