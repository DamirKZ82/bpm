"""Интеграционный слой: маппинг, outbox, лог обменов (ТЗ §9.4)."""
import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, UUIDPKMixin, utcnow
from app.models.enums import ExternalSystem, OutboxStatus, SyncDirection


class ExternalMapping(UUIDPKMixin, Base):
    """system в составе ключа: организация имеет разные GUID
    в ЗУП и в Бухгалтерии (ТЗ §8.6)."""

    __tablename__ = "external_mapping"
    __table_args__ = (
        UniqueConstraint(
            "system", "entity_type", "external_id", name="uq_external_mapping_key"
        ),
    )

    system: Mapped[ExternalSystem]
    entity_type: Mapped[str] = mapped_column(String(50))
    internal_id: Mapped[uuid.UUID]
    external_id: Mapped[str] = mapped_column(String(100))
    synced_at: Mapped[datetime | None]


class IntegrationOutbox(UUIDPKMixin, Base):
    """Outbox-паттерн (ТЗ §8.3): отдельный воркер, админ-экран зависших
    обменов, кнопка «Повторить» у бухгалтера."""

    __tablename__ = "integration_outbox"

    target_system: Mapped[ExternalSystem]
    entity_type: Mapped[str] = mapped_column(String(50))
    entity_id: Mapped[uuid.UUID]
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB)
    # Повтор с тем же ключом не создаёт второй объект в 1С (ТЗ §8.4)
    idempotency_key: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), unique=True, default=uuid.uuid4
    )
    status: Mapped[OutboxStatus] = mapped_column(default=OutboxStatus.PENDING)
    attempts: Mapped[int] = mapped_column(default=0)
    last_error: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        default=utcnow, server_default=func.now()
    )
    sent_at: Mapped[datetime | None]


class SyncLog(UUIDPKMixin, Base):
    __tablename__ = "sync_log"

    system: Mapped[ExternalSystem]
    direction: Mapped[SyncDirection]
    entity_type: Mapped[str | None] = mapped_column(String(50))
    request: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    response: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    status: Mapped[str | None] = mapped_column(String(50))
    created_at: Mapped[datetime] = mapped_column(
        default=utcnow, server_default=func.now()
    )
