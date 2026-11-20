import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  HashRouter,
  Link,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { products, findProduct, money, deliveryFee } from "./catalog.js";
import { restore, change, subtotal } from "./cart.js";
import "./style.css";

const cartKey = "six-strings.cart.v1";
const groups = ["Все товары", ...new Set(products.map((p) => p.category))];
function Mark() {
  return (
    <span className="mark">
      <img alt="" src="/pick.svg" />
      ШЕСТЬ СТРУН
    </span>
  );
}
function CartIcon() {
  return (
    <svg
      width="21"
      height="21"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      aria-hidden="true"
    >
      <path d="M3 4h2l2.2 10.5h11.5L21 7H6" />
      <circle cx="9" cy="19" r="1.2" />
      <circle cx="18" cy="19" r="1.2" />
    </svg>
  );
}
function Home() {
  const [params, setParams] = useSearchParams();
  const group = groups.includes(params.get("category"))
    ? params.get("category")
    : groups[0];
  const catalog = useRef(null);
  const rows = products.filter(
    (p) => group === groups[0] || p.category === group,
  );
  useEffect(() => {
    if (params.has("catalog")) catalog.current?.scrollIntoView();
  }, [params]);
  return (
    <>
      <section className="hero" aria-labelledby="featured">
        <div className="hero-inner">
          <span className="eyebrow orange">ЭЛЕКТРОГИТАРА</span>
          <h1 id="featured">
            Volt
            <br />
            Classic S<span>.</span>
          </h1>
          <p>
            Три сингла. Корпус из ольхи.
            <br />
            Классический звук в вишнёвом цвете.
          </p>
          <Link className="button bright" to="/product/volt">
            Смотреть гитару
          </Link>
        </div>
      </section>
      <section className="catalog wrap" ref={catalog}>
        <div className="section-heading">
          <h2>Каталог</h2>
          <span>
            {rows.length} из {products.length}
          </span>
        </div>
        <div className="filters" aria-label="Категории">
          {groups.map((g) => (
            <button
              key={g}
              aria-pressed={g === group}
              onClick={() =>
                setParams(
                  g === groups[0]
                    ? { catalog: "1" }
                    : { catalog: "1", category: g },
                  { replace: true },
                )
              }
            >
              {g}
            </button>
          ))}
        </div>
        <div className="grid">
          {rows.map((p) => (
            <Link className="card" to={"/product/" + p.id} key={p.id}>
              <div className="photo">
                <img
                  src={"/images/" + p.id + ".webp"}
                  alt={p.name}
                  loading="lazy"
                />
              </div>
              <div className="type">{p.category}</div>
              <h3>{p.name}</h3>
              <strong>{money(p.price)}</strong>
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}
function Product({ item, add }) {
  const [variant, setVariant] = useState(item.variants[0]);
  return (
    <section className="wrap inner">
      <Link className="back" to="/?catalog=1">
        К каталогу
      </Link>
      <div className="detail">
        <img
          className="detail-photo"
          src={"/images/" + item.id + ".webp"}
          alt={item.name}
        />
        <div className="detail-info">
          <div className="eyebrow">{item.category}</div>
          <h1>{item.name}</h1>
          <strong className="price">{money(item.price)}</strong>
          <p>{item.description}</p>
          <fieldset>
            <legend>{item.option}</legend>
            <div className="filters">
              {item.variants.map((v) => (
                <button
                  key={v}
                  aria-pressed={variant === v}
                  onClick={() => setVariant(v)}
                >
                  {v}
                </button>
              ))}
            </div>
          </fieldset>
          <button
            className="button bright"
            onClick={() => add(item.id, variant)}
          >
            Добавить в корзину
          </button>
          <dl>
            {Object.entries(item.specs).map(([a, b]) => (
              <div key={a}>
                <dt>{a}</dt>
                <dd>{b}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}
function ProductRoute(props) {
  const item = findProduct(useParams().id);
  return item ? (
    <Product key={item.id} item={item} {...props} />
  ) : (
    <Empty title="Товар не найден" />
  );
}
function Empty({ title }) {
  return (
    <section className="wrap inner empty">
      <h1>{title}</h1>
      <Link className="button dark" to="/?catalog=1">
        Открыть каталог
      </Link>
    </section>
  );
}
function Basket({ cart, adjust, dialog }) {
  const close = () => dialog.current.close();
  return (
    <dialog
      className="drawer"
      ref={dialog}
      aria-labelledby="basket-heading"
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="drawer-content">
        <div className="section-heading">
          <h2 id="basket-heading">Корзина</h2>
          <button
            className="close"
            onClick={close}
            aria-label="Закрыть корзину"
          >
            ×
          </button>
        </div>
        {cart.length === 0 ? (
          <>
            <p>Корзина пока пуста.</p>
            <Link className="button dark" to="/?catalog=1" onClick={close}>
              Перейти в каталог
            </Link>
          </>
        ) : (
          <>
            <div className="lines">
              {cart.map((line) => {
                const p = findProduct(line.id);
                return (
                  <div className="line" key={p.id + line.variant}>
                    <img src={"/images/" + p.id + ".webp"} alt="" />
                    <div>
                      <b>{p.name}</b>
                      <small>{line.variant}</small>
                      <div className="stepper">
                        <button
                          aria-label={"Уменьшить количество " + p.name}
                          onClick={() => adjust(p.id, line.variant, -1)}
                        >
                          −
                        </button>
                        <span>{line.qty}</span>
                        <button
                          aria-label={"Увеличить количество " + p.name}
                          disabled={line.qty >= 99}
                          onClick={() => adjust(p.id, line.variant, 1)}
                        >
                          +
                        </button>
                      </div>
                    </div>
                    <div className="line-end">
                      <b>{money(p.price * line.qty)}</b>
                      <button
                        className="text-button"
                        onClick={() => adjust(p.id, line.variant, -line.qty)}
                      >
                        Удалить
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="totals">
              <span>Итого</span>
              <b>{money(subtotal(cart))}</b>
            </div>
            <Link className="button bright" to="/checkout" onClick={close}>
              Оформить заказ
            </Link>
          </>
        )}
      </div>
    </dialog>
  );
}
async function request(path, options) {
  const res = await fetch(path, options);
  const data = await res
    .json()
    .catch(() => ({ error: "Сервер временно недоступен." }));
  if (!res.ok || data.error)
    throw new Error(data.error || "Не удалось выполнить запрос.");
  return data;
}
function Checkout({ cart, complete }) {
  const [method, setMethod] = useState("pickup");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const navigate = useNavigate();
  const attempt = useRef({});
  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    const data = Object.fromEntries(new FormData(e.currentTarget));
    const body = JSON.stringify({ ...data, method, items: cart });
    if (attempt.current.body !== body)
      attempt.current = { body, key: crypto.randomUUID() };
    setBusy(true);
    setError("");
    try {
      const order = await request("/api/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": attempt.current.key,
        },
        body,
      });
      complete(cart);
      navigate("/order/" + order.id, { replace: true });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }
  if (!cart.length) return <Empty title="Корзина пуста" />;
  return (
    <section className="wrap inner">
      <Link className="back" to="/?catalog=1">
        К каталогу
      </Link>
      <h1>Оформление заказа</h1>
      <div className="checkout">
        <form onSubmit={submit}>
          <h2>Контакты</h2>
          <label>
            Имя
            <input name="name" required maxLength="100" autoComplete="name" />
          </label>
          <label>
            Электронная почта
            <input
              type="email"
              name="email"
              required
              maxLength="200"
              autoComplete="email"
            />
          </label>
          <fieldset>
            <legend>Способ получения</legend>
            {[
              ["pickup", "Самовывоз · бесплатно"],
              ["courier", "Курьер · 500 ₽"],
            ].map(([key, text]) => (
              <label key={key} className="radio">
                <input
                  type="radio"
                  checked={method === key}
                  onChange={() => setMethod(key)}
                  name="delivery"
                />
                {text}
              </label>
            ))}
          </fieldset>
          {method === "courier" && (
            <label>
              Город, улица, дом и квартира
              <input
                name="address"
                required
                maxLength="300"
                autoComplete="street-address"
              />
            </label>
          )}
          <p className="muted">
            Учебный заказ. Можно указать вымышленные контакты. Оплата и доставка
            демонстрационные.
          </p>
          {error && <p role="alert">{error}</p>}
          <button className="button bright" disabled={busy}>
            {busy ? "Сохраняем…" : "Перейти к оплате"}
          </button>
        </form>
        <aside className="summary">
          <h2>Ваш заказ</h2>
          {cart.map((l) => (
            <div className="summary-row" key={l.id + l.variant}>
              <span>
                {findProduct(l.id).name}
                <small>
                  {l.variant} · {l.qty} шт.
                </small>
              </span>
              <b>{money(l.qty * findProduct(l.id).price)}</b>
            </div>
          ))}
          <div className="summary-row">
            <span>Доставка</span>
            <b>{money(deliveryFee(method))}</b>
          </div>
          <div className="totals">
            <span>Итого</span>
            <b>{money(subtotal(cart) + deliveryFee(method))}</b>
          </div>
        </aside>
      </div>
    </section>
  );
}
function Order() {
  const { id } = useParams(),
    url = "/api/orders/" + id;
  const [order, setOrder] = useState(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    setOrder(null);
    setError("");
    request(url)
      .then((o) => {
        if (active) setOrder(o);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [url]);
  async function pay() {
    setBusy(true);
    setError("");
    try {
      setOrder(await request(url + "/pay-demo", { method: "POST" }));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const paid = order?.status === "demo_paid";
  return (
    <section className="wrap inner receipt">
      <div className="eyebrow">Учебный магазин</div>
      <h1>
        {order
          ? paid
            ? "Заказ оформлен"
            : "Демо-оплата"
          : error
            ? "Заказ недоступен"
            : "Загружаем заказ…"}
      </h1>
      {order && (
        <>
          <p>
            Заказ № {id.slice(0, 8).toUpperCase()} ·{" "}
            {order.method === "pickup" ? "Самовывоз" : "Доставка курьером"}
          </p>
          <div className="totals">
            <span>Сумма заказа</span>
            <b>{money(order.total)}</b>
          </div>
          <p>
            {paid
              ? "Демонстрационная оплата подтверждена."
              : "Подтвердите оплату в учебном режиме. Деньги с карты не списываются."}
          </p>
          {!paid && (
            <button className="button bright" onClick={pay} disabled={busy}>
              {busy ? "Подтверждаем…" : "Подтвердить демо-оплату"}
            </button>
          )}
        </>
      )}
      {error && <p role="alert">{error}</p>}
      <Link className="back" to="/?catalog=1">
        Вернуться в каталог
      </Link>
    </section>
  );
}
function Shop() {
  const [cart, setCart] = useState(() => {
    try {
      return restore(localStorage.getItem(cartKey));
    } catch {
      return [];
    }
  });
  const dialog = useRef(null),
    location = useLocation();
  useEffect(() => {
    try {
      localStorage.setItem(cartKey, JSON.stringify(cart));
    } catch {}
  }, [cart]);
  useEffect(() => {
    if (!location.search.includes("catalog=")) window.scrollTo(0, 0);
  }, [location.pathname, location.search]);
  function adjust(id, v, n) {
    setCart((c) => change(c, id, v, n));
  }
  const count = cart.reduce((s, l) => s + l.qty, 0);
  return (
    <>
      <header>
        <div className="wrap nav">
          <Link to="/" aria-label="Шесть струн — главная">
            <Mark />
          </Link>
          <nav>
            <Link className="nav-cat" to="/?catalog=1">
              Каталог
            </Link>
            <button
              className="cart-trigger"
              onClick={() => dialog.current.showModal()}
            >
              <CartIcon /> Корзина <span>{count}</span>
            </button>
          </nav>
        </div>
      </header>
      <Basket cart={cart} adjust={adjust} dialog={dialog} />
      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route
            path="/product/:id"
            element={
              <ProductRoute
                add={(id, v) => {
                  adjust(id, v, 1);
                  dialog.current.showModal();
                }}
              />
            }
          />
          <Route
            path="/checkout"
            element={
              <Checkout
                cart={cart}
                complete={(submitted) =>
                  setCart((current) =>
                    submitted.reduce(
                      (rest, line) =>
                        change(rest, line.id, line.variant, -line.qty),
                      current,
                    ),
                  )
                }
              />
            }
          />
          <Route path="/order/:id" element={<Order />} />
          <Route path="*" element={<Empty title="Страница не найдена" />} />
        </Routes>
      </main>
      <footer>
        <div className="wrap">
          <Link to="/">
            <Mark />
          </Link>
          <span>Учебный магазин гитар и оборудования</span>
        </div>
      </footer>
    </>
  );
}
createRoot(document.getElementById("root")).render(
  <HashRouter>
    <Shop />
  </HashRouter>,
);
