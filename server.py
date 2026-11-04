"""Forma local storefront and authenticated administration, using Python's stdlib."""

import argparse
import getpass
import hashlib
import hmac
import json
import mimetypes
import os
import re
import secrets
import sqlite3
import time
import uuid
from contextlib import contextmanager
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parent
CATEGORIES = ["Home & living", "Clothing", "Kitchen", "Active & outdoor", "Accessories"]
STATUSES = ["ordered", "preparing", "shipped", "delivered", "cancelled"]
MAX_BODY = 512_000


class APIError(Exception):
    def __init__(self, status, message):
        self.status, self.message = status, message


def stamp():
    return int(time.time() * 1000)


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


def password_hash(password, salt):
    return hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=32768,
                          r=8, p=1, maxmem=64 * 1024 * 1024).hex()


def text(value, label, maximum, required=True):
    if not isinstance(value, str) or len(value.strip()) > maximum:
        raise APIError(400, f"{label} must be text of at most {maximum} characters.")
    value = value.strip()
    if required and not value:
        raise APIError(400, f"{label} is required.")
    return value


def integer(value, label, minimum, maximum):
    if type(value) is not int or not minimum <= value <= maximum:
        raise APIError(400, f"{label} must be a whole number from {minimum} to {maximum}.")
    return value


def validate_password(value):
    if not isinstance(value, str) or not 15 <= len(value) <= 128:
        raise APIError(400, "Use a password or passphrase between 15 and 128 characters.")
    return value


def validate_product(data, existing=None):
    if not isinstance(data, dict):
        raise APIError(400, "Product details must be an object.")
    name = text(data.get("name"), "Product name", 180)
    image = text(data.get("image"), "Image", 1000)
    try:
        parsed = urlsplit(image)
    except ValueError:
        raise APIError(400, "Enter a valid image URL.")
    if parsed.scheme:
        if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
            raise APIError(400, "Use a local product image or an HTTPS image URL.")
    else:
        image_path = (ROOT / image).resolve()
        if (not image.startswith("images/") or "\\" in image or parsed.query or parsed.fragment
                or not image_path.is_relative_to(ROOT / "images") or not image_path.is_file()
                or image_path.suffix.lower() not in {".png", ".jpg", ".jpeg", ".webp", ".gif"}):
            raise APIError(400, "Choose an existing local image under images/.")
    category = data.get("category")
    if category not in CATEGORIES:
        raise APIError(400, "Choose a valid collection.")
    keywords = data.get("keywords", [])
    if not isinstance(keywords, list) or len(keywords) > 25:
        raise APIError(400, "Use no more than 25 search keywords.")
    keywords = [text(k, "Keyword", 50) for k in keywords]
    active = data.get("active", True)
    if type(active) is not bool:
        raise APIError(400, "Availability must be true or false.")
    stock = data.get("stock")
    if stock is not None:
        stock = integer(stock, "Stock", 0, 1_000_000)
    return {
        "id": existing["id"] if existing else str(uuid.uuid4()),
        "name": name, "image": image,
        "description": text(data.get("description", ""), "Description", 2000, False),
        "priceCents": integer(data.get("priceCents"), "Price in cents", 1, 100_000_000),
        "category": category, "keywords": keywords, "active": active, "stock": stock,
        "rating": existing["rating"] if existing else {"stars": 0, "count": 0},
        "version": existing.get("version", 0) + 1 if existing else 1,
    }


