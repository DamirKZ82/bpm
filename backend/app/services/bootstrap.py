"""Предопределённые (системные) виды документов.

Служебная записка, заявка на договор и заявка на оплату — стандартные виды
любого внедрения; они помечены is_system и не удаляются (ТЗ §3, §5).
Функция вызывается при старте: недостающие создаёт, уже существующие
(в т.ч. заведённые вручную с тем же названием) делает системными, не меняя
их code/prefix и не трогая связанные документы.
"""
from sqlalchemy import select

from app.core.db import async_session
from app.models import DocumentType

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
