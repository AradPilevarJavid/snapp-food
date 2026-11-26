from __future__ import annotations

import hashlib
import json
from collections import defaultdict
from contextlib import asynccontextmanager
from decimal import Decimal, ROUND_HALF_UP
from typing import Annotated
from uuid import UUID

from fastapi import Depends, FastAPI, Header, HTTPException, Query, Response, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from api.auth import get_current_user, require_admin, require_customer
from api.config import Settings
from api.database import build_engine, build_session_factory, get_session
from api.models import (
    CustomerOrder,
    MenuItem,
    OrderLine,
    OrderIdempotencyRecord,
    RESTAURANT_ORDER_TRANSITIONS,
    Restaurant,
    RestaurantManager,
    RestaurantOrder,
    User,
)
from api.schemas import (
    ManagerApproval,
    ManagerIncomingOrderRead,
    MenuItemCreate,
    MenuItemRead,
    MenuItemUpdate,
    OrderCreate,
    OrderRead,
    RestaurantManagerRead,
    RestaurantOrderStatusUpdate,
    RestaurantRead,
)

SessionDep = Annotated[Session, Depends(get_session)]


def create_app(settings: Settings | None = None, jwks_client_factory=None) -> FastAPI:
    resolved_settings = settings or Settings.from_env()

    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        resolved_settings.validate()
        engine = build_engine(resolved_settings)
        _app.state.engine = engine
        _app.state.session_factory = build_session_factory(engine)
        try:
            yield
        finally:
            engine.dispose()

    app = FastAPI(
        title="Snapfood API",
        version="1.0.0",
        description=(
            "Pickup-only restaurant ordering API. OIDC identity is authenticated by the API; "
            "customer roles and manager ownership are enforced from the database."
        ),
        lifespan=lifespan,
        openapi_url="/openapi.json",
        docs_url="/docs",
        redoc_url="/redoc",
    )
    app.state.settings = resolved_settings
    app.state.engine = None
    app.state.session_factory = None

    if jwks_client_factory is None:
        from api.auth import jwks_client

        jwks_client_factory = jwks_client
    app.state.jwks_client_factory = jwks_client_factory

    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(resolved_settings.cors_origins),
        allow_credentials=False,
        allow_methods=["GET", "POST", "PATCH", "DELETE"],
        allow_headers=["Authorization", "Content-Type", "Idempotency-Key"],
        max_age=600,
    )

    @app.get("/health", tags=["service"], include_in_schema=False)
    def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/restaurants", response_model=list[RestaurantRead], tags=["restaurants"])
    def list_restaurants(db: SessionDep):
        return db.scalars(
            select(Restaurant).where(Restaurant.is_active.is_(True)).order_by(Restaurant.name, Restaurant.id)
        ).all()

    @app.get("/restaurants/{restaurant_id}", response_model=RestaurantRead, tags=["restaurants"])
    def read_restaurant(restaurant_id: int, db: SessionDep):
        restaurant = db.scalar(
            select(Restaurant).where(
                Restaurant.id == restaurant_id,
                Restaurant.is_active.is_(True),
            )
        )
        if restaurant is None:
            raise HTTPException(status_code=404, detail="Restaurant not found")
        return restaurant

    @app.get(
        "/restaurants/{restaurant_id}/menu",
        response_model=list[MenuItemRead],
        tags=["restaurants"],
    )
    def read_menu(restaurant_id: int, db: SessionDep):
        restaurant = db.scalar(
            select(Restaurant).where(
                Restaurant.id == restaurant_id,
                Restaurant.is_active.is_(True),
            )
        )
        if restaurant is None:
            raise HTTPException(status_code=404, detail="Restaurant not found")
        return db.scalars(
            select(MenuItem)
            .where(MenuItem.restaurant_id == restaurant_id, MenuItem.is_available.is_(True))
            .order_by(MenuItem.name, MenuItem.id)
        ).all()

    def require_restaurant_manager(
        restaurant_id: int, user: User, db: Session
    ) -> Restaurant:
        if user.role != "manager":
            raise HTTPException(status_code=403, detail="Approved restaurant manager access required")
        restaurant = db.scalar(
            select(Restaurant)
            .join(RestaurantManager, RestaurantManager.restaurant_id == Restaurant.id)
            .where(
                Restaurant.id == restaurant_id,
                RestaurantManager.user_id == user.id,
            )
        )
        if restaurant is None:
            raise HTTPException(status_code=403, detail="No access to this restaurant")
        return restaurant

    @app.get(
        "/manager/restaurants",
        response_model=list[RestaurantManagerRead],
        tags=["manager"],
        summary="List restaurants assigned to the current manager",
    )
    def manager_restaurants(
        db: SessionDep,
        user: Annotated[User, Depends(get_current_user)],
    ):
        if user.role != "manager":
            raise HTTPException(status_code=403, detail="Approved restaurant manager access required")
        return db.scalars(
            select(Restaurant)
            .join(RestaurantManager, RestaurantManager.restaurant_id == Restaurant.id)
            .where(RestaurantManager.user_id == user.id)
            .order_by(Restaurant.name, Restaurant.id)
        ).all()

    @app.get(
        "/manager/restaurants/{restaurant_id}/menu",
        response_model=list[MenuItemRead],
        tags=["manager"],
    )
    def manager_menu(
        restaurant_id: int,
        db: SessionDep,
        user: Annotated[User, Depends(get_current_user)],
    ):
        require_restaurant_manager(restaurant_id, user, db)
        return db.scalars(
            select(MenuItem).where(MenuItem.restaurant_id == restaurant_id).order_by(MenuItem.name, MenuItem.id)
        ).all()

    @app.post(
        "/manager/restaurants/{restaurant_id}/menu",
        response_model=MenuItemRead,
        status_code=status.HTTP_201_CREATED,
        tags=["manager"],
    )
    def create_menu_item(
        restaurant_id: int,
        payload: MenuItemCreate,
        db: SessionDep,
        user: Annotated[User, Depends(get_current_user)],
    ):
        require_restaurant_manager(restaurant_id, user, db)
        item = MenuItem(restaurant_id=restaurant_id, **payload.model_dump())
        db.add(item)
        db.commit()
        db.refresh(item)
        return item

    @app.patch(
        "/manager/restaurants/{restaurant_id}/menu/{item_id}",
        response_model=MenuItemRead,
        tags=["manager"],
    )
    def update_menu_item(
        restaurant_id: int,
        item_id: int,
        payload: MenuItemUpdate,
        db: SessionDep,
        user: Annotated[User, Depends(get_current_user)],
    ):
        require_restaurant_manager(restaurant_id, user, db)
        item = db.scalar(
            select(MenuItem)
            .where(MenuItem.id == item_id, MenuItem.restaurant_id == restaurant_id)
            .with_for_update()
        )
        if item is None:
            raise HTTPException(status_code=404, detail="Menu item not found")
        for field, value in payload.model_dump(exclude_unset=True).items():
            setattr(item, field, value)
        db.commit()
        db.refresh(item)
        return item

    @app.delete(
        "/manager/restaurants/{restaurant_id}/menu/{item_id}",
        status_code=status.HTTP_204_NO_CONTENT,
        tags=["manager"],
    )
    def delete_menu_item(
        restaurant_id: int,
        item_id: int,
        db: SessionDep,
        user: Annotated[User, Depends(get_current_user)],
    ):
        require_restaurant_manager(restaurant_id, user, db)
        item = db.scalar(
            select(MenuItem)
            .where(MenuItem.id == item_id, MenuItem.restaurant_id == restaurant_id)
            .with_for_update()
        )
        if item is None:
            raise HTTPException(status_code=404, detail="Menu item not found")
        db.delete(item)
        db.commit()
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    @app.post("/orders", response_model=OrderRead, status_code=status.HTTP_201_CREATED, tags=["orders"])
    def create_order(
        payload: OrderCreate,
        db: SessionDep,
        user: Annotated[User, Depends(require_customer)],
        idempotency_key: Annotated[UUID, Header(alias="Idempotency-Key")],
    ):
        canonical_request = {
            "fulfillment_method": payload.fulfillment_method,
            "items": sorted(
                (
                    {"menu_item_id": line.menu_item_id, "quantity": line.quantity}
                    for line in payload.items
                ),
                key=lambda item: item["menu_item_id"],
            ),
        }
        request_hash = hashlib.sha256(
            json.dumps(canonical_request, sort_keys=True, separators=(",", ":")).encode("utf-8")
        ).hexdigest()
        idempotency_record = OrderIdempotencyRecord(
            customer_id=user.id,
            idempotency_key=str(idempotency_key),
            request_hash=request_hash,
        )
        db.add(idempotency_record)
        try:
            db.flush()
        except IntegrityError:
            db.rollback()
            existing_record = db.scalar(
                select(OrderIdempotencyRecord).where(
                    OrderIdempotencyRecord.customer_id == user.id,
                    OrderIdempotencyRecord.idempotency_key == str(idempotency_key),
                )
            )
            if existing_record is None:
                raise HTTPException(status_code=503, detail="Checkout could not be completed") from None
            if existing_record.request_hash != request_hash:
                raise HTTPException(
                    status_code=409,
                    detail="Idempotency key was already used with a different checkout",
                )
            if not isinstance(existing_record.response_payload, dict):
                raise HTTPException(status_code=503, detail="Checkout result is unavailable")
            return OrderRead.model_validate(existing_record.response_payload)

        item_ids = [line.menu_item_id for line in payload.items]
        menu_items = db.scalars(
            select(MenuItem)
            .options(selectinload(MenuItem.restaurant))
            .where(MenuItem.id.in_(item_ids))
            .with_for_update()
        ).all()
        items_by_id = {item.id: item for item in menu_items}
        if len(items_by_id) != len(item_ids):
            raise HTTPException(status_code=422, detail="One or more menu items are unavailable")
        for line in payload.items:
            item = items_by_id[line.menu_item_id]
            if not item.is_available or not item.restaurant.is_active:
                raise HTTPException(status_code=422, detail="One or more menu items are unavailable")

        restaurant_ids = {item.restaurant_id for item in menu_items}
        locked_restaurants = db.scalars(
            select(Restaurant)
            .where(Restaurant.id.in_(restaurant_ids))
            .with_for_update()
            .execution_options(populate_existing=True)
        ).all()
        active_restaurant_ids = {restaurant.id for restaurant in locked_restaurants if restaurant.is_active}
        if active_restaurant_ids != restaurant_ids:
            raise HTTPException(status_code=422, detail="One or more menu items are unavailable")

        grouped: dict[int, list[tuple[MenuItem, int]]] = defaultdict(list)
        for line in payload.items:
            item = items_by_id[line.menu_item_id]
            grouped[item.restaurant_id].append((item, line.quantity))

        restaurant_orders: list[RestaurantOrder] = []
        grand_total = Decimal("0.00")
        for restaurant_id, requested_items in grouped.items():
            restaurant = requested_items[0][0].restaurant
            subtotal = Decimal("0.00")
            lines: list[OrderLine] = []
            for item, quantity in requested_items:
                price = Decimal(item.price).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
                line_total = (price * quantity).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
                subtotal += line_total
                lines.append(
                    OrderLine(
                        menu_item_id=item.id,
                        item_name=item.name,
                        quantity=quantity,
                        unit_price=price,
                        line_total=line_total,
                    )
                )
            subtotal = subtotal.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
            grand_total += subtotal
            restaurant_orders.append(
                RestaurantOrder(
                    restaurant_id=restaurant_id,
                    restaurant_name=restaurant.name,
                    subtotal=subtotal,
                    lines=lines,
                )
            )

        order = CustomerOrder(
            customer_id=user.id,
            fulfillment_method=payload.fulfillment_method,
            total_amount=grand_total.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP),
            restaurant_orders=restaurant_orders,
        )
        db.add(order)
        db.flush()
        completed_order = db.scalar(
            select(CustomerOrder)
            .options(
                selectinload(CustomerOrder.restaurant_orders).selectinload(RestaurantOrder.lines)
            )
            .where(CustomerOrder.id == order.id)
        )
        if completed_order is None:
            db.rollback()
            raise HTTPException(status_code=503, detail="Checkout result is unavailable")
        response = OrderRead.model_validate(completed_order)
        idempotency_record.order_id = order.id
        idempotency_record.response_payload = response.model_dump(mode="json")
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            existing_record = db.scalar(
                select(OrderIdempotencyRecord).where(
                    OrderIdempotencyRecord.customer_id == user.id,
                    OrderIdempotencyRecord.idempotency_key == str(idempotency_key),
                )
            )
            if existing_record is None:
                raise HTTPException(status_code=503, detail="Checkout could not be completed") from None
            if existing_record.request_hash != request_hash:
                raise HTTPException(
                    status_code=409,
                    detail="Idempotency key was already used with a different checkout",
                )
            if not isinstance(existing_record.response_payload, dict):
                raise HTTPException(status_code=503, detail="Checkout result is unavailable")
            return OrderRead.model_validate(existing_record.response_payload)
        return response

    @app.get("/orders/me", response_model=list[OrderRead], tags=["orders"])
    def customer_order_history(
        db: SessionDep,
        user: Annotated[User, Depends(require_customer)],
        limit: int = Query(default=50, ge=1, le=100),
        offset: int = Query(default=0, ge=0, le=10000),
    ):
        return db.scalars(
            select(CustomerOrder)
            .options(
                selectinload(CustomerOrder.restaurant_orders).selectinload(RestaurantOrder.lines)
            )
            .where(CustomerOrder.customer_id == user.id)
            .order_by(CustomerOrder.created_at.desc(), CustomerOrder.id.desc())
            .limit(limit)
            .offset(offset)
        ).all()

    @app.get(
        "/manager/restaurants/{restaurant_id}/orders",
        response_model=list[ManagerIncomingOrderRead],
        tags=["manager"],
    )
    def manager_orders(
        restaurant_id: int,
        db: SessionDep,
        user: Annotated[User, Depends(get_current_user)],
        limit: int = Query(default=50, ge=1, le=100),
        offset: int = Query(default=0, ge=0, le=10000),
    ):
        require_restaurant_manager(restaurant_id, user, db)
        orders = db.scalars(
            select(RestaurantOrder)
            .join(CustomerOrder, CustomerOrder.id == RestaurantOrder.customer_order_id)
            .options(
                selectinload(RestaurantOrder.lines),
                selectinload(RestaurantOrder.customer_order),
            )
            .where(RestaurantOrder.restaurant_id == restaurant_id)
            .order_by(CustomerOrder.created_at.desc(), CustomerOrder.id.desc())
            .limit(limit)
            .offset(offset)
        ).unique().all()
        return [manager_order_read(order) for order in orders]

    def manager_order_read(restaurant_order: RestaurantOrder) -> ManagerIncomingOrderRead:
        return ManagerIncomingOrderRead.model_validate(
            {
                "id": restaurant_order.id,
                "customer_order_id": restaurant_order.customer_order_id,
                "restaurant_id": restaurant_order.restaurant_id,
                "restaurant_name": restaurant_order.restaurant_name,
                "status": restaurant_order.status,
                "subtotal": restaurant_order.subtotal,
                "created_at": restaurant_order.created_at,
                "fulfillment_method": restaurant_order.fulfillment_method,
                "lines": restaurant_order.lines,
                "allowed_next_statuses": RESTAURANT_ORDER_TRANSITIONS.get(
                    restaurant_order.status, ()
                ),
            }
        )

    @app.patch(
        "/manager/restaurants/{restaurant_id}/orders/{restaurant_order_id}",
        response_model=ManagerIncomingOrderRead,
        tags=["manager"],
        summary="Update an incoming restaurant order status",
    )
    def update_restaurant_order_status(
        restaurant_id: int,
        restaurant_order_id: int,
        payload: RestaurantOrderStatusUpdate,
        db: SessionDep,
        user: Annotated[User, Depends(get_current_user)],
    ):
        require_restaurant_manager(restaurant_id, user, db)
        restaurant_order = db.scalar(
            select(RestaurantOrder)
            .where(
                RestaurantOrder.id == restaurant_order_id,
                RestaurantOrder.restaurant_id == restaurant_id,
            )
            .with_for_update()
        )
        if restaurant_order is None:
            raise HTTPException(status_code=404, detail="Restaurant order not found")
        allowed_transitions = RESTAURANT_ORDER_TRANSITIONS.get(restaurant_order.status)
        if allowed_transitions is None or payload.status not in allowed_transitions:
            raise HTTPException(
                status_code=409,
                detail=f"Order cannot transition from {restaurant_order.status} to {payload.status}",
            )
        restaurant_order.status = payload.status
        db.commit()
        db.refresh(restaurant_order)
        return manager_order_read(restaurant_order)

    @app.post(
        "/admin/managers",
        status_code=status.HTTP_204_NO_CONTENT,
        tags=["admin"],
        summary="Approve a manager for one restaurant",
    )
    def approve_manager(
        payload: ManagerApproval,
        db: SessionDep,
        _admin: Annotated[User, Depends(require_admin)],
    ):
        restaurant = db.get(Restaurant, payload.restaurant_id)
        if restaurant is None:
            raise HTTPException(status_code=404, detail="Restaurant not found")
        manager = db.scalar(
            select(User).where(User.oidc_subject == payload.oidc_subject).with_for_update()
        )
        if manager is None:
            manager = User(oidc_subject=payload.oidc_subject, role="manager")
            db.add(manager)
            db.flush()
        elif manager.role == "admin":
            raise HTTPException(status_code=409, detail="Administrator cannot be assigned as a manager")
        else:
            manager.role = "manager"
        association = db.get(
            RestaurantManager,
            {"user_id": manager.id, "restaurant_id": restaurant.id},
        )
        if association is None:
            db.add(RestaurantManager(user_id=manager.id, restaurant_id=restaurant.id))
        db.commit()
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    return app


app = create_app()
