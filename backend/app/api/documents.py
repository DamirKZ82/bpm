import re
import uuid
from datetime import date as date_type
from typing import Any
from urllib.parse import quote

from fastapi import APIRouter, HTTPException, Request, Response, UploadFile, status
from sqlalchemy import Numeric, cast, or_, select, text

from app.api.deps import CurrentUser, SessionDep
from app.models import (
    Attachment,
    Contract,
    Counterparty,
    DictionaryItem,
    Document,
    DocumentType,
    DocumentTypeField,
    Employee,
    Employment,
    Organization,
    ProcessInstance,
    Project,
    Task,
    User,
    VatRate,
)
from app.models.enums import FieldType, ProcessStatus, RefTarget, UserRole
from app.schemas.process import (
    AttachmentRead,
    DocumentCreate,
    DocumentRead,
    DocumentUpdate,
    ProcessBrief,
)
from app.services import process_service
from app.services.route_engine import RouteError
from app.services.storage import StorageError, get_storage, load_storage_config

router = APIRouter(prefix="/api/documents", tags=["documents"])
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


async def _next_number(session, doc_type: DocumentType) -> str:
    """Атомарная автонумерация: счётчик на виде документа."""
    row = await session.execute(
        text(
            "UPDATE document_types SET last_number = last_number + 1 "
            "WHERE id = :id RETURNING last_number"
        ),
        {"id": str(doc_type.id)},
    )
    return f"{doc_type.prefix}-{row.scalar_one():06d}"


async def _get_active_type(session, type_code: str) -> DocumentType:
    doc_type = await session.scalar(
        select(DocumentType).where(DocumentType.code == type_code)
    )
    if doc_type is None or not doc_type.active:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY, "Вид документа не найден"
        )
    return doc_type


_REF_TABLES = {
    RefTarget.EMPLOYEE: Employee,
    RefTarget.ORGANIZATION: Organization,
    RefTarget.PROJECT: Project,
    RefTarget.COUNTERPARTY: Counterparty,
    RefTarget.CONTRACT: Contract,
    RefTarget.VAT_RATE: VatRate,
}


async def _clean_scalar(
    session, field_type: str, ref_target, dictionary_id, value
):
    """Очистка/проверка одного скалярного значения (поле или ячейка
    таблицы). Бросает ValueError при неверном значении."""
    if field_type in (FieldType.STRING, FieldType.TEXT):
        return str(value)
    if field_type in (FieldType.NUMBER, FieldType.MONEY):
        return float(value)
    if field_type == FieldType.BOOLEAN:
        return bool(value)
    if field_type == FieldType.DATE:
        return date_type.fromisoformat(str(value)).isoformat()
    if field_type == FieldType.REF:
        ref_id = uuid.UUID(str(value))
        if ref_target == RefTarget.DICTIONARY:
            dict_id = uuid.UUID(str(dictionary_id)) if dictionary_id else None
            found = await session.scalar(
                select(DictionaryItem.id).where(
                    DictionaryItem.id == ref_id,
                    DictionaryItem.dictionary_id == dict_id,
                )
            )
        else:
            table = _REF_TABLES.get(ref_target)
            found = (
                await session.scalar(select(table.id).where(table.id == ref_id))
                if table is not None
                else None
            )
        if found is None:
            raise ValueError
        return str(ref_id)
    return value


async def _validate_custom_fields(
    session, doc_type: DocumentType, values: dict[str, Any]
) -> dict[str, Any]:
    """Проверка значений по описаниям полей вида; неизвестные ключи
    отбрасываются, возвращается очищенный словарь. Табличные части
    (field_type=TABLE) — список строк, каждая ячейка проверяется по
    описанию колонки."""
    fields = list(
        await session.scalars(
            select(DocumentTypeField).where(
                DocumentTypeField.document_type_id == doc_type.id
            )
        )
    )
    clean: dict[str, Any] = {}
    for field in fields:
        value = values.get(field.code)
        if value in (None, "", []):
            if field.required:
                raise HTTPException(
                    status.HTTP_422_UNPROCESSABLE_ENTITY,
                    f"Заполните поле «{field.name}»",
                )
            clean[field.code] = [] if field.field_type == FieldType.TABLE else None
            continue

        if field.field_type == FieldType.TABLE:
            if not isinstance(value, list):
                raise HTTPException(
                    status.HTTP_422_UNPROCESSABLE_ENTITY,
                    f"Табличная часть «{field.name}» должна быть списком строк",
                )
            columns = field.columns or []
            rows: list[dict] = []
            for row in value:
                if not isinstance(row, dict):
                    continue
                clean_row: dict[str, Any] = {}
                for col in columns:
                    cell = row.get(col["code"])
                    if cell in (None, "", []):
                        if col.get("required"):
                            raise HTTPException(
                                status.HTTP_422_UNPROCESSABLE_ENTITY,
                                f"В таблице «{field.name}» заполните колонку "
                                f"«{col['name']}»",
                            )
                        clean_row[col["code"]] = None
                        continue
                    try:
                        clean_row[col["code"]] = await _clean_scalar(
                            session, col["field_type"], col.get("ref_target"),
                            col.get("dictionary_id"), cell,
                        )
                    except (ValueError, TypeError):
                        raise HTTPException(
                            status.HTTP_422_UNPROCESSABLE_ENTITY,
                            f"Неверное значение в таблице «{field.name}», "
                            f"колонка «{col['name']}»",
                        )
                rows.append(clean_row)
            clean[field.code] = rows
            continue

        try:
            clean[field.code] = await _clean_scalar(
                session, field.field_type, field.ref_target,
                field.dictionary_id, value,
            )
        except (ValueError, TypeError):
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                f"Неверное значение поля «{field.name}»",
            )
    return clean


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


