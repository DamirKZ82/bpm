"""Создаёт локального администратора для dev-режима (идемпотентно).

Запуск из backend/:  .venv\\Scripts\\python.exe scripts\\seed_dev.py
Вход:  POST /api/auth/dev-login  {"username": "admin"}
"""
import asyncio
import uuid

from sqlalchemy import select

from app.core.db import async_session
from app.models import DocumentType, User
from app.models.enums import UserRole


async def main() -> None:
    async with async_session() as session:
        # системный вид «Служебная записка» (нужен после очистки БД)
        memo_type = await session.scalar(
            select(DocumentType).where(DocumentType.code == "MEMO")
        )
        if memo_type is None:
            session.add(
                DocumentType(
                    code="MEMO", name="Служебная записка", prefix="СЗ",
                    is_system=True, active=True, last_number=0,
                )
            )
            await session.commit()
            print("Создан системный вид документа: Служебная записка")
        admin = await session.scalar(
            select(User).where(User.ad_sam_account_name == "admin")
        )
        if admin is not None:
            if UserRole.ADMIN not in admin.roles:
                admin.roles = [*admin.roles, UserRole.ADMIN.value]
                await session.commit()
                print("Пользователю admin добавлена роль ADMIN")
            else:
                print("Администратор уже существует")
            return
        session.add(
            User(
                ad_object_guid=uuid.uuid4(),
                ad_sam_account_name="admin",
                display_name="Администратор (dev)",
                roles=[UserRole.ADMIN.value],
            )
        )
        await session.commit()
        print("Создан администратор: admin")


if __name__ == "__main__":
    # Windows: psycopg async несовместим с ProactorEventLoop
    asyncio.run(main(), loop_factory=asyncio.SelectorEventLoop)
