"""return for rework

Revision ID: a1b2c3d4e5f6
Revises: de2318048dd7
Create Date: 2026-07-24 05:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, Sequence[str], None] = 'de2318048dd7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Возврат на доработку: этап возобновления + новые значения enum."""
    op.add_column(
        'process_instances',
        sa.Column('rework_stage_no', sa.Integer(), nullable=True),
    )
    op.execute("ALTER TYPE processstatus ADD VALUE IF NOT EXISTS 'RETURNED'")
    op.execute("ALTER TYPE taskresult ADD VALUE IF NOT EXISTS 'RETURNED'")


def downgrade() -> None:
    """Значения enum в PostgreSQL не удаляются — откат только по колонке."""
    op.drop_column('process_instances', 'rework_stage_no')