async def _latest_process(session, document_id: uuid.UUID) -> ProcessInstance | None:
    return await session.scalar(
        select(ProcessInstance)
        .where(ProcessInstance.object_id == document_id)
        .order_by(ProcessInstance.started_at.desc())
        .limit(1)
    )


async def _can_view_document(session, document: Document, user) -> bool:
    """Автор, админ, участник согласования (текущий или прошлый),
    наблюдатель организации процесса."""
    if document.author_id == user.id or UserRole.ADMIN in user.roles:
        return True
    if user.employee_id is not None:
        participant = await session.scalar(
            select(Task.id)
            .join(ProcessInstance, Task.process_id == ProcessInstance.id)
            .where(
                ProcessInstance.object_id == document.id,
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
                    ProcessInstance.object_id == document.id,
                    Employment.employee_id == user.employee_id,
                )
                .limit(1)
            )
            if observer is not None:
                return True
    return False


async def _document_read(
    session, document: Document, process: ProcessInstance | None
) -> DocumentRead:
    result = DocumentRead.model_validate(document)
    if process is not None:
        result.process = ProcessBrief.model_validate(process)
    if document.organization_id:
        result.organization_name = await session.scalar(
            select(Organization.name).where(
                Organization.id == document.organization_id
            )
        )
    if document.project_id:
        result.project_name = await session.scalar(
            select(Project.name).where(Project.id == document.project_id)
        )
    return result


async def _editable_or_409(session, document: Document) -> ProcessInstance | None:
    process = await _latest_process(session, document.id)
    if process is not None and process.status in OPEN_STATUSES:
        # блокировка изменения документа во время согласования (ТЗ §6.4)
        raise HTTPException(
            status.HTTP_409_CONFLICT, "Документ на согласовании, изменение запрещено"
        )
    return process


@router.post("", response_model=DocumentRead, status_code=status.HTTP_201_CREATED)
async def create_document(body: DocumentCreate, user: CurrentUser, session: SessionDep):
    _require_employee(user)
    doc_type = await _get_active_type(session, body.type_code)
    await _validate_requisites(
        session, organization_id=body.organization_id, project_id=body.project_id
    )
    custom = await _validate_custom_fields(session, doc_type, body.custom_fields)
    document = Document(
        **body.model_dump(exclude={"date", "custom_fields"}),
        custom_fields=custom,
        date=body.date or date_type.today(),
        number=await _next_number(session, doc_type),
        author_id=user.id,
    )
    session.add(document)
    await session.commit()
    await session.refresh(document)
    return await _document_read(session, document, None)


async def _apply_custom_filters(session, stmt, type_code: str, request: Request):
    """Отбор по настраиваемым полям: cf_<code>=значение,
    cf_<code>_from / cf_<code>_to — диапазоны для дат и чисел."""
    doc_type = await session.scalar(
        select(DocumentType).where(DocumentType.code == type_code)
    )
    if doc_type is None:
        return stmt
    fields = {
        f.code: f
        for f in await session.scalars(
            select(DocumentTypeField).where(
                DocumentTypeField.document_type_id == doc_type.id
            )
        )
    }
    for key, raw in request.query_params.items():
        if not key.startswith("cf_") or raw == "":
            continue
        code, op = key[3:], "eq"
        if code.endswith("_from"):
            code, op = code[:-5], "ge"
        elif code.endswith("_to"):
            code, op = code[:-3], "le"
        field = fields.get(code)
        if field is None:
            continue
        column = Document.custom_fields[code].astext
        if field.field_type in (FieldType.STRING, FieldType.TEXT):
            stmt = stmt.where(column.ilike(f"%{raw}%"))
        elif field.field_type == FieldType.BOOLEAN:
            stmt = stmt.where(column == ("true" if raw in ("true", "1") else "false"))
        elif field.field_type == FieldType.REF:
            stmt = stmt.where(column == raw)
        elif field.field_type == FieldType.DATE:
            # ISO-даты сравниваются лексикографически корректно
            if op == "ge":
                stmt = stmt.where(column >= raw)
            elif op == "le":
                stmt = stmt.where(column <= raw)
            else:
                stmt = stmt.where(column == raw)
        elif field.field_type in (FieldType.NUMBER, FieldType.MONEY):
            try:
                number = float(raw)
            except ValueError:
                continue
            numeric = cast(column, Numeric)
            if op == "ge":
                stmt = stmt.where(numeric >= number)
            elif op == "le":
                stmt = stmt.where(numeric <= number)
            else:
                stmt = stmt.where(numeric == number)
    return stmt


