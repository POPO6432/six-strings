import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { api } from "../server/api.js";
import { cloudStore } from "../server/storage.js";
import { change, restore, subtotal } from "../src/cart.js";

const first = { id: "picks", variant: "0,60 мм", qty: 2 };
const order = {
  items: [first],
  name: "Анна",
  email: "test@example.com",
  method: "courier",
  address: "Тестовый город, дом 1",
};
test("Одинаковые варианты объединяются, разные толщины остаются отдельными строками", () => {
  let cart = change([], first.id, first.variant, 1);
  cart = change(cart, first.id, first.variant, 1);
  cart = change(cart, first.id, "1,00 мм", 1);
  assert.deepEqual(cart[0], first);
  assert.equal(cart.length, 2);
  assert.equal(subtotal(cart), 1350);
  assert.equal(change(cart, first.id, first.variant, -2).length, 1);
  assert.deepEqual(restore(JSON.stringify(cart)), cart);
});
test("Повреждённая корзина, удалённые позиции и неверное количество", () => {
  for (const value of [
    "bad",
    "null",
    "{}",
    "[null]",
    JSON.stringify([
      { ...first, qty: -1 },
      { ...first, id: "missing" },
    ]),
  ])
    assert.deepEqual(restore(value), []);
  assert.equal(change([first], first.id, first.variant, 100)[0].qty, 99);
});
function database() {
  const db = new DatabaseSync(":memory:");
  db.exec(
    readFileSync(
      new URL("../drizzle/0000_orders.sql", import.meta.url),
      "utf8",
    ),
  );
  // Exercise the hosted adapter with actual SQLite statements.
  return cloudStore({
    prepare(sql) {
      return {
        bind(...args) {
          const statement = db.prepare(sql);
          return {
            first: () => statement.get(...args),
            run: () => statement.run(...args),
            batch: () => ({ results: statement.all(...args) }),
          };
        },
      };
    },
    batch: (list) => list.map((item) => item.batch()),
  });
}
const post = (data, key) =>
  new Request("http://test/api/orders", {
    method: "POST",
    headers: { "Idempotency-Key": key },
    body: JSON.stringify(data),
  });
test("Цена с сервера, повтор заказа, оплата и чтение квитанции", async () => {
  const db = database(),
    key = crypto.randomUUID();
  const response = await api(post({ ...order, total: 1 }, key), db);
  assert.equal(response.status, 201);
  const saved = await response.json();
  assert.equal(saved.total, 1400);
  assert.equal(saved.status, "pending");
  assert.equal((await (await api(post(order, key), db)).json()).id, saved.id);
  assert.equal(
    (await api(post({ ...order, method: "pickup" }, key), db)).status,
    409,
  );
  const url = "http://test/api/orders/" + saved.id;
  for (let i = 0; i < 2; i++)
    assert.equal(
      (
        await (
          await api(new Request(url + "/pay-demo", { method: "POST" }), db)
        ).json()
      ).status,
      "demo_paid",
    );
  const result = await (await api(new Request(url), db)).json();
  assert.equal(result.status, "demo_paid");
  assert.equal(result.email, undefined);
});
test("Самовывоз бесплатный, для курьера нужен адрес, некорректные позиции отклоняются", async () => {
  const db = database();
  const valid = await api(
    post({ ...order, method: "pickup", address: "" }, crypto.randomUUID()),
    db,
  );
  assert.equal((await valid.json()).total, 900);
  for (const invalid of [
    { items: [] },
    { address: "   " },
    { method: "unknown" },
    { email: "bad" },
    { items: [{ ...first, qty: 0 }] },
    { items: [{ ...first, variant: "M" }] },
    { items: [first, first] },
  ]) {
    assert.equal(
      (await api(post({ ...order, ...invalid }, crypto.randomUUID()), db))
        .status,
      400,
    );
  }
});
