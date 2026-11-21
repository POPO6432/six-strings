from django.conf import settings
from django.urls import path, re_path
from django.views.static import serve
from . import views

urlpatterns = [
    path("api/session", views.session),
    path("api/auth/register", views.account, {"action": "register"}),
    path("api/auth/login", views.account, {"action": "login"}),
    path("api/auth/logout", views.sign_out),
    path("api/cart", views.change_cart),
    path("api/orders", views.orders),
    path("api/orders/<uuid:order_id>", views.detail),
    path("api/orders/<uuid:order_id>/pay-demo", views.pay),
    path("", serve, {"path": "index.html", "document_root": settings.CLIENT_DIR}),
    re_path(r"^(?P<path>(?:assets|images)/.+|pick\.svg)$", serve,
            {"document_root": settings.CLIENT_DIR}),
]
