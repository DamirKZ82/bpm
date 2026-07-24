"""department and project active flag

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-07-24 07:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd4e5f6a7b8c9'
down_revision: Union[str, Sequence[str], None] = 'c3d4e5f6a7b8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """active — для мягкого скрытия справочников из интеграции
    (удаления нет: в 1С помечено на удаление → в BPM active=false)."""
    op.add_column(
        'departments',
        sa.Column('active', sa.Boolean(), nullable=False, server_default=sa.text('true')),
    )
    op.add_column(
        'projects',
        sa.Column('active', sa.Boolean(), nullable=False, server_default=sa.text('true')),
    )


def downgrade() -> None:
    op.drop_column('projects', 'active')
    op.drop_column('departments', 'active')
