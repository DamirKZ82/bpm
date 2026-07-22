import uuid
from datetime import date

from pydantic import BaseModel, ConfigDict, model_validator

from app.models.enums import ResolverType, RuleMandatory, StageType


class RouteRuleCreate(BaseModel):
    object_type: str  # code вида документа
    stage_no: int
    resolver_type: ResolverType
    priority: int
    organization_id: uuid.UUID | None = None
    project_id: uuid.UUID | None = None
    position_id: uuid.UUID | None = None
    stage_type: StageType = StageType.SEQUENTIAL
    quorum_count: int | None = None
    deadline_hours: int | None = None
    mandatory: RuleMandatory = RuleMandatory.REQUIRED
    valid_from: date | None = None
    valid_to: date | None = None

    @model_validator(mode="after")
    def check_consistency(self):
        needs_position = self.resolver_type in (
            ResolverType.POSITION_IN_ORG,
            ResolverType.POSITION_IN_PROJECT,
        )
        if needs_position and self.position_id is None:
            raise ValueError(f"Для {self.resolver_type} требуется position_id")
        if self.stage_type == StageType.QUORUM and not self.quorum_count:
            raise ValueError("Для QUORUM требуется quorum_count")
        return self


class RouteRuleUpdate(BaseModel):
    stage_no: int | None = None
    resolver_type: ResolverType | None = None
    priority: int | None = None
    organization_id: uuid.UUID | None = None
    project_id: uuid.UUID | None = None
    position_id: uuid.UUID | None = None
    stage_type: StageType | None = None
    quorum_count: int | None = None
    deadline_hours: int | None = None
    mandatory: RuleMandatory | None = None
    valid_from: date | None = None
    valid_to: date | None = None


class RouteRuleRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    object_type: str
    stage_no: int
    order_in_stage: int
    resolver_type: ResolverType
    priority: int
    organization_id: uuid.UUID | None
    project_id: uuid.UUID | None
    position_id: uuid.UUID | None
    stage_type: StageType
    quorum_count: int | None
    deadline_hours: int | None
    mandatory: RuleMandatory
    valid_from: date | None
    valid_to: date | None


class ProjectAssignmentCreate(BaseModel):
    project_id: uuid.UUID
    position_id: uuid.UUID
    employee_id: uuid.UUID
    valid_from: date | None = None
    valid_to: date | None = None


class ProjectAssignmentUpdate(BaseModel):
    valid_from: date | None = None
    valid_to: date | None = None


class ProjectAssignmentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    project_id: uuid.UUID
    position_id: uuid.UUID
    employee_id: uuid.UUID
    valid_from: date | None
    valid_to: date | None


class SubstitutionCreate(BaseModel):
    employee_id: uuid.UUID
    substitute_id: uuid.UUID
    valid_from: date
    valid_to: date


class SubstitutionUpdate(BaseModel):
    substitute_id: uuid.UUID | None = None
    valid_from: date | None = None
    valid_to: date | None = None


class SubstitutionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    employee_id: uuid.UUID
    substitute_id: uuid.UUID
    valid_from: date
    valid_to: date
