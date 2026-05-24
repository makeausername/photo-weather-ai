import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../../../..");
const productionScripts = [
  "scripts/install.sh",
  "scripts/update.sh",
  "scripts/status.sh",
  "scripts/backup.sh",
  "scripts/uninstall.sh",
  "scripts/reset-prod-db.sh",
] as const;

function readRepoFile(relativePath: string): string {
  return readFileSync(path.join(root, relativePath), "utf8");
}

function bashPath(relativePath: string): string {
  const resolved = path.join(root, relativePath);
  return process.platform === "win32" ? resolved.replace(/\\/g, "/") : resolved;
}

function commandAvailable(command: string, args: readonly string[]): boolean {
  try {
    execFileSync(command, [...args], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

describe("production deployment assets", () => {
  it("includes the required production compose services and private astro-service", () => {
    const compose = readRepoFile("docker-compose.prod.yml");
    for (const service of [
      "caddy:",
      "web:",
      "api:",
      "worker:",
      "astro-service:",
      "postgres:",
      "redis:",
    ]) {
      expect(compose).toContain(service);
    }

    expect(compose).toContain('"80:80"');
    expect(compose).toContain('"443:443"');
    expect(compose).toContain("POSTGRES_DB: ${POSTGRES_DB}");
    expect(compose).toContain("POSTGRES_USER: ${POSTGRES_USER}");
    expect(compose).toContain("POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}");
    expect(compose).toContain("DATABASE_URL: ${DATABASE_URL}");
    expect(compose).toContain("postgres_data:");
    expect(compose).toContain("redis_data:");
    expect(compose).toContain("caddy_data:");
    expect(compose).toContain("caddy_config:");
    expect(compose).toContain("app_uploads:");
    expect(compose).toContain("logs:");
    expect(compose).not.toContain('"4100:4100"');
  });

  it("keeps Caddy routing same-domain API traffic with a domain placeholder", () => {
    const caddyfile = readRepoFile("deploy/Caddyfile.template");
    expect(caddyfile).toContain("DOMAIN_PLACEHOLDER");
    expect(caddyfile).toContain("encode zstd gzip");
    expect(caddyfile).toContain("handle_path /api/*");
    expect(caddyfile).toContain("reverse_proxy api:4000");
    expect(caddyfile).toContain("reverse_proxy web:3000");
  });

  it("keeps the production environment template complete and secret-free", () => {
    const template = readRepoFile("deploy/env.production.template");
    for (const key of [
      "NODE_ENV=production",
      "APP_ENV=production",
      "SITE_URL=https://DOMAIN_PLACEHOLDER",
      "PUBLIC_SITE_URL=https://DOMAIN_PLACEHOLDER",
      "NEXT_PUBLIC_API_BASE_URL=https://DOMAIN_PLACEHOLDER/api",
      "POSTGRES_DB=POSTGRES_DB_PLACEHOLDER",
      "POSTGRES_USER=POSTGRES_USER_PLACEHOLDER",
      "POSTGRES_PASSWORD=POSTGRES_PASSWORD_PLACEHOLDER",
      "DATABASE_URL=",
      "REDIS_URL=",
      "JWT_SECRET=JWT_SECRET_PLACEHOLDER",
      "ADMIN_EMAIL=ADMIN_EMAIL_PLACEHOLDER",
      "ADMIN_PASSWORD=ADMIN_PASSWORD_PLACEHOLDER",
      "ADMIN_DISPLAY_NAME=ADMIN_DISPLAY_NAME_PLACEHOLDER",
      "ENABLE_ASTRO_SERVICE=true",
      "ASTRO_SERVICE_URL=http://astro-service:4100",
      "ASTRO_SERVICE_TIMEOUT_MS=45000",
      "QWEATHER_API_KEY=",
      "QWEATHER_API_HOST=",
      "AMAP_API_KEY=",
      "DEEPSEEK_API_KEY=",
      "DEEPSEEK_BASE_URL=",
      "OPEN_METEO_API_KEY=",
      "OPEN_METEO_CUSTOMER_ENDPOINT=",
    ]) {
      expect(template).toContain(key);
    }

    expect(template).not.toMatch(/sk-[A-Za-z0-9]{16,}/);
    expect(template).not.toContain("DATABASE_URL=postgresql://user:password@");
  });

  it("ignores generated production secrets and runtime artifacts", () => {
    const gitignore = readRepoFile(".gitignore");
    for (const entry of [
      ".env.production",
      "deploy/Caddyfile",
      "deploy/generated/",
      ".runtime/",
      "backups/",
      "apps/astro-service/.venv/",
      "*.backup",
      "*.log",
    ]) {
      expect(gitignore).toContain(entry);
    }
  });

  it("has the requested production Dockerfiles", () => {
    for (const relativePath of [
      "apps/web/Dockerfile",
      "apps/api/Dockerfile",
      "apps/worker/Dockerfile",
      "apps/astro-service/Dockerfile",
    ]) {
      expect(existsSync(path.join(root, relativePath))).toBe(true);
    }

    expect(readRepoFile("apps/astro-service/Dockerfile")).toContain("EXPOSE 4100");
    expect(readRepoFile("apps/astro-service/Dockerfile")).toContain("pip install --no-cache-dir");
  });

  it("does not hard-code the old production database user in deployment assets", () => {
    for (const relativePath of [
      "scripts/install.sh",
      "scripts/update.sh",
      "scripts/backup.sh",
      "scripts/reset-prod-db.sh",
      "docker-compose.prod.yml",
      "apps/api/Dockerfile",
      "apps/worker/Dockerfile",
      "deploy/env.production.template",
    ]) {
      const source = readRepoFile(relativePath);
      expect(source).not.toContain('"photo_weather"');
      expect(source).not.toContain("photo_weather:");
      expect(source).not.toContain("photo_weather_ai:photo_weather_ai@postgres");
    }
  });

  it("generates production DATABASE_URL from encoded PostgreSQL prompt values", () => {
    const installer = readRepoFile("scripts/install.sh");
    expect(installer).toContain("urllib.parse.quote");
    expect(installer).toContain('db_user_encoded="$(urlencode "${POSTGRES_USER}")"');
    expect(installer).toContain('db_password_encoded="$(urlencode "${POSTGRES_PASSWORD}")"');
    expect(installer).toContain('db_name_encoded="$(urlencode "${POSTGRES_DB}")"');
    expect(installer).toContain(
      'database_url="postgresql://${db_user_encoded}:${db_password_encoded}@postgres:5432/${db_name_encoded}?schema=public"',
    );
  });

  it("forces production Docker Compose commands to load .env.production", () => {
    for (const relativePath of productionScripts) {
      const source = readRepoFile(relativePath);
      expect(source).toContain('ENV_FILE=".env.production"');
      expect(source).toContain('COMPOSE_FILE="docker-compose.prod.yml"');
      expect(source).toContain("compose() {");
      expect(source).toContain(
        'docker_cmd compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"',
      );

      for (const line of source.split(/\r?\n/)) {
        const invokesDockerCompose = /\bdocker(?:_cmd)? compose\b/.test(line);
        const targetsProdCompose =
          line.includes("docker-compose.prod.yml") ||
          line.includes("COMPOSE_FILE") ||
          /(?:^|\s)-f(?:\s|$)/.test(line);

        if (invokesDockerCompose && targetsProdCompose) {
          expect(line).toContain("--env-file");
          expect(line).toMatch(/ENV_FILE|\.env\.production/);
        }
      }
    }

    for (const relativePath of [
      "scripts/update.sh",
      "scripts/status.sh",
      "scripts/backup.sh",
      "scripts/uninstall.sh",
      "scripts/reset-prod-db.sh",
    ]) {
      const source = readRepoFile(relativePath);
      expect(source).toContain('if [[ ! -f "${ENV_FILE}" ]]; then');
      expect(source).toContain("未找到 .env.production，请先运行 bash scripts/install.sh");
    }
  });

  it("validates the production compose config before installer compose operations", () => {
    const installer = readRepoFile("scripts/install.sh");
    expect(installer).toContain("validate_compose_config");
    expect(installer).toContain('compose config > "${compose_check}" 2> "${compose_err}"');
    expect(installer).toContain("variable is not set");
    expect(installer).toContain("compose ps");
  });

  it("keeps installer safeguards for old PostgreSQL volumes and polished interaction", () => {
    const installer = readRepoFile("scripts/install.sh");
    for (const expected of [
      "逐光天气 一键部署安装程序",
      'section 1 "环境检查"',
      'section 2 "域名配置"',
      'section 3 "数据库配置"',
      'section 4 "管理员账号"',
      'section 5 "第三方服务配置"',
      'section 6 "生成配置文件"',
      'section 7 "启动 Docker 服务"',
      'section 8 "数据库初始化"',
      'section 9 "HTTPS 检查"',
      'section 10 "完成"',
      "检测到已有 PostgreSQL 数据卷",
      "PostgreSQL 首次初始化后的用户名和密码不会因为修改 .env.production 自动改变",
      "备份数据库后继续",
      "DELETE_DB_DATA",
      "backup_existing_database",
      "确认开始部署？输入 YES 继续",
      "deploy/install.log",
      "--verbose",
    ]) {
      expect(installer).toContain(expected);
    }
  });

  const bashAvailable = commandAvailable("bash", ["--version"]);
  const bashIt = bashAvailable ? it : it.skip;

  bashIt("passes bash syntax checks for deployment scripts", () => {
    for (const script of [
      "scripts/install.sh",
      "scripts/update.sh",
      "scripts/backup.sh",
      "scripts/status.sh",
      "scripts/uninstall.sh",
      "scripts/reset-prod-db.sh",
    ]) {
      execFileSync("bash", ["-n", bashPath(script)], { cwd: root, stdio: "pipe" });
    }
  });
});
