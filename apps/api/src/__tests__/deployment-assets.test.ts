import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
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
  "scripts/reset-admin.sh",
  "scripts/resume-install.sh",
  "scripts/verify-admin-bootstrap.sh",
  "scripts/download-ephemeris.sh",
  "scripts/test-providers.sh",
  "scripts/test-deepseek-interpretation.sh",
] as const;

const bashScripts = [
  ...productionScripts,
  "scripts/install-cn.sh",
  "scripts/check-env-production.sh",
  "scripts/check-login.sh",
  "scripts/lib/installer-input.sh",
  "scripts/test-installer-password.sh",
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

function resolveBashCommand(): string | null {
  if (commandAvailable("bash", ["--version"])) {
    return "bash";
  }

  if (process.platform !== "win32") {
    return null;
  }

  for (const candidate of [
    "C:/Program Files/Git/bin/bash.exe",
    "C:/Program Files/Git/usr/bin/bash.exe",
    "C:/msys64/usr/bin/bash.exe",
  ]) {
    if (existsSync(candidate) && commandAvailable(candidate, ["--version"])) {
      return candidate;
    }
  }

  return null;
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
    expect(compose).toContain("EPHEMERIS_PATH: /app/data/de421.bsp");
    expect(compose).toContain("postgres_data:");
    expect(compose).toContain("redis_data:");
    expect(compose).toContain("- astro_data:/app/data");
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
      "ADMIN_INITIAL_PASSWORD_B64=ADMIN_INITIAL_PASSWORD_B64_PLACEHOLDER",
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
    expect(readRepoFile("apps/astro-service/Dockerfile")).toContain(
      "ENV EPHEMERIS_PATH=/app/data/de421.bsp",
    );
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
    expect(installer).toContain("set_database_config()");
    expect(installer).toContain(
      'DB_NAME="$(prompt_required "请输入数据库名称" "photo_weather_ai")"',
    );
    expect(installer).toContain(
      'DB_USER="$(prompt_required "请输入数据库用户" "photo_weather_ai")"',
    );
    expect(installer).toContain(
      'DB_PASSWORD="$(prompt_secret "请输入数据库密码（留空自动生成）")"',
    );
    expect(installer).toContain('URL_ENCODED_DB_PASSWORD="$(urlencode_password "${DB_PASSWORD}")"');
    expect(installer).toContain('POSTGRES_DB="${DB_NAME}"');
    expect(installer).toContain('POSTGRES_USER="${DB_USER}"');
    expect(installer).toContain('POSTGRES_PASSWORD="${DB_PASSWORD}"');
    expect(installer).toContain(
      'DATABASE_URL="postgresql://${DB_USER}:${URL_ENCODED_DB_PASSWORD}@postgres:5432/${DB_NAME}?schema=public"',
    );
    expect(installer).toContain("当前系统未安装 python3，无法安全编码自定义数据库密码。");
    expect(installer).toContain("print_database_config_summary");
    expect(installer).toContain('echo "POSTGRES_DB=${POSTGRES_DB}"');
    expect(installer).toContain('echo "POSTGRES_USER=${POSTGRES_USER}"');
    expect(installer).toContain('echo "DATABASE_URL=$(mask_database_url "${DATABASE_URL}")"');
  });

  it("writes production env files through a safe KEY=VALUE helper", () => {
    const installer = readRepoFile("scripts/install.sh");
    const inputHelper = readRepoFile("scripts/lib/installer-input.sh");
    const renderEnv = installer.slice(
      installer.indexOf("render_env_file()"),
      installer.indexOf("update_env_admin_lines()"),
    );

    expect(installer).toContain("write_env_var()");
    expect(installer).toContain('! "${key}" =~ ^[A-Z0-9_]+$');
    expect(installer).toContain("strip_env_value()");
    expect(installer).toContain("escape_env_value()");
    expect(installer).toContain('printf \'%s=%s\\n\' "${key}" "$(escape_env_value "${value}")"');
    expect(installer).toContain("openssl rand -hex 32 | tr -d '\\r\\n'");
    expect(installer).toContain("od -An -N32 -tx1 /dev/urandom | tr -d ' \\r\\n'");
    expect(installer).toContain('INSTALLER_INPUT_LIB="${SCRIPT_DIR}/lib/installer-input.sh"');
    expect(installer).toContain("validate_admin_password_strength");
    expect(installer).toContain("ADMIN_INITIAL_PASSWORD_B64");
    expect(inputHelper).toContain("管理员密码至少 12 位，需包含大小写字母、数字和特殊字符；支持常见强密码符号。");
    expect(installer).not.toContain("validate_admin_password_for_env");
    expect(installer).not.toMatch(/A-Za-z0-9\._@#%[+]?[=]?-/);
    expect(installer).toContain("第三方服务 Key 建议部署完成后在后台管理中配置");
    expect(installer).not.toContain("write_env_line");
    expect(installer).not.toContain("dotenv_quote");
    expect(renderEnv).not.toMatch(
      /printf\s+['"]%s\\n['"].*\$\{(?:POSTGRES_PASSWORD|REDIS_PASSWORD|JWT_SECRET|ADMIN_PASSWORD|ADMIN_INITIAL_PASSWORD_B64)\}/,
    );

    for (const key of [
      "POSTGRES_PASSWORD",
      "REDIS_PASSWORD",
      "JWT_SECRET",
      "ADMIN_INITIAL_PASSWORD_B64",
    ]) {
      expect(renderEnv).toContain(`${key}) write_env_var "\${key}" "\${${key}}"`);
    }
  });

  it("forces production Docker Compose commands to load .env.production", () => {
    for (const relativePath of productionScripts) {
      const source = readRepoFile(relativePath);
      expect(source).toContain('ENV_FILE=".env.production"');
      expect(source).toContain('COMPOSE_FILE="docker-compose.prod.yml"');
      expect(source).toContain("compose() {");
      expect(source).toContain('docker_cmd compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"');

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
    expect(installer).toContain("check_env_file");
    expect(installer).toContain("生产环境配置文件格式错误，请检查 .env.production。");
    expect(installer).toContain("variable is not set");
    expect(installer).toContain("compose ps");
  });

  it("runs the env checker before resume and status compose commands", () => {
    for (const relativePath of ["scripts/resume-install.sh", "scripts/status.sh"]) {
      const source = readRepoFile(relativePath);
      expect(source).toContain('CHECK_ENV_SCRIPT="${SCRIPT_DIR}/check-env-production.sh"');
      expect(source).toContain('if ! bash "${CHECK_ENV_SCRIPT}"; then');
      expect(source).toContain("生产环境配置文件格式错误，请检查 .env.production。");
      const firstComposeUse =
        relativePath === "scripts/status.sh"
          ? source.lastIndexOf("compose ps")
          : source.indexOf("compose config >/dev/null");
      expect(source.indexOf('bash "${CHECK_ENV_SCRIPT}"')).toBeLessThan(firstComposeUse);
    }
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
      'section 7 "Docker 与系统资源检查"',
      'section 8 "构建并启动服务"',
      'section 9 "天文星历文件检查"',
      'section 10 "数据库连接预检"',
      'section 11 "数据库迁移"',
      'section 12 "管理员创建与验证"',
      'section 13 "HTTPS 与健康检查"',
      'section 14 "完成"',
      "需要下载本地天文星历文件 de421.bsp",
      "bash scripts/download-ephemeris.sh",
      "检测到已有 PostgreSQL 数据卷",
      "PostgreSQL 首次初始化后的用户名和密码不会因为修改 .env.production 自动改变",
      "1. 保留现有数据并停止安装",
      "2. 删除测试数据库卷并重新初始化",
      'read -r -p "请输入选项 [1/2]: " choice',
      "DELETE_DB_DATA",
      "confirm_continue()",
      "confirm_dangerous_delete()",
      "直接回车继续，输入 n 取消:",
      "请输入 y/yes 继续，或 n/no 取消。",
      "backup_existing_database",
      'confirm_continue "确认开始部署？" "直接回车继续，输入 n 取消:"',
      "请输入管理员邮箱",
      "请输入管理员密码",
      "请再次输入管理员密码",
      "请输入管理员显示名称",
      "command -v docker",
      "docker --version",
      "docker compose version",
      "Docker 已安装，跳过安装。",
      "Docker Compose 插件可用。",
      "wait_for_apt_lock",
      "当前 apt/dpkg 相关进程",
      "ensure_swap_capacity",
      "fallocate -l 4G /swapfile",
      "DEBIAN_FRONTEND=noninteractive",
      "正在安装 Docker，请稍候",
      "当前命令：${display_command}",
      'run_apt_step "apt-get update"',
      "Docker 安装仍在进行，请稍候",
      "系统软件包管理器被占用，请稍后重试或检查是否有其他 apt 进程。",
      "需要安装 Docker",
      "deploy/install.log",
      "--verbose",
      "pnpm bootstrap:admin",
      "verify-admin-bootstrap.sh",
      "管理员账号、角色或权限验证失败，部署未完成。",
      "可执行 bash scripts/reset-admin.sh 重新设置管理员密码。",
      "Reset admin: bash scripts/reset-admin.sh",
    ]) {
      expect(installer).toContain(expected);
    }

    expect(installer).not.toContain("备份数据库后继续");
    expect(installer).not.toContain("确认开始部署？输入 YES 继续");
  });

  it("runs layered database preflight before migrations", () => {
    const installer = readRepoFile("scripts/install.sh");
    for (const expected of [
      "print_database_diagnostics",
      "mask_database_url",
      "compose ps postgres",
      "compose logs --tail=100 postgres",
      "pg_isready -U",
      'psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -v ON_ERROR_STOP=1 -c "SELECT 1;"',
      "检查 API 容器内数据库连接",
      "数据库连接失败，请检查 DATABASE_URL、POSTGRES_USER、POSTGRES_PASSWORD 是否一致。",
    ]) {
      expect(installer).toContain(expected);
    }

    const bootstrap = installer.slice(installer.indexOf("bootstrap_stack()"));
    expect(bootstrap.indexOf('section 10 "数据库连接预检"')).toBeLessThan(
      bootstrap.indexOf('section 11 "数据库迁移"'),
    );
    expect(bootstrap.indexOf("preflight_database_connection")).toBeLessThan(
      bootstrap.indexOf("run_migrations"),
    );
  });

  it("keeps resume/update database preflight aligned with the installer", () => {
    for (const relativePath of ["scripts/resume-install.sh", "scripts/update.sh"]) {
      const source = readRepoFile(relativePath);
      expect(source).toContain("preflight_database_connection");
      expect(source).toContain("pg_isready -U");
      expect(source).toContain(
        'psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -v ON_ERROR_STOP=1 -c "SELECT 1;"',
      );
      expect(source).toContain(
        "数据库连接失败，请检查 DATABASE_URL、POSTGRES_USER、POSTGRES_PASSWORD 是否一致。",
      );
      expect(source.lastIndexOf("preflight_database_connection")).toBeLessThan(
        source.lastIndexOf("run_migrations"),
      );
    }
  });

  it("requires explicit confirmation before deleting the production PostgreSQL volume", () => {
    const resetProdDb = readRepoFile("scripts/reset-prod-db.sh");
    expect(resetProdDb).toContain("DELETE_DB_DATA");
    expect(resetProdDb).toContain("DELETE_CADDY_DATA");
    expect(resetProdDb).toContain("compose down --remove-orphans");
    expect(resetProdDb).not.toContain("compose down -v");
  });

  it("ships the production ephemeris download flow", () => {
    const script = readRepoFile("scripts/download-ephemeris.sh");
    const installer = readRepoFile("scripts/install.sh");
    const status = readRepoFile("scripts/status.sh");
    const resume = readRepoFile("scripts/resume-install.sh");

    expect(script).toContain("https://ssd.jpl.nasa.gov/ftp/eph/planets/bsp/de421.bsp");
    expect(script).toContain('CONTAINER_EPHEMERIS_PATH="/app/data/de421.bsp"');
    expect(script).toContain("MIN_EPHEMERIS_BYTES=$((10 * 1024 * 1024))");
    expect(script).toContain(
      'compose cp "${EPHEMERIS_FILE}" "astro-service:${CONTAINER_EPHEMERIS_PATH}"',
    );
    expect(script).toContain('compose exec -T astro-service ls -lh "${CONTAINER_EPHEMERIS_PATH}"');
    expect(script).toContain("compose restart astro-service api web");
    expect(script).toContain("http://astro-service:4100/health");
    expect(script).toContain("ephemerisAvailable !== true");
    expect(script).toContain("body.ephemerisPath !== '${CONTAINER_EPHEMERIS_PATH}'");
    expect(installer).toContain('section 9 "天文星历文件检查"');
    expect(installer).toContain("download-ephemeris.sh");
    expect(resume).toContain("ensure_ephemeris_available");
    expect(resume).toContain('bash "${SCRIPT_DIR}/download-ephemeris.sh"');
    expect(status).toContain("ephemerisAvailable");
    expect(status).toContain("ephemerisPath");
    expect(status).toContain("星历文件缺失，请执行 bash scripts/download-ephemeris.sh");
  });

  it("ships the production provider diagnostics script without printing secrets", () => {
    const script = readRepoFile("scripts/test-providers.sh");

    expect(script).toContain('ENV_FILE=".env.production"');
    expect(script).toContain('COMPOSE_FILE="docker-compose.prod.yml"');
    expect(script).toContain('docker_cmd compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"');
    expect(script).toContain("compose run --rm api pnpm test-provider --all");
    expect(script).toContain("No API keys or secrets will be printed.");
    expect(script).not.toContain(
      "/admin/providers/${providerType}/${providerCode}/test-connection",
    );
    expect(script).not.toMatch(/console\.log\(.*ADMIN_PASSWORD/);
    expect(script).not.toMatch(/echo .*ADMIN_PASSWORD/);
  });

  it("prints forecast source diagnostics in the real weather smoke script", () => {
    const script = readRepoFile("scripts/test-real-weather.sh");

    expect(script).toContain("sourceSummaries:");
    expect(script).toContain("providerRuntimeSnapshot:");
    expect(script).toContain("meteoblueAttempted:");
    expect(script).toContain("meteoblueSuccess:");
    expect(script).toContain("meteobluePartial:");
    expect(script).toContain("deepSeekInterpretationStatus:");
    expect(script).toContain("dataConfidence:");
    expect(script).toContain("agreementLevel:");
    expect(script).toContain("disagreementLevel:");
    expect(script).toContain("cloudTotalDisagreement:");
    expect(script).toContain("cloudLowDisagreement:");
    expect(script).toContain("cloudMidHighDisagreement:");
    expect(script).toContain("precipitationDisagreement:");
    expect(script).toContain("temperatureDisagreement:");
    expect(script).toContain("agreementUserSummaryZh:");
    expect(script).toContain("agreementShouldLowerConfidence:");
    expect(script).toContain("cacheHit:");
    expect(script).not.toContain(
      "/admin/providers/${providerType}/${providerCode}/test-connection",
    );
    expect(script).not.toMatch(/apikey=.*\\$\\{/i);
  });

  it("ships a secret-safe DeepSeek interpretation diagnostic script", () => {
    const script = readRepoFile("scripts/test-deepseek-interpretation.sh");

    expect(script).toContain("model: ${config.model}");
    expect(script).toContain('config.model !== "deepseek-v4-pro"');
    expect(script).toContain("timeoutMs: ${config.timeoutMs}");
    expect(script).toContain("http://127.0.0.1:4000/forecast/ai-explain");
    expect(script).toContain("timeout 130s");
    expect(script).toContain("source:");
    expect(script).toContain("parseSuccess:");
    expect(script).toContain("fallbackSuccess:");
    expect(script).toContain("No API keys or secrets will be printed.");
    expect(script).not.toMatch(/echo .*API_KEY/);
    expect(script).not.toMatch(/console\.log\(.*apiKey[:=]/i);
  });

  it("keeps the placeholder worker alive and documents that interpretation does not depend on it", () => {
    const workerSource = readRepoFile("apps/worker/src/index.ts");

    expect(workerSource).toContain("Forecast interpretation runs synchronously in the api service");
    expect(workerSource).toContain("worker is not required for /forecast/ai-explain");
    expect(workerSource).toContain("setInterval");
    expect(workerSource).toContain("idle heartbeat");
  });

  const bashCommand = resolveBashCommand();
  const bashIt = bashCommand ? it : it.skip;

  bashIt("passes bash syntax checks for deployment scripts", () => {
    if (!bashCommand) {
      throw new Error("bash is not available");
    }

    for (const script of bashScripts) {
      execFileSync(bashCommand, ["-n", bashPath(script)], { cwd: root, stdio: "pipe" });
    }
  });

  bashIt("detects invalid .env.production lines and masks valid values", () => {
    if (!bashCommand) {
      throw new Error("bash is not available");
    }

    const tempDir = mkdtempSync(path.join(os.tmpdir(), "photo-weather-env-"));
    try {
      const envPath = path.join(tempDir, ".env.production");
      writeFileSync(
        envPath,
        [
          "POSTGRES_DB=photo_weather_ai",
          "POSTGRES_USER=photo_weather_ai",
          "POSTGRES_PASSWORD=secret123",
          "DATABASE_URL=postgresql://photo_weather_ai:secret123@postgres:5432/photo_weather_ai?schema=public",
          "EMPTY_VALUE=",
          "",
        ].join("\n"),
        "utf8",
      );

      const validOutput = execFileSync(bashCommand, [bashPath("scripts/check-env-production.sh")], {
        cwd: tempDir,
        encoding: "utf8",
        stdio: "pipe",
      });
      expect(validOutput).toContain("POSTGRES_PASSWORD=***");
      expect(validOutput).toContain("DATABASE_URL=***");
      expect(validOutput).toContain("EMPTY_VALUE=(empty)");
      expect(validOutput).not.toContain("secret123");

      writeFileSync(
        envPath,
        ["POSTGRES_DB=photo_weather_ai", "nUo2m70877e536MP'", ""].join("\n"),
        "utf8",
      );

      let failed = false;
      let invalidOutput = "";
      try {
        execFileSync(bashCommand, [bashPath("scripts/check-env-production.sh")], {
          cwd: tempDir,
          encoding: "utf8",
          stdio: "pipe",
        });
      } catch (caught) {
        failed = true;
        const error = caught as { stdout?: string; stderr?: string };
        invalidOutput = `${error.stdout ?? ""}${error.stderr ?? ""}`;
      }

      expect(failed).toBe(true);
      expect(invalidOutput).toContain("缺少 =");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("ships admin reset and production login diagnostic helpers", () => {
    const resetAdmin = readRepoFile("scripts/reset-admin.sh");
    expect(resetAdmin).toContain("管理员密码已重置。");
    expect(resetAdmin).toContain("后台地址：https://${DOMAIN:-}/admin/login");
    expect(resetAdmin).toContain("密码：已隐藏");
    expect(resetAdmin).toContain('INSTALLER_INPUT_LIB="${SCRIPT_DIR}/lib/installer-input.sh"');
    expect(resetAdmin).toContain("prompt_password_twice");
    expect(resetAdmin).toContain("ADMIN_INITIAL_PASSWORD_B64");
    expect(resetAdmin).toContain("api pnpm bootstrap:admin");
    expect(resetAdmin).toContain("verify-admin-bootstrap.sh");
    expect(resetAdmin).not.toMatch(/echo .*ADMIN_PASSWORD/);
    expect(resetAdmin).not.toMatch(/read\s+-r\s+-s\s+-p/);
    expect(resetAdmin).not.toContain("密码：${ADMIN_PASSWORD}");

    const checkLogin = readRepoFile("scripts/check-login.sh");
    expect(checkLogin).toContain("登录验证成功");
    expect(checkLogin).toContain("登录验证失败");
    expect(checkLogin).toContain("/auth/login");
    expect(checkLogin).toContain("resolve_admin_password_from_env");
    expect(checkLogin).not.toMatch(/echo .*ADMIN_PASSWORD/);
    expect(checkLogin).not.toMatch(/read\s+-r\s+-s\s+-p/);
  });

  it("ships the admin bootstrap verification helper without printing secrets", () => {
    const script = readRepoFile("scripts/verify-admin-bootstrap.sh");

    for (const expected of [
      'ENV_FILE=".env.production"',
      'COMPOSE_FILE="docker-compose.prod.yml"',
      "public.users",
      "public.roles",
      "public.user_roles",
      "roles WHERE code = 'admin'",
      "role_permissions",
      "REQUIRED_ADMIN_PERMISSION_CODES",
      "admin.manage",
      "verify-admin-auth",
      "prepare_admin_password_b64_from_env",
    ]) {
      expect(script).toContain(expected);
    }

    expect(script).not.toMatch(/echo .*ADMIN_INITIAL_PASSWORD_B64/);
    expect(script).not.toMatch(/echo .*ADMIN_PASSWORD/);
  });
});
