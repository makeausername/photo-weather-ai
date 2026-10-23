import { startLocalDatabase } from "./free-local-db.mjs";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
for (const packageName of ["shared", "geo"]) {
const buildPackage = spawnSync(
  process.execPath,
  ["node_modules/typescript/bin/tsc", "-p", `packages/${packageName}/tsconfig.build.json`],
  { cwd: root, stdio: "inherit" },
);
if (buildPackage.status !== 0) process.exit(buildPackage.status ?? 1);
}
if (existsSync(path.join(root, ".env.local"))) {
  const localEnv = parseEnv(
    readFileSync(path.join(root, ".env.local"), "utf8").replace(/^\uFEFF/, ""),
  );
  for (const [key, value] of Object.entries(localEnv)) process.env[key] ??= value;
}
const env = {
  ...process.env,
  ...startLocalDatabase(),
  NODE_ENV: "development",
  LOCAL_MAP_PREVIEW: "true",
  LOCAL_ADMIN_PREVIEW: "false",
  ADMIN_AUTH_BYPASS: "false",
  DATABASE_ENABLED: "true",
  HOST: "127.0.0.1",
  PORT: "4101",
  API_PORT: "4101",
  API_BASE_URL: "http://127.0.0.1:4101",
  NEXT_PUBLIC_API_BASE_URL: "/api/service",
  NEXT_DIST_DIR: ".next-free",
  ENABLE_ASTRO_SERVICE: process.env.FREE_LOCAL_ASTRO === "true" ? "true" : "false",
  OPEN_METEO_ENABLED: "true",
  OPEN_METEO_MODEL_LIST: "best_match,gfs_seamless",
  OPEN_METEO_MODE: "free",
  OPEN_METEO_API_KEY: "",
  OPEN_METEO_BASE_URL: "https://api.open-meteo.com",
  OPEN_METEO_CUSTOMER_ENDPOINT: "",
  OPEN_METEO_MODEL_LIST_LIMIT: "2",
  WEATHER_PROVIDER: "open_meteo",
  WEATHER_PROVIDER_MODE: "real",
};
const api = spawn(process.execPath, ["--import", "tsx", "apps/api/src/index.ts"], {
  cwd: root,
  env,
  stdio: "inherit",
});
const web = spawn(
  process.execPath,
  ["node_modules/next/dist/bin/next", "dev", "-p", "3100", "-H", "127.0.0.1"],
  { cwd: path.join(root, "apps/web"), env, stdio: "inherit" },
);
function stop() {
  api.kill();
  web.kill();
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
api.on("error", (error) => {
  console.error(error.message);
  stop();
});
web.on("error", (error) => {
  console.error(error.message);
  stop();
});
api.on("exit", (code) => {
  if (code) {
    console.error(`API exited (${code})`);
    stop();
    process.exitCode = code;
  }
});
web.on("exit", (code) => {
  if (code) {
    console.error(`Web exited (${code})`);
    stop();
    process.exitCode = code;
  }
});
console.log("本地免费版：http://127.0.0.1:3100；真实后台：/admin（独立本地数据库，仅监听本机，不部署）");
