import uuid

from fastapi import APIRouter
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select

from app.api.deps import CurrentUser, SessionDep
from app.models import Organization, Project

router = APIRouter(prefix="/api")


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


# --- Справочные списки для форм (доступны любому вошедшему) ---

class OrganizationRef(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str


class ProjectRef(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    code: str | None
    organization_id: uuid.UUID | None


@router.get("/refs/organizations", response_model=list[OrganizationRef])
async def ref_organizations(user: CurrentUser, session: SessionDep):
    rows = await session.scalars(
        select(Organization)
        .where(Organization.active.is_(True))
        .order_by(Organization.name)
    )
    return list(rows)


@router.get("/refs/projects", response_model=list[ProjectRef])
async def ref_projects(user: CurrentUser, session: SessionDep):
    rows = await session.scalars(select(Project).order_by(Project.name))
    return list(rows)
