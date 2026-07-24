import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models.enums import UserStatus


class DevLoginRequest(BaseModel):
    username: str


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    ad_sam_account_name: str
    display_name: str | None
    email: str | None
    status: UserStatus
    roles: list[str]
    employee_id: uuid.UUID | None
    locale: str
    theme: str
    last_login_at: datetime | None


class PreferencesUpdate(BaseModel):
    locale: str | None = None
    theme: str | None = None


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserRead
