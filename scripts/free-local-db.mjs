import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const localDirectory = path.join(root, ".runtime", "free-local");
const dataDirectory = path.join(localDirectory, "pgdata");
const binDirectory = path.join(localDirectory, "postgres-runtime/node_modules/@embedded-postgres/windows-x64/native/bin");
const configPath = path.join(localDirectory, "database.json");
const databaseName = "photo_weather_free_local";
const databasePort = 55432;

export function assertFreeLocalDatabaseUrl(value) {
  const url = new URL(value);
  if (url.protocol !== "postgresql:" || url.hostname !== "127.0.0.1" || url.port !== String(databasePort) || url.pathname !== `/${databaseName}` || url.username !== "free_local" || url.hash || [...url.searchParams.keys()].some((key) => key !== "schema") || url.searchParams.get("schema") !== "public") {
    throw new Error("拒绝操作：仅允许本项目独立的本地免费版数据库。");
  }
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, windowsHide: true, encoding: "utf8", ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${path.basename(command)} 执行失败：${result.stderr || result.stdout}`);
  return result.stdout ?? "";
}

function pg(name, args, options) {
  return run(path.join(binDirectory, `${name}.exe`), args, options);
}

export function loadLocalDatabaseEnv() {
  if (!existsSync(configPath)) throw new Error("请先运行 npm run setup:free-local，初始化新的本地数据库。");
  const config = JSON.parse(readFileSync(configPath, "utf8"));
  assertFreeLocalDatabaseUrl(config.databaseUrl);
  if (typeof config.jwtSecret !== "string" || config.jwtSecret.length < 32) throw new Error("本地登录密钥无效。");
  return { DATABASE_URL: config.databaseUrl, DATABASE_ENABLED: "true", JWT_SECRET: config.jwtSecret, ADMIN_AUTH_BYPASS: "false" };
}

export function startLocalDatabase() {
  const env = loadLocalDatabaseEnv();
  if (!existsSync(path.join(dataDirectory, "PG_VERSION"))) throw new Error("本地数据库尚未初始化，请运行 npm run setup:free-local。");
  const status = spawnSync(path.join(binDirectory, "pg_ctl.exe"), ["-D", dataDirectory, "status"], { windowsHide: true, stdio: "ignore" });
  if (status.status !== 0) {
    pg("pg_ctl", ["-D", dataDirectory, "-l", path.join(localDirectory, "postgres.log"), "-o", `-h 127.0.0.1 -p ${databasePort}`, "-w", "-t", "30", "start"], { stdio: "ignore" });
  }
  return env;
}

export function stopLocalDatabase() {
  loadLocalDatabaseEnv();
  pg("pg_ctl", ["-D", dataDirectory, "-m", "fast", "-w", "stop"]);
  console.log("本地免费版数据库已停止，数据保留。");
}

async function setup() {
  if (!existsSync(path.join(binDirectory, "initdb.exe"))) {
    throw new Error("缺少本地 PostgreSQL。请先运行 npm install --prefix .runtime/free-local/postgres-runtime @embedded-postgres/windows-x64@17.10.0-beta.17 --ignore-scripts --no-audit --no-fund");
  }
  mkdirSync(localDirectory, { recursive: true });
  if (!existsSync(configPath)) {
    if (existsSync(dataDirectory)) throw new Error("已有数据目录但缺少本地配置，停止初始化以防覆盖。");
    const password = randomBytes(24).toString("hex");
    writeFileSync(configPath, JSON.stringify({ databaseUrl: `postgresql://free_local:${password}@127.0.0.1:${databasePort}/${databaseName}?schema=public`, jwtSecret: randomBytes(48).toString("hex") }, null, 2), { flag: "wx", mode: 0o600 });
  }
  const localEnv = loadLocalDatabaseEnv();
  const url = new URL(localEnv.DATABASE_URL);
  if (!existsSync(path.join(dataDirectory, "PG_VERSION"))) {
    const passwordFile = path.join(localDirectory, "init-password.tmp");
    writeFileSync(passwordFile, url.password, { mode: 0o600 });
    try {
      pg("initdb", ["-D", dataDirectory, "-U", "free_local", "--encoding=UTF8", "--locale=C", "--auth=scram-sha-256", `--pwfile=${passwordFile}`]);
    } finally { unlinkSync(passwordFile); }
  }
  startLocalDatabase();
  const env = { ...process.env, ...localEnv, PRISMA_GENERATE_NO_ENGINE: "", PRISMA_CLIENT_ENGINE_TYPE: "library" };
  const prismaCli = "packages/db/node_modules/prisma/build/index.js";
  if (!existsSync(path.join(localDirectory, "initialized"))) {
    run(process.execPath, [prismaCli, "generate", "--schema", "packages/db/prisma/schema.prisma"], { env, stdio: "inherit" });
  }
  const { PrismaClient } = createRequire(path.join(root, "packages/db/package.json"))("@prisma/client");
  const maintenanceUrl = new URL(localEnv.DATABASE_URL);
  maintenanceUrl.pathname = "/postgres";
  const maintenance = new PrismaClient({ datasources: { db: { url: maintenanceUrl.toString() } } });
  try {
    const rows = await maintenance.$queryRaw`SELECT 1 FROM pg_database WHERE datname=${databaseName}`;
    if (rows.length === 0) await maintenance.$executeRawUnsafe(`CREATE DATABASE ${databaseName}`);
  } finally { await maintenance.$disconnect(); }
  run(process.execPath, [prismaCli, "migrate", "deploy", "--schema", "packages/db/prisma/schema.prisma"], { env, stdio: "inherit" });
  run(process.execPath, ["--import", "tsx", "scripts/seed-free-local.ts"], { env, stdio: "inherit" });
  writeFileSync(path.join(localDirectory, "initialized"), "Local free edition initialized.\n");
  console.log("新本地数据库已就绪（127.0.0.1:55432）。账号见 .runtime/free-local/admin-login.json；不会迁移旧记录。");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  Promise.resolve().then(() => {
    if (process.argv[2] === "setup") return setup();
    if (process.argv[2] === "stop") return stopLocalDatabase();
    if (process.argv[2] === "start") { startLocalDatabase(); return; }
    throw new Error("用法：node scripts/free-local-db.mjs setup|start|stop");
  }).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