class Store:
    def __init__(self, folder):
        self.folder = Path(folder).resolve()
        self.folder.mkdir(parents=True, exist_ok=True)
        self.path = self.folder / "forma.sqlite3"
        with self.connect() as db:
            db.executescript("""
                CREATE TABLE IF NOT EXISTS products (id TEXT PRIMARY KEY, data TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, owner TEXT NOT NULL, data TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS admin (id INTEGER PRIMARY KEY CHECK(id=1), salt TEXT NOT NULL, password_hash TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, kind TEXT NOT NULL, csrf TEXT NOT NULL, expires REAL NOT NULL);
                CREATE TABLE IF NOT EXISTS attempts (address TEXT PRIMARY KEY, failures INTEGER NOT NULL, window REAL NOT NULL);
                CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY, at_ms INTEGER NOT NULL, action TEXT NOT NULL, target TEXT NOT NULL);
            """)
            if not db.execute("SELECT 1 FROM products LIMIT 1").fetchone():
                for p in json.loads((ROOT / "backend/products.json").read_text()):
                    p.update(active=True, stock=None, version=1, description="")
                    db.execute("INSERT INTO products VALUES (?,?)", (p["id"], json.dumps(p)))
                for order in json.loads((ROOT / "backend/orders.json").read_text()):
                    order["sample"] = True
                    for item in order["products"]:
                        p = json.loads(db.execute("SELECT data FROM products WHERE id=?", (item["productId"],)).fetchone()[0])
                        item.update(productSnapshot=p, status="ordered", trackingNumber="", carrier="",
                                    trackingNote="Original sample order; awaiting a manual update.", version=1,
                                    history=[{"status": "ordered", "atMs": order["orderTimeMs"], "note": "Sample order placed."}])
                    db.execute("INSERT INTO orders VALUES (?,?,?)", (order["id"], "sample", json.dumps(order)))
            if not db.execute("SELECT 1 FROM admin").fetchone():
                password = os.environ.get("FORMA_ADMIN_PASSWORD") or secrets.token_urlsafe(24)
                validate_password(password)
                salt = secrets.token_hex(16)
                db.execute("INSERT INTO admin VALUES (1,?,?)", (salt, password_hash(password, salt)))
                if not os.environ.get("FORMA_ADMIN_PASSWORD"):
                    access = self.folder / "admin-access.txt"
                    access.write_text(f"Forma administrator\nUsername: admin\nPassword: {password}\n\nChange this password in Admin > Security after signing in.\n", encoding="utf-8")
                    print(f"Admin sign-in details saved privately to: {access}", flush=True)

    @contextmanager
    def connect(self, write=False):
        db = sqlite3.connect(self.path, timeout=15)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA foreign_keys=ON")
        try:
            if write:
                db.execute("BEGIN IMMEDIATE")
            yield db
            db.commit()
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

    def audit(self, db, action, target):
        db.execute("INSERT INTO audit(at_ms,action,target) VALUES (?,?,?)", (stamp(), action, target))


