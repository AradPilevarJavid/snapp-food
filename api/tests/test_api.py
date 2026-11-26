from datetime import datetime, timedelta, timezone
from decimal import Decimal
from concurrent.futures import ThreadPoolExecutor
from uuid import uuid4

import jwt
import pytest
from sqlalchemy.exc import IntegrityError

from api.models import (
    CustomerOrder,
    MenuItem,
    OrderIdempotencyRecord,
    RestaurantOrder,
    User,
)


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def order_auth(token, key="123e4567-e89b-42d3-a456-426614174000"):
    return {**auth(token), "Idempotency-Key": key}


def test_authentication_requires_and_validates_oidc(api, token_for):
    assert api.client.get("/orders/me").status_code == 401
    valid_token = token_for("customer-1", role="admin")
    response = api.client.get("/orders/me", headers=auth(valid_token))
    assert response.status_code == 200
    assert response.json() == []
    session = api.session_factory()
    try:
        user = session.query(User).filter_by(oidc_subject="customer-1").one()
        assert user.role == "customer"
    finally:
        session.close()

    wrong_issuer = token_for("customer-2", iss="https://attacker.example.test/")
    assert api.client.get("/orders/me", headers=auth(wrong_issuer)).status_code == 401
    wrong_audience = token_for("customer-3", aud="another-api")
    assert api.client.get("/orders/me", headers=auth(wrong_audience)).status_code == 401
    expired = token_for(
        "customer-4",
        exp=datetime.now(timezone.utc) - timedelta(minutes=1),
    )
    assert api.client.get("/orders/me", headers=auth(expired)).status_code == 401
    claims = {
        "iss": "https://identity.example.test/",
        "aud": "snapfood-api",
        "sub": "customer-5",
        "iat": datetime.now(timezone.utc),
        "exp": datetime.now(timezone.utc) + timedelta(minutes=5),
    }
    wrong_algorithm = jwt.encode(
        claims,
        "test-only-hmac-key-for-rejecting-algorithm-confusion",
        algorithm="HS256",
    )
    assert api.client.get("/orders/me", headers=auth(wrong_algorithm)).status_code == 401


def test_public_reads_hide_inactive_menu_items(api, seed_restaurants):
    ids = seed_restaurants
    restaurants = api.client.get("/restaurants")
    assert restaurants.status_code == 200
    assert {row["id"] for row in restaurants.json()} == {ids["first"], ids["second"]}
    menu = api.client.get(f"/restaurants/{ids['first']}/menu")
    assert menu.status_code == 200
    assert [row["id"] for row in menu.json()] == [ids["soup"]]
    assert api.client.get("/restaurants/9999/menu").status_code == 404


def test_checkout_splits_restaurant_rows_and_calculates_snapshots(
    api, seed_restaurants, token_for
):
    ids = seed_restaurants
    headers = order_auth(token_for("buyer"))
    response = api.client.post(
        "/orders",
        headers=headers,
        json={
            "fulfillment_method": "pickup",
            "items": [
                {"menu_item_id": ids["soup"], "quantity": 2},
                {"menu_item_id": ids["cake"], "quantity": 1},
            ],
        },
    )
    assert response.status_code == 201, response.text
    result = response.json()
    assert result["total_amount"] == "12.30"
    assert len(result["restaurant_orders"]) == 2
    assert {row["restaurant_id"] for row in result["restaurant_orders"]} == {
        ids["first"],
        ids["second"],
    }
    soup_snapshot = next(
        line
        for restaurant_order in result["restaurant_orders"]
        for line in restaurant_order["lines"]
        if line["menu_item_id"] == ids["soup"]
    )
    assert soup_snapshot["item_name"] == "Soup"
    assert soup_snapshot["unit_price"] == "3.25"
    assert soup_snapshot["line_total"] == "6.50"

    session = api.session_factory()
    try:
        item = session.get(MenuItem, ids["soup"])
        item.name = "Renamed Soup"
        item.price = Decimal("99.00")
        session.commit()
    finally:
        session.close()
    history = api.client.get("/orders/me", headers=headers)
    assert history.status_code == 200
    old_line = next(
        line
        for row in history.json()[0]["restaurant_orders"]
        for line in row["lines"]
        if line["menu_item_id"] == ids["soup"]
    )
    assert old_line["item_name"] == "Soup"
    assert old_line["unit_price"] == "3.25"


