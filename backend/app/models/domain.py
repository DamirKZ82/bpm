"""Предметные объекты: контрагенты, договоры, служебные записки (ТЗ §9.3)."""
import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import ForeignKey, Numeric, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, UUIDPKMixin, utcnow
from app.models.enums import ContractSyncStatus, CounterpartySyncStatus, ObjectType


class Counterparty(UUIDPKMixin, Base):
    """БИН — нормализованная строка фиксированной длины, сравнивать
    как число нельзя: теряются ведущие нули (ТЗ §8.5)."""

    __tablename__ = "counterparties"

    bin: Mapped[str | None] = mapped_column(String(12), index=True)
    name: Mapped[str] = mapped_column(String(500))
    full_name: Mapped[str | None] = mapped_column(String(1000))
    address: Mapped[str | None] = mapped_column(Text)
    external_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), unique=True
    )
    sync_status: Mapped[CounterpartySyncStatus] = mapped_column(
        default=CounterpartySyncStatus.DRAFT
    )
    created_from_process_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("process_instances.id")
    )


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
    process_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("process_instances.id")
    )


class Memo(UUIDPKMixin, Base):
    """Служебная записка — первый вид объекта (этап 3 внедрения).

    Обязательные реквизиты любого документа: номер (автонумерация),
    дата, организация, проект. Организация/проект в БД nullable
    (исторические данные), обязательность обеспечивает API.
    """

    __tablename__ = "memos"

    number: Mapped[str] = mapped_column(String(50), unique=True)
    date: Mapped[date]
    organization_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("organizations.id")
    )
    project_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("projects.id"))
    subject: Mapped[str] = mapped_column(String(500))
    body: Mapped[str] = mapped_column(Text)
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

    object_type: Mapped[ObjectType]
    object_id: Mapped[uuid.UUID] = mapped_column(index=True)
    filename: Mapped[str] = mapped_column(String(500))
    content_type: Mapped[str | None] = mapped_column(String(200))
    size_bytes: Mapped[int]
    storage_key: Mapped[str] = mapped_column(String(700))
    uploaded_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(
        default=utcnow, server_default=func.now()
    )
