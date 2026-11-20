import { products, deliveryFee } from "../src/catalog.js";
import { subtotal, validLine } from "../src/cart.js";

const json = (value, status = 200) =>
  Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
const fail = (message, status = 400) => json({ error: message }, status);
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

function orderData(data) {
  if (
    !Array.isArray(data?.items) ||
    !data.items.length ||
    data.items.length > 50 ||
    !data.items.every(validLine)
  )
    return null;
  const items = data.items.map(({ id, variant, qty }) => ({
    id,
    variant,
    qty,
    price: products.find((p) => p.id === id).price,
  }));
  if (new Set(items.map((i) => i.id + ":" + i.variant)).size !== items.length)
    return null;
  const { method } = data;
  const trim = (key) => (typeof data[key] === "string" ? data[key].trim() : "");
  const name = trim("name"),
    email = trim("email"),
    address = method === "courier" ? trim("address") : "";
  if (
    !name ||
    name.length > 100 ||
    email.length > 200 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  )
    return null;
  if (
    !["pickup", "courier"].includes(method) ||
    (method === "courier" && (!address || address.length > 300))
  )
    return null;
  return {
    name,
    email,
    method,
    address,
    items,
    total: subtotal(items) + deliveryFee(method),
  };
}
function receipt(row) {
  const data = JSON.parse(row.payload);
  return {
    id: row.id,
    status: row.status,
    total: data.total,
    method: data.method,
    items: data.items,
  };
}

// The opaque order ID is a bearer capability. Responses omit contact details.
export async function api(req, store) {
  const path = new URL(req.url).pathname;
  if (path === "/api/orders" && req.method === "POST") {
    const key = req.headers.get("Idempotency-Key") || "";
    if (!uuid.test(key)) return fail("Некорректный ключ заказа.");
    const data = orderData(await req.json().catch(() => null));
    if (!data) return fail("Проверьте состав заказа и данные доставки.");
    const payload = JSON.stringify(data);
    const row = await store.insert(crypto.randomUUID(), key, payload);
    if (row.payload !== payload)
      return fail("Данные заказа изменились. Повторите оформление.", 409);
    return json(receipt(row), 201);
  }
  const parts = path.split("/");
  if (parts[2] === "orders" && uuid.test(parts[3] || "")) {
    const id = parts[3];
    if (parts.length === 5 && parts[4] === "pay-demo" && req.method === "POST")
      await store.pay(id);
    else if (parts.length !== 4 || req.method !== "GET")
      return fail("Страница не найдена.", 404);
    const row = await store.get(id);
    return row ? json(receipt(row)) : fail("Заказ не найден.", 404);
  }
  return fail("Страница не найдена.", 404);
}
