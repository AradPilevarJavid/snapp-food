from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient

from api.config import Settings
from api.database import Base
from api.main import create_app
from api.models import MenuItem, Restaurant, RestaurantManager, User


class LocalJwksClient:
    def __init__(self, public_key):
        self.public_key = public_key

    def get_signing_key_from_jwt(self, _token):
        return SimpleNamespace(key=self.public_key)


@pytest.fixture
def api():
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    public_key = private_key.public_key()
    settings = Settings(
        app_env="test",
        database_url=f"sqlite:///{Path('api/tests').resolve() / f'.api-test-{os.getpid()}.sqlite3'}",
        oidc_issuer="https://identity.example.test/",
        oidc_audience="snapfood-api",
        oidc_jwks_url="https://identity.example.test/jwks",
        cors_origins=("https://frontend.example.test",),
    )
    app = create_app(settings, lambda _url: LocalJwksClient(public_key))
    with TestClient(app) as client:
        Base.metadata.create_all(app.state.engine)
        yield SimpleNamespace(
            client=client,
            private_key=private_key,
            session_factory=app.state.session_factory,
        )
    Path('api/tests', f'.api-test-{os.getpid()}.sqlite3').unlink(missing_ok=True)


def make_token(api, subject: str, **claims) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "iss": "https://identity.example.test/",
        "aud": "snapfood-api",
        "sub": subject,
        "iat": now,
        "exp": now + timedelta(minutes=5),
        **claims,
    }
    return jwt.encode(payload, api.private_key, algorithm="RS256", headers={"kid": "test-key"})


@pytest.fixture
def token_for(api):
    return lambda subject, **claims: make_token(api, subject, **claims)


@pytest.fixture
def seed_restaurants(api):
    session = api.session_factory()
    try:
        first = Restaurant(name="North Cafe", description="Coffee", address="1 Main")
        second = Restaurant(name="South Kitchen", description="Meals", address="2 Main")
        session.add_all([first, second])
        session.flush()
        soup = MenuItem(
            restaurant_id=first.id,
            name="Soup",
            description="Tomato soup",
            price="3.25",
            is_available=True,
        )
        cake = MenuItem(
            restaurant_id=second.id,
            name="Cake",
            description="Chocolate cake",
            price="5.80",
            is_available=True,
        )
        hidden = MenuItem(
            restaurant_id=first.id,
            name="Sold out",
            description="Unavailable",
            price="2.00",
            is_available=False,
        )
        session.add_all([soup, cake, hidden])
        session.commit()
        return {
            "first": first.id,
            "second": second.id,
            "soup": soup.id,
            "cake": cake.id,
            "hidden": hidden.id,
        }
    finally:
        session.close()


@pytest.fixture
def create_user(api):
    def create(subject, role="customer", restaurant_ids=()):
        session = api.session_factory()
        try:
            user = User(oidc_subject=subject, role=role)
            session.add(user)
            session.flush()
            for restaurant_id in restaurant_ids:
                session.add(RestaurantManager(user_id=user.id, restaurant_id=restaurant_id))
            session.commit()
            return user.id
        finally:
            session.close()

    return create
