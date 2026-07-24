"""Предметные объекты: контрагенты, договоры, служебные записки (ТЗ §9.3)."""
import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import ForeignKey, Numeric, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from sqlalchemy import text as sa_text
from sqlalchemy.dialects.postgresql import JSONB

from app.models.base import Base, UUIDPKMixin, utcnow
from app.models.enums import ContractSyncStatus, CounterpartySyncStatus


class Counterparty(UUIDPKMixin, Base):
    """БИН — нормализованная строка фиксированной длины, сравнивать
    как число нельзя: теряются ведущие нули (ТЗ §8.5)."""

    __tablename__ = "counterparties"

    # ИНН (Узбекистан) — строка, ведущие нули значимы
    inn: Mapped[str | None] = mapped_column(String(12), index=True)
    name: Mapped[str] = mapped_column(String(500))
    full_name: Mapped[str | None] = mapped_column(String(1000))
    address: Mapped[str | None] = mapped_column(Text)  # юридический адрес
    phone: Mapped[str | None] = mapped_column(String(50))
    email: Mapped[str | None] = mapped_column(String(320))
    external_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), unique=True
    )
    sync_status: Mapped[CounterpartySyncStatus] = mapped_column(
        default=CounterpartySyncStatus.DRAFT
    )
    # справочник из интеграции: удаления нет, вместо него деактивация
    active: Mapped[bool] = mapped_column(default=True, server_default=sa_text("true"))
    created_from_process_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("process_instances.id")
    )


class VatRate(UUIDPKMixin, Base):
    """Ставка НДС: название и процент (NULL = без НДС). Например «НДС 12%»,
    «НДС 0%», «Без НДС»."""

    __tablename__ = "vat_rates"

    name: Mapped[str] = mapped_column(String(100))
    rate: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))  # процент
    active: Mapped[bool] = mapped_column(default=True, server_default=sa_text("true"))
    sort_order: Mapped[int] = mapped_column(default=0)


class Contract(UUIDPKMixin, Base):
    """Отправка в БУХ строго после финальной визы и только когда
    контрагент SYNCED (ТЗ §8.5, §8.7)."""

    __tablename__ = "contracts"

    counterparty_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("counterparties.id"))
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id"))
    project_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("projects.id"))
    number: Mapped[str | None] = mapped_column(String(100))
    date: Mapped[date | None]
    contract_type: Mapped[str | None] = mapped_column(String(100))
    amount: Mapped[Decimal | None] = mapped_column(Numeric(18, 2))
    vat_rate_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("vat_rates.id"))
    currency: Mapped[str] = mapped_column(String(3), default="KZT")
    valid_from: Mapped[date | None]
    valid_to: Mapped[date | None]
    responsible_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("employees.id"))
    external_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), unique=True
    )
    sync_status: Mapped[ContractSyncStatus] = mapped_column(
        default=ContractSyncStatus.DRAFT
    )
    active: Mapped[bool] = mapped_column(default=True, server_default=sa_text("true"))
    process_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("process_instances.id")
    )


class Document(UUIDPKMixin, Base):
    """Документ любого вида (вид — динамический, из document_types).

    Стандартная шапка: номер (автонумерация по виду), дата, организация,
    проект, тема, содержание. Организация/проект в БД nullable
    (исторические данные), обязательность обеспечивает API.
    Настраиваемые поля вида — в custom_fields (JSONB).
    """

    __tablename__ = "documents"

    type_code: Mapped[str] = mapped_column(
        String(50), ForeignKey("document_types.code")
    )
    number: Mapped[str] = mapped_column(String(50), unique=True)
    date: Mapped[date]
    organization_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("organizations.id")
    )
    project_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("projects.id"))
    subject: Mapped[str] = mapped_column(String(500))
    body: Mapped[str] = mapped_column(Text)
    custom_fields: Mapped[dict] = mapped_column(
        JSONB, default=dict, server_default=sa_text("'{}'::jsonb")
    )
    department_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("departments.id")
    )
    author_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(
        default=utcnow, server_default=func.now()
    )


class Attachment(UUIDPKMixin, Base):
    """Вложение к документу. Файл лежит в хранилище (storage_key),
    в БД — только метаданные; в 1С передаются ссылки (ТЗ §8.7)."""

    __tablename__ = "attachments"

    object_type: Mapped[str] = mapped_column(String(50))
    object_id: Mapped[uuid.UUID] = mapped_column(index=True)
    filename: Mapped[str] = mapped_column(String(500))
    content_type: Mapped[str | None] = mapped_column(String(200))
    size_bytes: Mapped[int]
    storage_key: Mapped[str] = mapped_column(String(700))
    uploaded_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(
        default=utcnow, server_default=func.now()
    )
