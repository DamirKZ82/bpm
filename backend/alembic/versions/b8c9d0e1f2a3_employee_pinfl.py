"""employee pinfl

Revision ID: b8c9d0e1f2a3
Revises: a7b8c9d0e1f2
Create Date: 2026-07-24 10:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b8c9d0e1f2a3'
down_revision: Union[str, Sequence[str], None] = 'a7b8c9d0e1f2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """ПИНФЛ сотрудника — идентификатор физлица (Узбекистан)."""
    op.add_column('employees', sa.Column('pinfl', sa.String(length=14), nullable=True))
    op.create_index('ix_employees_pinfl', 'employees', ['pinfl'])


def downgrade() -> None:
    op.drop_index('ix_employees_pinfl', table_name='employees')
    op.drop_column('employees', 'pinfl')
