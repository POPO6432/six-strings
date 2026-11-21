import products from "./products.json";
export { products };
export const findProduct = (id) => products.find((p) => p.id === id);
export const money = (n) => new Intl.NumberFormat("ru-RU").format(n) + " ₽";
export const deliveryFee = (method) => (method === "courier" ? 500 : 0);
