"""task timing and escalation

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-07-24 05:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b2c3d4e5f6a7'
down_revision: Union[str, Sequence[str], None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """activated_at — для аналитики времени на этапе; escalated_at — метка
    однократной эскалации по просрочке."""
    op.add_column('tasks', sa.Column('activated_at', sa.DateTime(), nullable=True))
    op.add_column('tasks', sa.Column('escalated_at', sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.drop_column('tasks', 'escalated_at')
    op.drop_column('tasks', 'activated_at')
