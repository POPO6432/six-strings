import uuid
from django.contrib.auth import get_user_model
from django.test import Client, TestCase
from .models import CartItem, Order


class ShopTests(TestCase):
    password = "guitar-practice-2026"

    def setUp(self):
        self.alice, self.a = self.register("alice@example.org")
        self.bob, self.b = self.register("bob@example.org")
        self.line = {"id": "picks", "variant": "0,88 мм", "qty": 2}
        self.checkout = {"items": [self.line], "name": "Покупатель",
                         "email": "buyer@example.org", "method": "courier", "address": "Тестовая 1"}

    def send(self, client, path, data, owner="", **headers):
        return client.post(path, data, content_type="application/json", HTTP_X_SHOP_USER=str(owner),
                           HTTP_X_CSRFTOKEN=client.cookies["csrftoken"].value, **headers)

    def register(self, email):
        client = Client(enforce_csrf_checks=True)
        client.get("/api/session")
        response = self.send(client, "/api/auth/register", {"name": "Имя", "email": email, "password": self.password})
        self.assertEqual(response.status_code, 201)
        return client, response.json()["user"]["id"]

    def change(self, client, owner, delta, variant="0,88 мм"):
        return self.send(client, "/api/cart", {"id": "picks", "variant": variant, "delta": delta}, owner)

    def test_login_logout_and_account_scoped_cart(self):
        self.change(self.alice, self.a, 2)
        self.assertEqual(self.bob.get("/api/session").json()["cart"], [])
        user = get_user_model().objects.get(pk=self.a)
        self.assertNotEqual(user.password, self.password)
        self.assertTrue(user.check_password(self.password))
        old_session = self.alice.cookies["sessionid"].value
        self.send(self.alice, "/api/auth/logout", {}, self.a)
        self.assertIsNone(self.alice.get("/api/session").json()["user"])
        self.assertEqual(self.change(self.alice, self.a, 1).status_code, 401)
        self.alice.cookies["sessionid"] = old_session
        self.assertIsNone(self.alice.get("/api/session").json()["user"])
        credentials = {"email": "BOB@example.org", "password": self.password}
        self.assertEqual(self.send(self.alice, "/api/auth/login", credentials).json()["cart"], [])
        self.assertEqual(self.change(self.alice, self.a, 1).status_code, 409)
        credentials["email"] = "alice@example.org"
        self.assertEqual(self.send(self.alice, "/api/auth/login", credentials).json()["cart"], [self.line])

    def test_registration_csrf_and_login_checks(self):
        form = {"email": "ALICE@example.org", "name": "А", "password": self.password}
        self.assertEqual(self.alice.post("/api/auth/register", form, content_type="application/json").status_code, 403)
        self.assertEqual(self.send(self.alice, "/api/auth/register", form).status_code, 409)
        self.assertEqual(self.send(self.alice, "/api/auth/register", {**form,"email":"bad"}).status_code, 400)
        self.assertEqual(self.send(self.alice, "/api/auth/register", {**form,"password":"123"}).status_code, 400)
        self.assertEqual(self.send(self.alice, "/api/auth/login", {**form,"password":"wrong"}).status_code, 401)

    def test_cart_validation_variants_and_independent_removal(self):
        self.change(self.alice, self.a, 2)
        self.change(self.alice, self.a, 99)
        result = self.change(self.alice, self.a, 1, "1,00 мм")
        self.assertEqual([r["qty"] for r in result.json()["cart"]], [99, 1])
        self.assertEqual(self.change(self.alice, self.a, 1, "M").status_code, 400)
        self.assertEqual(self.change(self.alice, self.a, True).status_code, 400)
        self.change(self.bob, self.b, 1)
        self.change(self.alice, self.a, -99)
        self.assertEqual(self.bob.get("/api/session").json()["cart"][0]["qty"], 1)

    def test_checkout_price_retries_and_private_payment(self):
        self.change(self.alice, self.a, 2)
        self.change(self.bob, self.b, 1)
        headers = {"HTTP_IDEMPOTENCY_KEY": str(uuid.uuid4())}
        def checkout(data):
            return self.send(self.alice, "/api/orders", data, self.a, **headers)
        result = checkout({**self.checkout, "total": 1})
        self.assertEqual(result.status_code, 201)
        order = result.json()
        self.assertEqual(order["total"], 1400)
        self.assertEqual(checkout(self.checkout).json()["id"], order["id"])
        self.assertEqual(checkout({**self.checkout, "method":"pickup"}).status_code, 409)
        self.assertEqual(Order.objects.count(), 1)
        self.assertFalse(CartItem.objects.filter(user_id=self.a).exists())
        self.assertTrue(CartItem.objects.filter(user_id=self.b).exists())
        path = "/api/orders/" + order["id"]
        self.assertEqual(self.bob.get("/api/orders").json()["orders"], [])
        self.assertEqual(self.bob.get(path).status_code, 404)
        self.assertEqual(self.send(self.bob, path+"/pay-demo", {}, self.b).status_code, 404)
        self.assertEqual(self.alice.get(path).json()["status"], "pending")
        for _ in range(2):
            self.assertEqual(self.send(self.alice, path+"/pay-demo", {}, self.a).json()["status"], "demo_paid")
        self.assertNotIn("email", self.alice.get(path).json())

    def test_invalid_and_stale_orders_leave_cart_untouched(self):
        self.change(self.alice, self.a, 1)
        def checkout(data):
            return self.send(self.alice, "/api/orders", data, self.a, HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()))
        self.assertEqual(checkout(self.checkout).status_code, 409)
        for invalid in [{"email": "bad"}, {"items": []}, {"method": []}, {"address": " "}]:
            self.assertEqual(checkout({**self.checkout, **invalid}).status_code, 400)
        self.assertFalse(Order.objects.exists())
        self.assertEqual(CartItem.objects.get(user_id=self.a).qty, 1)
        self.change(self.alice, self.a, 1)
        self.assertEqual(checkout({**self.checkout, "method": "pickup"}).json()["total"], 900)
