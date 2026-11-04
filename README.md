# Forma storefront and admin

The four-page storefront now includes a password-protected admin workspace with a Python/SQLite backend. It uses Python 3.12+ and browser JavaScript modules. No application dependencies or build step are required.

**LIVE DEMO:** https://forma-ecommerce.onrender.com/

## Start for Local Computer

From this folder:

```powershell
python server.py
```

- Storefront: <http://127.0.0.1:8010>
- Admin: <http://127.0.0.1:8010/admin>

Use **`server.py`**, rather than `python -m http.server`. The application server supplies authentication and APIs and prevents private files from being served. Opening HTML files directly will not work. Keep the terminal running while using the site. An alternate port is supported with `python server.py --port 8020`.

## Admin sign-in

The username is **admin**. On the first run, the server generates a random password and writes it to **`.store/admin-access.txt`**, readable locally on your computer. This file is not available through the website and is excluded from Git.

Sign in, then use **Security** to choose your own password. Passwords must contain 15-128 characters. Changing the password revokes every admin session and removes the initial credentials file. Passwords are hashed with scrypt and unique random salts; the application does not put them in browser storage or request logs.

For initial provisioning only, `FORMA_ADMIN_PASSWORD` can supply the first password instead of generating a file. It does not overwrite an existing account.

If you forget the password, reset it from the local terminal:

```powershell
python server.py --reset-admin-password
```

This prompts for a new password without displaying it and signs out all admin sessions.

## Admin controls

- **Overview:** active products, orders, items awaiting delivery, low-stock count, and recent changes.
- **Collection:** add or edit products; update name, USD price, description, collection, search keywords, image, stock, and shop visibility. Images can be an existing path under `images/` or an HTTPS image URL. A blank stock field means unlimited inventory; zero marks the item sold out.
- **Archive/restore:** archived products disappear from the shop. Past orders retain a snapshot of the original item and price. Restore an item through the Archived filter.
- **Orders & delivery:** search orders and filter by status. Update each item's status (placed, preparing, on the way, delivered, cancelled), estimated arrival, carrier, tracking number, and customer-visible note. Status/note updates create a timestamped history.
- **Security:** change the administrator password. Sign out is available in the navigation.

Edits are validated on the server and use version checks to prevent overwriting another tab's newer edit. Store data refreshes in the customer pages every 15 seconds and when the window regains focus. A page refresh shows changes immediately. Customer order pages only show that browser's orders plus the original sample orders; admin can manage all orders.

**admin uesrname** = admin

**admin password** = admin@123456789


## Storefront and data

The existing routes remain `index.html`, `checkout.html`, `orders.html`, and `tracking.html`. Search, sorting, categories, favorites, product dialogs, delivery choices, and cart editing remain available. Store administration is linked in the footer.

On first server startup, the database is seeded from the original 42-product catalog and sample orders in `backend/`. Later changes persist in **`.store/forma.sqlite3`**, not in the fixtures. Existing browser-saved demo orders are imported automatically when that browser next opens the store. Their original totals are retained and they are labeled as imported demo orders. Their previous browser records remain in localStorage.

Cart and favorites remain in localStorage. Orders are now in SQLite and associated with an opaque HttpOnly customer cookie. This is not a customer account system: another browser profile or clearing that cookie loses that browser's access to its orders, while admin can still see them. Use the same hostname and port to retain browser state.

Checkout remains a **demo**. It collects no payment and triggers no carrier integration or physical shipment. The server calculates totals and 10% estimated tax, validates availability/stock, saves a product snapshot, and deducts finite inventory in one transaction. Duplicate checkout requests reuse the same order rather than deducting inventory again. Cancelling an item through tracking does not automatically restock it; adjust stock in Collection if needed.

Delivery updates are manual and explicitly labeled that way on the storefront. Archived items remain visible in order history and cannot be reordered while unavailable. Customers cannot change prices or delivery status through public endpoints.

## Protection and hosting scope

Admin reads and writes require a server-validated session. Sessions expire after 8 hours and use HttpOnly, SameSite=Strict cookies. Writes require both a same-origin request and a CSRF token. Five failed sign-ins within 15 minutes temporarily block further attempts from that address. Database, credentials, source server, tests, and original order fixtures are excluded from static serving. Password changes, product changes, orders, and tracking changes are recorded in an activity log.

This is a **local server**, bound to `127.0.0.1`. For public hosting, use an appropriate production Python server and HTTPS reverse proxy, persist/back up the SQLite directory, set `FORMA_HTTPS=1` to require Secure cookies, and set `FORMA_PUBLIC_ORIGIN` to the exact HTTPS origin. These variables do not create TLS themselves. Do not deploy the private `.store` directory as static files.

The session and CSRF approach follows the [OWASP Session Management guidance](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html). This implementation has integration tests; it is not a claim of a comprehensive external security audit.

## Verification

```powershell
python -m unittest discover -s tests -v
node --check scripts/app.js
node --check scripts/admin.js
node --check scripts/api.js
```

The integration tests use a temporary database and HTTP server, never the actual store. They cover admin authorization, CSRF/origin/host rejection, private-file protection, cookie flags, expiry/logout, password change, login rate limiting, product creation/editing/archiving, optimistic concurrency, persistence, historical product snapshots, server totals, stock, idempotent checkout, customer order isolation, legacy migration, and manual tracking history.

Browser checks cover login, product creation and price changes reaching the shop, demo checkout reaching admin, manual tracking reaching the customer, archive/restore, sold-out controls, and responsive admin layouts at desktop, 768px, 390px, and 320px. The temporary verification product/order are removed after testing.

Shared store UI: `scripts/app.js`, `styles/forma.css`. Admin UI: `admin.html`, `scripts/admin.js`, `styles/admin.css`. JSON request helper: `scripts/api.js`. Backend: `server.py`. Original data/assets remain available on disk. Google Fonts has local fallback fonts if the font service is unavailable.
