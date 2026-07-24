"""Предопределённые (системные) виды документов.

Служебная записка, заявка на договор и заявка на оплату — стандартные виды
любого внедрения; они помечены is_system и не удаляются (ТЗ §3, §5).
Функция вызывается при старте: недостающие создаёт, уже существующие
(в т.ч. заведённые вручную с тем же названием) делает системными, не меняя
их code/prefix и не трогая связанные документы.
"""
from decimal import Decimal

from sqlalchemy import func, select

from app.core.db import async_session
from app.models import Dictionary, DictionaryItem, DocumentType, VatRate

# (code по умолчанию, название, префикс номера)
STANDARD_TYPES = [
    ("MEMO", "Служебная записка", "СЗ"),
    ("REQ_CONTRACT", "Заявка на договор", "ЗД"),
    ("REQ_PAYMENT", "Заявка на оплату", "ЗО"),
]


async def ensure_system_document_types() -> None:
    async with async_session() as session:
        changed = False
        for code, name, prefix in STANDARD_TYPES:
            by_code = await session.scalar(
                select(DocumentType).where(DocumentType.code == code)
            )
            if by_code is not None:
                if not by_code.is_system:
                    by_code.is_system = True
                    changed = True
                continue
            # заведён вручную с тем же названием — делаем системным на месте
            by_name = await session.scalar(
                select(DocumentType).where(DocumentType.name == name)
            )
            if by_name is not None:
                if not by_name.is_system:
                    by_name.is_system = True
                    changed = True
                continue
            session.add(
                DocumentType(
                    code=code, name=name, prefix=prefix,
                    is_system=True, active=True, last_number=0,
                )
            )
            changed = True
        if changed:
            await session.commit()


# типовые ставки НДС РК (создаются только если справочник пуст)
DEFAULT_VAT_RATES = [
    ("НДС 12%", Decimal("12"), 0),
    ("НДС 0%", Decimal("0"), 1),
    ("Без НДС", None, 2),
]


async def ensure_vat_rates() -> None:
    async with async_session() as session:
        count = await session.scalar(select(func.count()).select_from(VatRate))
        if count:
            return
        for name, rate, order in DEFAULT_VAT_RATES:
            session.add(VatRate(name=name, rate=rate, active=True, sort_order=order))
        await session.commit()


# справочник видов операций для заявки на оплату
OPERATION_TYPES_DICT = "Виды операций"
DEFAULT_OPERATION_TYPES = [
    "Заработная плата",
    "Перечисление налогов",
    "Прочие",
    "Перечисление по исполнительным листам",
    "Подотчёт",
]


async def ensure_operation_types() -> None:
    """Справочник «Виды операций» — для поля «Вид операции» в заявке на
    оплату. Создаётся один раз, если ещё нет."""
    async with async_session() as session:
        exists = await session.scalar(
            select(Dictionary.id).where(Dictionary.name == OPERATION_TYPES_DICT)
        )
        if exists:
            return
        dictionary = Dictionary(name=OPERATION_TYPES_DICT, active=True)
        session.add(dictionary)
        await session.flush()
        for order, name in enumerate(DEFAULT_OPERATION_TYPES):
            session.add(DictionaryItem(
                dictionary_id=dictionary.id, name=name, active=True, sort_order=order,
            ))
        await session.commit()
