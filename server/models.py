import uuid
from django.conf import settings
from django.db import models


# Одна строка корзины хранит один вариант товара у покупателя.
class CartItem(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    product_id = models.CharField(max_length=64)
    variant = models.CharField(max_length=120)
    qty = models.PositiveSmallIntegerField()

    class Meta:
        constraints = [
            # Повторное добавление того же варианта меняет количество.
            models.UniqueConstraint(fields=["user", "product_id", "variant"], name="unique_cart_variant"),
            models.CheckConstraint(condition=models.Q(qty__gte=1, qty__lte=99), name="cart_qty_1_to_99"),
        ]


# Заказ сохраняет владельца, состав покупки и статус оплаты.
class Order(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    # Ключ связывает повторную отправку формы с прежним заказом.
    request_key = models.UUIDField()
    payload = models.JSONField()
    status = models.CharField(max_length=12, default="pending")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["user", "request_key"], name="unique_user_order_key")]
