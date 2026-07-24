import uuid

from fastapi import APIRouter, HTTPException, Request, status
from sqlalchemy import select

from app.api.deps import CurrentUser, SessionDep
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models import (
    AuditLog,
    Document,
    Employee,
    Organization,
    ProcessComment,
    ProcessInstance,
    Project,
    Task,
    User,
)
from app.models.enums import TaskStatus, UserRole, UserStatus
from app.services.process_service import _notify_users
from app.schemas.process import (
    AuditRead,
    ForceCloseRequest,
    ProcessRead,
    TaskRead,
)
from app.services import process_service

router = APIRouter(prefix="/api/processes", tags=["processes"])


async def _can_view(session, process: ProcessInstance, user) -> bool:
    """Инициатор; согласующий (текущий или прошлый — ТЗ §3.6);
    наблюдатель своей организации; админ."""
    if UserRole.ADMIN in user.roles or process.initiator_id == user.id:
        return True
    if user.employee_id is not None:
        has_task = await session.scalar(
            select(Task.id).where(
                Task.process_id == process.id, Task.assignee_id == user.employee_id
            )
        )
        if has_task is not None:
            return True
    if UserRole.OBSERVER in user.roles and user.employee_id is not None:
        from app.models import Employment

        same_org = await session.scalar(
            select(Employment.id).where(
                Employment.employee_id == user.employee_id,
                Employment.organization_id == process.organization_id,
            )
        )
        if same_org is not None:
            return True
    return False


@router.get("/{process_id}", response_model=ProcessRead)
async def get_process(process_id: uuid.UUID, user: CurrentUser, session: SessionDep):
    process = await session.get(ProcessInstance, process_id)
    if process is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    if not await _can_view(session, process, user):
        raise HTTPException(status.HTTP_403_FORBIDDEN)

    result = ProcessRead.model_validate(process)

    initiator = await session.get(User, process.initiator_id)
    if initiator:
        result.initiator_name = initiator.display_name or initiator.ad_sam_account_name

    result.organization_name = await session.scalar(
        select(Organization.name).where(Organization.id == process.organization_id)
    )
    if process.project_id:
        result.project_name = await session.scalar(
            select(Project.name).where(Project.id == process.project_id)
        )

    document = await session.get(Document, process.object_id)
    if document:
        result.subject = document.subject
        result.doc_number = document.number
        result.doc_date = document.date
        result.doc_body = document.body

    tasks = list(
        await session.scalars(
            select(Task)
            .where(Task.process_id == process.id)
            .order_by(Task.stage_no, Task.order_in_stage)
        )
    )
    employee_names = dict(
        (
            await session.execute(
                select(Employee.id, Employee.full_name).where(
                    Employee.id.in_({t.assignee_id for t in tasks})
                )
            )
        ).all()
    )
    for task in tasks:
        task_read = TaskRead.model_validate(task)
        task_read.assignee_name = employee_names.get(task.assignee_id)
        result.tasks.append(task_read)

    audit_rows = (
        await session.execute(
            select(AuditLog, User)
            .outerjoin(User, AuditLog.user_id == User.id)
            .where(AuditLog.process_id == process.id)
            .order_by(AuditLog.created_at)
        )
    ).all()
    for entry, entry_user in audit_rows:
        audit_read = AuditRead.model_validate(entry)
        if entry_user:
            audit_read.user_name = (
                entry_user.display_name or entry_user.ad_sam_account_name
            )
        result.audit.append(audit_read)

    return result


# --- Обсуждение процесса ---

class CommentCreate(BaseModel):
    text: str


class CommentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    user_name: str | None = None
    text: str
    created_at: datetime


async def _get_viewable_process(session, process_id, user) -> ProcessInstance:
    process = await session.get(ProcessInstance, process_id)
    if process is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    if not await _can_view(session, process, user):
        raise HTTPException(status.HTTP_403_FORBIDDEN)
    return process


