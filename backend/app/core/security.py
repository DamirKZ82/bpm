import uuid
from datetime import UTC, datetime, timedelta

import jwt

from app.core.config import settings

ALGORITHM = "HS256"


def create_access_token(user_id: uuid.UUID, roles: list[str]) -> str:
    payload = {
        "sub": str(user_id),
        "roles": roles,
        "exp": datetime.now(UTC) + timedelta(hours=settings.jwt_ttl_hours),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=ALGORITHM)


def decode_token(token: str) -> dict:
    """Поднимает jwt.PyJWTError при невалидном/просроченном токене."""
    return jwt.decode(token, settings.jwt_secret, algorithms=[ALGORITHM])


def create_email_action_token(
    task_id: uuid.UUID, action: str, user_id: uuid.UUID
) -> str:
    """Подписанный токен для согласования по почте (действие по задаче
    от конкретного пользователя, срок 7 дней)."""
    payload = {
        "typ": "email_action",
        "tid": str(task_id),
        "act": action,  # APR | REJ
        "uid": str(user_id),
        "exp": datetime.now(UTC) + timedelta(days=7),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=ALGORITHM)


def decode_email_action_token(token: str) -> dict:
    data = jwt.decode(token, settings.jwt_secret, algorithms=[ALGORITHM])
    if data.get("typ") != "email_action":
        raise jwt.InvalidTokenError("wrong token type")
    return data
