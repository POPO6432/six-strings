import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { money } from "./catalog.js";

export async function request(path, options = {}) {
  const response = await fetch(path, { ...options, cache: "no-store" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(
      data.error || "Не удалось выполнить запрос. Попробуйте ещё раз.",
    );
    error.status = response.status;
    throw error;
  }
  return data;
}

export function Auth({ submit }) {
  const [register, setRegister] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function send(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await submit(
        register ? "register" : "login",
        Object.fromEntries(new FormData(event.currentTarget)),
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="wrap inner account-page">
      <h1>{register ? "Регистрация" : "Вход в магазин"}</h1>
      <p>В аккаунте сохраняются ваша корзина и заказы.</p>
      <form key={String(register)} className="account-form" onSubmit={send}>
        {register && (
          <label>
            Имя
            <input
              name="name"
              autoComplete="given-name"
              maxLength="100"
              required
            />
          </label>
        )}
        <label>
          Электронная почта
          <input
            name="email"
            type="email"
            autoComplete="username"
            maxLength="150"
            required
          />
        </label>
        <label>
          Пароль
          <input
            type="password"
            name="password"
            autoComplete={register ? "new-password" : "current-password"}
            minLength={register ? 8 : 1}
            maxLength="128"
            required
          />
        </label>
        {register && <small>От 8 до 128 символов.</small>}
        {error && <p role="alert">{error}</p>}
        <button disabled={busy} className="button bright">
          {register ? "Создать аккаунт" : "Войти"}
        </button>
      </form>
      <button
        className="account-switch"
        disabled={busy}
        onClick={() => {
          setRegister(!register);
          setError("");
        }}
      >
        {register ? "Уже есть аккаунт? Войти" : "Создать новый аккаунт"}
      </button>
    </section>
  );
}

export function Profile({ user, signOut }) {
  const [orders, setOrders] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    request("/api/orders")
      .then((data) => {
        if (active) setOrders(data.orders);
      })
      .catch((err) => {
        if (active) setError(err.message);
      });
    return () => {
      active = false;
    };
  }, [user.id]);
  return (
    <section className="wrap inner account-page">
      <h1>Мой аккаунт</h1>
      <p>
        {user.name} · {user.email}
      </p>
      <button className="account-switch" onClick={signOut}>
        Выйти из аккаунта
      </button>
      <h2>Мои заказы</h2>
      {error && <p role="alert">{error}</p>}
      {orders?.map((o) => (
        <Link key={o.id} className="summary-row" to={"/order/" + o.id}>
          <span>
            Заказ № {o.id.slice(0, 8).toUpperCase()}
            <small>
              {o.status === "demo_paid"
                ? "Демо-оплата подтверждена"
                : "Ожидает демо-оплаты"}
            </small>
          </span>
          <b>{money(o.total)}</b>
        </Link>
      ))}
      {orders?.length === 0 && <p>Заказов пока нет.</p>}
      {orders === null && !error && <p>Загружаем заказы…</p>}
    </section>
  );
}
