"""Constrain restaurant order lifecycle statuses."""

from alembic import op

revision = "0002_restaurant_order_status"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("restaurant_orders") as batch_op:
        batch_op.create_check_constraint(
            "ck_restaurant_orders_status",
            "status IN ('received', 'preparing', 'ready', 'picked_up', 'cancelled')",
        )


def downgrade() -> None:
    with op.batch_alter_table("restaurant_orders") as batch_op:
        batch_op.drop_constraint("ck_restaurant_orders_status", type_="check")
