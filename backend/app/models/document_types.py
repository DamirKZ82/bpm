"""Конструктор видов документов и пользовательские справочники.

Вид документа = стандартная шапка (номер/дата/организация/проект/тема/
содержание) + настраиваемые поля (document_type_fields), значения которых
хранятся в documents.custom_fields (JSONB). Системные виды (is_system)
нельзя удалять.
"""
import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import ForeignKey, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, UUIDPKMixin, utcnow


class DocumentType(UUIDPKMixin, Base):
    __tablename__ = "document_types"

    code: Mapped[str] = mapped_column(String(50), unique=True)
    name: Mapped[str] = mapped_column(String(200))  # основное название (fallback)
    # переводы названия по языкам: {"uz": "...", "en": "..."}
    name_i18n: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    prefix: Mapped[str] = mapped_column(String(10))  # префикс нумерации: СЗ, ЗП…
    is_system: Mapped[bool] = mapped_column(default=False)
    active: Mapped[bool] = mapped_column(default=True)
    last_number: Mapped[int] = mapped_column(default=0)  # счётчик автонумерации
    created_at: Mapped[datetime] = mapped_column(
        default=utcnow, server_default=func.now()
    )


class DocumentTypeField(UUIDPKMixin, Base):
    """Настраиваемое поле вида документа. Типы: STRING / TEXT / NUMBER /
    MONEY / DATE / BOOLEAN / REF. Для REF ref_target указывает справочник:
    EMPLOYEE / ORGANIZATION / PROJECT / DICTIONARY (+ dictionary_id)."""

    __tablename__ = "document_type_fields"
    __table_args__ = (
        UniqueConstraint("document_type_id", "code", name="uq_type_field_code"),
    )

    document_type_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("document_types.id", ondelete="CASCADE")
    )
    code: Mapped[str] = mapped_column(String(50))  # ключ в custom_fields
    name: Mapped[str] = mapped_column(String(200))
    name_i18n: Mapped[dict[str, Any] | None] = mapped_column(JSONB)  # переводы
    field_type: Mapped[str] = mapped_column(String(20))
    ref_target: Mapped[str | None] = mapped_column(String(20))
    dictionary_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("dictionaries.id")
    )
    required: Mapped[bool] = mapped_column(default=False)
    sort_order: Mapped[int] = mapped_column(default=0)


class Dictionary(UUIDPKMixin, Base):
    """Пользовательский справочник, создаётся админом под нужды полей."""

    __tablename__ = "dictionaries"

    name: Mapped[str] = mapped_column(String(200))
    active: Mapped[bool] = mapped_column(default=True)


class DictionaryItem(UUIDPKMixin, Base):
    __tablename__ = "dictionary_items"

    dictionary_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("dictionaries.id", ondelete="CASCADE")
    )
    name: Mapped[str] = mapped_column(String(500))
    active: Mapped[bool] = mapped_column(default=True)
    sort_order: Mapped[int] = mapped_column(default=0)
