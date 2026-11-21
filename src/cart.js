import { findProduct } from "./catalog.js";

export const subtotal = (cart) =>
  cart.reduce((sum, row) => sum + row.qty * findProduct(row.id).price, 0);
