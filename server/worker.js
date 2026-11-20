import { api } from "./api.js";
import { cloudStore } from "./storage.js";
import { assets } from "virtual:store-assets";

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (path.startsWith("/api/")) {
      try {
        return await api(request, cloudStore(env.DB));
      } catch {
        return Response.json(
          { error: "Не удалось сохранить или загрузить заказ." },
          { status: 503 },
        );
      }
    }
    const file = assets[path === "/" ? "/index.html" : path];
    if (!file || !["HEAD", "GET"].includes(request.method))
      return new Response("Не найдено", { status: 404 });
    return new Response(
      request.method === "HEAD"
        ? null
        : Uint8Array.from(atob(file[1]), (c) => c.charCodeAt(0)),
      { headers: { "Content-Type": file[0] } },
    );
  },
};
