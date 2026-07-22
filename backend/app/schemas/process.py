import uuid
# алиас Date: поле "date" в моделях затеняет тип в аннотациях
from datetime import date as Date
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict

from app.models.enums import ObjectType, ProcessStatus, TaskResult, TaskStatus


class MemoCreate(BaseModel):
    """Номер присваивается автоматически; дата, организация и проект —
    обязательные реквизиты любого документа."""

    subject: str
    body: str
    date: Date | None = None  # None = сегодня
    organization_id: uuid.UUID
    project_id: uuid.UUID
    department_id: uuid.UUID | None = None


class MemoUpdate(BaseModel):
    subject: str | None = None
    body: str | None = None
    date: Date | None = None
    organization_id: uuid.UUID | None = None
    project_id: uuid.UUID | None = None
    department_id: uuid.UUID | None = None


class ProcessBrief(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    status: ProcessStatus
    started_at: datetime | None
    completed_at: datetime | None


class MemoRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    number: str
    date: Date
    organization_id: uuid.UUID | None
    organization_name: str | None = None
    project_id: uuid.UUID | None
    project_name: str | None = None
    subject: str
    body: str
    department_id: uuid.UUID | None
    author_id: uuid.UUID | None
    author_name: str | None = None
    created_at: datetime
    process: ProcessBrief | None = None


class AttachmentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    filename: str
    content_type: str | None
    size_bytes: int
    created_at: datetime


class TaskRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    process_id: uuid.UUID
    stage_no: int
    order_in_stage: int
    position_id: uuid.UUID | None
    assignee_id: uuid.UUID
    assignee_name: str | None = None
    substitute_for_id: uuid.UUID | None
    status: TaskStatus
    result: TaskResult | None
    comment: str | None
    due_at: datetime | None
    completed_at: datetime | None


class MyTaskRead(TaskRead):
    object_type: ObjectType | None = None
    subject: str | None = None
    initiator_name: str | None = None
    process_started_at: datetime | None = None


class TaskAction(BaseModel):
    comment: str | None = None


class AuditRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    task_id: uuid.UUID | None
    user_id: uuid.UUID | None
    user_name: str | None = None
    action: str
    payload: dict[str, Any] | None
    ip: str | None
    created_at: datetime


class ProcessRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    object_type: ObjectType
    object_id: uuid.UUID
    initiator_id: uuid.UUID
    initiator_name: str | None = None
    organization_id: uuid.UUID
    organization_name: str | None = None
    project_id: uuid.UUID | None
    project_name: str | None = None
    status: ProcessStatus
    route_snapshot: dict[str, Any] | None
    started_at: datetime | None
    completed_at: datetime | None
    subject: str | None = None
    doc_number: str | None = None
    doc_date: Date | None = None
    tasks: list[TaskRead] = []
    audit: list[AuditRead] = []


class ForceCloseRequest(BaseModel):
    comment: str
