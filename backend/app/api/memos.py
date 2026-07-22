import re
import uuid
from datetime import date as date_type
from urllib.parse import quote

from fastapi import APIRouter, HTTPException, Request, Response, UploadFile, status
from sqlalchemy import select, text

from app.api.deps import CurrentUser, SessionDep
from app.models import (
    Attachment,
    Employment,
    Memo,
    Organization,
    ProcessInstance,
    Project,
    Task,
    User,
)
from app.models.enums import ObjectType, ProcessStatus, UserRole
from app.schemas.process import (
    AttachmentRead,
    MemoCreate,
    MemoRead,
    MemoUpdate,
    ProcessBrief,
)
from app.services import process_service
from app.services.route_engine import RouteError
from app.services.storage import StorageError, get_storage, load_storage_config

router = APIRouter(prefix="/api/memos", tags=["memos"])
attachments_router = APIRouter(prefix="/api/attachments", tags=["attachments"])

OPEN_STATUSES = (ProcessStatus.IN_PROGRESS, ProcessStatus.PENDING_EXPORT)


def _require_employee(user) -> uuid.UUID:
    if user.employee_id is None:
        # ТЗ §3.5: несопоставленный пользователь — явное сообщение
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Учётная запись не сопоставлена с сотрудником, "
            "обратитесь к администратору",
        )
    return user.employee_id


async def _next_memo_number(session) -> str:
    seq = await session.scalar(text("SELECT nextval('memo_number_seq')"))
    return f"СЗ-{seq:06d}"


async def _validate_requisites(
    session, *, organization_id: uuid.UUID, project_id: uuid.UUID
) -> None:
    organization = await session.get(Organization, organization_id)
    if organization is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY,
                            "Организация не найдена")
    project = await session.get(Project, project_id)
    if project is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY,
                            "Проект не найден")
    if project.organization_id is not None and project.organization_id != organization_id:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "Проект относится к другой организации",
        )


async def _latest_process(session, memo_id: uuid.UUID) -> ProcessInstance | None:
    return await session.scalar(
        select(ProcessInstance)
        .where(
            ProcessInstance.object_type == ObjectType.MEMO,
            ProcessInstance.object_id == memo_id,
        )
        .order_by(ProcessInstance.started_at.desc())
        .limit(1)
    )


async def _can_view_memo(session, memo: Memo, user) -> bool:
    """Автор, админ, участник согласования (текущий или прошлый),
    наблюдатель организации процесса."""
    if memo.author_id == user.id or UserRole.ADMIN in user.roles:
        return True
    if user.employee_id is not None:
        participant = await session.scalar(
            select(Task.id)
            .join(ProcessInstance, Task.process_id == ProcessInstance.id)
            .where(
                ProcessInstance.object_type == ObjectType.MEMO,
                ProcessInstance.object_id == memo.id,
                Task.assignee_id == user.employee_id,
            )
            .limit(1)
        )
        if participant is not None:
            return True
        if UserRole.OBSERVER in user.roles:
            observer = await session.scalar(
                select(ProcessInstance.id)
                .join(
                    Employment,
                    Employment.organization_id == ProcessInstance.organization_id,
                )
                .where(
                    ProcessInstance.object_type == ObjectType.MEMO,
                    ProcessInstance.object_id == memo.id,
                    Employment.employee_id == user.employee_id,
                )
                .limit(1)
            )
            if observer is not None:
                return True
    return False


async def _memo_read(session, memo: Memo, process: ProcessInstance | None) -> MemoRead:
    result = MemoRead.model_validate(memo)
    if process is not None:
        result.process = ProcessBrief.model_validate(process)
    if memo.organization_id:
        result.organization_name = await session.scalar(
            select(Organization.name).where(Organization.id == memo.organization_id)
        )
    if memo.project_id:
        result.project_name = await session.scalar(
            select(Project.name).where(Project.id == memo.project_id)
        )
    return result


async def _editable_or_409(session, memo: Memo) -> ProcessInstance | None:
    process = await _latest_process(session, memo.id)
    if process is not None and process.status in OPEN_STATUSES:
        # блокировка изменения документа во время согласования (ТЗ §6.4)
        raise HTTPException(
            status.HTTP_409_CONFLICT, "Документ на согласовании, изменение запрещено"
        )
    return process


