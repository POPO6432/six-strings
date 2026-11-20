export const queries = {
  add: "INSERT INTO orders(id, request_key, payload) VALUES(?, ?, ?) ON CONFLICT(request_key) DO NOTHING",
  byKey: "SELECT * FROM orders WHERE request_key = ?",
  byId: "SELECT * FROM orders WHERE id = ?",
  pay: "UPDATE orders SET status = 'demo_paid' WHERE id = ? AND status = 'pending'",
};
export function cloudStore(db) {
  return {
    async insert(id, key, payload) {
      const [, result] = await db.batch([
        db.prepare(queries.add).bind(id, key, payload),
        db.prepare(queries.byKey).bind(key),
      ]);
      return result.results[0];
    },
    get: (id) => db.prepare(queries.byId).bind(id).first(),
    pay: (id) => db.prepare(queries.pay).bind(id).run(),
  };
}
