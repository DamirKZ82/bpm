"""expand organization and counterparty fields; bin -> inn

Revision ID: a7b8c9d0e1f2
Revises: f6a7b8c9d0e1
Create Date: 2026-07-24 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a7b8c9d0e1f2'
down_revision: Union[str, Sequence[str], None] = 'f6a7b8c9d0e1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """ИНН вместо БИН (Узбекистан) + контактные реквизиты."""
    # организации: bin -> inn, новые поля
    op.alter_column('organizations', 'bin', new_column_name='inn')
    op.add_column('organizations', sa.Column('full_name', sa.String(length=1000), nullable=True))
    op.add_column('organizations', sa.Column('legal_address', sa.Text(), nullable=True))
    op.add_column('organizations', sa.Column('phone', sa.String(length=50), nullable=True))
    op.add_column('organizations', sa.Column('email', sa.String(length=320), nullable=True))

    # контрагенты: bin -> inn, телефон и email
    op.alter_column('counterparties', 'bin', new_column_name='inn')
    op.add_column('counterparties', sa.Column('phone', sa.String(length=50), nullable=True))
    op.add_column('counterparties', sa.Column('email', sa.String(length=320), nullable=True))


def downgrade() -> None:
    op.drop_column('counterparties', 'email')
    op.drop_column('counterparties', 'phone')
    op.alter_column('counterparties', 'inn', new_column_name='bin')

    op.drop_column('organizations', 'email')
    op.drop_column('organizations', 'phone')
    op.drop_column('organizations', 'legal_address')
    op.drop_column('organizations', 'full_name')
    op.alter_column('organizations', 'inn', new_column_name='bin')
