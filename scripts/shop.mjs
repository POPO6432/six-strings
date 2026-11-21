import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { build } from "vite";

const windows = process.platform === "win32";
const local = join(".venv", windows ? "Scripts/python.exe" : "bin/python");
const python = existsSync(local) ? local : windows ? "python" : "python3";
const mode = process.argv[2];
function manage(...args) {
  const result = spawnSync(python, ["manage.py", ...args], {
    stdio: "inherit",
  });
  if (result.error) console.error(result.error.message);
  if (result.status !== 0) process.exit(result.status ?? 1);
}
if (mode === "test") {
  manage("test", "server");
} else {
  const port = process.env.PORT || "5173";
  manage("migrate", "--noinput");
  let watcher;
  if (mode === "dev") {
    watcher = await build({ build: { outDir: "dist/client", watch: {} } });
    await new Promise((resolve, reject) => {
      watcher.on("event", (event) => {
        if (event.code === "END") resolve();
        if (event.code === "ERROR") reject(event.error);
      });
    });
  } else if (!existsSync("dist/client/index.html")) {
    console.error("Сначала выполните npm run build.");
    process.exit(1);
  }
  const server = spawn(
    python,
    [
      "manage.py",
      "runserver",
      "127.0.0.1:" + port,
      ...(mode === "dev" ? [] : ["--noreload"]),
    ],
    { stdio: "inherit" },
  );
  for (const signal of ["SIGINT", "SIGTERM"])
    process.on(signal, () => server.kill(signal));
  server.once("exit", async (code) => {
    if (watcher) await watcher.close();
    process.exitCode = code ?? 0;
  });
}
