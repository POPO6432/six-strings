import { createServer } from "node:http";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync } from "node:fs";
import { Readable } from "node:stream";
import { createServer as createVite, preview } from "vite";
import { api } from "./api.js";
import { queries } from "./storage.js";

mkdirSync("data", { recursive: true });
const db = new DatabaseSync("data/shop.sqlite");
db.exec(readFileSync("drizzle/0000_orders.sql", "utf8"));
const store = {
  insert(id, key, payload) {
    db.prepare(queries.add).run(id, key, payload);
    return db.prepare(queries.byKey).get(key);
  },
  get: (id) => db.prepare(queries.byId).get(id),
  pay: (id) => db.prepare(queries.pay).run(id),
};
async function handle(req, res, next) {
  if (!req.url.startsWith("/api/")) return next();
  try {
    const options = { method: req.method, headers: req.headers };
    if (req.method === "POST")
      Object.assign(options, { body: Readable.toWeb(req), duplex: "half" });
    const result = await api(
      new Request(new URL(req.url, "http://localhost"), options),
      store,
    );
    res.writeHead(result.status, Object.fromEntries(result.headers));
    res.end(await result.text());
  } catch {
    res.writeHead(503, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({ error: "Не удалось сохранить или загрузить заказ." }),
    );
  }
}
const port = Number(process.env.PORT || 5173);
if (process.argv.includes("--built")) {
  const app = await preview({
    build: { outDir: "dist/client" },
    preview: { host: "127.0.0.1", port, strictPort: true },
    plugins: [
      {
        name: "shop-api",
        configurePreviewServer(server) {
          server.middlewares.use(handle);
        },
      },
    ],
  });
  app.printUrls();
} else {
  const http = createServer();
  const vite = await createVite({
    server: {
      middlewareMode: true,
      hmr: { server: http },
      watch: { usePolling: true },
    },
  });
  http.on("request", (req, res) =>
    handle(req, res, () => vite.middlewares(req, res)),
  );
  http.listen(port, "127.0.0.1", () =>
    console.log("Шесть струн · http://127.0.0.1:" + port),
  );
}