class Handler(BaseHTTPRequestHandler):
    server_version = "Forma"

    @property
    def store(self):
        return self.server.store

    def log_message(self, format, *args):
        # Passwords, cookies, bodies and query strings are never logged.
        if args:
            print(f"{self.command} {urlsplit(self.path).path} {args[1] if len(args) > 1 else ''}", flush=True)

    def headers_common(self):
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Referrer-Policy", "same-origin")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
        self.send_header("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' https: data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'")

    def respond(self, status, data, cookies=None):
        payload = json.dumps(data, allow_nan=False).encode()
        self.send_response(status)
        self.headers_common()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        for cookie in cookies or []:
            self.send_header("Set-Cookie", cookie)
        self.end_headers()
        self.wfile.write(payload)

    def cookie(self, name, token, max_age):
        secure = "; Secure" if self.server.https else ""
        return f"{name}={token}; Path=/; HttpOnly; SameSite=Strict; Max-Age={max_age}{secure}"

    def session(self, kind, required=True):
        jar = SimpleCookie()
        try:
            jar.load(self.headers.get("Cookie", ""))
        except Exception:
            pass
        name = "forma_admin" if kind == "admin" else "forma_customer"
        token = jar[name].value if name in jar else ""
        with self.store.connect() as db:
            row = db.execute("SELECT * FROM sessions WHERE token_hash=? AND kind=? AND expires>?",
                             (digest(token), kind, time.time())).fetchone()
        if not row and required:
            raise APIError(401, "Please sign in again." if kind == "admin" else "Refresh the store to start a new session.")
        return dict(row) if row else None

    def new_session(self, db, kind):
        token, csrf = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
        life = 8 * 3600 if kind == "admin" else 365 * 86400
        db.execute("DELETE FROM sessions WHERE expires<=?", (time.time(),))
        db.execute("INSERT INTO sessions VALUES (?,?,?,?)", (digest(token), kind, csrf, time.time() + life))
        return {"token_hash": digest(token), "csrf": csrf}, self.cookie("forma_" + kind, token, life)

    def check_origin(self):
        expected = ("https" if self.server.https else "http") + "://" + self.headers.get("Host", "")
        if self.headers.get("Origin") != expected:
            raise APIError(403, "This request must come from the Forma site.")

    def csrf(self, session):
        if not hmac.compare_digest(self.headers.get("X-CSRF-Token", "").encode(), session["csrf"].encode()):
            raise APIError(403, "Your security token expired. Refresh and try again.")

    def body(self):
        if self.headers.get_content_type() != "application/json":
            raise APIError(415, "Send JSON data.")
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if not 0 < length <= MAX_BODY:
                raise APIError(413, "Request is too large or empty.")
            value = json.loads(self.rfile.read(length), parse_constant=lambda _: None)
            if not isinstance(value, dict):
                raise ValueError()
            return value
        except (ValueError, UnicodeDecodeError):
            raise APIError(400, "Invalid JSON request.")

    def handle_request(self):
        try:
            # Local host validation also prevents browser DNS rebinding.
            if self.headers.get("Host") not in self.server.allowed_hosts:
                raise APIError(400, "Unrecognized site host.")
            path = urlsplit(self.path).path
            if self.command != "GET":
                self.check_origin()
            if path.startswith("/api/"):
                self.api(path)
            elif self.command == "GET":
                self.static(path)
            else:
                raise APIError(405, "Method not allowed.")
        except APIError as error:
            self.respond(error.status, {"error": error.message})
        except (BrokenPipeError, ConnectionResetError):
            pass
        except Exception:
            self.respond(500, {"error": "The server could not complete the request. Please try again."})

    do_GET = handle_request
    do_POST = handle_request
    do_PATCH = handle_request
    do_DELETE = handle_request

    def static(self, path):
        path = unquote(path)
        if path in ("/admin", "/admin/"):
            path = "/admin.html"
        if path == "/":
            path = "/index.html"
        # Explicit public-file allowlist: databases, credentials, source server,
        # tests and old order fixtures are never served by this application.
        allowed = path in {"/index.html", "/checkout.html", "/orders.html", "/tracking.html", "/admin.html"}
        allowed = allowed or path.startswith(("/styles/", "/scripts/", "/images/"))
        target = (ROOT / path.lstrip("/")).resolve()
        if not allowed or not target.is_relative_to(ROOT) or any(p.startswith(".") for p in Path(path).parts) or not target.is_file():
            raise APIError(404, "Page not found.")
        if target.suffix.lower() not in {".html", ".js", ".css", ".jpg", ".jpeg", ".png", ".webp", ".gif"}:
            raise APIError(404, "Page not found.")
        data = target.read_bytes()
        self.send_response(200)
        self.headers_common()
        mime = "text/javascript" if target.suffix == ".js" else mimetypes.guess_type(target.name)[0]
        self.send_header("Content-Type", mime or "application/octet-stream")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def api(self, path):
        if path == "/api/admin/login" and self.command == "POST":
            return self.login()
        if path.startswith("/api/admin/"):
            admin = self.session("admin")
            if self.command != "GET":
                self.csrf(admin)
            return self.admin_api(path, admin)
        if path == "/api/bootstrap" and self.command == "GET":
            customer = self.session("customer", False)
            cookies = []
            with self.store.connect(write=True) as db:
                if not customer:
                    customer, cookie = self.new_session(db, "customer")
                    cookies.append(cookie)
                products = [json.loads(r[0]) for r in db.execute("SELECT data FROM products")]
                orders = [json.loads(r[0]) for r in db.execute("SELECT data FROM orders WHERE owner IN (?, 'sample')", (customer["token_hash"],))]
            return self.respond(200, {"products": [p for p in products if p["active"]],
                                      "orders": sorted(orders, key=lambda o: o["orderTimeMs"], reverse=True),
                                      "deliveryOptions": json.loads((ROOT / "backend/deliveryOptions.json").read_text()),
                                      "initialCart": json.loads((ROOT / "backend/cart.json").read_text()),
                                      "csrf": customer["csrf"]}, cookies)
        if path in {"/api/orders", "/api/orders/import"} and self.command == "POST":
            customer = self.session("customer")
            self.csrf(customer)
            if path.endswith("/import"):
                return self.import_orders(customer)
            return self.create_order(customer)
        raise APIError(404, "Endpoint not found.")

    def login(self):
        body = self.body()
        address = self.client_address[0]
        with self.store.connect(write=True) as db:
            attempt = db.execute("SELECT * FROM attempts WHERE address=?", (address,)).fetchone()
            if attempt and attempt["window"] > time.time() - 900 and attempt["failures"] >= 5:
                raise APIError(429, "Too many sign-in attempts. Try again in 15 minutes.")
            user = db.execute("SELECT * FROM admin WHERE id=1").fetchone()
            password = body.get("password", "")
            valid_input = isinstance(password, str) and len(password) <= 128
            computed = password_hash(password if valid_input else "", user["salt"])
            valid = hmac.compare_digest(computed, user["password_hash"]) and body.get("username") == "admin" and valid_input
            if not valid:
                failures = attempt["failures"] + 1 if attempt and attempt["window"] > time.time() - 900 else 1
                start = attempt["window"] if attempt and attempt["window"] > time.time() - 900 else time.time()
                db.execute("INSERT OR REPLACE INTO attempts VALUES (?,?,?)", (address, failures, start))
                # Commit the failed attempt before returning an authentication error.
                db.commit()
                raise APIError(401, "Incorrect username or password.")
            db.execute("DELETE FROM attempts WHERE address=?", (address,))
            old = self.session("admin", False)
            if old:
                db.execute("DELETE FROM sessions WHERE token_hash=?", (old["token_hash"],))
            session, cookie = self.new_session(db, "admin")
            self.store.audit(db, "admin.login", "admin")
        self.respond(200, {"csrf": session["csrf"], "username": "admin"}, [cookie])

    def admin_api(self, path, session):
        if path == "/api/admin/session" and self.command == "GET":
            return self.respond(200, {"username": "admin", "csrf": session["csrf"]})
        if path == "/api/admin/logout" and self.command == "POST":
            with self.store.connect(write=True) as db:
                db.execute("DELETE FROM sessions WHERE token_hash=?", (session["token_hash"],))
            return self.respond(200, {"ok": True}, [self.cookie("forma_admin", "", 0)])
        if path == "/api/admin/password" and self.command == "POST":
            body = self.body()
            password = validate_password(body.get("newPassword"))
            current = body.get("currentPassword")
            if not isinstance(current, str) or len(current) > 128:
                raise APIError(400, "Enter your current password.")
            with self.store.connect(write=True) as db:
                user = db.execute("SELECT * FROM admin").fetchone()
                if not hmac.compare_digest(password_hash(current, user["salt"]), user["password_hash"]):
                    raise APIError(400, "The current password is incorrect.")
                if current == password:
                    raise APIError(400, "Choose a different new password.")
                salt = secrets.token_hex(16)
                db.execute("UPDATE admin SET salt=?,password_hash=? WHERE id=1", (salt, password_hash(password, salt)))
                db.execute("DELETE FROM sessions WHERE kind='admin'")
                self.store.audit(db, "admin.password_changed", "admin")
            (self.store.folder / "admin-access.txt").unlink(missing_ok=True)
            return self.respond(200, {"ok": True}, [self.cookie("forma_admin", "", 0)])
        if path == "/api/admin/data" and self.command == "GET":
            with self.store.connect() as db:
                products = [json.loads(r[0]) for r in db.execute("SELECT data FROM products")]
                orders = [json.loads(r[0]) for r in db.execute("SELECT data FROM orders")]
                audit = [dict(r) for r in db.execute("SELECT at_ms,action,target FROM audit ORDER BY id DESC LIMIT 30")]
            images = sorted(p.relative_to(ROOT).as_posix() for p in (ROOT / "images/products").iterdir() if p.suffix.lower() in {".jpg", ".png", ".webp"})
            return self.respond(200, {"products": products, "orders": sorted(orders, key=lambda o:o["orderTimeMs"], reverse=True), "audit": audit, "images": images})
        match = re.fullmatch(r"/api/admin/products(?:/([a-zA-Z0-9-]+))?", path)
        if match and self.command in {"POST", "PATCH", "DELETE"}:
            body = self.body()
            identifier = match.group(1)
            with self.store.connect(write=True) as db:
                row = db.execute("SELECT data FROM products WHERE id=?", (identifier,)).fetchone() if identifier else None
                if identifier and not row:
                    raise APIError(404, "Product not found.")
                existing = json.loads(row[0]) if row else None
                if existing and body.get("version") != existing.get("version"):
                    raise APIError(409, "This product changed elsewhere. Refresh before editing again.")
                if self.command == "POST" and identifier or self.command != "POST" and not identifier:
                    raise APIError(405, "Method not allowed.")
                if self.command == "DELETE":
                    updated = {**existing, "active": False, "version": existing["version"] + 1}
                else:
                    updated = validate_product(body, existing)
                db.execute("INSERT OR REPLACE INTO products VALUES (?,?)", (updated["id"], json.dumps(updated)))
                self.store.audit(db, "product.archived" if self.command == "DELETE" else "product.updated" if existing else "product.created", updated["id"])
            return self.respond(200 if existing else 201, {"product": updated})
        match = re.fullmatch(r"/api/admin/orders/([a-zA-Z0-9-]+)/items/([a-zA-Z0-9-]+)", path)
        if match and self.command == "PATCH":
            body = self.body()
            with self.store.connect(write=True) as db:
                row = db.execute("SELECT data FROM orders WHERE id=?", (match[1],)).fetchone()
                if not row:
                    raise APIError(404, "Order not found.")
                order = json.loads(row[0])
                item = next((i for i in order["products"] if i["productId"] == match[2]), None)
                if not item:
                    raise APIError(404, "Order item not found.")
                if body.get("version") != item.get("version", 1):
                    raise APIError(409, "Tracking changed elsewhere. Refresh before editing again.")
                status = body.get("status")
                if status not in STATUSES:
                    raise APIError(400, "Choose a valid delivery status.")
                arrival = integer(body.get("estimatedDeliveryTimeMs"), "Arrival date", 0, 8_640_000_000_000)
                carrier = text(body.get("carrier", ""), "Carrier", 80, False)
                tracking_number = text(body.get("trackingNumber", ""), "Tracking number", 120, False)
                note = text(body.get("trackingNote", ""), "Delivery note", 500, False)
                if status != item.get("status") or note != item.get("trackingNote"):
                    item.setdefault("history", []).append({"status": status, "atMs": stamp(), "note": note or "Status updated by the store."})
                    item["history"] = item["history"][-100:]
                item.update(status=status, estimatedDeliveryTimeMs=arrival, carrier=carrier,
                            trackingNumber=tracking_number, trackingNote=note, version=item.get("version", 1) + 1)
                db.execute("UPDATE orders SET data=? WHERE id=?", (json.dumps(order), order["id"]))
                self.store.audit(db, "tracking.updated", f"{order['id']}/{item['productId']}")
            return self.respond(200, {"order": order})
        raise APIError(404, "Endpoint not found.")

    def create_order(self, customer):
        body = self.body()
        entries = body.get("items")
        if not isinstance(entries, list) or not 1 <= len(entries) <= 100:
            raise APIError(400, "Add between 1 and 100 different products to your bag.")
        key = text(body.get("requestId"), "Checkout request ID", 80)
        try:
            uuid.UUID(key)
        except ValueError:
            raise APIError(400, "Invalid checkout request ID.")
        options = json.loads((ROOT / "backend/deliveryOptions.json").read_text())
        items, seen, subtotal, shipping = [], set(), 0, 0
        with self.store.connect(write=True) as db:
            existing = db.execute("SELECT owner,data FROM orders WHERE id=?", (key,)).fetchone()
            if existing:
                if existing["owner"] != customer["token_hash"]:
                    raise APIError(409, "Checkout request already used. Refresh and try again.")
                return self.respond(200, {"order": json.loads(existing["data"])})
            for entry in entries:
                if not isinstance(entry, dict):
                    raise APIError(400, "Invalid bag item.")
                pid = text(entry.get("productId"), "Product ID", 80)
                if pid in seen:
                    raise APIError(400, "Duplicate product in bag.")
                seen.add(pid)
                row = db.execute("SELECT data FROM products WHERE id=?", (pid,)).fetchone()
                p = json.loads(row[0]) if row else None
                if not p or not p["active"]:
                    raise APIError(409, "An item is no longer available. Refresh your bag.")
                quantity = integer(entry.get("quantity"), "Quantity", 1, 99)
                if p["stock"] is not None and p["stock"] < quantity:
                    raise APIError(409, f"Only {p['stock']} remaining for {p['name']}. Update your bag.")
                option = next((d for d in options if d["id"] == entry.get("deliveryOptionId")), None)
                if not option:
                    raise APIError(400, "Choose a valid delivery option.")
                subtotal += p["priceCents"] * quantity
                shipping += option["priceCents"]
                items.append({"productId": pid, "quantity": quantity, "productSnapshot": p,
                              "estimatedDeliveryTimeMs": stamp() + option["deliveryDays"] * 86400000,
                              "status": "ordered", "carrier": "", "trackingNumber": "", "trackingNote": "",
                              "version": 1, "history": [{"status": "ordered", "atMs": stamp(), "note": "Demo order placed."}]})
                if p["stock"] is not None:
                    updated = {**p, "stock": p["stock"] - quantity, "version": p["version"] + 1}
                    db.execute("UPDATE products SET data=? WHERE id=?", (json.dumps(updated), pid))
            tax = (subtotal + shipping + 5) // 10
            total = subtotal + shipping + tax
            if total != body.get("expectedTotalCents"):
                raise APIError(409, "Prices changed while you were shopping. Refresh your bag and review the new total.")
            order = {"id": key, "orderTimeMs": stamp(), "totalCostCents": total, "demo": True,
                     "subtotalCents": subtotal, "shippingCents": shipping, "taxCents": tax, "products": items}
            db.execute("INSERT INTO orders VALUES (?,?,?)", (key, customer["token_hash"], json.dumps(order)))
            self.store.audit(db, "order.created", key)
        self.respond(201, {"order": order})

    def import_orders(self, customer):
        """One-time migration of this browser's previous local demo orders."""
        body = self.body()
        legacy = body.get("orders")
        if not isinstance(legacy, list) or len(legacy) > 100:
            raise APIError(400, "Invalid legacy orders.")
        imported = 0
        with self.store.connect(write=True) as db:
            for old in legacy:
                if not isinstance(old, dict) or not old.get("local"):
                    continue
                try:
                    identifier = str(uuid.UUID(old.get("id", "")))
                    if db.execute("SELECT 1 FROM orders WHERE id=?", (identifier,)).fetchone():
                        continue
                    when = integer(old.get("orderTimeMs"), "Order date", 0, stamp() + 86400000)
                    total = integer(old.get("totalCostCents"), "Historical total", 0, 1_000_000_000)
                    entries = old.get("products", [])
                    if not isinstance(entries, list) or not 1 <= len(entries) <= 100:
                        continue
                    items, seen = [], set()
                    for entry in entries:
                        if not isinstance(entry, dict):
                            raise APIError(400, "Invalid legacy item.")
                        pid = text(entry.get("productId"), "Product", 80)
                        if pid in seen:
                            raise APIError(400, "Duplicate legacy item.")
                        seen.add(pid)
                        row = db.execute("SELECT data FROM products WHERE id=?", (pid,)).fetchone()
                        if not row:
                            raise APIError(400, "Unknown legacy item.")
                        items.append({"productId": pid, "quantity": integer(entry.get("quantity"), "Quantity", 1, 99),
                                      "estimatedDeliveryTimeMs": integer(entry.get("estimatedDeliveryTimeMs"), "Arrival", 0, 8_640_000_000_000),
                                      "productSnapshot": json.loads(row[0]), "status": "ordered", "version": 1,
                                      "carrier": "", "trackingNumber": "", "trackingNote": "Imported browser demo order.",
                                      "history": [{"status": "ordered", "atMs": when, "note": "Imported browser demo order."}]})
                    order = {"id": identifier, "orderTimeMs": when, "totalCostCents": total,
                             "demo": True, "imported": True, "products": items}
                    db.execute("INSERT INTO orders VALUES (?,?,?)", (identifier, customer["token_hash"], json.dumps(order)))
                    imported += 1
                except (APIError, ValueError, TypeError):
                    continue
            if imported:
                self.store.audit(db, "orders.imported", str(imported))
        self.respond(200, {"imported": imported})