@router.get("/{process_id}/comments", response_model=list[CommentRead])
async def list_comments(process_id: uuid.UUID, user: CurrentUser, session: SessionDep):
    await _get_viewable_process(session, process_id, user)
    rows = (
        await session.execute(
            select(ProcessComment, User)
            .outerjoin(User, ProcessComment.user_id == User.id)
            .where(ProcessComment.process_id == process_id)
            .order_by(ProcessComment.created_at)
        )
    ).all()
    result = []
    for comment, comment_user in rows:
        item = CommentRead.model_validate(comment)
        if comment_user:
            item.user_name = comment_user.display_name or comment_user.ad_sam_account_name
        result.append(item)
    return result


@router.post(
    "/{process_id}/comments",
    response_model=CommentRead,
    status_code=status.HTTP_201_CREATED,
)
async def add_comment(
    process_id: uuid.UUID,
    body: CommentCreate,
    user: CurrentUser,
    session: SessionDep,
):
    if not body.text.strip():
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Пустой комментарий")
    process = await _get_viewable_process(session, process_id, user)
    comment = ProcessComment(
        process_id=process_id, user_id=user.id, text=body.text.strip()
    )
    session.add(comment)

    # уведомить инициатора и исполнителей активных задач (кроме автора)
    recipient_ids = [process.initiator_id]
    assignee_employees = list(
        await session.scalars(
            select(Task.assignee_id).where(
                Task.process_id == process_id, Task.status == TaskStatus.ACTIVE
            )
        )
    )
    if assignee_employees:
        recipient_ids += list(
            await session.scalars(
                select(User.id).where(
                    User.employee_id.in_(assignee_employees),
                    User.status == UserStatus.ACTIVE,
                )
            )
        )
    document = await session.get(Document, process.object_id)
    label = f"{document.number} «{document.subject}»" if document else "документ"
    author = user.display_name or user.ad_sam_account_name
    await _notify_users(
        session,
        recipient_ids,
        title=f"Комментарий к {label}",
        body=f"{author}: {body.text.strip()[:200]}",
        link=f"/process/{process_id}",
        exclude=user.id,
    )

    await session.commit()
    await session.refresh(comment)
    result = CommentRead.model_validate(comment)
    result.user_name = author
    return result


@router.post("/{process_id}/cancel", response_model=ProcessRead)
async def cancel_process(
    process_id: uuid.UUID, user: CurrentUser, session: SessionDep, request: Request
):
    process = await session.get(ProcessInstance, process_id)
    if process is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    await process_service.cancel_process(
        session,
        process=process,
        user=user,
        ip=request.client.host if request.client else None,
    )
    return await get_process(process_id, user, session)


@router.post("/{process_id}/resubmit", response_model=ProcessRead)
async def resubmit(
    process_id: uuid.UUID, user: CurrentUser, session: SessionDep, request: Request
):
    """Отправить снова после доработки (инициатор)."""
    process = await session.get(ProcessInstance, process_id)
    if process is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    if process.initiator_id != user.id and UserRole.ADMIN not in user.roles:
        raise HTTPException(status.HTTP_403_FORBIDDEN)
    await process_service.resubmit_process(
        session,
        process=process,
        user=user,
        ip=request.client.host if request.client else None,
    )
    return await get_process(process_id, user, session)


@router.post("/{process_id}/force-close", response_model=ProcessRead)
async def force_close(
    process_id: uuid.UUID,
    body: ForceCloseRequest,
    user: CurrentUser,
    session: SessionDep,
    request: Request,
):
    if UserRole.ADMIN not in user.roles:
        raise HTTPException(status.HTTP_403_FORBIDDEN)
    if not body.comment.strip():
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY, "Комментарий обязателен"
        )
    process = await session.get(ProcessInstance, process_id)
    if process is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    await process_service.force_close_process(
        session,
        process=process,
        user=user,
        comment=body.comment,
        ip=request.client.host if request.client else None,
    )
    return await get_process(process_id, user, session)
