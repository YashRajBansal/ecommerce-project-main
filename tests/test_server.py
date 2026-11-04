"""Integration tests run against an isolated database and real HTTP server."""
import http.client
import json
import os
import tempfile
import threading
import unittest
import uuid
from pathlib import Path
from unittest.mock import patch

from server import Store, build_server


class Client:
    def __init__(self, port):
        self.port, self.cookies, self.csrf = port, {}, None

    def call(self, path, method="GET", body=None, csrf=True, origin=True, headers=None):
        connection = http.client.HTTPConnection("127.0.0.1", self.port, timeout=15)
        request_headers = {"Cookie": "; ".join(f"{k}={v}" for k,v in self.cookies.items())}
        if method != "GET":
            request_headers["Content-Type"] = "application/json"
            if origin:
                request_headers["Origin"] = f"http://127.0.0.1:{self.port}"
            if csrf and self.csrf:
                request_headers["X-CSRF-Token"] = self.csrf
        request_headers.update(headers or {})
        connection.request(method, path, None if body is None else json.dumps(body), request_headers)
        response = connection.getresponse()
        response_headers = response.getheaders()
        for key,value in response_headers:
            if key.lower() == "set-cookie":
                name, token = value.split(";",1)[0].split("=",1)
                self.cookies[name] = token
        payload = response.read()
        status = response.status
        connection.close()
        try:
            data = json.loads(payload)
        except (ValueError,UnicodeDecodeError):
            data = payload
        return status, data, response_headers


class ServerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        cls.password = "Test-only long password 9384!"
        with patch.dict(os.environ, {"FORMA_ADMIN_PASSWORD": cls.password}, clear=False):
            cls.server = build_server(port=0, store_dir=cls.temp.name)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()
        cls.temp.cleanup()

    def setUp(self):
        self.admin = Client(self.server.server_port)
        self.customer = Client(self.server.server_port)
        status, data, _ = self.admin.call("/api/admin/login", "POST", {"username":"admin","password":self.password})
        self.assertEqual(status,200)
        self.admin.csrf = data["csrf"]
        status, self.bootstrap, _ = self.customer.call("/api/bootstrap")
        self.assertEqual(status,200)
        self.customer.csrf = self.bootstrap["csrf"]

    def new_product(self, **changes):
        value = {"name":"Integration test product", "priceCents":1234, "category":"Home & living",
                 "image":"images/products/luxury-towel-set.jpg", "description":"A test product.",
                 "keywords":["test"], "stock":5, "active":True}
        value.update(changes)
        status, data, _ = self.admin.call("/api/admin/products", "POST", value)
        self.assertEqual(status,201,data)
        return data["product"]

    def order(self, product, quantity=2, **changes):
        subtotal=product["priceCents"]*quantity
        payload={"items":[{"productId":product["id"],"quantity":quantity,"deliveryOptionId":"1"}],
                 "expectedTotalCents":subtotal+(subtotal+5)//10,"requestId":str(uuid.uuid4())}
        payload.update(changes)
        return self.customer.call("/api/orders", "POST", payload), payload

    def test_authentication_required_for_every_admin_operation(self):
        anonymous = Client(self.server.server_port)
        for path,method in [("/api/admin/data","GET"),("/api/admin/session","GET"),
                            ("/api/admin/products","POST"),("/api/admin/products/a","PATCH"),
                            ("/api/admin/products/a","DELETE"),("/api/admin/orders/a/items/b","PATCH"),
                            ("/api/admin/password","POST")]:
            self.assertEqual(anonymous.call(path,method,{})[0],401,(path,method))
        self.assertEqual(self.customer.call("/api/admin/data")[0],401)

    def test_csrf_origin_and_host_protection(self):
        self.assertEqual(self.admin.call("/api/admin/products","POST",{},csrf=False)[0],403)
        self.assertEqual(self.admin.call("/api/admin/products","POST",{},origin=False)[0],403)
        self.assertEqual(self.admin.call("/api/admin/products","POST",{},headers={"Origin":"http://evil.example"})[0],403)
        self.assertEqual(self.admin.call("/api/admin/data",headers={"Host":"evil.example"})[0],400)
        self.assertEqual(self.customer.call("/api/orders","POST",{},csrf=False)[0],403)

    def test_private_files_not_served(self):
        for path in ["/.store/forma.sqlite3","/.store/admin-access.txt","/backend/orders.json",
                     "/server.py","/tests/test_server.py","/styles/../server.py",
                     "/styles/%2e%2e/.store/admin-access.txt","/README.md","/data/products.js"]:
            self.assertEqual(self.customer.call(path)[0],404,path)
        for path in ["/admin","/admin/","/index.html","/scripts/admin.js","/styles/admin.css"]:
            self.assertEqual(self.customer.call(path)[0],200,path)

    def test_cookie_flags_logout_and_expiry(self):
        client=Client(self.server.server_port)
        status,data,headers=client.call("/api/admin/login","POST",{"username":"admin","password":self.password})
        cookie=next(value for name,value in headers if name.lower()=="set-cookie")
        self.assertIn("HttpOnly",cookie)
        self.assertIn("SameSite=Strict",cookie)
        client.csrf=data["csrf"]
        stale=Client(self.server.server_port)
        stale.cookies=client.cookies.copy()
        self.assertEqual(client.call("/api/admin/logout","POST",{})[0],200)
        self.assertEqual(stale.call("/api/admin/data")[0],401)
        with self.server.store.connect(write=True) as db:
            db.execute("UPDATE sessions SET expires=0 WHERE token_hash=(SELECT token_hash FROM sessions WHERE csrf=?)",(self.admin.csrf,))
        self.assertEqual(self.admin.call("/api/admin/data")[0],401)

    def test_product_lifecycle_snapshots_and_persistence(self):
        p=self.new_product()
        (status,result,_),payload=self.order(p)
        self.assertEqual(status,201,result)
        order=result["order"]
        status,result,_=self.admin.call("/api/admin/data")
        current=next(x for x in result["products"] if x["id"]==p["id"])
        self.assertEqual(current["stock"],3)
        edited={**current,"priceCents":2500,"name":"A changed product"}
        status,result,_=self.admin.call("/api/admin/products/"+p["id"],"PATCH",edited)
        self.assertEqual(status,200,result)
        updated=result["product"]
        self.assertEqual(self.admin.call("/api/admin/products/"+p["id"],"PATCH",edited)[0],409)
        self.assertEqual(self.admin.call("/api/admin/products/"+p["id"],"DELETE",{"version":updated["version"]})[0],200)
        _,catalog,_=self.customer.call("/api/bootstrap")
        self.assertNotIn(p["id"],[x["id"] for x in catalog["products"]])
        historical=next(o for o in catalog["orders"] if o["id"]==order["id"])
        self.assertEqual(historical["products"][0]["productSnapshot"]["priceCents"],1234)
        self.assertEqual(historical["products"][0]["productSnapshot"]["name"],p["name"])
        reopened=Store(self.temp.name)
        with reopened.connect() as db:
            persisted=json.loads(db.execute("SELECT data FROM products WHERE id=?",(p["id"],)).fetchone()[0])
        self.assertFalse(persisted["active"])
        self.assertEqual(persisted["priceCents"],2500)
        (status,_,_),_=self.order(p)
        self.assertEqual(status,409)

    def test_order_totals_stock_and_idempotency(self):
        p=self.new_product(stock=3)
        (status,result,_),payload=self.order(p,expectedTotalCents=1)
        self.assertEqual(status,409)
        _,data,_=self.admin.call("/api/admin/data")
        self.assertEqual(next(x for x in data["products"] if x["id"]==p["id"])["stock"],3)
        (status,result,_),payload=self.order(p)
        self.assertEqual(status,201,result)
        self.assertEqual(result["order"]["totalCostCents"],2715)
        status,duplicate,_=self.customer.call("/api/orders","POST",payload)
        self.assertEqual(status,200)
        self.assertEqual(duplicate["order"]["id"],result["order"]["id"])
        (status,_,_),_=self.order(p)
        self.assertEqual(status,409)
        other=Client(self.server.server_port)
        _,other_data,_=other.call("/api/bootstrap")
        self.assertNotIn(result["order"]["id"],[o["id"] for o in other_data["orders"]])

    def test_manual_tracking_and_history(self):
        p=self.new_product(stock=None)
        (status,result,_),_=self.order(p)
        order=result["order"]
        update={"version":1,"status":"shipped","estimatedDeliveryTimeMs":1794000000000,
                "carrier":"Test carrier","trackingNumber":"TRACK-123","trackingNote":"On the way to you."}
        path=f"/api/admin/orders/{order['id']}/items/{p['id']}"
        status,result,_=self.admin.call(path,"PATCH",update)
        self.assertEqual(status,200,result)
        self.assertEqual(self.admin.call(path,"PATCH",update)[0],409)
        _,public,_=self.customer.call("/api/bootstrap")
        item=next(o for o in public["orders"] if o["id"]==order["id"])["products"][0]
        self.assertEqual(item["status"],"shipped")
        self.assertEqual(item["trackingNumber"],"TRACK-123")
        self.assertEqual(item["history"][-1]["note"],update["trackingNote"])
        self.assertEqual(len(item["history"]),2)

    def test_validation_and_password_hash_not_in_response(self):
        for changes in [{"priceCents":-1},{"priceCents":1.5},{"stock":-1},{"category":"Unknown"},
                        {"image":"javascript:alert(1)"},{"image":"../server.py"},{"image":"http://example.com/a.jpg"}]:
            base={"name":"Bad input","priceCents":100,"category":"Kitchen","image":"images/products/luxury-towel-set.jpg","keywords":[]}
            base.update(changes)
            self.assertEqual(self.admin.call("/api/admin/products","POST",base)[0],400,changes)
        _,result,_=self.admin.call("/api/admin/data")
        self.assertNotIn("password_hash",json.dumps(result))
        with self.server.store.connect() as db:
            row=db.execute("SELECT * FROM admin").fetchone()
            self.assertNotEqual(row["password_hash"],self.password)
            self.assertEqual(len(row["salt"]),32)

    def test_legacy_import_is_idempotent_and_preserves_total(self):
        p=self.bootstrap["products"][0]
        identifier=str(uuid.uuid4())
        old={"id":identifier,"local":True,"orderTimeMs":1723456800000,"totalCostCents":3506,
             "products":[{"productId":p["id"],"quantity":1,"estimatedDeliveryTimeMs":1723716000000}]}
        for expected in [1,0]:
            status,result,_=self.customer.call("/api/orders/import","POST",{"orders":[old]})
            self.assertEqual(status,200)
            self.assertEqual(result["imported"],expected)
        _,result,_=self.admin.call("/api/admin/data")
        imported=next(o for o in result["orders"] if o["id"]==identifier)
        self.assertTrue(imported["imported"])
        self.assertEqual(imported["totalCostCents"],3506)

    def test_password_change_revokes_sessions(self):
        new="A different test passphrase 582!"
        status,result,_=self.admin.call("/api/admin/password","POST",{"currentPassword":self.password,"newPassword":new})
        self.assertEqual(status,200,result)
        self.assertEqual(self.admin.call("/api/admin/data")[0],401)
        self.assertEqual(self.admin.call("/api/admin/login","POST",{"username":"admin","password":self.password})[0],401)
        status,result,_=self.admin.call("/api/admin/login","POST",{"username":"admin","password":new})
        self.assertEqual(status,200,result)
        self.admin.csrf=result["csrf"]
        self.assertEqual(self.admin.call("/api/admin/password","POST",{"currentPassword":new,"newPassword":self.password})[0],200)

    def test_password_change_supports_unicode_passphrases(self):
        new="A café passphrase with 日本語 582!"
        self.assertEqual(self.admin.call("/api/admin/password","POST",{"currentPassword":self.password,"newPassword":new})[0],200)
        status,result,_=self.admin.call("/api/admin/login","POST",{"username":"admin","password":new})
        self.assertEqual(status,200,result)
        self.admin.csrf=result["csrf"]
        self.assertEqual(self.admin.call("/api/admin/password","POST",{"currentPassword":new,"newPassword":self.password})[0],200)

    def test_z_login_rate_limit(self):
        wrong=Client(self.server.server_port)
        for _ in range(5):
            self.assertEqual(wrong.call("/api/admin/login","POST",{"username":"admin","password":"wrong"})[0],401)
        self.assertEqual(wrong.call("/api/admin/login","POST",{"username":"admin","password":self.password})[0],429)


if __name__ == "__main__":
    unittest.main()
