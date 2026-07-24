"""Справочники из внешних систем: ЗУП, БУХ, AD (ТЗ §9.1).

Read-only для бизнес-логики BPM — пишет в них только синхронизация.
Ключ сопоставления — GUID внешней системы, никогда не ФИО (ТЗ §7.3).
"""
import uuid
from datetime import date, datetime

from sqlalchemy import BigInteger, ForeignKey, String, Text, text
from sqlalchemy.dialects.postgresql import ARRAY, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, UUIDPKMixin, utcnow
from app.models.enums import AbsenceType, EmployeeStatus, UserStatus


class Organization(UUIDPKMixin, Base):
    __tablename__ = "organizations"

    external_id_buh: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), unique=True
    )
    # ИНН (Узбекистан) — строка, ведущие нули значимы
    inn: Mapped[str | None] = mapped_column(String(12), unique=True)
    name: Mapped[str] = mapped_column(String(500))
    full_name: Mapped[str | None] = mapped_column(String(1000))
    legal_address: Mapped[str | None] = mapped_column(Text)
    phone: Mapped[str | None] = mapped_column(String(50))
    email: Mapped[str | None] = mapped_column(String(320))
    active: Mapped[bool] = mapped_column(default=True)


class Position(UUIDPKMixin, Base):
    """Должность = роль в маршрутах (ТЗ §1)."""

    __tablename__ = "positions"

    external_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), unique=True)
    name: Mapped[str] = mapped_column(String(500))
    active: Mapped[bool] = mapped_column(default=True)


class Department(UUIDPKMixin, Base):
    __tablename__ = "departments"

    external_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), unique=True)
    name: Mapped[str] = mapped_column(String(500))
    parent_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("departments.id"))
    organization_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("organizations.id")
    )
    # справочник из интеграции не удаляется: удаление в 1С → active=false
    active: Mapped[bool] = mapped_column(default=True, server_default=text("true"))


class Employee(UUIDPKMixin, Base):
    __tablename__ = "employees"

    external_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), unique=True)
    full_name: Mapped[str] = mapped_column(String(500))
    # ПИНФЛ — идентификатор физлица (Узбекистан), строка 14 цифр
    pinfl: Mapped[str | None] = mapped_column(String(14), index=True)
    # email из ЗУП — только fallback, основной источник — AD (ТЗ §7.3)
    email: Mapped[str | None] = mapped_column(String(320))
    status: Mapped[EmployeeStatus] = mapped_column(default=EmployeeStatus.ACTIVE)
    synced_at: Mapped[datetime | None]


class Employment(UUIDPKMixin, Base):
    """Кадровые данные. Совместитель = несколько записей (ТЗ §5.2)."""

    __tablename__ = "employments"

    employee_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("employees.id"))
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id"))
    department_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("departments.id")
    )
    position_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("positions.id"))
    is_primary: Mapped[bool] = mapped_column(default=False)
    valid_from: Mapped[date | None]
    valid_to: Mapped[date | None]


class Absence(UUIDPKMixin, Base):
    __tablename__ = "absences"

    employee_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("employees.id"))
    date_from: Mapped[date]
    date_to: Mapped[date]
    type: Mapped[AbsenceType]


class Project(UUIDPKMixin, Base):
    __tablename__ = "projects"

    external_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), unique=True)
    code: Mapped[str | None] = mapped_column(String(100))
    name: Mapped[str] = mapped_column(String(500))
    organization_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("organizations.id")
    )
    status: Mapped[str | None] = mapped_column(String(50))
    # справочник из интеграции не удаляется: удаление в 1С → active=false
    active: Mapped[bool] = mapped_column(default=True, server_default=text("true"))


class User(UUIDPKMixin, Base):
    """Учётные записи из AD. Ключ — objectGUID: DN меняется при переводе
    между OU, sAMAccountName — при смене фамилии (ТЗ §3.3)."""

    __tablename__ = "users"

    ad_object_guid: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), unique=True)
    ad_sam_account_name: Mapped[str] = mapped_column(String(256))
    # NULL = не сопоставлен с сотрудником ЗУП: вход разрешён,
    # создание заявок заблокировано (ТЗ §3.5)
    employee_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("employees.id"))
    email: Mapped[str | None] = mapped_column(String(320))
    display_name: Mapped[str | None] = mapped_column(String(500))
    status: Mapped[UserStatus] = mapped_column(default=UserStatus.ACTIVE)
    # Роли BPM (ТЗ §3.6), значения из enums.UserRole
    roles: Mapped[list[str]] = mapped_column(
        ARRAY(String(50)),
        default=lambda: ["INITIATOR"],
        server_default=text("'{INITIATOR}'"),
    )
    # Привязка Telegram для уведомлений и согласования с телефона
    telegram_chat_id: Mapped[int | None] = mapped_column(BigInteger)
    telegram_link_code: Mapped[str | None] = mapped_column(String(20))
    # Персональные настройки интерфейса
    locale: Mapped[str] = mapped_column(String(5), default="uz", server_default="uz")
    theme: Mapped[str] = mapped_column(
        String(10), default="light", server_default="light"
    )
    last_login_at: Mapped[datetime | None]
    created_at: Mapped[datetime] = mapped_column(default=utcnow)
