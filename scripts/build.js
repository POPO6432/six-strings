import { build } from "vite";
import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative, sep } from "node:path";
await build({ build: { outDir: "dist/client", emptyOutDir: true } });
const assets = {};
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css",
  ".js": "text/javascript",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
};
async function collect(folder) {
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const path = join(folder, entry.name);
    if (entry.isDirectory()) await collect(path);
    else
      assets["/" + relative("dist/client", path).split(sep).join("/")] = [
        types[extname(path)],
        (await readFile(path)).toString("base64"),
      ];
  }
}
await collect("dist/client");
await build({
  publicDir: false,
  plugins: [
    {
      name: "store-assets",
      resolveId(id) {
        if (id === "virtual:store-assets") return "\0store-assets";
      },
      load(id) {
        if (id === "\0store-assets")
          return "export const assets = " + JSON.stringify(assets);
      },
    },
  ],
  build: {
    outDir: "dist/server",
    emptyOutDir: true,
    ssr: "server/worker.js",
    rollupOptions: { output: { entryFileNames: "index.js" } },
  },
});
