# Snapfood frontend

The Next.js App Router frontend is statically exported and published to
GitHub Pages by the repository's Pages workflow. The Cloudflare Pages
workflow is present but disabled. See the repository
[deployment guide](../README.md#deployment) for provider configuration and
workflow details.

## Requirements

- Node.js 24 or newer and npm 12.2.3
- Python 3.12 and the API dependencies in `../api/requirements.txt` for
  OpenAPI contract generation
- A running API and an OIDC provider registration for authenticated workflows

## Local development

Create a local environment file and configure the public API and OIDC values:

```sh
cp .env.example .env.local
```

`NEXT_PUBLIC_API_BASE_URL`, `NEXT_PUBLIC_OIDC_AUTHORITY`, and
`NEXT_PUBLIC_OIDC_CLIENT_ID` must be set for a production build. These values
are embedded in public browser assets; never put API credentials, tokens, or
other secrets in `NEXT_PUBLIC_*` variables. `NEXT_PUBLIC_OIDC_RESOURCE` is
optional. Set `NEXT_PUBLIC_CURRENCY` for meaningful production price display;
it is intentionally blank in the example because the API returns decimal
prices without a currency.

Install the API's Python dependencies, then generate the frontend contract and
install the Node dependencies:

```sh
python3 -m venv ../api/.venv
../api/.venv/bin/python -m pip install -r ../api/requirements.txt
npm ci
PATH="../api/.venv/bin:$PATH" npm run api:generate
npm run dev
```

The development server is available at `http://localhost:3000`. If the API or
identity provider is not configured, authenticated flows remain unavailable.

## Build and verification

```sh
PATH="../api/.venv/bin:$PATH" npm run check
```

The check generates API types from `../api/openapi.json`, runs linting,
typechecking and tests, validates the security-header generator, and creates
the static production export. `npm run build` alone creates the export in
`out/` and generates the response headers in `out/_headers`; both require the
public API and OIDC build settings.
For local builds, export the required public variables into the shell as well:
the Python security-header generator reads the process environment directly.
Next.js reads `.env.local` for the development server.

## Serving from a sub-path

GitHub Pages serves this repository's site from `/snap-food`, so the Pages
workflow exports `NEXT_PUBLIC_BASE_PATH` from the repository name and the
build sets the Next.js `basePath` from it. The same value is used for the
OIDC redirect URI and the sign-in callback path. Leave the variable unset for
local development and for any host that serves the site from the domain root.
