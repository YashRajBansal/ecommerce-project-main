# Forma — E-commerce Storefront & Admin Dashboard

Forma is a responsive, four-page e-commerce demo with a customer storefront and a password-protected admin workspace. It is powered by a lightweight Python and SQLite backend, with browser-native JavaScript modules for the storefront and admin interface.

- **Live demo:** https://forma-ecommerce.onrender.com/
- **Source code:** https://github.com/YashRajBansal/ecommerce-project-main

The project requires **Python 3.12+**. It uses Python's standard library and does not require application packages or a frontend build step.

## Preview

### Storefront

<img width="1917" height="876" alt="image" src="https://github.com/user-attachments/assets/e08f1fa2-d821-47f0-bf26-eefece8ae11e" />

<img width="1762" height="842" alt="image" src="https://github.com/user-attachments/assets/53671e65-4abb-4d23-9aa0-9d99103b3d4f" />


### Admin workspace

<img width="1917" height="876" alt="image" src="https://github.com/user-attachments/assets/2b1891a3-cfd5-426c-af7c-def710705d00" />


## Features

### Customer storefront

- Browse a catalog of products across Home & Living, Clothing, Kitchen, Active & Outdoor, and Accessories.
- Search products, filter by category, and sort the catalog.
- Open product details, save favorites, and manage the shopping bag.
- Choose delivery options during the demo checkout flow.
- View previous orders and follow item-level delivery updates.
- Keep cart and favorites in browser `localStorage`.

### Admin workspace

The admin workspace is available at `/admin` and requires server-validated sign-in.

- **Overview:** See active products, orders, items awaiting delivery, low-stock counts, and recent activity.
- **Product collection:** Add and edit products, including name, USD price, description, category, search keywords, image, stock, and shop visibility.
- **Inventory:** Set a finite stock quantity or leave stock blank for unlimited inventory. A quantity of `0` marks an item as sold out.
- **Archive and restore:** Remove products from the storefront without deleting their historical order snapshots. Restore products from the archived filter.
- **Orders and delivery:** Search and filter orders, then update item status, estimated arrival, carrier, tracking number, and customer-visible notes.
- **Tracking history:** Record timestamped status and note changes for customers to review.
- **Security:** Change the administrator password and sign out of the workspace.

Product and order edits are validated by the server. Version checks help prevent one browser tab from overwriting a newer edit made elsewhere.

## Technology

| Technology | Role |
|---|---|
| Python 3.12+ | Backend application server |
| Python standard library | HTTP server, request handling, password hashing, and other backend utilities |
| SQLite | Persistent product, order, session, and activity data |
| HTML5 | Storefront and admin page structure |
| CSS3 | Responsive styling |
| JavaScript modules | Storefront and admin interactions |
| `localStorage` | Browser-side cart and favorites |
| Render | Live demo hosting |

There is no React, Django, Flask, npm package installation, or frontend compilation step in this implementation.

## Project structure

```text
ecommerce-project-main/
├── backend/                 # Initial product, order, cart, and delivery data
├── data/                    # Supporting project data
├── images/                  # Product and storefront images
├── scripts/
│   ├── app.js               # Customer storefront behavior
│   ├── admin.js             # Admin workspace behavior
│   └── api.js               # Shared JSON request helper
├── styles/
│   ├── forma.css            # Shared storefront styling
│   └── admin.css            # Admin workspace styling
├── tests/                   # Backend integration tests
├── admin.html               # Admin workspace page
├── index.html               # Storefront page
├── checkout.html            # Checkout page
├── orders.html              # Customer order history
├── tracking.html            # Order tracking page
├── server.py                # Python application server and API
├── forma-preview.jpg        # Storefront screenshot
└── admin-preview.jpg        # Admin screenshot
```

## Run locally

### Requirements

- Python 3.12 or newer
- A modern web browser
- Node.js is optional and is only needed for the JavaScript syntax checks listed under Verification.

### 1. Clone the repository

```bash
git clone https://github.com/YashRajBansal/ecommerce-project-main.git
cd ecommerce-project-main
```

### 2. Start the application

```bash
python server.py
```

Open the following addresses in your browser:

- **Storefront:** http://127.0.0.1:8010/
- **Admin workspace:** http://127.0.0.1:8010/admin

Keep the terminal running while using the application. To use a different port:

```bash
python server.py --port 8020
```

Then open `http://127.0.0.1:8020/`.

> **Important:** Start the application with `python server.py`. Do not use `python -m http.server` or open the HTML files directly. The application server provides the API and authentication routes and restricts which files can be served.

No `pip install` or frontend build command is needed.

## Admin sign-in and password management

The admin username is `admin`. **Admin passwords are intentionally not published in this README or in the repository.**

### First-time setup

When the application initializes a new data directory, it generates a random administrator password and writes the credentials to:

```text
.store/admin-access.txt
```

Read this file on the machine or hosting environment where the application is running. It is private and excluded from Git. After signing in, open **Security** in the admin workspace and choose a new password.

For initial provisioning only, you can set `FORMA_ADMIN_PASSWORD` in the server environment before the admin account is created. The password must be 15–128 characters. This variable does not replace or overwrite an existing administrator account.

### Reset a forgotten password

Run this command from the project directory on the machine that owns the database:

```bash
python server.py --reset-admin-password
```

