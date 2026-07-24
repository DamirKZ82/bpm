"""Схемы предметных справочников: контрагенты, договоры, ставки НДС."""
import uuid
from datetime import date as Date
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import ContractSyncStatus, CounterpartySyncStatus


# --- Ставки НДС ---

class VatRateCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    rate: Decimal | None = None  # процент; None = без НДС
    active: bool = True
    sort_order: int = 0


class VatRateUpdate(BaseModel):
    name: str | None = None
    rate: Decimal | None = None
    active: bool | None = None
    sort_order: int | None = None


class VatRateRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    rate: Decimal | None
    active: bool
    sort_order: int


# --- Контрагенты ---

class CounterpartyCreate(BaseModel):
    name: str = Field(min_length=1, max_length=500)
    bin: str | None = Field(default=None, max_length=12)  # строка, ведущие нули!
    full_name: str | None = None
    address: str | None = None
    active: bool = True


class CounterpartyUpdate(BaseModel):
    name: str | None = None
    bin: str | None = None
    full_name: str | None = None
    address: str | None = None
    active: bool | None = None


class CounterpartyRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    bin: str | None
    name: str
    full_name: str | None
    address: str | None
    external_id: uuid.UUID | None
    sync_status: CounterpartySyncStatus
    active: bool


# --- Договоры ---

class ContractCreate(BaseModel):
    counterparty_id: uuid.UUID
    organization_id: uuid.UUID
    project_id: uuid.UUID | None = None
    number: str | None = None
    date: Date | None = None
    contract_type: str | None = None
    amount: Decimal | None = None
    vat_rate_id: uuid.UUID | None = None
    currency: str = "KZT"
    valid_from: Date | None = None
    valid_to: Date | None = None
    responsible_id: uuid.UUID | None = None
    active: bool = True


class ContractUpdate(BaseModel):
    counterparty_id: uuid.UUID | None = None
    organization_id: uuid.UUID | None = None
    project_id: uuid.UUID | None = None
    number: str | None = None
    date: Date | None = None
    contract_type: str | None = None
    amount: Decimal | None = None
    vat_rate_id: uuid.UUID | None = None
    currency: str | None = None
    valid_from: Date | None = None
    valid_to: Date | None = None
    responsible_id: uuid.UUID | None = None
    active: bool | None = None


class ContractRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    counterparty_id: uuid.UUID
    organization_id: uuid.UUID
    project_id: uuid.UUID | None
    number: str | None
    date: Date | None
    contract_type: str | None
    amount: Decimal | None
    vat_rate_id: uuid.UUID | None
    currency: str
    valid_from: Date | None
    valid_to: Date | None
    responsible_id: uuid.UUID | None
    external_id: uuid.UUID | None
    sync_status: ContractSyncStatus
    active: bool