@router.post("", response_model=MemoRead, status_code=status.HTTP_201_CREATED)
async def create_memo(body: MemoCreate, user: CurrentUser, session: SessionDep):
    _require_employee(user)
    await _validate_requisites(
        session, organization_id=body.organization_id, project_id=body.project_id
    )
    memo = Memo(
        **body.model_dump(exclude={"date"}),
        date=body.date or date_type.today(),
        number=await _next_memo_number(session),
        author_id=user.id,
    )
    session.add(memo)
    await session.commit()
    await session.refresh(memo)
    return await _memo_read(session, memo, None)


@router.get("", response_model=list[MemoRead])
async def list_memos(user: CurrentUser, session: SessionDep):
    """Свои документы; администратор видит все (ТЗ §3.6)."""
    is_admin = UserRole.ADMIN in user.roles
    stmt = select(Memo).order_by(Memo.created_at.desc())
    if not is_admin:
        stmt = stmt.where(Memo.author_id == user.id)
    memos = list(await session.scalars(stmt))

    author_names: dict[uuid.UUID, str] = {}
    if is_admin and memos:
        rows = await session.execute(
            select(User.id, User.display_name, User.ad_sam_account_name).where(
                User.id.in_({m.author_id for m in memos if m.author_id})
            )
        )
        author_names = {row[0]: row[1] or row[2] for row in rows}

    result = []
    for memo in memos:
        item = await _memo_read(session, memo, await _latest_process(session, memo.id))
        if memo.author_id in author_names:
            item.author_name = author_names[memo.author_id]
        result.append(item)
    return result


@router.get("/{memo_id}", response_model=MemoRead)
async def get_memo(memo_id: uuid.UUID, user: CurrentUser, session: SessionDep):
    memo = await session.get(Memo, memo_id)
    if memo is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    if not await _can_view_memo(session, memo, user):
        raise HTTPException(status.HTTP_403_FORBIDDEN)
    return await _memo_read(session, memo, await _latest_process(session, memo.id))


@router.patch("/{memo_id}", response_model=MemoRead)
async def update_memo(
    memo_id: uuid.UUID, body: MemoUpdate, user: CurrentUser, session: SessionDep
):
    memo = await session.get(Memo, memo_id)
    if memo is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    if memo.author_id != user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN)
    process = await _editable_or_409(session, memo)
    updates = body.model_dump(exclude_unset=True)
    for key, value in updates.items():
        setattr(memo, key, value)
    if memo.organization_id and memo.project_id:
        await _validate_requisites(
            session,
            organization_id=memo.organization_id,
            project_id=memo.project_id,
        )
    await session.commit()
    await session.refresh(memo)
    return await _memo_read(session, memo, process)


@router.post("/{memo_id}/submit", response_model=MemoRead)
async def submit_memo(
    memo_id: uuid.UUID,
    user: CurrentUser,
    session: SessionDep,
    request: Request,
):
    employee_id = _require_employee(user)
    memo = await session.get(Memo, memo_id)
    if memo is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    if memo.author_id != user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN)
    if memo.organization_id is None or memo.project_id is None:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "Заполните организацию и проект документа",
        )

    process = await _latest_process(session, memo.id)
    if process is not None and process.status in OPEN_STATUSES:
        raise HTTPException(status.HTTP_409_CONFLICT, "Документ уже на согласовании")

    employed = await session.scalar(
        select(Employment.id).where(
            Employment.employee_id == employee_id,
            Employment.organization_id == memo.organization_id,
        )
    )
    if employed is None:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Инициатор не работает в организации документа",
        )

    try:
        process = await process_service.start_process(
            session,
            object_type=ObjectType.MEMO,
            object_id=memo.id,
            initiator=user,
            organization_id=memo.organization_id,
            project_id=memo.project_id,
            ip=request.client.host if request.client else None,
        )
    except RouteError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc))

    return await _memo_read(session, memo, process)


