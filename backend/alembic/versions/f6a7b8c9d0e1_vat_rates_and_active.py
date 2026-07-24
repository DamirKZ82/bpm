"""vat rates + active flags for counterparty/contract

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
Create Date: 2026-07-24 09:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f6a7b8c9d0e1'
down_revision: Union[str, Sequence[str], None] = 'e5f6a7b8c9d0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Справочник ставок НДС + деактивация контрагентов/договоров."""
    op.create_table(
        'vat_rates',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('rate', sa.Numeric(5, 2), nullable=True),
        sa.Column('active', sa.Boolean(), server_default=sa.text('true'), nullable=False),
        sa.Column('sort_order', sa.Integer(), server_default='0', nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.add_column(
        'counterparties',
        sa.Column('active', sa.Boolean(), server_default=sa.text('true'), nullable=False),
    )
    op.add_column(
        'contracts',
        sa.Column('active', sa.Boolean(), server_default=sa.text('true'), nullable=False),
    )
    op.add_column('contracts', sa.Column('vat_rate_id', sa.Uuid(), nullable=True))
    op.create_foreign_key(
        'fk_contracts_vat_rate', 'contracts', 'vat_rates', ['vat_rate_id'], ['id']
    )


def downgrade() -> None:
    op.drop_constraint('fk_contracts_vat_rate', 'contracts', type_='foreignkey')
    op.drop_column('contracts', 'vat_rate_id')
    op.drop_column('contracts', 'active')
    op.drop_column('counterparties', 'active')
    op.drop_table('vat_rates')
