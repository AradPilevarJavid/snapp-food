# Snapfood

Snapfood consists of a static Next.js frontend in [`web/`](web/README.md) and a
separately deployed FastAPI backend in [`api/`](api/README.md). The frontend is
exported as static files; Cloudflare Pages is the production host. GitHub Pages
is a redirect-only project site and does not host the application.

## Deployment

- Cloudflare Pages serves the production frontend. Its provisional public
  origin is `https://snapp-food.pages.dev/`; confirm the Cloudflare project and
  origin before treating this as final.
- GitHub Pages serves only a redirect at
  `https://aradpilevarjavid.github.io/snap-food/`. Its workflow publishes
  `index.html` and `404.html` pointing to the production origin.
- Both workflows deploy only from `master`. Manual dispatch is supported but
  is also restricted to `master`; pull requests do not deploy.
- The Cloudflare workflow installs the API contract-generation dependencies
  from `api/requirements.txt`, then runs `npm ci`, `npm run api:generate`, and
  `npm run build` in `web/`. The static site and Cloudflare `_headers` file are
  produced in `web/out/`.
  The redirect workflow uses `web/scripts/generate_pages_redirect.py` and
  publishes `web/redirect-out/`.

### GitHub configuration

Set these repository **Actions variables** before enabling production
deployments:

| Variable | Required | Purpose |
| --- | --- | --- |
| `CLOUDFLARE_ACCOUNT_ID` | Yes | Cloudflare account identifier for Wrangler. |
| `CLOUDFLARE_PAGES_PROJECT` | Yes | Existing Cloudflare Pages project name. |
| `NEXT_PUBLIC_API_BASE_URL` | Yes | HTTPS origin/base URL of the separately deployed API. |
| `NEXT_PUBLIC_OIDC_AUTHORITY` | Yes | HTTPS issuer/authority configured by the identity-provider owner. |
| `NEXT_PUBLIC_OIDC_CLIENT_ID` | Yes | Public client identifier registered for the frontend. |
| `NEXT_PUBLIC_OIDC_RESOURCE` | No | Optional API resource/audience requested by the frontend; coordinate it with the API's `OIDC_AUDIENCE`. |
| `NEXT_PUBLIC_CURRENCY` | Yes for production display | Currency code used when formatting the API's decimal price strings. The API does not return a currency field; choose the appropriate currency for the deployment. |
| `PRODUCTION_WEB_URL` | Yes | Confirmed HTTPS destination for the GitHub Pages redirect. |

`NEXT_PUBLIC_*` values are compiled into public browser assets, not secrets.
The OIDC authority and client ID must either both be configured or both be
empty. Set the API URL and the real identity-provider values only after the API
and provider are configured; do not put credentials or tokens in these
variables. The Cloudflare workflow fails before building if the API URL,
authority, or client ID is missing. `NEXT_PUBLIC_CURRENCY` is passed to the
build when configured; set it for production so decimal prices have meaningful
currency display. It is intentionally left blank in the example because no
currency is assumed. The GitHub Pages workflow also fails unless
`PRODUCTION_WEB_URL` is set, so it cannot publish a redirect to an unconfirmed
provisional address.

Add the `CLOUDFLARE_API_TOKEN` **Actions secret** with only the Cloudflare
Pages edit permission needed for the selected account/project. The workflow
uses the `github-pages` environment and the standard `GITHUB_TOKEN` Pages
permissions for its redirect-only deployment. Enable GitHub Pages with
**GitHub Actions** as the source in repository settings.

The frontend build generates route-specific CSP and related security headers
in `web/out/_headers`. Their `connect-src` allowlist includes the configured
HTTPS API and OIDC origins. Cloudflare Pages applies `_headers` to static
responses. GitHub Pages cannot serve these custom response headers here; it
only serves the noindex redirect and fallback redirect.

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