def test_checkout_rejects_client_prices_delivery_invalid_or_unavailable_items(
    api, seed_restaurants, token_for
):
    ids = seed_restaurants
    headers = order_auth(token_for("buyer"))
    base_item = {"menu_item_id": ids["soup"], "quantity": 1}
    delivery = api.client.post(
        "/orders",
        headers=headers,
        json={"fulfillment_method": "delivery", "items": [base_item]},
    )
    assert delivery.status_code == 422
    client_price = api.client.post(
        "/orders",
        headers=headers,
        json={
            "fulfillment_method": "pickup",
            "items": [{**base_item, "price": "0.01"}],
        },
    )
    assert client_price.status_code == 422
    client_total = api.client.post(
        "/orders",
        headers=headers,
        json={
            "fulfillment_method": "pickup",
            "items": [base_item],
            "total_amount": "0.01",
            "response_payload": {"id": 1},
        },
    )
    assert client_total.status_code == 422
    bad_quantity = api.client.post(
        "/orders",
        headers=headers,
        json={
            "fulfillment_method": "pickup",
            "items": [{"menu_item_id": ids["soup"], "quantity": 0}],
        },
    )
    assert bad_quantity.status_code == 422
    unavailable = api.client.post(
        "/orders",
        headers=headers,
        json={
            "fulfillment_method": "pickup",
            "items": [{"menu_item_id": ids["hidden"], "quantity": 1}],
        },
    )
    assert unavailable.status_code == 422


def test_checkout_requires_valid_uuid_idempotency_key(api, seed_restaurants, token_for):
    ids = seed_restaurants
    headers = auth(token_for("buyer"))
    body = {
        "fulfillment_method": "pickup",
        "items": [{"menu_item_id": ids["soup"], "quantity": 1}],
    }
    assert api.client.post("/orders", headers=headers, json=body).status_code == 422
    assert api.client.post(
        "/orders",
        headers={**headers, "Idempotency-Key": "not-a-uuid"},
        json=body,
    ).status_code == 422
    assert api.client.post(
        "/orders",
        headers=order_auth(token_for("buyer"), str(uuid4())),
        json={**body, "unit_price": "0.01"},
    ).status_code == 422
    session = api.session_factory()
    try:
        assert session.query(CustomerOrder).count() == 0
        assert session.query(OrderIdempotencyRecord).count() == 0
    finally:
        session.close()


def test_checkout_idempotency_replays_exact_result_and_rejects_changed_payload(
    api, seed_restaurants, token_for
):
    ids = seed_restaurants
    key = str(uuid4())
    token = token_for("buyer")
    body = {
        "fulfillment_method": "pickup",
        "items": [
            {"menu_item_id": ids["soup"], "quantity": 2},
            {"menu_item_id": ids["cake"], "quantity": 1},
        ],
    }
    first = api.client.post("/orders", headers=order_auth(token, key), json=body)
    assert first.status_code == 201, first.text
    original_response = first.json()

    session = api.session_factory()
    try:
        restaurant_order = session.query(RestaurantOrder).filter_by(
            customer_order_id=original_response["id"],
            restaurant_id=ids["first"],
        ).one()
        restaurant_order.status = "preparing"
        session.commit()
    finally:
        session.close()

    # Item order is not semantically significant in a cart fingerprint.
    retry_body = {**body, "items": list(reversed(body["items"]))}
    retry = api.client.post("/orders", headers=order_auth(token, key), json=retry_body)
    assert retry.status_code == 201
    assert retry.json() == original_response

    changed_payload = {
        "fulfillment_method": "pickup",
        "items": [{"menu_item_id": ids["soup"], "quantity": 3}],
    }
    conflict = api.client.post(
        "/orders",
        headers=order_auth(token, key),
        json=changed_payload,
    )
    assert conflict.status_code == 409

    session = api.session_factory()
    try:
        assert session.query(CustomerOrder).count() == 1
        assert session.query(OrderIdempotencyRecord).count() == 1
        record = session.query(OrderIdempotencyRecord).one()
        assert record.order_id == original_response["id"]
        assert record.response_payload == original_response
    finally:
        session.close()

    # The key scope is the authenticated customer, not a global namespace.
    other_customer = api.client.post(
        "/orders",
        headers=order_auth(token_for("another-buyer"), key),
        json=changed_payload,
    )
    assert other_customer.status_code == 201
    assert other_customer.json()["id"] != original_response["id"]


