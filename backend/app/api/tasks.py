import uuid

from fastapi import APIRouter, HTTPException, Request, status
from sqlalchemy import select

from app.api.deps import CurrentUser, SessionDep
from app.models import Employee, Memo, ProcessInstance, Task, User
from app.models.enums import TaskStatus
from app.schemas.process import MyTaskRead, TaskAction, TaskRead
from app.services import process_service

router = APIRouter(prefix="/api/tasks", tags=["tasks"])


@router.get("/my", response_model=list[MyTaskRead])
async def my_tasks(user: CurrentUser, session: SessionDep):
    """«Мне на согласование» — активные задачи текущего пользователя."""
    if user.employee_id is None:
        return []
    rows = (
        await session.execute(
            select(Task, ProcessInstance, User, Employee)
            .join(ProcessInstance, Task.process_id == ProcessInstance.id)
            .join(User, ProcessInstance.initiator_id == User.id)
            .outerjoin(Employee, User.employee_id == Employee.id)
            .where(
                Task.assignee_id == user.employee_id,
                Task.status == TaskStatus.ACTIVE,
            )
            .order_by(Task.due_at.nulls_last(), ProcessInstance.started_at)
        )
    ).all()

    result = []
    for task, process, initiator_user, initiator_employee in rows:
        item = MyTaskRead.model_validate(task)
        item.object_type = process.object_type
        item.process_started_at = process.started_at
        item.initiator_name = (
            initiator_employee.full_name
            if initiator_employee
            else initiator_user.display_name or initiator_user.ad_sam_account_name
        )
        memo = await session.get(Memo, process.object_id)
        item.subject = memo.subject if memo else None
        result.append(item)
    return result


async def _get_task(session, task_id: uuid.UUID) -> Task:
    task = await session.get(Task, task_id)
    if task is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    return task


@router.post("/{task_id}/approve", response_model=TaskRead)
async def approve_task(
    task_id: uuid.UUID, body: TaskAction, user: CurrentUser,
    session: SessionDep, request: Request,
):
    task = await _get_task(session, task_id)
    await process_service.complete_task(
        session,
        task=task,
        user=user,
        approve=True,
        comment=body.comment,
        ip=request.client.host if request.client else None,
    )
    await session.refresh(task)
    return task


@router.post("/{task_id}/reject", response_model=TaskRead)
async def reject_task(
    task_id: uuid.UUID, body: TaskAction, user: CurrentUser,
    session: SessionDep, request: Request,
):
    task = await _get_task(session, task_id)
    await process_service.complete_task(
        session,
        task=task,
        user=user,
        approve=False,
        comment=body.comment,
        ip=request.client.host if request.client else None,
    )
    await session.refresh(task)
    return task
