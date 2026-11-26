"""Create API identity, restaurant, menu, and order tables."""

from alembic import op
import sqlalchemy as sa

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("oidc_subject", sa.String(length=255), nullable=False),
        sa.Column("role", sa.String(length=20), nullable=False),
        sa.CheckConstraint("role IN ('customer', 'manager', 'admin')", name="ck_users_role"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("oidc_subject"),
    )
    op.create_index("ix_users_oidc_subject", "users", ["oidc_subject"], unique=True)

    op.create_table(
        "restaurants",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("address", sa.String(length=300), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "restaurant_managers",
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("restaurant_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["restaurant_id"], ["restaurants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id", "restaurant_id"),
    )
    op.create_table(
        "menu_items",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("restaurant_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("price", sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column("is_available", sa.Boolean(), nullable=False),
        sa.CheckConstraint("price >= 0", name="ck_menu_items_price_nonnegative"),
        sa.ForeignKeyConstraint(["restaurant_id"], ["restaurants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_menu_items_restaurant_id", "menu_items", ["restaurant_id"], unique=False)

    op.create_table(
        "customer_orders",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("customer_id", sa.Integer(), nullable=False),
        sa.Column("fulfillment_method", sa.String(length=16), nullable=False),
        sa.Column("total_amount", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("fulfillment_method = 'pickup'", name="ck_customer_orders_pickup_only"),
        sa.CheckConstraint("total_amount >= 0", name="ck_customer_orders_total_nonnegative"),
        sa.ForeignKeyConstraint(["customer_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_customer_orders_customer_id", "customer_orders", ["customer_id"], unique=False)
    op.create_table(
        "restaurant_orders",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("customer_order_id", sa.Integer(), nullable=False),
        sa.Column("restaurant_id", sa.Integer(), nullable=False),
        sa.Column("restaurant_name", sa.String(length=160), nullable=False),
        sa.Column("status", sa.String(length=24), nullable=False),
        sa.Column("subtotal", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.CheckConstraint("subtotal >= 0", name="ck_restaurant_orders_subtotal_nonnegative"),
        sa.ForeignKeyConstraint(["customer_order_id"], ["customer_orders.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["restaurant_id"], ["restaurants.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "customer_order_id", "restaurant_id", name="uq_restaurant_order_per_restaurant"
        ),
    )
    op.create_index("ix_restaurant_orders_customer_order_id", "restaurant_orders", ["customer_order_id"], unique=False)
    op.create_index("ix_restaurant_orders_restaurant_id", "restaurant_orders", ["restaurant_id"], unique=False)
    op.create_table(
        "order_lines",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("restaurant_order_id", sa.Integer(), nullable=False),
        sa.Column("menu_item_id", sa.Integer(), nullable=True),
        sa.Column("item_name", sa.String(length=160), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("unit_price", sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column("line_total", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.CheckConstraint("quantity > 0", name="ck_order_lines_quantity_positive"),
        sa.CheckConstraint("unit_price >= 0", name="ck_order_lines_price_nonnegative"),
        sa.CheckConstraint("line_total >= 0", name="ck_order_lines_total_nonnegative"),
        sa.ForeignKeyConstraint(["menu_item_id"], ["menu_items.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["restaurant_order_id"], ["restaurant_orders.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_order_lines_menu_item_id", "order_lines", ["menu_item_id"], unique=False)
    op.create_index("ix_order_lines_restaurant_order_id", "order_lines", ["restaurant_order_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_order_lines_restaurant_order_id", table_name="order_lines")
    op.drop_index("ix_order_lines_menu_item_id", table_name="order_lines")
    op.drop_table("order_lines")
    op.drop_index("ix_restaurant_orders_restaurant_id", table_name="restaurant_orders")
    op.drop_index("ix_restaurant_orders_customer_order_id", table_name="restaurant_orders")
    op.drop_table("restaurant_orders")
    op.drop_index("ix_customer_orders_customer_id", table_name="customer_orders")
    op.drop_table("customer_orders")
    op.drop_index("ix_menu_items_restaurant_id", table_name="menu_items")
    op.drop_table("menu_items")
    op.drop_table("restaurant_managers")
    op.drop_table("restaurants")
    op.drop_index("ix_users_oidc_subject", table_name="users")
    op.drop_table("users")