def test_idempotency_customer_key_uniqueness_is_database_enforced(
    api, seed_restaurants, token_for
):
    ids = seed_restaurants
    key = str(uuid4())
    response = api.client.post(
        "/orders",
        headers=order_auth(token_for("buyer"), key),
        json={
            "fulfillment_method": "pickup",
            "items": [{"menu_item_id": ids["soup"], "quantity": 1}],
        },
    )
    assert response.status_code == 201

    session = api.session_factory()
    try:
        user = session.query(User).filter_by(oidc_subject="buyer").one()
        second_order = CustomerOrder(
            customer_id=user.id,
            fulfillment_method="pickup",
            total_amount=Decimal("0.00"),
        )
        session.add(second_order)
        session.flush()
        session.add(
            OrderIdempotencyRecord(
                customer_id=user.id,
                idempotency_key=key,
                request_hash="0" * 64,
                order_id=second_order.id,
                response_payload={},
            )
        )
        with pytest.raises(IntegrityError):
            session.commit()
        session.rollback()
        assert session.query(CustomerOrder).count() == 1
        assert session.query(OrderIdempotencyRecord).count() == 1
    finally:
        session.close()


def test_concurrent_same_key_checkouts_persist_only_one_order(
    api, seed_restaurants, create_user, token_for
):
    ids = seed_restaurants
    create_user("buyer")
    headers = order_auth(token_for("buyer"), str(uuid4()))
    body = {
        "fulfillment_method": "pickup",
        "items": [
            {"menu_item_id": ids["soup"], "quantity": 1},
            {"menu_item_id": ids["cake"], "quantity": 2},
        ],
    }

    def checkout():
        return api.client.post("/orders", headers=headers, json=body)

    with ThreadPoolExecutor(max_workers=2) as executor:
        responses = list(executor.map(lambda _index: checkout(), range(2)))

    assert [response.status_code for response in responses] == [201, 201]
    assert responses[0].json() == responses[1].json()
    session = api.session_factory()
    try:
        assert session.query(CustomerOrder).count() == 1
        assert session.query(OrderIdempotencyRecord).count() == 1
    finally:
        session.close()


def test_order_history_is_owned_by_authenticated_customer(api, seed_restaurants, token_for):
    ids = seed_restaurants
    alice = order_auth(token_for("alice"))
    response = api.client.post(
        "/orders",
        headers=alice,
        json={
            "fulfillment_method": "pickup",
            "items": [{"menu_item_id": ids["soup"], "quantity": 1}],
        },
    )
    assert response.status_code == 201
    assert len(api.client.get("/orders/me", headers=alice).json()) == 1
    assert api.client.get("/orders/me", headers=auth(token_for("bob"))).json() == []


def test_manager_access_and_incoming_orders_are_restaurant_scoped(
    api, seed_restaurants, create_user, token_for
):
    ids = seed_restaurants
    create_user("manager", "manager", (ids["first"],))
    customer_token = order_auth(token_for("buyer"))
    order = api.client.post(
        "/orders",
        headers=customer_token,
        json={
            "fulfillment_method": "pickup",
            "items": [
                {"menu_item_id": ids["soup"], "quantity": 1},
                {"menu_item_id": ids["cake"], "quantity": 1},
            ],
        },
    )
    assert order.status_code == 201
    manager_headers = auth(token_for("manager"))
    own_orders = api.client.get(
        f"/manager/restaurants/{ids['first']}/orders", headers=manager_headers
    )
    assert own_orders.status_code == 200
    assert len(own_orders.json()) == 1
    assert own_orders.json()[0]["restaurant_id"] == ids["first"]
    assert own_orders.json()[0]["restaurant_name"] == "North Cafe"
    assert own_orders.json()[0]["created_at"]
    assert own_orders.json()[0]["fulfillment_method"] == "pickup"
    assert len(own_orders.json()[0]["lines"]) == 1
    assert own_orders.json()[0]["allowed_next_statuses"] == ["preparing", "cancelled"]
    assert "received" not in own_orders.json()[0]["allowed_next_statuses"]
    assert api.client.get(
        f"/manager/restaurants/{ids['second']}/orders", headers=manager_headers
    ).status_code == 403
    assert api.client.get(
        f"/manager/restaurants/{ids['second']}/menu", headers=manager_headers
    ).status_code == 403


