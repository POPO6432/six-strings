import json
import uuid
from functools import wraps

from django.conf import settings
from django.contrib.auth import authenticate, get_user_model, login, logout
from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from django.db import IntegrityError, transaction
from django.http import JsonResponse
from django.middleware.csrf import get_token
from django.views.decorators.cache import never_cache
from django.views.decorators.http import require_http_methods

from .models import CartItem, Order

User = get_user_model()
# Каталог и цены загружаются из products.json по коду товара.
PRODUCTS = {p["id"]: p for p in json.loads((settings.BASE_DIR / "server/products.json").read_text())}


# Ошибка проверки содержит сообщение и HTTP-статус для ответа.
class Invalid(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.status = status


def error(message, status):
    return JsonResponse({"error": message}, status=status)


def csrf_failure(request, reason=""):
    return error("Сессия изменилась. Обновите страницу.", 403)


# Общая проверка метода запроса и доступа к закрытым адресам API.
def endpoint(*methods, private=False):
    """Check the logged-in session before handing a request to a shop operation."""
    def decorate(fn):
        @never_cache
        @require_http_methods(methods)
        @wraps(fn)
        def wrapped(request, **kwargs):
            if private and not request.user.is_authenticated:
                return error("Войдите в аккаунт.", 401)
            if private and request.method == "POST":
                if request.headers.get("X-Shop-User") != str(request.user.pk):
                    return error("Аккаунт изменился. Обновите страницу.", 409)
            try:
                return fn(request, **kwargs)
            except Invalid as exc:
                return error(str(exc), exc.status)
        return wrapped
    return decorate


# Читаем JSON из тела запроса и проверяем его формат.
def body(request):
    if request.content_type != "application/json":
        raise Invalid("Ожидается запрос JSON.", 415)
    try:
        data = json.loads(request.body)
    except (ValueError, UnicodeDecodeError):
        raise Invalid("Не удалось прочитать JSON.")
    if not isinstance(data, dict):
        raise Invalid("Ожидается объект JSON.")
    return data


# Проверяем обязательное текстовое поле и убираем пробелы по краям.
def field(data, key, limit):
    value = data.get(key)
    if not isinstance(value, str) or not value.strip() or len(value.strip()) > limit:
        raise Invalid("Проверьте поля формы.")
    return value.strip()


# Проверяем формат почты и приводим адрес к нижнему регистру.
def email_field(data, limit=150):
    email = field(data, "email", limit).lower()
    try:
        validate_email(email)
    except ValidationError:
        raise Invalid("Введите корректный email.")
    return email


# Выбираем только позиции корзины текущего покупателя.
def cart_rows(user):
    return [{"id": line.product_id, "variant": line.variant, "qty": line.qty}
            for line in CartItem.objects.filter(user=user).order_by("pk")]


# Гость получает пустую корзину, вошедший пользователь — свою.
def session_data(request):
    token = get_token(request)
    if not request.user.is_authenticated:
        return {"user": None, "cart": [], "csrf": token}
    user = request.user
    return {"user": {"id": user.pk, "email": user.email, "name": user.first_name},
            "cart": cart_rows(user), "csrf": token}


@endpoint("GET")
def session(request):
    return JsonResponse(session_data(request))


@endpoint("POST")
def account(request, action):
    authenticate_account(request, action, body(request))
    return JsonResponse(session_data(request), status=201 if action == "register" else 200)


# При регистрации создаём аккаунт, при входе проверяем пароль.
def authenticate_account(request, action, data):
    email = email_field(data)
    password = data.get("password")
    if not isinstance(password, str) or not 1 <= len(password) <= 128:
        raise Invalid("Пароль должен содержать от 1 до 128 символов.")
    if action == "register":
        name = field(data, "name", 100)
        if len(password) < 8:
            raise Invalid("Для регистрации нужен пароль от 8 символов.")
        try:
            with transaction.atomic():
                user = User.objects.create_user(username=email, email=email, password=password, first_name=name)
        except IntegrityError:
            raise Invalid("Этот email уже зарегистрирован.", 409)
    else:
        user = authenticate(request, username=email, password=password)
        if user is None:
            raise Invalid("Неверный email или пароль.", 401)
    # Связываем успешный вход с сессией браузера.
    login(request, user)


@endpoint("POST", private=True)
def sign_out(request):
    logout(request)
    return JsonResponse(session_data(request))


# Проверяем, что выбранный вариант есть у этого товара.
def product_variant(data):
    product_id, variant = data.get("id"), data.get("variant")
    product = PRODUCTS.get(product_id) if isinstance(product_id, str) else None
    if not product or variant not in product["variants"]:
        raise Invalid("Такого товара или варианта нет в каталоге.")
    return product


@endpoint("POST", private=True)
def change_cart(request):
    adjust_cart(request.user, body(request))
    return JsonResponse({"cart": cart_rows(request.user)})


# В одной транзакции изменяем количество или удаляем позицию.
@transaction.atomic
def adjust_cart(user, data):
    product = product_variant(data)
    delta = data.get("delta")
    if type(delta) is not int or not 1 <= abs(delta) <= 99:
        raise Invalid("Некорректное изменение количества.")
    key = dict(user=user, product_id=product["id"], variant=data["variant"])
    line = CartItem.objects.filter(**key).first()
    qty = min(99, (line.qty if line else 0) + delta)
    if qty > 0:
        CartItem.objects.update_or_create(**key, defaults={"qty": qty})
    elif line:
        line.delete()


# Пересчитываем сумму по ценам каталога с учётом доставки.
def order_data(data):
    method = data.get("method")
    if method not in ("pickup", "courier"):
        raise Invalid("Выберите способ получения.")
    rows = data.get("items")
    if not isinstance(rows, list) or not 1 <= len(rows) <= 50:
        raise Invalid("Проверьте состав заказа.")
    items = []
    for row in rows:
        if not isinstance(row, dict):
            raise Invalid("Некорректная позиция корзины.")
        product = product_variant(row)
        qty = row.get("qty")
        if type(qty) is not int or not 1 <= qty <= 99:
            raise Invalid("Некорректное количество.")
        items.append(dict(id=product["id"], variant=row["variant"], qty=qty, price=product["price"]))
    return dict(name=field(data, "name", 100), email=email_field(data, 200), method=method,
                address=field(data, "address", 300) if method == "courier" else "",
                items=items, total=sum(i["qty"] * i["price"] for i in items) + (500 if method == "courier" else 0))


# Для квитанции выбираем номер, статус, позиции, сумму и способ получения.
def receipt(order):
    return dict(id=order.pk, status=order.status, total=order.payload["total"],
                method=order.payload["method"], items=order.payload["items"])


@endpoint("GET", "POST", private=True)
def orders(request):
    if request.method == "GET":
        mine = Order.objects.filter(user=request.user).order_by("-created_at")
        return JsonResponse({"orders": [receipt(order) for order in mine]})
    try:
        key = uuid.UUID(request.headers.get("Idempotency-Key", ""))
    except ValueError:
        raise Invalid("Некорректный ключ заказа.")
    order = create_order(request.user, key, body(request))
    return JsonResponse(receipt(order), status=201)


# Сохраняем заказ и очищаем корзину одной транзакцией.
def create_order(user, key, data):
    payload = order_data(data)
    with transaction.atomic():
        # При повторной отправке ищем заказ по владельцу и ключу.
        existing = Order.objects.filter(user=user, request_key=key).first()
        if existing:
            if existing.payload != payload:
                raise Invalid("Данные заказа изменились.", 409)
            return existing
        snapshot = [{k: item[k] for k in ("id", "variant", "qty")} for item in payload["items"]]
        # Перед записью сверяем состав заказа с текущей корзиной.
        if cart_rows(user) != snapshot:
            raise Invalid("Корзина изменилась. Обновите страницу и проверьте заказ.", 409)
        order = Order.objects.create(user=user, request_key=key, payload=payload)
        CartItem.objects.filter(user=user).delete()
    return order


@endpoint("GET", private=True)
def detail(request, order_id):
    order = Order.objects.filter(pk=order_id, user=request.user).first()
    if not order:
        raise Invalid("Заказ не найден.", 404)
    return JsonResponse(receipt(order))


@endpoint("POST", private=True)
def pay(request, order_id):
    return JsonResponse(receipt(pay_order(request.user, order_id)))


# Подтверждаем учебную оплату только у заказа этого покупателя.
@transaction.atomic
def pay_order(user, order_id):
    order = Order.objects.filter(pk=order_id, user=user).first()
    if not order:
        raise Invalid("Заказ не найден.", 404)
    if order.status == "pending":
        order.status = "demo_paid"
        order.save(update_fields=["status"])
    return order