@router.get("", response_model=list[DocumentRead])
async def list_documents(
    user: CurrentUser,
    session: SessionDep,
    request: Request,
    type_code: str | None = None,
    organization_id: uuid.UUID | None = None,
    project_id: uuid.UUID | None = None,
    date_from: date_type | None = None,
    date_to: date_type | None = None,
    search: str | None = None,
    limit: int | None = None,
    scope: str | None = None,
):
    """Видимость по ТЗ §3.6: автор видит свои; согласующий — документы
    со своей задачей (текущей или прошлой); наблюдатель — по своей
    организации; администратор — все.
    scope: my (только свои) | approvals (только где я согласующий).
    Отбор: вид, организация, проект, период, поля (cf_*), поиск."""
    is_admin = UserRole.ADMIN in user.roles
    stmt = select(Document).order_by(Document.created_at.desc())

    # документы, где у пользователя есть (или была) задача согласования
    participant_docs = (
        select(ProcessInstance.object_id)
        .join(Task, Task.process_id == ProcessInstance.id)
        .where(Task.assignee_id == user.employee_id)
        if user.employee_id
        else None
    )

    if scope == "my":
        stmt = stmt.where(Document.author_id == user.id)
    elif scope == "approvals":
        if participant_docs is None:
            return []
        stmt = stmt.where(Document.id.in_(participant_docs))
    elif not is_admin:
        visible = [Document.author_id == user.id]
        if participant_docs is not None:
            visible.append(Document.id.in_(participant_docs))
            if UserRole.OBSERVER in user.roles:
                own_orgs = select(Employment.organization_id).where(
                    Employment.employee_id == user.employee_id
                )
                visible.append(Document.organization_id.in_(own_orgs))
        stmt = stmt.where(or_(*visible))
    if search:
        pattern = f"%{search.strip()}%"
        stmt = stmt.where(
            Document.number.ilike(pattern) | Document.subject.ilike(pattern)
        )
    if limit:
        stmt = stmt.limit(min(limit, 100))
    if type_code is not None:
        stmt = stmt.where(Document.type_code == type_code)
        stmt = await _apply_custom_filters(session, stmt, type_code, request)
    if organization_id is not None:
        stmt = stmt.where(Document.organization_id == organization_id)
    if project_id is not None:
        stmt = stmt.where(Document.project_id == project_id)
    if date_from is not None:
        stmt = stmt.where(Document.date >= date_from)
    if date_to is not None:
        stmt = stmt.where(Document.date <= date_to)
    documents = list(await session.scalars(stmt))

    author_names: dict[uuid.UUID, str] = {}
    if documents:
        rows = await session.execute(
            select(User.id, User.display_name, User.ad_sam_account_name).where(
                User.id.in_({d.author_id for d in documents if d.author_id})
            )
        )
        author_names = {row[0]: row[1] or row[2] for row in rows}

    result = []
    for document in documents:
        item = await _document_read(
            session, document, await _latest_process(session, document.id)
        )
        if document.author_id in author_names:
            item.author_name = author_names[document.author_id]
        result.append(item)
    return result


@router.get("/{document_id}", response_model=DocumentRead)
async def get_document(document_id: uuid.UUID, user: CurrentUser, session: SessionDep):
    document = await session.get(Document, document_id)
    if document is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    if not await _can_view_document(session, document, user):
        raise HTTPException(status.HTTP_403_FORBIDDEN)
    return await _document_read(
        session, document, await _latest_process(session, document.id)
    )


@router.patch("/{document_id}", response_model=DocumentRead)
async def update_document(
    document_id: uuid.UUID, body: DocumentUpdate, user: CurrentUser, session: SessionDep
):
    document = await session.get(Document, document_id)
    if document is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    if document.author_id != user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN)
    process = await _editable_or_409(session, document)
    updates = body.model_dump(exclude_unset=True)
    custom_values = updates.pop("custom_fields", None)
    for key, value in updates.items():
        setattr(document, key, value)
    if custom_values is not None:
        doc_type = await _get_active_type(session, document.type_code)
        document.custom_fields = await _validate_custom_fields(
            session, doc_type, custom_values
        )
    if document.organization_id and document.project_id:
        await _validate_requisites(
            session,
            organization_id=document.organization_id,
            project_id=document.project_id,
        )
    await session.commit()
    await session.refresh(document)
    return await _document_read(session, document, process)


