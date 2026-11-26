# Snapfood

Snapfood consists of a static Next.js frontend in [`web/`](web/README.md) and a
separately deployed FastAPI backend in [`api/`](api/README.md). The frontend is
exported as static files and served by GitHub Pages; the Cloudflare Pages
workflow is kept in the repository but disabled.

## Deployment

- GitHub Pages serves the production frontend at
  `https://aradpilevarjavid.github.io/snap-food/`.
- The repository is not named `*.github.io`, so the site is served from the
  `/snap-food` sub-path. The workflow derives the base path from the repository
  name and passes it to the build as `NEXT_PUBLIC_BASE_PATH`. Set the optional
  `PAGES_BASE_PATH` Actions variable to `/` if the site must be served from the
  domain root (a `*.github.io` repository or a custom domain).
- The Pages workflow installs the API contract-generation dependencies from
  `api/requirements.txt`, then runs `npm ci` and `npm run check` in `web/`. The
  check regenerates the API contract, lints, typechecks, runs the tests, and
  creates the static export plus the `web/out/_headers` file, which the
  workflow then publishes with the official Pages actions.
- The Cloudflare Pages workflow is disabled while GitHub Pages is the host.
  Restore its `push` trigger and its job `if` guard to run it again. Cloudflare
  serves the site from the domain root, so leave `NEXT_PUBLIC_BASE_PATH` unset
  when re-enabling it.
- Deployments run only from `master`. Manual dispatch is supported but is also
  restricted to `master`; pull requests do not deploy.

### GitHub configuration

Set these repository **Actions variables** before enabling production
deployments:

| Variable | Required | Purpose |
| --- | --- | --- |
| `CLOUDFLARE_ACCOUNT_ID` | Only if the Cloudflare workflow is re-enabled | Cloudflare account identifier for Wrangler. |
| `CLOUDFLARE_PAGES_PROJECT` | Only if the Cloudflare workflow is re-enabled | Existing Cloudflare Pages project name. |
| `NEXT_PUBLIC_API_BASE_URL` | Yes | HTTPS origin/base URL of the separately deployed API. |
| `NEXT_PUBLIC_OIDC_AUTHORITY` | Yes | HTTPS issuer/authority configured by the identity-provider owner. |
| `NEXT_PUBLIC_OIDC_CLIENT_ID` | Yes | Public client identifier registered for the frontend. |
| `NEXT_PUBLIC_OIDC_RESOURCE` | No | Optional API resource/audience requested by the frontend; coordinate it with the API's `OIDC_AUDIENCE`. |
| `NEXT_PUBLIC_CURRENCY` | Yes for production display | Currency code used when formatting the API's decimal price strings. The API does not return a currency field; choose the appropriate currency for the deployment. |
| `PAGES_BASE_PATH` | No | Overrides the base path derived from the repository name. Use `/` for a site served from the domain root; any other value must start with `/` and must not end with it. |

`NEXT_PUBLIC_*` values are compiled into public browser assets, not secrets.
The OIDC authority and client ID must either both be configured or both be
empty. Set the API URL and the real identity-provider values only after the API
and provider are configured; do not put credentials or tokens in these
variables. The Pages workflow fails before building if the API URL, authority,
or client ID is missing. `NEXT_PUBLIC_CURRENCY` is passed to the build when
configured; set it for production so decimal prices have meaningful currency
display. It is intentionally left blank in the example because no currency is
assumed.

Enable GitHub Pages with **GitHub Actions** as the source in repository
settings; the workflow uses the `github-pages` environment and the standard
`GITHUB_TOKEN` Pages permissions. Add the `CLOUDFLARE_API_TOKEN` **Actions
secret** with only the Cloudflare Pages edit permission needed for the selected
account/project if you re-enable the Cloudflare workflow.

The frontend build generates route-specific CSP and related security headers
in `web/out/_headers`. Their `connect-src` allowlist includes the configured
HTTPS API and OIDC origins. GitHub Pages cannot attach custom response headers
to static files, so those headers are not applied to the Pages deployment;
they take effect again only if the Cloudflare workflow is re-enabled.

Configure the identity provider with
`https://aradpilevarjavid.github.io/snap-food/auth/callback/` as a redirect URI,
and include `https://aradpilevarjavid.github.io` in the API's `CORS_ORIGINS`
allowlist, so that sign-in and API calls work from the Pages origin.

