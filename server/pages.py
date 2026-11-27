"""Страницы магазина: Django обрабатывает формы и возвращает готовый HTML."""
import uuid

from django.contrib.auth import logout
from django.contrib.auth.decorators import login_required
from django.core import signing
from django.db.models import Sum
from django.http import Http404
from django.shortcuts import get_object_or_404, redirect, render
from django.utils.http import url_has_allowed_host_and_scheme
from django.views.decorators.http import require_GET, require_POST, require_http_methods

from .models import CartItem, Order
from .views import PRODUCTS, Invalid, adjust_cart, authenticate_account, cart_rows, create_order, pay_order


# Общий счётчик корзины для всех страниц
def page(request, template, status=200, **context):
    count = 0
    if request.user.is_authenticated:
        count = CartItem.objects.filter(user=request.user).aggregate(total=Sum("qty"))["total"] or 0
    response = render(request, template, {**context, "cart_count": count}, status=status)
    response["Cache-Control"] = "private, no-store"
    return response


# Проверяем, что в открытой форме тот же аккаунт
def owner_matches(request):
    return request.POST.get("owner") == str(request.user.pk)


def problem(request, message, status=400):
    return page(request, "problem.html", message=message, status=status)


# GET — каталог и фильтр по категории
@require_GET
def home(request):
    products = list(PRODUCTS.values())
    categories = list(dict.fromkeys(p["category"] for p in products))
    selected = request.GET.get("category", "")
    if selected in categories:
        products = [p for p in products if p["category"] == selected]
    else:
        selected = ""
    return page(request, "home.html", products=products, categories=categories, selected=selected, total=len(PRODUCTS))


# GET — карточка выбранного товара
@require_GET
def product(request, product_id):
    item = PRODUCTS.get(product_id)
    if not item:
        raise Http404
    return page(request, "product.html", product=item)


# GET — форма входа или регистрации, POST — отправка данных
@require_http_methods(["GET", "POST"])
def auth(request, action):
    following = request.POST.get("next", request.GET.get("next", ""))
    if not url_has_allowed_host_and_scheme(following, allowed_hosts={request.get_host()}):
        following = ""
    if request.user.is_authenticated:
        return redirect(following or "profile")
    message = ""
    status = 200
    if request.method == "POST":
        try:
            authenticate_account(request, action, request.POST)
            return redirect(following or "profile")
        except Invalid as exc:
            message, status = str(exc), exc.status
    return page(request, "auth.html", register=action == "register", following=following,
                error=message, values=request.POST, status=status)


# GET — просмотр профиля и заказов
@login_required
@require_GET
def profile(request):
    return page(request, "profile.html", orders=Order.objects.filter(user=request.user).order_by("-created_at"))


# POST — выход из аккаунта
@login_required
@require_POST
def leave(request):
    if not owner_matches(request):
        return problem(request, "Аккаунт изменился. Обновите страницу.", 409)
    logout(request)
    return redirect("home")


# Расчёт стоимости корзины
def basket(rows):
    lines = []
    for row in rows:
        item = PRODUCTS[row["id"]]
        lines.append({**row, "product": item, "sum": item["price"] * row["qty"]})
    return lines, sum(line["sum"] for line in lines)


# GET — просмотр корзины, POST — изменение количества
@login_required
@require_http_methods(["GET", "POST"])
def cart(request):
    if request.method == "POST":
        if not owner_matches(request):
            return problem(request, "Аккаунт изменился. Обновите корзину.", 409)
        try:
            delta = int(request.POST.get("delta", ""))
            adjust_cart(request.user, {**request.POST.dict(), "delta": delta})
        except ValueError:
            return problem(request, "Некорректное количество.")
        except Invalid as exc:
            return problem(request, str(exc), exc.status)
        return redirect("cart")
    lines, total = basket(cart_rows(request.user))
    return page(request, "cart.html", lines=lines, total=total)


# GET — форма оформления, POST — создание заказа
@login_required
@require_http_methods(["GET", "POST"])
def checkout(request):
    values = request.POST if request.method == "POST" else {
        "name": request.user.first_name, "email": request.user.email,
    }
    method = request.GET.get("method", "pickup")
    message, status = "", 200
    if request.method == "POST":
        if not owner_matches(request):
            return problem(request, "Аккаунт изменился. Обновите страницу.", 409)
        try:
            snapshot = signing.loads(request.POST.get("snapshot", ""), salt="shop.checkout")
            if snapshot["user"] != request.user.pk:
                raise Invalid("Аккаунт изменился.", 409)
            method = snapshot["method"]
            order = create_order(request.user, uuid.UUID(snapshot["key"]), {
                **values.dict(), "method": method, "items": snapshot["items"]
            })
            return redirect("order", order_id=order.pk)
        except signing.BadSignature:
            return problem(request, "Откройте форму оформления заново.")
        except Invalid as exc:
            message, status = str(exc), exc.status
    rows = cart_rows(request.user)
    lines, subtotal = basket(rows)
    method = "courier" if method == "courier" else "pickup"
    # Подписываем состав корзины и способ получения
    token = signing.dumps({"user": request.user.pk, "key": str(uuid.uuid4()),
                           "items": rows, "method": method}, salt="shop.checkout")
    return page(request, "checkout.html", lines=lines, method=method, values=values,
                snapshot=token, total=subtotal + (500 if method == "courier" else 0),
                error=message, status=status)


# GET — просмотр заказа, POST — оплата заказа
@login_required
@require_http_methods(["GET", "POST"])
def order(request, order_id):
    if request.method == "POST":
        if not owner_matches(request):
            return problem(request, "Аккаунт изменился.", 409)
        try:
            pay_order(request.user, order_id)
        except Invalid as exc:
            return problem(request, str(exc), exc.status)
        return redirect("order", order_id=order_id)
    # Заказ доступен только его владельцу
    purchase = get_object_or_404(Order, pk=order_id, user=request.user)
    return page(request, "order.html", order=purchase)
