"""user passwords

Revision ID: 0005
Revises: 0004
Create Date: 2026-09-25
"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = '0005'
down_revision: str | None = '0004'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column('users', sa.Column('password_hash', sa.String(length=255), nullable=True))
    op.add_column('users', sa.Column('password_changed_at', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column('users', 'password_changed_at')
    op.drop_column('users', 'password_hash')
