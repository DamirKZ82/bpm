"""memo required attributes and app settings

Revision ID: e731e6c53257
Revises: bcf130ad82e5
Create Date: 2026-07-22 16:35:47.067743

Обязательные реквизиты документа (номер, дата, организация, проект)
с бэкфиллом существующих записок + таблица настроек приложения.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = 'e731e6c53257'
down_revision: Union[str, Sequence[str], None] = 'bcf130ad82e5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'app_settings',
        sa.Column('key', sa.String(length=100), nullable=False),
        sa.Column('value', postgresql.JSONB(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('now()'),
                  nullable=False),
        sa.PrimaryKeyConstraint('key', name=op.f('pk_app_settings')),
    )

    op.execute("CREATE SEQUENCE IF NOT EXISTS memo_number_seq START 1")

    op.add_column('memos', sa.Column('number', sa.String(length=50), nullable=True))
    op.add_column('memos', sa.Column('date', sa.Date(), nullable=True))
    op.add_column('memos', sa.Column('organization_id', sa.UUID(), nullable=True))
    op.add_column('memos', sa.Column('project_id', sa.UUID(), nullable=True))
    op.create_foreign_key(
        op.f('fk_memos_organization_id_organizations'), 'memos',
        'organizations', ['organization_id'], ['id'],
    )
    op.create_foreign_key(
        op.f('fk_memos_project_id_projects'), 'memos',
        'projects', ['project_id'], ['id'],
    )

    # бэкфилл существующих записок: номер по порядку создания, дата из
    # created_at, организация из последнего процесса согласования
    op.execute("""
        WITH ordered AS (
            SELECT id, row_number() OVER (ORDER BY created_at) AS rn
            FROM memos
        )
        UPDATE memos m
        SET number = 'СЗ-' || lpad(o.rn::text, 6, '0')
        FROM ordered o WHERE m.id = o.id
    """)
    op.execute(
        "SELECT setval('memo_number_seq',"
        " (SELECT count(*) FROM memos) + 1, false)"
    )
    op.execute("UPDATE memos SET date = created_at::date WHERE date IS NULL")
    op.execute("""
        UPDATE memos m
        SET organization_id = p.organization_id
        FROM process_instances p
        WHERE p.object_type = 'MEMO' AND p.object_id = m.id
          AND m.organization_id IS NULL
    """)

    op.alter_column('memos', 'number', nullable=False)
    op.alter_column('memos', 'date', nullable=False)
    op.create_unique_constraint(op.f('uq_memos_number'), 'memos', ['number'])


def downgrade() -> None:
    op.drop_constraint(op.f('uq_memos_number'), 'memos', type_='unique')
    op.drop_constraint(op.f('fk_memos_project_id_projects'), 'memos',
                       type_='foreignkey')
    op.drop_constraint(op.f('fk_memos_organization_id_organizations'), 'memos',
                       type_='foreignkey')
    op.drop_column('memos', 'project_id')
    op.drop_column('memos', 'organization_id')
    op.drop_column('memos', 'date')
    op.drop_column('memos', 'number')
    op.execute("DROP SEQUENCE IF EXISTS memo_number_seq")
    op.drop_table('app_settings')
