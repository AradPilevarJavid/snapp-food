from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator
from typing_extensions import Annotated


NonEmptyName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=160)]
Description = Annotated[str, StringConstraints(max_length=4000)]
Address = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=300)]
Money = Annotated[Decimal, Field(ge=0, max_digits=10, decimal_places=2)]
RestaurantOrderStatus = Literal["received", "preparing", "ready", "picked_up", "cancelled"]
RestaurantOrderStatusTarget = Literal["preparing", "ready", "picked_up", "cancelled"]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class RestaurantRead(BaseModel):
    id: int
    name: str
    description: str
    address: str
    is_active: bool

    model_config = ConfigDict(from_attributes=True)


class MenuItemRead(BaseModel):
    id: int
    restaurant_id: int
    name: str
    description: str
    price: Decimal
    is_available: bool

    model_config = ConfigDict(from_attributes=True)


class MenuItemCreate(StrictModel):
    name: NonEmptyName
    description: Description = ""
    price: Money
    is_available: bool = True


class MenuItemUpdate(StrictModel):
    name: NonEmptyName | None = None
    description: Description | None = None
    price: Money | None = None
    is_available: bool | None = None

    @model_validator(mode="after")
    def require_changes(self):
        if not self.model_fields_set:
            raise ValueError("At least one field must be provided")
        if any(getattr(self, field) is None for field in self.model_fields_set):
            raise ValueError("Fields cannot be null")
        return self


class OrderLineCreate(StrictModel):
    menu_item_id: int = Field(gt=0, strict=True)
    quantity: int = Field(gt=0, le=50, strict=True)


class OrderCreate(StrictModel):
    fulfillment_method: Literal["pickup"]
    items: list[OrderLineCreate] = Field(min_length=1, max_length=100)

    @model_validator(mode="after")
    def reject_duplicate_items(self):
        ids = [line.menu_item_id for line in self.items]
        if len(ids) != len(set(ids)):
            raise ValueError("Each menu item may appear only once")
        return self


class OrderLineRead(BaseModel):
    id: int
    menu_item_id: int | None
    item_name: str
    quantity: int
    unit_price: Decimal
    line_total: Decimal

    model_config = ConfigDict(from_attributes=True)


class RestaurantOrderRead(BaseModel):
    id: int
    restaurant_id: int
    restaurant_name: str
    status: RestaurantOrderStatus
    subtotal: Decimal
    lines: list[OrderLineRead]

    model_config = ConfigDict(from_attributes=True)


class ManagerIncomingOrderRead(BaseModel):
    id: int
    customer_order_id: int
    restaurant_id: int
    restaurant_name: str
    status: RestaurantOrderStatus
    subtotal: Decimal
    created_at: datetime
    fulfillment_method: str
    lines: list[OrderLineRead]
    allowed_next_statuses: list[RestaurantOrderStatusTarget]

    model_config = ConfigDict(from_attributes=True)


class RestaurantManagerRead(BaseModel):
    id: int
    name: str
    description: str
    address: str
    is_active: bool

    model_config = ConfigDict(from_attributes=True)


class RestaurantOrderStatusUpdate(StrictModel):
    status: RestaurantOrderStatusTarget


class OrderRead(BaseModel):
    id: int
    fulfillment_method: str
    total_amount: Decimal
    created_at: datetime
    restaurant_orders: list[RestaurantOrderRead]

    model_config = ConfigDict(from_attributes=True)


class ManagerApproval(StrictModel):
    oidc_subject: str = Field(min_length=1, max_length=255, pattern=r"^\S+$")
    restaurant_id: int = Field(gt=0, strict=True)
