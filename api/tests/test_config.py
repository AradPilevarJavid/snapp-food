from dataclasses import replace

import pytest

from api.config import ConfigurationError, Settings


@pytest.fixture
def settings():
    return Settings(
        app_env="test",
        database_url="sqlite://",
        oidc_issuer="https://identity.example.test/",
        oidc_audience="snapfood-api",
        oidc_jwks_url="https://identity.example.test/jwks",
        cors_origins=("https://frontend.example.test",),
    )


def test_configuration_rejects_missing_oidc_and_wildcard_cors(settings):
    with pytest.raises(ConfigurationError, match="OIDC_ISSUER"):
        replace(settings, oidc_issuer=None).validate()
    with pytest.raises(ConfigurationError, match="CORS_ORIGINS"):
        replace(settings, cors_origins=("*",)).validate()
    with pytest.raises(ConfigurationError, match="CORS_ORIGINS"):
        replace(settings, cors_origins=("https://*.pages.dev",)).validate()


def test_production_requires_verified_postgresql(settings):
    production = replace(settings, app_env="production")
    with pytest.raises(ConfigurationError, match="PostgreSQL"):
        production.validate()
    with pytest.raises(ConfigurationError, match="sslmode=verify-full"):
        replace(
            production,
            database_url="postgresql+psycopg://app:secret@db.example.test/app",
        ).validate()
    with pytest.raises(ConfigurationError, match="sslmode=verify-full"):
        replace(
            production,
            database_url="postgresql+psycopg://app:secret@db.example.test/app?notsslmode=verify-full",
        ).validate()
    replace(
        production,
        database_url="postgresql+psycopg://app:secret@db.example.test/app?sslmode=verify-full",
    ).validate()


def test_local_http_cors_is_limited_to_explicit_loopback(settings):
    replace(settings, cors_origins=("http://localhost:3000",)).validate()
    replace(settings, cors_origins=("https://snapfood.pages.dev",)).validate()
    with pytest.raises(ConfigurationError, match="HTTPS"):
        replace(settings, cors_origins=("http://frontend.example.test",)).validate()


def test_environment_must_be_explicit(monkeypatch):
    for name in (
        "APP_ENV",
        "DATABASE_URL",
        "OIDC_ISSUER",
        "OIDC_AUDIENCE",
        "OIDC_JWKS_URL",
        "CORS_ORIGINS",
    ):
        monkeypatch.delenv(name, raising=False)
    with pytest.raises(ConfigurationError, match="APP_ENV"):
        Settings.from_env().validate()