def test_manager_restaurant_list_is_only_assigned_restaurants(
    api, seed_restaurants, create_user, token_for
):
    ids = seed_restaurants
    create_user("manager", "manager", (ids["first"],))
    manager_response = api.client.get(
        "/manager/restaurants",
        headers=auth(token_for("manager")),
    )
    assert manager_response.status_code == 200
    assert [row["id"] for row in manager_response.json()] == [ids["first"]]
    assert manager_response.json()[0]["name"] == "North Cafe"

    customer_response = api.client.get(
        "/manager/restaurants",
        headers=auth(token_for("customer")),
    )
    assert customer_response.status_code == 403

    session = api.session_factory()
    try:
        session.add(User(oidc_subject="admin", role="admin"))
        session.commit()
    finally:
        session.close()
    admin_response = api.client.get(
        "/manager/restaurants",
        headers=auth(token_for("admin")),
    )
    assert admin_response.status_code == 403


def test_manager_updates_only_scoped_order_with_allowed_transitions(
    api, seed_restaurants, create_user, token_for
):
    ids = seed_restaurants
    create_user("manager", "manager", (ids["first"],))
    order_response = api.client.post(
        "/orders",
        headers=order_auth(token_for("buyer")),
        json={
            "fulfillment_method": "pickup",
            "items": [
                {"menu_item_id": ids["soup"], "quantity": 1},
                {"menu_item_id": ids["cake"], "quantity": 1},
            ],
        },
    )
    assert order_response.status_code == 201
    own_order = next(
        row for row in order_response.json()["restaurant_orders"]
        if row["restaurant_id"] == ids["first"]
    )
    other_order = next(
        row for row in order_response.json()["restaurant_orders"]
        if row["restaurant_id"] == ids["second"]
    )
    manager = auth(token_for("manager"))

    changed = api.client.patch(
        f"/manager/restaurants/{ids['first']}/orders/{own_order['id']}",
        headers=manager,
        json={"status": "preparing"},
    )
    assert changed.status_code == 200, changed.text
    assert changed.json()["status"] == "preparing"
    assert changed.json()["restaurant_id"] == ids["first"]
    assert set(changed.json()) == {
        "id",
        "customer_order_id",
        "restaurant_id",
        "restaurant_name",
        "status",
        "subtotal",
        "created_at",
        "fulfillment_method",
        "lines",
        "allowed_next_statuses",
    }
    assert changed.json()["allowed_next_statuses"] == ["ready", "cancelled"]
    assert "received" not in changed.json()["allowed_next_statuses"]
    assert len(changed.json()["lines"]) == 1

    assert api.client.patch(
        f"/manager/restaurants/{ids['first']}/orders/{own_order['id']}",
        headers=manager,
        json={"status": "picked_up"},
    ).status_code == 409
    assert api.client.patch(
        f"/manager/restaurants/{ids['first']}/orders/{own_order['id']}",
        headers=manager,
        json={"status": "received"},
    ).status_code == 422
    assert api.client.patch(
        f"/manager/restaurants/{ids['first']}/orders/{own_order['id']}",
        headers=manager,
        json={"status": "unknown"},
    ).status_code == 422
    assert api.client.patch(
        f"/manager/restaurants/{ids['first']}/orders/{other_order['id']}",
        headers=manager,
        json={"status": "preparing"},
    ).status_code == 404
    assert api.client.patch(
        f"/manager/restaurants/{ids['second']}/orders/{other_order['id']}",
        headers=manager,
        json={"status": "preparing"},
    ).status_code == 403
    assert api.client.patch(
        f"/manager/restaurants/{ids['first']}/orders/{own_order['id']}",
        headers=auth(token_for("customer")),
        json={"status": "preparing"},
    ).status_code == 403

    for next_status in ("ready", "picked_up"):
        changed = api.client.patch(
            f"/manager/restaurants/{ids['first']}/orders/{own_order['id']}",
            headers=manager,
            json={"status": next_status},
        )
        assert changed.status_code == 200
        assert changed.json()["status"] == next_status
        expected_next = ["picked_up", "cancelled"] if next_status == "ready" else []
        assert changed.json()["allowed_next_statuses"] == expected_next

    terminal = api.client.patch(
        f"/manager/restaurants/{ids['first']}/orders/{own_order['id']}",
        headers=manager,
        json={"status": "cancelled"},
    )
    assert terminal.status_code == 409


