import uuid
from typing import Any

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy import func, select

from app.api.deps import CurrentUser, SessionDep
from app.models import (
    Contract,
    Counterparty,
    Dictionary,
    DictionaryItem,
    Document,
    DocumentType,
    DocumentTypeField,
    Employee,
    Organization,
    Position,
    Project,
    VatRate,
)
from app.models.enums import EmployeeStatus
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
    rows = await session.scalars(
        select(Project).where(Project.active.is_(True)).order_by(Project.name)
    )
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


class TypeFieldRef(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    code: str
    name: str
    name_i18n: dict[str, str] | None = None
    field_type: str
    ref_target: str | None
    dictionary_id: uuid.UUID | None
    required: bool
    sort_order: int


class DocumentTypeRef(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    code: str
    name: str
    name_i18n: dict[str, str] | None = None
    prefix: str
    is_system: bool
    fields: list[TypeFieldRef] = []


@router.get("/refs/document-types", response_model=list[DocumentTypeRef])
async def ref_document_types(user: CurrentUser, session: SessionDep):
    """Активные виды документов с описаниями полей — для навигации
    и динамических форм."""
    types = list(
        await session.scalars(
            select(DocumentType)
            .where(DocumentType.active.is_(True))
            .order_by(DocumentType.created_at)
        )
    )
    fields = list(
        await session.scalars(
            select(DocumentTypeField).order_by(DocumentTypeField.sort_order)
        )
    )
    result = []
    for doc_type in types:
        item = DocumentTypeRef.model_validate(doc_type)
        item.fields = [
            TypeFieldRef.model_validate(f)
            for f in fields
            if f.document_type_id == doc_type.id
        ]
        result.append(item)
    return result


class FrequentType(BaseModel):
    code: str
    name: str
    name_i18n: dict[str, str] | None = None
    count: int


@router.get("/my/frequent-types", response_model=list[FrequentType])
async def frequent_types(user: CurrentUser, session: SessionDep, limit: int = 4):
    """Виды документов, которые пользователь создаёт чаще всего —
    для быстрого запуска на главной. Без истории — порядок как в справочнике."""
    counts = dict(
        (
            await session.execute(
                select(Document.type_code, func.count())
                .where(Document.author_id == user.id)
                .group_by(Document.type_code)
            )
        ).all()
    )
    types = list(
        await session.scalars(
            select(DocumentType)
            .where(DocumentType.active.is_(True))
            .order_by(DocumentType.created_at)
        )
    )
    ranked = sorted(types, key=lambda t: -counts.get(t.code, 0))
    return [
        FrequentType(
            code=t.code, name=t.name, name_i18n=t.name_i18n,
            count=counts.get(t.code, 0),
        )
        for t in ranked[:limit]
    ]


class EmployeeRef(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    full_name: str


@router.get("/refs/employees", response_model=list[EmployeeRef])
async def ref_employees(user: CurrentUser, session: SessionDep):
    rows = await session.scalars(
        select(Employee)
        .where(Employee.status == EmployeeStatus.ACTIVE)
        .order_by(Employee.full_name)
    )
    return list(rows)


class DictionaryItemRef(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str


class DictionaryRef(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    items: list[DictionaryItemRef] = []


@router.get("/refs/dictionaries", response_model=list[DictionaryRef])
async def ref_dictionaries(user: CurrentUser, session: SessionDep):
    dictionaries = list(
        await session.scalars(
            select(Dictionary).where(Dictionary.active.is_(True)).order_by(Dictionary.name)
        )
    )
    items = list(
        await session.scalars(
            select(DictionaryItem)
            .where(DictionaryItem.active.is_(True))
            .order_by(DictionaryItem.sort_order, DictionaryItem.name)
        )
    )
    result = []
    for dictionary in dictionaries:
        ref = DictionaryRef.model_validate(dictionary)
        ref.items = [
            DictionaryItemRef.model_validate(i)
            for i in items
            if i.dictionary_id == dictionary.id
        ]
        result.append(ref)
    return result


class CounterpartyRef(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    inn: str | None


@router.get("/refs/counterparties", response_model=list[CounterpartyRef])
async def ref_counterparties(user: CurrentUser, session: SessionDep):
    rows = await session.scalars(
        select(Counterparty)
        .where(Counterparty.active.is_(True))
        .order_by(Counterparty.name)
    )
    return list(rows)


class ContractRef(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    number: str | None
    counterparty_id: uuid.UUID


@router.get("/refs/contracts", response_model=list[ContractRef])
async def ref_contracts(user: CurrentUser, session: SessionDep):
    rows = await session.scalars(
        select(Contract)
        .where(Contract.active.is_(True))
        .order_by(Contract.number)
    )
    return list(rows)


class VatRateRef(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    rate: float | None


@router.get("/refs/vat-rates", response_model=list[VatRateRef])
async def ref_vat_rates(user: CurrentUser, session: SessionDep):
    rows = await session.scalars(
        select(VatRate)
        .where(VatRate.active.is_(True))
        .order_by(VatRate.sort_order, VatRate.name)
    )
    return list(rows)


class RoutePreview(BaseModel):
    ok: bool
    error: str | None = None
    stages: list[dict[str, Any]] = []


@router.get("/route-preview", response_model=RoutePreview)
async def route_preview(
    object_type: str,
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
