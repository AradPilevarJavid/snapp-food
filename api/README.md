# Snapfood API

This directory contains a separate FastAPI backend. It does not import, migrate,
or authenticate against the desktop application's JSON/SQLite store. In
particular, desktop plaintext passwords and demo credentials are neither read
nor migrated.

The API uses PostgreSQL in production and supports SQLite for local development
and tests. It exposes interactive API documentation at `/docs`, ReDoc at
`/redoc`, and the OpenAPI contract at `/openapi.json`. The generated OpenAPI
document is the frontend contract.

## Local setup

Requires Python 3.11 or newer. From the repository root:

```sh
python -m venv .venv
. .venv/bin/activate
python -m pip install -r api/requirements.txt
export APP_ENV=development
export DATABASE_URL=sqlite:///./api.db
export OIDC_ISSUER=https://your-identity-provider.example/issuer
export OIDC_AUDIENCE=snapfood-api
export OIDC_JWKS_URL=https://your-identity-provider.example/.well-known/jwks.json
export CORS_ORIGINS=http://localhost:3000
alembic -c api/alembic.ini upgrade head
uvicorn api.main:app --reload
```

`http://localhost:3000` is permitted only as an explicit loopback development
origin. Set `CORS_ORIGINS` to a comma-separated list of exact frontend origins;
wildcards, paths, and wildcard subdomains are rejected. The API does not host
an identity provider or issue tokens. Obtain a real token from the configured
OIDC provider with the API audience before calling protected operations.

To set up the first administrator, first apply migrations and configure the
same environment above, then provision the administrator using the exact,
out-of-band-verified OIDC `sub`:

```sh
python -m api.cli bootstrap-admin <verified-oidc-subject>
```

The command requires the target account's OIDC subject, and it only operates
on the API database. Protect this operational command and its database
credentials as administrator privileges. Subsequent managers are approved by
an authenticated administrator using `POST /admin/managers`. A user logging in
for the first time is created as a customer; token role claims are ignored.

## API behavior

- `GET /restaurants`, `GET /restaurants/{id}`, and
  `GET /restaurants/{id}/menu` are public; public menus contain available
  items only.
- An authenticated customer creates one combined order with
  `POST /orders`. The body includes `fulfillment_method: "pickup"` and menu
  item IDs and quantities, and the request requires an `Idempotency-Key`
  header containing a UUID. A cart spanning restaurants is persisted as one
  customer order with one scoped restaurant-order row per restaurant.
- The server loads current menu rows, rejects inactive/unavailable items,
  derives names and prices from the database, and calculates line, restaurant,
  and combined totals. Client-supplied prices or totals are rejected. Names and
  prices are snapshotted for order history. The key is unique per customer;
  retries with the same key and cart replay the original completed response,
  while reuse with a different cart returns `409 Conflict`. The idempotency
  record, order, and saved response commit in one transaction, with a database
  uniqueness constraint arbitrating concurrent retries. Failed checkouts leave
  no idempotency record. Keep a key for retries of an unchanged cart, and
  generate a fresh UUID after changing the cart or receiving success. There is
  no automatic key expiry: completed keys and response snapshots are retained
  for as long as their associated order record. There is no payment handling.
- `GET /orders/me` returns only the authenticated customer's order history.
- Approved restaurant managers use
  `/manager/restaurants/{restaurant_id}/menu` for restaurant-scoped menu CRUD
  and availability changes, and
  `/manager/restaurants/{restaurant_id}/orders` for that restaurant's incoming
  order rows only.
- `POST /admin/managers` binds a verified OIDC subject to a restaurant. Only
  an API database administrator can approve; neither token claims nor user
  input grant a privileged role.

## Environment

| Variable | Required | Description |
| --- | --- | --- |
| `APP_ENV` | Yes | Must be `development`, `test`, or `production`. The application rejects a missing value at startup. |
| `DATABASE_URL` | Yes for deployment | SQLAlchemy URL. SQLite is for local/test. Production requires `postgresql+psycopg://...` and `sslmode=verify-full`. |
| `OIDC_ISSUER` | Yes | Exact HTTPS issuer expected in JWT `iss`. |
| `OIDC_AUDIENCE` | Yes | API audience expected in JWT `aud`. |
| `OIDC_JWKS_URL` | Yes | Trusted HTTPS JWKS endpoint selected by deployment configuration, never by token headers. |
| `CORS_ORIGINS` | Yes | Comma-separated exact browser origins. `*` is never accepted. |

