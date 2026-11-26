from __future__ import annotations

import logging
from functools import lru_cache

import jwt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import PyJWKClient
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from api.database import get_session
from api.models import User

logger = logging.getLogger(__name__)
bearer_scheme = HTTPBearer(auto_error=False)


@lru_cache(maxsize=8)
def jwks_client(url: str) -> PyJWKClient:
    return PyJWKClient(url, cache_keys=True, cache_jwk_set=True, lifespan=300, timeout=5)


def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_session),
) -> User:
    settings = request.app.state.settings
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization header required",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if len(credentials.credentials) > 16_384:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired bearer token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    try:
        client = request.app.state.jwks_client_factory(settings.oidc_jwks_url)
        signing_key = client.get_signing_key_from_jwt(credentials.credentials)
        claims = jwt.decode(
            credentials.credentials,
            signing_key.key,
            algorithms=["RS256"],
            issuer=settings.oidc_issuer,
            audience=settings.oidc_audience,
            options={"require": ["exp", "iat", "iss", "aud", "sub"]},
            leeway=30,
        )
        subject = claims.get("sub")
        if not isinstance(subject, str) or not subject.strip() or len(subject) > 255:
            raise jwt.InvalidTokenError("Invalid subject")
    except Exception as exc:
        logger.info("OIDC token rejected (%s)", type(exc).__name__)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired bearer token",
            headers={"WWW-Authenticate": "Bearer"},
        ) from None

    user = db.scalar(select(User).where(User.oidc_subject == subject))
    if user is not None:
        return user

    # A verified identity may become a customer only. Privileged roles are
    # assigned exclusively by an authenticated administrator.
    user = User(oidc_subject=subject, role="customer")
    db.add(user)
    try:
        db.commit()
        db.refresh(user)
    except IntegrityError:
        db.rollback()
        user = db.scalar(select(User).where(User.oidc_subject == subject))
        if user is None:
            raise HTTPException(status_code=503, detail="Identity provisioning unavailable")
    return user


def require_customer(user: User = Depends(get_current_user)) -> User:
    if user.role != "customer":
        raise HTTPException(status_code=403, detail="Customer access required")
    return user


def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Administrator access required")
    return user
