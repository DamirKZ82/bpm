"""dynamic document types

Revision ID: 8421915b4730
Revises: e731e6c53257
Create Date: 2026-07-22 21:18:02.042629

Динамические виды документов: справочник document_types + конструктор
полей + пользовательские справочники. memos переименовывается в documents,
enum objecttype заменяется строковым code вида документа.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = '8421915b4730'
down_revision: Union[str, Sequence[str], None] = 'e731e6c53257'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- справочник видов документов ---
    op.create_table(
        'document_types',
        sa.Column('code', sa.String(length=50), nullable=False),
        sa.Column('name', sa.String(length=200), nullable=False),
        sa.Column('prefix', sa.String(length=10), nullable=False),
        sa.Column('is_system', sa.Boolean(), nullable=False),
        sa.Column('active', sa.Boolean(), nullable=False),
        sa.Column('last_number', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'),
                  nullable=False),
        sa.Column('id', sa.UUID(), nullable=False),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_document_types')),
        sa.UniqueConstraint('code', name=op.f('uq_document_types_code')),
    )
    # системный вид «Служебная записка»; счётчик — из старой sequence
    op.execute("""
        INSERT INTO document_types
            (id, code, name, prefix, is_system, active, last_number, created_at)
        SELECT gen_random_uuid(), 'MEMO', 'Служебная записка', 'СЗ',
               true, true,
               (SELECT CASE WHEN is_called THEN last_value ELSE 0 END
                FROM memo_number_seq),
               now()
    """)
    op.execute("DROP SEQUENCE IF EXISTS memo_number_seq")

    # --- пользовательские справочники ---
    op.create_table(
        'dictionaries',
        sa.Column('name', sa.String(length=200), nullable=False),
        sa.Column('active', sa.Boolean(), nullable=False),
        sa.Column('id', sa.UUID(), nullable=False),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_dictionaries')),
    )
    op.create_table(
        'dictionary_items',
        sa.Column('dictionary_id', sa.UUID(), nullable=False),
        sa.Column('name', sa.String(length=500), nullable=False),
        sa.Column('active', sa.Boolean(), nullable=False),
        sa.Column('sort_order', sa.Integer(), nullable=False),
        sa.Column('id', sa.UUID(), nullable=False),
        sa.ForeignKeyConstraint(
            ['dictionary_id'], ['dictionaries.id'], ondelete='CASCADE',
            name=op.f('fk_dictionary_items_dictionary_id_dictionaries')),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_dictionary_items')),
    )

    # --- настраиваемые поля видов ---
    op.create_table(
        'document_type_fields',
        sa.Column('document_type_id', sa.UUID(), nullable=False),
        sa.Column('code', sa.String(length=50), nullable=False),
        sa.Column('name', sa.String(length=200), nullable=False),
        sa.Column('field_type', sa.String(length=20), nullable=False),
        sa.Column('ref_target', sa.String(length=20), nullable=True),
        sa.Column('dictionary_id', sa.UUID(), nullable=True),
        sa.Column('required', sa.Boolean(), nullable=False),
        sa.Column('sort_order', sa.Integer(), nullable=False),
        sa.Column('id', sa.UUID(), nullable=False),
        sa.ForeignKeyConstraint(
            ['document_type_id'], ['document_types.id'], ondelete='CASCADE',
            name=op.f('fk_document_type_fields_document_type_id_document_types')),
        sa.ForeignKeyConstraint(
            ['dictionary_id'], ['dictionaries.id'],
            name=op.f('fk_document_type_fields_dictionary_id_dictionaries')),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_document_type_fields')),
        sa.UniqueConstraint('document_type_id', 'code', name='uq_type_field_code'),
    )

    # --- enum objecttype -> строковый code вида ---
    for table in ('route_rules', 'process_instances', 'attachments'):
        op.alter_column(
            table, 'object_type',
            type_=sa.String(length=50),
            postgresql_using='object_type::text',
        )
    op.execute("DROP TYPE IF EXISTS objecttype")

    # --- memos -> documents ---
    op.rename_table('memos', 'documents')
    op.add_column('documents', sa.Column(
        'type_code', sa.String(length=50), nullable=False,
        server_default='MEMO'))
    op.alter_column('documents', 'type_code', server_default=None)
    op.add_column('documents', sa.Column(
        'custom_fields', postgresql.JSONB(), nullable=False,
        server_default=sa.text("'{}'::jsonb")))
    op.create_foreign_key(
        op.f('fk_documents_type_code_document_types'), 'documents',
        'document_types', ['type_code'], ['code'])


def downgrade() -> None:
    raise NotImplementedError("Откат конструктора видов документов не поддерживается")