def test_manager_crud_and_admin_only_approval(api, seed_restaurants, create_user, token_for):
    ids = seed_restaurants
    manager_id = create_user("manager", "manager", (ids["first"],))
    manager = auth(token_for("manager"))
    created = api.client.post(
        f"/manager/restaurants/{ids['first']}/menu",
        headers=manager,
        json={"name": "Tea", "price": "2.50"},
    )
    assert created.status_code == 201
    assert created.json()["is_available"] is True
    hidden = api.client.patch(
        f"/manager/restaurants/{ids['first']}/menu/{created.json()['id']}",
        headers=manager,
        json={"is_available": False},
    )
    assert hidden.status_code == 200, hidden.text
    assert hidden.json()["is_available"] is False
    assert api.client.delete(
        f"/manager/restaurants/{ids['first']}/menu/{created.json()['id']}",
        headers=auth(token_for("customer")),
    ).status_code == 403

    customer = auth(token_for("customer"))
    denied = api.client.post(
        "/admin/managers",
        headers=customer,
        json={"oidc_subject": "new-manager", "restaurant_id": ids["second"]},
    )
    assert denied.status_code == 403

    session = api.session_factory()
    try:
        session.add(User(oidc_subject="admin", role="admin"))
        session.commit()
    finally:
        session.close()
    approved = api.client.post(
        "/admin/managers",
        headers=auth(token_for("admin")),
        json={"oidc_subject": "new-manager", "restaurant_id": ids["second"]},
    )
    assert approved.status_code == 204
    manager_menu = api.client.get(
        f"/manager/restaurants/{ids['second']}/menu",
        headers=auth(token_for("new-manager")),
    )
    assert manager_menu.status_code == 200

    session = api.session_factory()
    try:
        assert session.get(User, manager_id).role == "manager"
    finally:
        session.close()


def test_openapi_contract_exposes_routes(api):
    schema = api.client.get("/openapi.json").json()
    assert "/orders" in schema["paths"]
    assert "/manager/restaurants" in schema["paths"]
    assert "/manager/restaurants/{restaurant_id}/orders" in schema["paths"]
    assert "/manager/restaurants/{restaurant_id}/orders/{restaurant_order_id}" in schema["paths"]
    statuses = schema["components"]["schemas"]["RestaurantOrderStatusUpdate"]
    expected_target_statuses = [
        "preparing",
        "ready",
        "picked_up",
        "cancelled",
    ]
    assert statuses["properties"]["status"]["enum"] == expected_target_statuses
    status_patch = schema["paths"][
        "/manager/restaurants/{restaurant_id}/orders/{restaurant_order_id}"
    ]["patch"]
    assert status_patch["responses"]["200"]["content"]["application/json"]["schema"]["$ref"] == (
        "#/components/schemas/ManagerIncomingOrderRead"
    )
    manager_order_schema = schema["components"]["schemas"]["ManagerIncomingOrderRead"]
    restaurant_order_schema = schema["components"]["schemas"]["RestaurantOrderRead"]
    expected_order_statuses = ["received", "preparing", "ready", "picked_up", "cancelled"]
    assert manager_order_schema["properties"]["status"]["enum"] == expected_order_statuses
    assert restaurant_order_schema["properties"]["status"]["enum"] == expected_order_statuses
    assert manager_order_schema["properties"]["allowed_next_statuses"]["type"] == "array"
    assert manager_order_schema["properties"]["allowed_next_statuses"]["items"]["enum"] == (
        expected_target_statuses
    )
    assert {
        "id",
        "customer_order_id",
        "restaurant_id",
        "restaurant_name",
        "status",
        "subtotal",
        "created_at",
        "fulfillment_method",
        "lines",
        "allowed_next_statuses",
    } == set(manager_order_schema["properties"])
    assert schema["components"]["securitySchemes"]["HTTPBearer"]["scheme"] == "bearer"
    parameters = schema["paths"]["/orders"]["post"]["parameters"]
    idempotency_header = next(
        parameter
        for parameter in parameters
        if parameter["in"] == "header" and parameter["name"] == "Idempotency-Key"
    )
    assert idempotency_header["required"] is True
    assert idempotency_header["schema"]["format"] == "uuid"


def test_cors_preflight_allows_idempotency_key(api):
    response = api.client.options(
        "/orders",
        headers={
            "Origin": "https://frontend.example.test",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "authorization,content-type,idempotency-key",
        },
    )
    assert response.status_code == 200
    assert "idempotency-key" in response.headers["access-control-allow-headers"].lower()
