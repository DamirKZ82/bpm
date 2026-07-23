"""Приём ошибок фронтенда и журнал ошибок для администратора."""
import uuid
from datetime import date as Date
from datetime import datetime, timedelta

import jwt as pyjwt
from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select

from app.api.deps import SessionDep, require_roles
from app.core.security import decode_token
from app.models import ErrorLog, User

router = APIRouter(prefix="/api", tags=["errors"])


def new_error_code() -> str:
    return f"ERR-{uuid.uuid4().hex[:6].upper()}"


def user_id_from_request(request: Request) -> uuid.UUID | None:
    """Мягкое определение пользователя по токену (без похода в БД)."""
    auth = request.headers.get("authorization", "")
    if not auth.lower().startswith("bearer "):
        return None
    try:
        return uuid.UUID(decode_token(auth[7:])["sub"])
    except (pyjwt.PyJWTError, KeyError, ValueError):
        return None


class ClientErrorIn(BaseModel):
    message: str = Field(max_length=2000)
    stack: str | None = Field(default=None, max_length=20000)
    path: str | None = Field(default=None, max_length=500)


class ClientErrorOut(BaseModel):
    error_code: str


@router.post("/client-errors", response_model=ClientErrorOut)
async def report_client_error(
    body: ClientErrorIn, request: Request, session: SessionDep
):
    code = new_error_code()
    session.add(
        ErrorLog(
            code=code,
            source="CLIENT",
            method=None,
            path=body.path,
            message=body.message,
            traceback=body.stack,
            user_id=user_id_from_request(request),
            ip=request.client.host if request.client else None,
        )
    )
    await session.commit()
    return ClientErrorOut(error_code=code)


class ErrorLogRow(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    code: str
    source: str
    method: str | None
    path: str | None
    message: str
    traceback: str | None
    user_name: str | None = None
    ip: str | None
    created_at: datetime


@router.get(
    "/admin/errors",
    response_model=list[ErrorLogRow],
    dependencies=[Depends(require_roles())],
)
async def list_errors(
    session: SessionDep,
    source: str | None = None,
    date_from: Date | None = None,
    date_to: Date | None = None,
    limit: int = 100,
    offset: int = 0,
):
    stmt = (
        select(ErrorLog, User)
        .outerjoin(User, ErrorLog.user_id == User.id)
        .order_by(ErrorLog.created_at.desc())
        .limit(min(limit, 500))
        .offset(offset)
    )
    if source:
        stmt = stmt.where(ErrorLog.source == source)
    if date_from is not None:
        stmt = stmt.where(
            ErrorLog.created_at >= datetime.combine(date_from, datetime.min.time())
        )
    if date_to is not None:
        stmt = stmt.where(
            ErrorLog.created_at
            < datetime.combine(date_to, datetime.min.time()) + timedelta(days=1)
        )
    result = []
    for entry, entry_user in (await session.execute(stmt)).all():
        row = ErrorLogRow.model_validate(entry)
        if entry_user:
            row.user_name = entry_user.display_name or entry_user.ad_sam_account_name
        result.append(row)
    return result
