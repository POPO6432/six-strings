from django.conf import settings
from django.urls import path, re_path
from django.views.static import serve
from . import pages, views

urlpatterns = [
    path("api/session", views.session),
    path("api/auth/register", views.account, {"action": "register"}),
    path("api/auth/login", views.account, {"action": "login"}),
    path("api/auth/logout", views.sign_out),
    path("api/cart", views.change_cart),
    path("api/orders", views.orders),
    path("api/orders/<uuid:order_id>", views.detail),
    path("api/orders/<uuid:order_id>/pay-demo", views.pay),
    path("", pages.home, name="home"),
    path("product/<slug:product_id>/", pages.product, name="product"),
    path("login/", pages.auth, {"action": "login"}, name="login"),
    path("register/", pages.auth, {"action": "register"}, name="register"),
    path("logout/", pages.leave, name="logout"),
    path("account/", pages.profile, name="profile"),
    path("cart/", pages.cart, name="cart"),
    path("checkout/", pages.checkout, name="checkout"),
    path("order/<uuid:order_id>/", pages.order, name="order"),
    re_path(r"^(?P<path>images/[a-z0-9-]+\.webp|pick\.svg|style\.css)$", serve,
            {"document_root": settings.PUBLIC_DIR}),
]
