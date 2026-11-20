import { findProduct } from "./catalog.js";

export function validLine(line) {
  return (
    !!line &&
    findProduct(line.id)?.variants.includes(line.variant) &&
    Number.isInteger(line.qty) &&
    line.qty > 0 &&
    line.qty <= 99
  );
}
export function restore(raw) {
  try {
    const rows = JSON.parse(raw);
    return Array.isArray(rows) ? rows.filter(validLine) : [];
  } catch {
    return [];
  }
}
export function change(cart, id, variant, delta) {
  if (!Number.isInteger(delta) || !findProduct(id)?.variants.includes(variant))
    return cart;
  const existing = cart.find((row) => row.id === id && row.variant === variant);
  if (!existing)
    return delta > 0
      ? [...cart, { id, variant, qty: Math.min(delta, 99) }]
      : cart;
  return cart
    .map((row) =>
      row === existing ? { ...row, qty: Math.min(99, row.qty + delta) } : row,
    )
    .filter((row) => row.qty > 0);
}
export const subtotal = (cart) =>
  cart.reduce((sum, row) => sum + row.qty * findProduct(row.id).price, 0);
