"""Схемы CRUD справочников для локального (dev) ведения админом.

external_id генерируется автоматически, если не передан: при работе
без 1С админ создаёт записи вручную, а при появлении синхронизации
реальные GUID из 1С придут через тот же upsert-механизм.
"""
import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import AbsenceType, EmployeeStatus


class OrganizationCreate(BaseModel):
    name: str
    inn: str | None = None
    full_name: str | None = None
    legal_address: str | None = None
    phone: str | None = None
    email: str | None = None
    external_id_buh: uuid.UUID | None = None
    active: bool = True


class OrganizationUpdate(BaseModel):
    name: str | None = None
    inn: str | None = None
    full_name: str | None = None
    legal_address: str | None = None
    phone: str | None = None
    email: str | None = None
    active: bool | None = None


class OrganizationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    inn: str | None
    full_name: str | None
    legal_address: str | None
    phone: str | None
    email: str | None
    external_id_buh: uuid.UUID | None
    active: bool


class PositionCreate(BaseModel):
    name: str
    external_id: uuid.UUID = Field(default_factory=uuid.uuid4)
    active: bool = True


class PositionUpdate(BaseModel):
    name: str | None = None
    active: bool | None = None


class PositionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    external_id: uuid.UUID
    active: bool


class DepartmentCreate(BaseModel):
    name: str
    external_id: uuid.UUID = Field(default_factory=uuid.uuid4)
    parent_id: uuid.UUID | None = None
    organization_id: uuid.UUID | None = None
    active: bool = True


class DepartmentUpdate(BaseModel):
    name: str | None = None
    parent_id: uuid.UUID | None = None
    organization_id: uuid.UUID | None = None
    active: bool | None = None


class DepartmentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    external_id: uuid.UUID
    parent_id: uuid.UUID | None
    organization_id: uuid.UUID | None
    active: bool


class EmployeeCreate(BaseModel):
    full_name: str
    pinfl: str | None = None
    email: str | None = None
    external_id: uuid.UUID = Field(default_factory=uuid.uuid4)
    status: EmployeeStatus = EmployeeStatus.ACTIVE


class EmployeeUpdate(BaseModel):
    full_name: str | None = None
    pinfl: str | None = None
    email: str | None = None
    status: EmployeeStatus | None = None


class EmployeeRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    full_name: str
    pinfl: str | None
    email: str | None
    external_id: uuid.UUID
    status: EmployeeStatus
    synced_at: datetime | None


class EmploymentCreate(BaseModel):
    employee_id: uuid.UUID
    organization_id: uuid.UUID
    position_id: uuid.UUID
    department_id: uuid.UUID | None = None
    is_primary: bool = False
    valid_from: date | None = None
    valid_to: date | None = None


class EmploymentUpdate(BaseModel):
    department_id: uuid.UUID | None = None
    is_primary: bool | None = None
    valid_from: date | None = None
    valid_to: date | None = None


class EmploymentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    employee_id: uuid.UUID
    organization_id: uuid.UUID
    position_id: uuid.UUID
    department_id: uuid.UUID | None
    is_primary: bool
    valid_from: date | None
    valid_to: date | None


class AbsenceCreate(BaseModel):
    employee_id: uuid.UUID
    date_from: date
    date_to: date
    type: AbsenceType


class AbsenceUpdate(BaseModel):
    date_from: date | None = None
    date_to: date | None = None
    type: AbsenceType | None = None


class AbsenceRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    employee_id: uuid.UUID
    date_from: date
    date_to: date
    type: AbsenceType


class ProjectCreate(BaseModel):
    name: str
    code: str | None = None
    external_id: uuid.UUID = Field(default_factory=uuid.uuid4)
    organization_id: uuid.UUID | None = None
    status: str | None = None
    active: bool = True


class ProjectUpdate(BaseModel):
    name: str | None = None
    code: str | None = None
    organization_id: uuid.UUID | None = None
    status: str | None = None
    active: bool | None = None


class ProjectRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    code: str | None
    external_id: uuid.UUID
    organization_id: uuid.UUID | None
    status: str | None
    active: bool