@router.post("/{document_id}/submit", response_model=DocumentRead)
async def submit_document(
    document_id: uuid.UUID,
    user: CurrentUser,
    session: SessionDep,
    request: Request,
):
    employee_id = _require_employee(user)
    document = await session.get(Document, document_id)
    if document is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    if document.author_id != user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN)
    if document.organization_id is None or document.project_id is None:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "Заполните организацию и проект документа",
        )
    # обязательные настраиваемые поля должны быть заполнены перед отправкой
    doc_type = await _get_active_type(session, document.type_code)
    await _validate_custom_fields(session, doc_type, document.custom_fields or {})

    process = await _latest_process(session, document.id)
    if process is not None and process.status in OPEN_STATUSES:
        raise HTTPException(status.HTTP_409_CONFLICT, "Документ уже на согласовании")

    employed = await session.scalar(
        select(Employment.id).where(
            Employment.employee_id == employee_id,
            Employment.organization_id == document.organization_id,
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
            object_type=document.type_code,
            object_id=document.id,
            initiator=user,
            organization_id=document.organization_id,
            project_id=document.project_id,
            ip=request.client.host if request.client else None,
        )
    except RouteError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc))

    return await _document_read(session, document, process)


@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(
    document_id: uuid.UUID, user: CurrentUser, session: SessionDep
):
    document = await session.get(Document, document_id)
    if document is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    if document.author_id != user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN)
    process = await _latest_process(session, document.id)
    if process is not None:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "По документу уже запускалось согласование — удаление запрещено",
        )
    attachments = list(
        await session.scalars(
            select(Attachment).where(Attachment.object_id == document.id)
        )
    )
    storage = await get_storage(session)
    for attachment in attachments:
        storage.delete(attachment.storage_key)
        await session.delete(attachment)
    await session.delete(document)
    await session.commit()


# --- Вложения ---

_UNSAFE_FILENAME = re.compile(r'[\\/:*?"<>|\x00-\x1f]')


@router.post(
    "/{document_id}/attachments",
    response_model=AttachmentRead,
    status_code=status.HTTP_201_CREATED,
)
async def upload_attachment(
    document_id: uuid.UUID, file: UploadFile, user: CurrentUser, session: SessionDep
):
    document = await session.get(Document, document_id)
    if document is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    if document.author_id != user.id and UserRole.ADMIN not in user.roles:
        raise HTTPException(status.HTTP_403_FORBIDDEN)
    await _editable_or_409(session, document)

    config = await load_storage_config(session)
    data = await file.read()
    if len(data) > config.max_upload_mb * 1024 * 1024:
        raise HTTPException(
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            f"Файл больше {config.max_upload_mb} МБ",
        )
    filename = _UNSAFE_FILENAME.sub("_", file.filename or "file")[:300]
    key = f"documents/{document.id}/{uuid.uuid4().hex}_{filename}"
    (await get_storage(session)).save(key, data)

    attachment = Attachment(
        object_type=document.type_code,
        object_id=document.id,
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


@router.get("/{document_id}/attachments", response_model=list[AttachmentRead])
async def list_attachments(
    document_id: uuid.UUID, user: CurrentUser, session: SessionDep
):
    document = await session.get(Document, document_id)
    if document is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    if not await _can_view_document(session, document, user):
        raise HTTPException(status.HTTP_403_FORBIDDEN)
    rows = await session.scalars(
        select(Attachment)
        .where(Attachment.object_id == document.id)
        .order_by(Attachment.created_at)
    )
    return list(rows)


async def _get_attachment_with_document(
    session, attachment_id: uuid.UUID
) -> tuple[Attachment, Document]:
    attachment = await session.get(Attachment, attachment_id)
    if attachment is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    document = await session.get(Document, attachment.object_id)
    if document is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    return attachment, document


@attachments_router.get("/{attachment_id}/download")
async def download_attachment(
    attachment_id: uuid.UUID, user: CurrentUser, session: SessionDep
):
    attachment, document = await _get_attachment_with_document(session, attachment_id)
    if not await _can_view_document(session, document, user):
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
    attachment, document = await _get_attachment_with_document(session, attachment_id)
    if document.author_id != user.id and UserRole.ADMIN not in user.roles:
        raise HTTPException(status.HTTP_403_FORBIDDEN)
    await _editable_or_409(session, document)
    (await get_storage(session)).delete(attachment.storage_key)
    await session.delete(attachment)
    await session.commit()
