from __future__ import annotations

import os
from dataclasses import dataclass
from urllib.parse import parse_qs, urlparse


class ConfigurationError(RuntimeError):
    pass


@dataclass(frozen=True)
class Settings:
    app_env: str
    database_url: str
    oidc_issuer: str | None
    oidc_audience: str | None
    oidc_jwks_url: str | None
    cors_origins: tuple[str, ...]

    @classmethod
    def from_env(cls) -> "Settings":
        origins = os.getenv("CORS_ORIGINS", "")
        return cls(
            app_env=os.getenv("APP_ENV", "").strip().lower(),
            database_url=os.getenv("DATABASE_URL", "").strip(),
            oidc_issuer=os.getenv("OIDC_ISSUER", "").strip() or None,
            oidc_audience=os.getenv("OIDC_AUDIENCE", "").strip() or None,
            oidc_jwks_url=os.getenv("OIDC_JWKS_URL", "").strip() or None,
            cors_origins=tuple(origin.strip() for origin in origins.split(",") if origin.strip()),
        )

    def validate(self) -> None:
        if self.app_env not in {"development", "test", "production"}:
            raise ConfigurationError("APP_ENV must be development, test, or production")
        if not self.database_url:
            raise ConfigurationError("DATABASE_URL is required")
        if not all((self.oidc_issuer, self.oidc_audience, self.oidc_jwks_url)):
            raise ConfigurationError(
                "OIDC_ISSUER, OIDC_AUDIENCE, and OIDC_JWKS_URL are required"
            )
        if not self.cors_origins or any("*" in origin for origin in self.cors_origins):
            raise ConfigurationError("CORS_ORIGINS must contain explicit origins; '*' is not allowed")

        for value, label in (
            (self.oidc_issuer, "OIDC_ISSUER"),
            (self.oidc_jwks_url, "OIDC_JWKS_URL"),
            *[(origin, "CORS_ORIGINS entry") for origin in self.cors_origins],
        ):
            parsed = urlparse(value or "")
            if not parsed.scheme or not parsed.netloc:
                raise ConfigurationError(f"{label} must be an absolute URL")
            try:
                port = parsed.port
            except ValueError as exc:
                raise ConfigurationError(f"{label} contains an invalid port") from exc
            if not parsed.hostname or (port is not None and not 1 <= port <= 65535):
                raise ConfigurationError(f"{label} must contain a valid host and port")
            if label == "CORS_ORIGINS entry" and (
                parsed.path or parsed.query or parsed.fragment or parsed.username or parsed.password
            ):
                raise ConfigurationError("CORS_ORIGINS entries must be origins without paths or queries")
            if parsed.username or parsed.password:
                raise ConfigurationError(f"{label} must not contain URL credentials")
            if label == "OIDC_ISSUER" and parsed.fragment:
                raise ConfigurationError("OIDC_ISSUER must not contain a fragment")
            local_http_origin = (
                label == "CORS_ORIGINS entry"
                and self.app_env != "production"
                and parsed.scheme == "http"
                and parsed.hostname in {"localhost", "127.0.0.1", "::1"}
            )
            if parsed.scheme != "https" and not local_http_origin:
                raise ConfigurationError(f"{label} must use HTTPS")

        if self.app_env == "production":
            if not self.database_url.startswith("postgresql+psycopg://"):
                raise ConfigurationError("Production requires PostgreSQL")
            database_query = parse_qs(urlparse(self.database_url).query)
            if database_query.get("sslmode") != ["verify-full"]:
                raise ConfigurationError("Production DATABASE_URL must set sslmode=verify-full")