The command prompts for a new password and confirmation without displaying the password. It updates the local database, removes the initial credentials file, and revokes existing admin sessions.

> **Local vs. hosted database:** Running the reset command on your computer changes your local `.store/forma.sqlite3` database only. It does not reset the password for the live Render deployment. To reset a hosted admin account, the command must be run in the hosted application's runtime against the same persistent `.store` database used by that deployment.

Passwords are stored as scrypt hashes with unique random salts. Passwords are not stored in browser storage or included in request logs.

## Storefront pages and data

The customer-facing pages are:

| Route | Purpose |
|---|---|
| `/` or `/index.html` | Product storefront |
| `/checkout.html` | Demo checkout |
| `/orders.html` | Customer order history |
| `/tracking.html` | Item-level delivery tracking |
| `/admin` | Protected admin workspace |

On the first server startup, the database is initialized from the original 42-product catalog and sample orders in `backend/`. After initialization, product and order changes are saved in:

```text
.store/forma.sqlite3
```

The JSON files in `backend/` act as initial seed data; they are not the live database. The `.store/` directory is excluded from Git.

Cart and favorites remain in browser `localStorage`. Orders are stored in SQLite and associated with an opaque, HttpOnly customer cookie. This is **not a customer account system**: a customer generally needs the same browser profile and cookie to access their orders. Clearing that cookie or switching browser profiles can remove that browser's access, while the admin workspace can still view orders. Original sample orders are also visible in the customer order pages.

Previously saved browser demo orders are imported when that browser next opens the store. Imported orders retain their original totals and are identified as imported demo orders.

## Checkout and delivery limitations

Checkout is a **demonstration flow**, not a live payment or fulfillment integration.

- No payment details are collected and no payment is processed.
- No carrier integration or physical shipment is triggered.
- The server validates product availability and stock, calculates the order total and estimated 10% tax, stores a product snapshot, and deducts finite inventory in a database transaction.
- Duplicate checkout submissions with the same request ID reuse the existing order, preventing a second inventory deduction.
- Delivery status and tracking information are entered manually by an administrator.
- Cancelling an item through tracking does not automatically restore its stock. Adjust inventory in the admin collection when needed.
- Archived products remain visible in historical orders but cannot be reordered while unavailable.

Customer-facing order pages show that browser's orders and the original sample orders. The admin workspace can manage all orders.

## Security

The application includes several server-side protections:

- Admin operations require a valid server-side session.
- Admin sessions expire after 8 hours and use HttpOnly, SameSite=Strict cookies.
- State-changing requests require same-origin validation and a CSRF token.
- Five failed sign-in attempts within a 15-minute window temporarily block further attempts from that address.
- Passwords are hashed with scrypt and randomly generated salts.
- The static-file handler uses an explicit allowlist; the database, credentials, server source, tests, and original order fixtures are not publicly served.
- Product, order, password, and tracking changes are recorded in an activity log.
- Product and tracking edits use version checks to detect stale updates.

The implementation includes integration tests, but this should not be interpreted as a comprehensive independent security audit.

## Deployment notes

The command `python server.py` starts the built-in server bound to `127.0.0.1` for local development. Do not treat that local development command as a complete production deployment configuration.

For a public deployment:

1. Use a hosting setup and production-capable server/reverse-proxy arrangement appropriate for the application.
2. Put the public site behind HTTPS.
3. Set `FORMA_HTTPS=1` so the application marks cookies as Secure.
4. Set `FORMA_PUBLIC_ORIGIN` to the exact public HTTPS origin, for example `https://your-domain.example`.
5. Persist and back up the `.store/` directory so the SQLite database survives restarts and redeployments.
6. Never publish or serve `.store/` as static content, and never commit admin passwords or production secrets.

`FORMA_HTTPS` and `FORMA_PUBLIC_ORIGIN` configure cookie and origin behavior; they do not create HTTPS or configure a production web server by themselves.

The session and CSRF approach follows the [OWASP Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html).

## Verification

Run the Python integration tests with:

```bash
python -m unittest discover -s tests -v
```

Check the JavaScript modules with Node.js:

```bash
node --check scripts/app.js
node --check scripts/admin.js
node --check scripts/api.js
```

The integration tests use a temporary database and HTTP server rather than the live store. They cover admin authorization, CSRF and origin/host validation, private-file protection, cookie flags, session expiry and logout, password changes, login rate limiting, product creation/editing/archiving, concurrent-edit detection, persistence, historical product snapshots, server-side totals, stock handling, idempotent checkout, customer order isolation, legacy order migration, and manual tracking history.

## Project notes

- Shared storefront UI: `scripts/app.js` and `styles/forma.css`
- Admin UI: `admin.html`, `scripts/admin.js`, and `styles/admin.css`
- Shared JSON request helper: `scripts/api.js`
- Backend and API: `server.py`
- Initial catalog and sample data: `backend/`

Google Fonts has local fallback fonts if the font service is unavailable.

## Author

**Yash Raj Bansal**

- GitHub: [@YashRajBansal](https://github.com/YashRajBansal)
- Repository: [ecommerce-project-main](https://github.com/YashRajBansal/ecommerce-project-main)
- Live demo: https://forma-ecommerce.onrender.com/

---

If you find the project useful, consider giving the repository a star.
