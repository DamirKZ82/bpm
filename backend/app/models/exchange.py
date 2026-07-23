"""Настройки обмена справочниками с 1С (ТЗ §2 «Разделение ответственности»).

Для каждого справочника: с какой внешней системой обменивается,
можно ли получать (импорт из 1С) и отправлять (создавать в BPM → 1С).
Правило ТЗ: BPM никогда не редактирует данные систем-источников —
только чтение справочников и создание новых объектов (контрагент, договор).
"""
from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, UUIDPKMixin


class ExchangeSetting(UUIDPKMixin, Base):
    __tablename__ = "exchange_settings"

    entity_type: Mapped[str] = mapped_column(String(30), unique=True)
    name: Mapped[str] = mapped_column(String(100))
    source_system: Mapped[str] = mapped_column(String(10))  # ZUP | BUH
    can_receive: Mapped[bool] = mapped_column(default=False)  # импорт из 1С
    can_send: Mapped[bool] = mapped_column(default=False)     # BPM создаёт → 1С
    active: Mapped[bool] = mapped_column(default=True)
    sort_order: Mapped[int] = mapped_column(default=0)