@router.delete("/{memo_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_memo(memo_id: uuid.UUID, user: CurrentUser, session: SessionDep):
    memo = await session.get(Memo, memo_id)
    if memo is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    if memo.author_id != user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN)
    process = await _latest_process(session, memo.id)
    if process is not None:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "По документу уже запускалось согласование — удаление запрещено",
        )
    attachments = list(
        await session.scalars(
            select(Attachment).where(
                Attachment.object_type == ObjectType.MEMO,
                Attachment.object_id == memo.id,
            )
        )
    )
    storage = await get_storage(session)
    for attachment in attachments:
        storage.delete(attachment.storage_key)
        await session.delete(attachment)
    await session.delete(memo)
    await session.commit()


# --- Вложения ---

_UNSAFE_FILENAME = re.compile(r'[\\/:*?"<>|\x00-\x1f]')


@router.post(
    "/{memo_id}/attachments",
    response_model=AttachmentRead,
    status_code=status.HTTP_201_CREATED,
)
async def upload_attachment(
    memo_id: uuid.UUID, file: UploadFile, user: CurrentUser, session: SessionDep
):
    memo = await session.get(Memo, memo_id)
    if memo is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    if memo.author_id != user.id and UserRole.ADMIN not in user.roles:
        raise HTTPException(status.HTTP_403_FORBIDDEN)
    await _editable_or_409(session, memo)

    config = await load_storage_config(session)
    data = await file.read()
    if len(data) > config.max_upload_mb * 1024 * 1024:
        raise HTTPException(
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            f"Файл больше {config.max_upload_mb} МБ",
        )
    filename = _UNSAFE_FILENAME.sub("_", file.filename or "file")[:300]
    key = f"memos/{memo.id}/{uuid.uuid4().hex}_{filename}"
    (await get_storage(session)).save(key, data)

    attachment = Attachment(
        object_type=ObjectType.MEMO,
        object_id=memo.id,
        filename=filename,
        content_type=file.content_type,
        size_bytes=len(data),
        storage_key=key,
        uploaded_by=user.id,
    )
    session.add(attachment)
    await session.commit()
    await session.refresh(attachment)
    return attachment


@router.get("/{memo_id}/attachments", response_model=list[AttachmentRead])
async def list_attachments(memo_id: uuid.UUID, user: CurrentUser, session: SessionDep):
    memo = await session.get(Memo, memo_id)
    if memo is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    if not await _can_view_memo(session, memo, user):
        raise HTTPException(status.HTTP_403_FORBIDDEN)
    rows = await session.scalars(
        select(Attachment)
        .where(
            Attachment.object_type == ObjectType.MEMO,
            Attachment.object_id == memo.id,
        )
        .order_by(Attachment.created_at)
    )
    return list(rows)


async def _get_attachment_with_memo(
    session, attachment_id: uuid.UUID
) -> tuple[Attachment, Memo]:
    attachment = await session.get(Attachment, attachment_id)
    if attachment is None or attachment.object_type != ObjectType.MEMO:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    memo = await session.get(Memo, attachment.object_id)
    if memo is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    return attachment, memo


@attachments_router.get("/{attachment_id}/download")
async def download_attachment(
    attachment_id: uuid.UUID, user: CurrentUser, session: SessionDep
):
    attachment, memo = await _get_attachment_with_memo(session, attachment_id)
    if not await _can_view_memo(session, memo, user):
        raise HTTPException(status.HTTP_403_FORBIDDEN)
    try:
        data = (await get_storage(session)).load(attachment.storage_key)
    except StorageError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc))
    return Response(
        content=data,
        media_type=attachment.content_type or "application/octet-stream",
        headers={
            "Content-Disposition":
                f"attachment; filename*=UTF-8''{quote(attachment.filename)}"
        },
    )


@attachments_router.delete(
    "/{attachment_id}", status_code=status.HTTP_204_NO_CONTENT
)
async def delete_attachment(
    attachment_id: uuid.UUID, user: CurrentUser, session: SessionDep
):
    attachment, memo = await _get_attachment_with_memo(session, attachment_id)
    if memo.author_id != user.id and UserRole.ADMIN not in user.roles:
        raise HTTPException(status.HTTP_403_FORBIDDEN)
    await _editable_or_409(session, memo)
    (await get_storage(session)).delete(attachment.storage_key)
    await session.delete(attachment)
    await session.commit()
