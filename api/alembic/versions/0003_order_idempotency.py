"""Persist customer-scoped checkout idempotency and completed responses."""

from alembic import op
import sqlalchemy as sa

revision = "0003_order_idempotency"
down_revision = "0002_restaurant_order_status"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "order_idempotency_records",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("customer_id", sa.Integer(), nullable=False),
        sa.Column("idempotency_key", sa.String(length=36), nullable=False),
        sa.Column("request_hash", sa.String(length=64), nullable=False),
        sa.Column("order_id", sa.Integer(), nullable=True),
        sa.Column("response_payload", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["customer_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["order_id"], ["customer_orders.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("customer_id", "idempotency_key", name="uq_order_idempotency_customer_key"),
        sa.UniqueConstraint("order_id", name="uq_order_idempotency_order_id"),
    )


def downgrade() -> None:
    op.drop_table("order_idempotency_records")
