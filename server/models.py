import uuid
from django.conf import settings
from django.db import models


class CartItem(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    product_id = models.CharField(max_length=64)
    variant = models.CharField(max_length=120)
    qty = models.PositiveSmallIntegerField()

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["user", "product_id", "variant"], name="unique_cart_variant"),
            models.CheckConstraint(condition=models.Q(qty__gte=1, qty__lte=99), name="cart_qty_1_to_99"),
        ]


class Order(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    request_key = models.UUIDField()
    payload = models.JSONField()
    status = models.CharField(max_length=12, default="pending")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["user", "request_key"], name="unique_user_order_key")]
