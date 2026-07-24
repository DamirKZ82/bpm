"""task kinds execution and acknowledgement

Revision ID: de2318048dd7
Revises: 197269162e60
Create Date: 2026-07-24 08:06:52.861482

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'de2318048dd7'
down_revision: Union[str, Sequence[str], None] = '197269162e60'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('route_rules', sa.Column('task_kind', sa.String(length=20), server_default='APPROVAL', nullable=False))
    op.add_column('tasks', sa.Column('task_kind', sa.String(length=20), server_default='APPROVAL', nullable=False))
    # новые результаты заданий (autogenerate не видит добавление значений enum)
    op.execute("ALTER TYPE taskresult ADD VALUE IF NOT EXISTS 'EXECUTED'")
    op.execute("ALTER TYPE taskresult ADD VALUE IF NOT EXISTS 'ACKNOWLEDGED'")


def downgrade() -> None:
    """Значения enum в PostgreSQL не удаляются — откат только по колонкам."""
    op.drop_column('tasks', 'task_kind')
    op.drop_column('route_rules', 'task_kind')