def build_server(host="127.0.0.1", port=8010, store_dir=None):
    server = ThreadingHTTPServer((host, port), Handler)
    server.store = Store(store_dir or ROOT / ".store")
    server.https = os.environ.get("FORMA_HTTPS") == "1"
    scheme = "https" if server.https else "http"
    configured = os.environ.get("FORMA_PUBLIC_ORIGIN")
    if configured:
        origin = urlsplit(configured)
        if origin.scheme != scheme or not origin.netloc:
            raise ValueError("FORMA_PUBLIC_ORIGIN must match the configured HTTP/HTTPS scheme.")
        server.allowed_hosts = {origin.netloc}
    else:
        server.allowed_hosts = {f"127.0.0.1:{server.server_port}", f"localhost:{server.server_port}"}
    return server


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run the Forma store and admin area.")
    parser.add_argument("--port", type=int, default=8010)
    parser.add_argument("--reset-admin-password", action="store_true", help="Set a new password in the local terminal and revoke admin sessions.")
    args = parser.parse_args()
    if args.reset_admin_password:
        store = Store(ROOT / ".store")
        first = getpass.getpass("New admin password (15-128 characters): ")
        second = getpass.getpass("Confirm new password: ")
        try:
            validate_password(first)
            if first != second:
                raise APIError(400, "Passwords do not match.")
        except APIError as error:
            parser.error(error.message)
        with store.connect(write=True) as db:
            salt = secrets.token_hex(16)
            db.execute("UPDATE admin SET salt=?,password_hash=? WHERE id=1", (salt, password_hash(first, salt)))
            db.execute("DELETE FROM sessions WHERE kind='admin'")
            store.audit(db, "admin.password_reset", "admin")
        (store.folder / "admin-access.txt").unlink(missing_ok=True)
        print("Password reset. All admin sessions have been signed out.")
        raise SystemExit(0)
    server = build_server(port=args.port)
    print(f"Forma: http://127.0.0.1:{args.port}\nAdmin: http://127.0.0.1:{args.port}/admin", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