Browser CORS preflight allows the `Idempotency-Key` request header.

Configuration is validated when the ASGI application starts. All deployments
must configure an OIDC issuer, audience, and trusted JWKS URL. JWT verification
pins `RS256`, checks signature, issuer, audience, `exp`, `iat`, and `sub`, and
fails closed if the provider or JWKS is unavailable. Use an OIDC access token
whose audience is the API; do not configure an ID-token audience or accept
tokens minted for another service. The provider must publish compatible
RS256 signing keys at the configured JWKS URL. Provider-specific client,
tenant, claim-mapping, network, and key-rotation settings must be supplied by
the deployment owner; this repository intentionally invents none and has no
development authentication bypass.

For production, provide a PostgreSQL connection URL such as:

```text
postgresql+psycopg://<runtime-user>:<secret>@<db-host>:5432/<database>?sslmode=verify-full
```

Use the platform secret manager for database credentials. Configure the
PostgreSQL CA trust on the application host/container so `verify-full` can
validate the server certificate. Use a distinct least-privilege migration
database role for migrations and a runtime role without DDL privileges.
Configure TLS, request limits, health monitoring, backups, and process
supervision at the deployment edge. Never expose database credentials,
OIDC tokens, or signing keys in source control or logs.

## Deployment prerequisites

The frontend workflows do not deploy this API. Choose and configure a separate
API runtime, PostgreSQL service, and secret manager before enabling the
production frontend. The runtime must provide the following settings:

| Setting | Classification | Production value |
| --- | --- | --- |
| `APP_ENV` | Runtime variable | `production` (required; there is no production default). |
| `DATABASE_URL` | Secret | PostgreSQL URL using `sslmode=verify-full`; use the runtime database role, not the migration role. |
| `OIDC_ISSUER` | Runtime variable | Exact HTTPS issuer used by the provider and frontend registration. |
| `OIDC_AUDIENCE` | Runtime variable | API audience accepted in access tokens; coordinate with the frontend's optional `NEXT_PUBLIC_OIDC_RESOURCE`. |
| `OIDC_JWKS_URL` | Runtime variable | Trusted HTTPS JWKS endpoint selected by the deployment owner. |
| `CORS_ORIGINS` | Runtime variable | Exact HTTPS production frontend origin, for example `https://aradpilevarjavid.github.io` (the GitHub Pages origin, without its `/snap-food` path). |

The app's checks require all six settings, including `APP_ENV`. Keep database
credentials only in the API platform's secret manager. The issuer, audience,
JWKS endpoint, and CORS origin are configuration values, not credentials, but
must match the real provider, API, and production frontend. Do not copy secret
values into the frontend build or any `NEXT_PUBLIC_*` variable.

Order price fields are decimal strings, and the API does not return a currency
field. Configure the frontend's public `NEXT_PUBLIC_CURRENCY` build variable
for production price formatting; this is a frontend setting, not an API
environment variable or a backend contract change.

Before exposing the frontend, configure the identity provider's browser client
for the production frontend origin and callback
`https://aradpilevarjavid.github.io/snap-food/auth/callback/`, and ensure the
API accepts only the intended access-token
audience. The repository does not select an identity provider or supply its
issuer, client registration, JWKS endpoint, or credentials.

Apply Alembic migrations with the separately provisioned migration role before
starting the production service. Configure TLS, request limits, health
monitoring, backups, and process supervision at the API deployment edge. The
GitHub Pages origin serves the frontend, so it must be listed in
`CORS_ORIGINS` as an origin without a path.

## Database migrations

Migrations are managed by Alembic and do not run automatically during API
startup:

```sh
alembic -c api/alembic.ini upgrade head
alembic -c api/alembic.ini current
```

Set `DATABASE_URL` in the migration environment. Migration commands use the
configured database URL; do not run schema migrations with the runtime
application role. The API never creates or imports tables from the desktop
application's database.

## Tests

```sh
python -m pip install -r api/requirements-dev.txt
python -m pytest api/tests -q
```

The tests use an in-memory SQLite database and locally generated signing keys;
the JWKS client is replaced in-process. No provider credentials or network
access are required by the test suite.