The workflows deploy the frontend only. A production API, PostgreSQL database,
OIDC provider registration, API environment configuration, migrations, and
matching CORS allowlist must be provisioned separately. See
[`api/README.md`](api/README.md#deployment-prerequisites).

## Legacy Tkinter desktop client


## 📸 Screenshots

<table>
  <tr>
    <td><img src="screenshots/login-light.png" width="400" alt="Login screen"><br><em>Clean login window (light theme)</em></td>
    <td><img src="screenshots/menu_light.png" width="400" alt="Manager menu"><br><em>Manager menu (light theme)</em></td>
  </tr>
</table>

<div align="center">
  <img src="screenshots/user_menu_dark.png" width="400" alt="Customer menu dark"><br>
  <em>Customer menu with dark theme and cart highlighting.</em>
</div>

---

## 🚀 Features

### 🔐 User Management
- Sign up as **Manager** (requires a restaurant name) or **Customer**
- Secure login/logout
- Validation of names, usernames, and passwords

### 🧑‍💼 Manager Dashboard
- View menu grouped by category (food 🍕, drink 🥤, dessert 🍰)
- Add ➕ / Edit ✏️ / Delete 🗑️ menu items
- Toggle item availability
- Support for item images (requires **Pillow**)
- View all orders placed at the restaurant

### 👤 Customer Dashboard
- Browse a list of restaurants
- View each restaurant’s menu with availability status
- Add items to cart 🛒 (across multiple restaurants)
- Checkout to place orders (creates a combined order per‑restaurant)
- View order history with timestamps

### 🎨 User Interface
- Clean, modern Tkinter GUI
- **Light & dark themes** toggle 🎛️
- Interactive sidebar navigation
- Treeviews with alternating row colors and cart highlighting
- Status bar for feedback messages

### 💾 Flexible Storage
- JSON file (`data.json`) – simple, human‑readable, no extra dependencies
- SQLite database (`data.db`) – for scalability and concurrent access
- Easily switch by editing one variable (`STORAGE_TYPE`) in `storage.py`

---

## 📦 Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/AradPilevarJavid/snap-food
   cd snap-food
   ```

2. **Install Python 3.8+** if not already installed.

3. **(Optional) Install Pillow** for image support:
   ```bash
   pip install -r requirements.txt
   ```
   > The app runs fine without Pillow – menu images will simply not be displayed.

4. **Run the application**
   ```bash
   python src/main.py
   ```

---

## ▶️ Usage

### Default accounts (preloaded)
| Role     | Username | Password |
|----------|----------|----------|
| Manager  | `admin`  | `123456` |
| Manager  | `manager2` | `123456` |
| Customer | `user`   | `123456` |

### Manager flow
1. Log in as a manager (e.g., `admin` / `123456`).
2. Use the sidebar to:
   - Browse your menu (📋 Menu)
   - Add new items (➕ Add Item)
   - Edit/delete existing items
   - View incoming orders (📦 Orders)

### Customer flow
1. Log in as `user` / `123456`.
2. Select a restaurant from the list and click **Open Menu**.
3. In the menu window, add items to cart.
4. Click **View Cart** to review and **Checkout**.
5. Check **Order History** for past orders.

### Changing storage backend
Edit the `STORAGE_TYPE` variable in `src/storage.py`:
```python
# Use SQLite
STORAGE_TYPE = "sqlite"

# Use JSON (default)
STORAGE_TYPE = "anything_else"
```
> On first run with a new storage type, default restaurants/users are created automatically.

---

## 📁 Project Structure

```
📦 restaurant-management-system
├── 📄 LICENSE
├── 📄 requirements.txt
└── 📂 src
    ├── 🐍 main.py              # Entry point
    ├── 🖼️ gui.py               # Tkinter GUI (light/dark themes)
    ├── 📦 models.py            # User, Manager, Customer, MenuItem, Order, Restaurant
    ├── ⚙️ platform_core.py     # Core logic (auth, cart, checkout, data loading)
    └── 💾 storage.py           # JSON & SQLite storage backends
```

---

## 🛠️ Technologies

- **Python 3** – core language
- **Tkinter** – GUI toolkit
- **Pillow** (optional) – image handling
- **sqlite3** – built‑in SQLite support
- **json** – JSON serialisation
- **ABC** – abstract base classes for storage

---

## 📜 License

This project is licensed under the **MIT License** – see the [LICENSE](LICENSE) file for details.


---

## 🌟 Future Enhancements

- [ ] Image uploads instead of file paths  
- [ ] Search and filter menu items  
- [ ] Order status tracking (pending, in progress, delivered)  
- [ ] Export orders to PDF/Excel  
- [ ] Multi‑language support  
- [ ] Packaging as a standalone executable  

---
