from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    JSON,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from api.database import Base


RESTAURANT_ORDER_STATUSES = frozenset({"received", "preparing", "ready", "picked_up", "cancelled"})
RESTAURANT_ORDER_TRANSITIONS = {
    "received": ("preparing", "cancelled"),
    "preparing": ("ready", "cancelled"),
    "ready": ("picked_up", "cancelled"),
    "picked_up": (),
    "cancelled": (),
}


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint("role IN ('customer', 'manager', 'admin')", name="ck_users_role"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    oidc_subject: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    role: Mapped[str] = mapped_column(String(20), default="customer", nullable=False)

    restaurant_access: Mapped[list["RestaurantManager"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    orders: Mapped[list["CustomerOrder"]] = relationship(back_populates="customer")


class Restaurant(Base):
    __tablename__ = "restaurants"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="", nullable=False)
    address: Mapped[str] = mapped_column(String(300), nullable=False)
    is_active: Mapped[bool] = mapped_column(default=True, nullable=False)

    menu_items: Mapped[list["MenuItem"]] = relationship(
        back_populates="restaurant", cascade="all, delete-orphan"
    )
    managers: Mapped[list["RestaurantManager"]] = relationship(
        back_populates="restaurant", cascade="all, delete-orphan"
    )


class RestaurantManager(Base):
    __tablename__ = "restaurant_managers"

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    restaurant_id: Mapped[int] = mapped_column(
        ForeignKey("restaurants.id", ondelete="CASCADE"), primary_key=True
    )
    user: Mapped[User] = relationship(back_populates="restaurant_access")
    restaurant: Mapped[Restaurant] = relationship(back_populates="managers")


class MenuItem(Base):
    __tablename__ = "menu_items"
    __table_args__ = (
        CheckConstraint("price >= 0", name="ck_menu_items_price_nonnegative"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    restaurant_id: Mapped[int] = mapped_column(
        ForeignKey("restaurants.id", ondelete="CASCADE"), index=True, nullable=False
    )
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="", nullable=False)
    price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    is_available: Mapped[bool] = mapped_column(default=True, nullable=False)
    restaurant: Mapped[Restaurant] = relationship(back_populates="menu_items")


class CustomerOrder(Base):
    __tablename__ = "customer_orders"
    __table_args__ = (
        CheckConstraint("fulfillment_method = 'pickup'", name="ck_customer_orders_pickup_only"),
        CheckConstraint("total_amount >= 0", name="ck_customer_orders_total_nonnegative"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True, nullable=False)
    fulfillment_method: Mapped[str] = mapped_column(String(16), nullable=False)
    total_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    customer: Mapped[User] = relationship(back_populates="orders")
    restaurant_orders: Mapped[list["RestaurantOrder"]] = relationship(
        back_populates="customer_order", cascade="all, delete-orphan"
    )


class OrderIdempotencyRecord(Base):
    __tablename__ = "order_idempotency_records"
    __table_args__ = (
        UniqueConstraint(
            "customer_id",
            "idempotency_key",
            name="uq_order_idempotency_customer_key",
        ),
        UniqueConstraint("order_id", name="uq_order_idempotency_order_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    idempotency_key: Mapped[str] = mapped_column(String(36), nullable=False)
    request_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    order_id: Mapped[int | None] = mapped_column(
        ForeignKey("customer_orders.id", ondelete="RESTRICT"), nullable=True
    )
    response_payload: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )


class RestaurantOrder(Base):
    __tablename__ = "restaurant_orders"
    __table_args__ = (
        UniqueConstraint("customer_order_id", "restaurant_id", name="uq_restaurant_order_per_restaurant"),
        CheckConstraint("subtotal >= 0", name="ck_restaurant_orders_subtotal_nonnegative"),
        CheckConstraint(
            "status IN ('received', 'preparing', 'ready', 'picked_up', 'cancelled')",
            name="ck_restaurant_orders_status",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    customer_order_id: Mapped[int] = mapped_column(
        ForeignKey("customer_orders.id", ondelete="CASCADE"), index=True, nullable=False
    )
    restaurant_id: Mapped[int] = mapped_column(ForeignKey("restaurants.id"), index=True, nullable=False)
    restaurant_name: Mapped[str] = mapped_column(String(160), nullable=False)
    status: Mapped[str] = mapped_column(String(24), default="received", nullable=False)
    subtotal: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    customer_order: Mapped[CustomerOrder] = relationship(back_populates="restaurant_orders")
    lines: Mapped[list["OrderLine"]] = relationship(
        back_populates="restaurant_order", cascade="all, delete-orphan"
    )

    @property
    def created_at(self) -> datetime:
        return self.customer_order.created_at

    @property
    def fulfillment_method(self) -> str:
        return self.customer_order.fulfillment_method


class OrderLine(Base):
    __tablename__ = "order_lines"
    __table_args__ = (
        CheckConstraint("quantity > 0", name="ck_order_lines_quantity_positive"),
        CheckConstraint("unit_price >= 0", name="ck_order_lines_price_nonnegative"),
        CheckConstraint("line_total >= 0", name="ck_order_lines_total_nonnegative"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    restaurant_order_id: Mapped[int] = mapped_column(
        ForeignKey("restaurant_orders.id", ondelete="CASCADE"), index=True, nullable=False
    )
    menu_item_id: Mapped[int | None] = mapped_column(
        ForeignKey("menu_items.id", ondelete="SET NULL"), index=True
    )
    item_name: Mapped[str] = mapped_column(String(160), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    line_total: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    restaurant_order: Mapped[RestaurantOrder] = relationship(back_populates="lines")
