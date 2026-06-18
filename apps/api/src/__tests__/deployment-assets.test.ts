import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
  "scripts/import-light-pollution.sh",
  "scripts/check-light-pollution.sh",
  "scripts/import-sky-brightness-raster.sh",
  "scripts/check-sky-brightness-raster.sh",
  "scripts/import-terrain-dem.sh",
  "scripts/check-terrain-dem.sh",
  "scripts/test-providers.sh",
  "scripts/test-deepseek-interpretation.sh",
] as const;

const bashScripts = [
  ...productionScripts,
  "scripts/install-cn.sh",
  "scripts/check-env-production.sh",
  "scripts/check-login.sh",
  "scripts/lib/installer-input.sh",
  "scripts/test-installer-bootstrap.sh",
  "scripts/test-installer-password.sh",
] as const;

function readRepoFile(relativePath: string): string {
  return readFileSync(path.join(root, relativePath), "utf8");
}

function bashPath(relativePath: string): string {
  const resolved = path.join(root, relativePath);
  return process.platform === "win32" ? resolved.replace(/\\/g, "/") : resolved;
}

function bashAbsolutePath(resolvedPath: string): string {
  return process.platform === "win32" ? resolvedPath.replace(/\\/g, "/") : resolvedPath;
}

function quoteBash(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
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
    expect(compose).toContain(
      "LIGHT_POLLUTION_DATASET_PATH: /app/data/light-pollution/current/light-pollution.cog.tif",
    );
    expect(compose).toContain("LIGHT_POLLUTION_CACHE_SIZE: ${LIGHT_POLLUTION_CACHE_SIZE:-1024}");
    expect(compose).toContain(
      "SKY_BRIGHTNESS_DATASET_PATH: /app/data/sky-brightness/current/sky-brightness.cog.tif",
    );
    expect(compose).toContain(
      "SKY_BRIGHTNESS_METADATA_PATH: /app/data/sky-brightness/current/metadata.json",
    );
    expect(compose).toContain(
      "TERRAIN_DEM_DATASET_PATH: /app/data/terrain-dem/current/terrain-dem.cog.tif",
    );
    expect(compose).toContain(
      "TERRAIN_DEM_METADATA_PATH: /app/data/terrain-dem/current/metadata.json",
    );
    expect(compose).toContain("postgres_data:");
    expect(compose).toContain("redis_data:");
    expect(compose).toContain("- astro_data:/app/data");
    expect(compose).toContain("- ./deploy/light-pollution:/app/data/light-pollution");
    expect(compose).toContain("- ./deploy/sky-brightness:/app/data/sky-brightness");
    expect(compose).toContain("- ./deploy/terrain-dem:/app/data/terrain-dem");
    expect(compose).toContain("- ./deploy/calibration:/app/deploy/calibration");
    expect(compose).toContain("caddy_data:");
    expect(compose).toContain("caddy_config:");
    expect(compose).toContain("app_uploads:");
    expect(compose).toContain("logs:");
    expect(compose).toContain("pg_isready -U");
    expect(compose).toContain('redis-cli -a "$${REDIS_PASSWORD}" ping | grep PONG');
    expect(compose).toContain("http://127.0.0.1:4000/health");
    expect(compose).toContain("http://127.0.0.1:4100/health");
    expect(compose).toContain("http://127.0.0.1:3000");
    expect(compose).toContain("condition: service_healthy");
    expect(compose).toContain("driver: json-file");
    expect(compose).toContain('max-size: "10m"');
    expect(compose).toContain('max-file: "5"');
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
      "API_BODY_LIMIT_BYTES=1048576",
      "API_REQUEST_TIMEOUT_MS=60000",
      "API_CONNECTION_TIMEOUT_MS=10000",
      "API_KEEP_ALIVE_TIMEOUT_MS=65000",
      "API_TRUST_PROXY=true",
      "API_RATE_LIMIT_ENABLED=true",
      "API_RATE_LIMIT_WINDOW_MS=60000",
      "API_RATE_LIMIT_MAX=60",
      "API_RATE_LIMIT_MAX_BUCKETS=10000",
      "FORECAST_CALCULATE_CACHE_TTL_MS=300000",
      "FORECAST_CALCULATE_CACHE_MAX_ENTRIES=256",
      "PUBLIC_SEARCH_CACHE_TTL_MS=300000",
      "PUBLIC_SEARCH_CACHE_MAX_ENTRIES=256",
      "ENABLE_ASTRO_SERVICE=true",
      "ASTRO_SERVICE_URL=http://astro-service:4100",
      "ASTRO_SERVICE_TIMEOUT_MS=45000",
      "LIGHT_POLLUTION_DATASET_PATH=/app/data/light-pollution/current/light-pollution.cog.tif",
      "LIGHT_POLLUTION_METADATA_PATH=/app/data/light-pollution/current/metadata.json",
      "LIGHT_POLLUTION_CACHE_SIZE=1024",
      "LIGHT_POLLUTION_QUERY_TIMEOUT_MS=5000",
      "SKY_BRIGHTNESS_DATASET_PATH=/app/data/sky-brightness/current/sky-brightness.cog.tif",
      "SKY_BRIGHTNESS_METADATA_PATH=/app/data/sky-brightness/current/metadata.json",
      "TERRAIN_DEM_DATASET_PATH=/app/data/terrain-dem/current/terrain-dem.cog.tif",
      "TERRAIN_DEM_METADATA_PATH=/app/data/terrain-dem/current/metadata.json",
      "PIP_INDEX_URL=",
      "EPHEMERIS_LOCAL_FILE=",
      "EPHEMERIS_URLS=",
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
      "deploy/assets/*.bsp",
      "deploy/ephemeris/*.bsp",
      "deploy/light-pollution/incoming/*",
      "deploy/light-pollution/current/*",
      "deploy/light-pollution/backups/*",
      "deploy/light-pollution/**/*.tif",
      "deploy/light-pollution/**/*.tiff",
      "!deploy/light-pollution/**/.gitkeep",
      "deploy/sky-brightness/incoming/*",
      "deploy/sky-brightness/current/*",
      "deploy/sky-brightness/backups/*",
      "deploy/sky-brightness/**/*.tif",
      "deploy/sky-brightness/**/*.tiff",
      "deploy/sky-brightness/**/metadata.json",
      "deploy/sky-brightness/**/checksum.sha256",
      "!deploy/sky-brightness/**/.gitkeep",
      "deploy/terrain-dem/incoming/*",
      "deploy/terrain-dem/current/*",
      "deploy/terrain-dem/backups/*",
      "deploy/terrain-dem/**/*.tif",
      "deploy/terrain-dem/**/*.tiff",
      "deploy/terrain-dem/**/metadata.json",
      "deploy/terrain-dem/**/checksum.sha256",
      "!deploy/terrain-dem/**/.gitkeep",
      "deploy/calibration/runtime/*",
      "!deploy/calibration/runtime/.gitkeep",
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
    expect(readRepoFile("apps/astro-service/Dockerfile")).toContain('ARG PIP_INDEX_URL=""');
    expect(readRepoFile("apps/astro-service/Dockerfile")).toContain("pip install --no-cache-dir");
    expect(readRepoFile("docker-compose.prod.yml")).toContain("PIP_INDEX_URL: ${PIP_INDEX_URL:-}");
    expect(readRepoFile("apps/astro-service/Dockerfile")).toContain(
      "ENV EPHEMERIS_PATH=/app/data/de421.bsp",
    );
    expect(readRepoFile("apps/astro-service/Dockerfile")).toContain(
      "ENV LIGHT_POLLUTION_DATASET_PATH=/app/data/light-pollution/current/light-pollution.cog.tif",
    );
    expect(readRepoFile("apps/astro-service/Dockerfile")).toContain(
      "ENV SKY_BRIGHTNESS_DATASET_PATH=/app/data/sky-brightness/current/sky-brightness.cog.tif",
    );
    expect(readRepoFile("apps/astro-service/Dockerfile")).toContain(
      "ENV TERRAIN_DEM_DATASET_PATH=/app/data/terrain-dem/current/terrain-dem.cog.tif",
    );
    expect(readRepoFile("apps/astro-service/Dockerfile")).toContain(
      "/app/data/sky-brightness/current /app/data/sky-brightness/incoming",
    );
    expect(readRepoFile("apps/astro-service/Dockerfile")).toContain(
      "/app/data/terrain-dem/current /app/data/terrain-dem/incoming",
    );
  });

  it("ships optional local sky-brightness import and status scripts without downloading data", () => {
    const importer = readRepoFile("scripts/import-sky-brightness-raster.sh");
    const checker = readRepoFile("scripts/check-sky-brightness-raster.sh");
    const importerCli = readRepoFile("apps/astro-service/scripts/import_sky_brightness_raster.py");
    const installer = readRepoFile("scripts/install.sh");
    const updater = readRepoFile("scripts/update.sh");
    const resume = readRepoFile("scripts/resume-install.sh");

    for (const source of [importer, checker]) {
      expect(source).toContain('DATA_DIR="${PROJECT_ROOT}/deploy/sky-brightness"');
      expect(source).toContain('-v "${DATA_DIR}:/app/data/sky-brightness"');
      expect(source).toContain('COMPOSE_FILE="docker-compose.prod.yml"');
      expect(source).toContain('ENV_FILE=".env.production"');
      expect(source).not.toMatch(/\b(?:curl|wget)\b/);
    }

    expect(importer).toContain("python -m scripts.import_sky_brightness_raster");
    expect(importer).toContain("Place legally obtained GeoTIFF files");
    expect(importer).toContain("This script does not download WA or other sky-brightness data.");
    expect(importer).toContain("compose restart astro-service");
    expect(checker).toContain("python -m scripts.import_sky_brightness_raster --check");
    expect(checker).toContain("skyBrightnessAvailable");
    expect(checker).toContain("skyBrightnessDatasetExists");
    expect(checker).toContain("skyBrightnessMetadataAvailable");
    expect(checker).toContain("skyBrightnessDatasetName");
    expect(checker).toContain("skyBrightnessDatasetYear");
    expect(checker).toContain("skyBrightnessDatasetVersion");
    expect(checker).toContain("skyBrightnessValueType");
    expect(checker).toContain("skyBrightnessHealthStatus");
    expect(checker).toContain("skyBrightnessLoadError");
    expect(importerCli).toContain("does not download data");
    expect(importerCli).toContain("metadata.json");
    expect(importerCli).toContain("checksum.sha256");

    for (const source of [installer, updater, resume]) {
      expect(source).toContain("${PROJECT_ROOT}/deploy/sky-brightness/incoming");
      expect(source).toContain("${PROJECT_ROOT}/deploy/sky-brightness/current");
      expect(source).toContain("${PROJECT_ROOT}/deploy/sky-brightness/backups");
      expect(source).toMatch(
        /no WA or other sky-brightness raster is downloaded automatically|existing data are preserved/,
      );
    }
  });

  it("ships optional local terrain DEM import and status scripts without downloading data", () => {
    const importer = readRepoFile("scripts/import-terrain-dem.sh");
    const checker = readRepoFile("scripts/check-terrain-dem.sh");
    const planner = readRepoFile("scripts/plan-terrain-dem-tiles.sh");
    const plannerCli = readRepoFile("apps/astro-service/scripts/plan_terrain_dem_tiles.py");
    const plannerDocs = readRepoFile("docs/national-dem-tile-coverage.md");
    const installer = readRepoFile("scripts/install.sh");
    const updater = readRepoFile("scripts/update.sh");
    const resume = readRepoFile("scripts/resume-install.sh");

    for (const source of [importer, checker]) {
      expect(source).toContain('DATA_DIR="${PROJECT_ROOT}/deploy/terrain-dem"');
      expect(source).toContain('-v "${DATA_DIR}:/app/data/terrain-dem"');
      expect(source).toContain('COMPOSE_FILE="docker-compose.prod.yml"');
      expect(source).toContain('ENV_FILE=".env.production"');
      expect(source).not.toMatch(/\b(?:curl|wget)\b/);
    }

    expect(importer).toContain("python -m scripts.import_terrain_dem");
    expect(importer).toContain("Place legally obtained GeoTIFF/COG DEM files");
    expect(importer).toContain("This script does not download DEM data.");
    expect(importer).toContain("compose restart astro-service");
    expect(checker).toContain("python -m scripts.import_terrain_dem --check");
    expect(checker).toContain("terrainDemAvailable");
    expect(checker).toContain("terrainDemDatasetExists");
    expect(checker).toContain("terrainDemMetadataAvailable");
    expect(checker).toContain("terrainDemDatasetName");
    expect(checker).toContain("terrainDemHealthStatus");
    expect(checker).toContain("terrainDemLoadError");
    expect(planner).toContain("python -m scripts.plan_terrain_dem_tiles");
    expect(planner).toContain('-v "${DATA_DIR}:/app/data/terrain-dem"');
    expect(plannerCli).toContain("--download is intentionally not implemented");
    expect(plannerCli).toContain("downloadCommands");
    expect(plannerDocs).toContain("前端 forecast/API 普通请求不得自动下载 DEM");
    expect(plannerDocs).toContain("缺少 DEM 不等于地形无遮挡");
    expect(plannerDocs).toContain("GLO-90 vs GLO-30");

    for (const source of [installer, updater, resume]) {
      expect(source).toContain("${PROJECT_ROOT}/deploy/terrain-dem/incoming");
      expect(source).toContain("${PROJECT_ROOT}/deploy/terrain-dem/current");
      expect(source).toContain("${PROJECT_ROOT}/deploy/terrain-dem/backups");
      expect(source).toMatch(/no DEM is downloaded automatically|existing data are preserved/);
    }
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
    expect(inputHelper).toContain(
      "管理员密码至少 12 位，需包含大小写字母、数字和特殊字符；支持常见强密码符号。",
    );
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
      "需要准备本地天文星历文件 de421.bsp",
      'bash "${SCRIPT_DIR}/download-ephemeris.sh"',
      "未安装 de421.bsp，无法完成生产部署",
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

  it("supports China Docker bootstrap defaults and safe fallback behavior", () => {
    const installer = readRepoFile("scripts/install.sh");
    const installCn = readRepoFile("scripts/install-cn.sh");

    for (const expected of [
      'INSTALL_REGION="${INSTALL_REGION:-${PHOTO_WEATHER_INSTALL_MODE:-global}}"',
      'DOCKER_INSTALL_METHOD="${DOCKER_INSTALL_METHOD:-auto}"',
      "is_ignored_apt_lock_process_args()",
      "unattended-upgrade-shutdown --wait-for-signal",
      'local max_seconds="${APT_LOCK_TIMEOUT_SECONDS}"',
      "No real apt/dpkg blocker is running.",
      "if ! docker_install_needed; then",
      'DOCKER_INSTALL_METHOD_USED="existing"',
      "Docker already installed; skipping Docker installation.",
      "install_docker_from_official_repo()",
      "install_docker_from_ubuntu_packages()",
      "docker.io",
      "docker-compose-v2",
      "docker-compose-plugin",
      "official Docker repository failed: Docker apt GPG download",
      "official Docker repository failed; falling back to Ubuntu docker.io + Compose v2 packages",
      "configure_docker_registry_mirrors()",
      "Back up Docker daemon.json",
      'run_logged "Back up Docker daemon.json" run_sudo cp "${daemon_json}" "${backup_path}"',
      '"registry-mirrors"',
      "Verify Docker registry mirror configuration",
      "Docker install method used:",
      "PIP_INDEX_URL",
    ]) {
      expect(installer).toContain(expected);
    }

    expect(installCn).toContain('export INSTALL_REGION="${INSTALL_REGION:-cn}"');
    expect(installCn).toContain('export DOCKER_INSTALL_METHOD="${DOCKER_INSTALL_METHOD:-ubuntu}"');
    expect(installCn).toContain('export EPHEMERIS_URLS="${EPHEMERIS_URLS:-');
    expect(installCn).toContain(
      "https://datacenter.stix.i4ds.net/pub/spice/latest/kernels/spk/de421.bsp",
    );
    expect(installCn).toContain(
      "https://p2sadev.esac.esa.int/p2sa-files/spice/swap/kernels/spk/de421.bsp",
    );
    expect(installCn).toContain("https://mirrors.tuna.tsinghua.edu.cn/ubuntu");
    expect(installCn).toContain("https://pypi.tuna.tsinghua.edu.cn/simple");
    for (const mirror of [
      "https://docker.1ms.run",
      "https://docker.m.daocloud.io",
      "https://dockerproxy.com",
      "https://mirror.baidubce.com",
    ]) {
      expect(installCn).toContain(mirror);
    }
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
    expect(bootstrap.indexOf("run_migrations")).toBeLessThan(
      bootstrap.indexOf("create_admin_account"),
    );

    const runMigrations = installer.slice(
      installer.indexOf("run_migrations()"),
      installer.indexOf("collect_admin_configuration()"),
    );
    expect(runMigrations).toContain('fail_install "数据库迁移失败。"');
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

    expect(script).toContain('EPHEMERIS_LOCAL_FILE="${EPHEMERIS_LOCAL_FILE:-}"');
    expect(script).toContain('EPHEMERIS_URLS="${EPHEMERIS_URLS:-}"');
    expect(script).toContain('EPHEMERIS_URL="${EPHEMERIS_URL:-}"');
    expect(script).toContain("DEFAULT_EPHEMERIS_URLS=(");
    expect(script).toContain(
      "https://datacenter.stix.i4ds.net/pub/spice/latest/kernels/spk/de421.bsp",
    );
    expect(script).toContain(
      "https://p2sadev.esac.esa.int/p2sa-files/spice/swap/kernels/spk/de421.bsp",
    );
    expect(script).toContain("https://ssd.jpl.nasa.gov/ftp/eph/planets/bsp/de421.bsp");
    expect(script).toContain(
      "https://naif.jpl.nasa.gov/pub/naif/generic_kernels/spk/planets/a_old_versions/de421.bsp",
    );
    const defaultUrlsBlock = script.slice(
      script.indexOf("DEFAULT_EPHEMERIS_URLS=("),
      script.indexOf("EPHEMERIS_URL_CANDIDATES=()"),
    );
    const defaultUrls = Array.from(defaultUrlsBlock.matchAll(/"([^"]+de421\.bsp)"/g), (match) => {
      const url = match[1];
      if (!url) {
        throw new Error("Missing ephemeris URL capture");
      }
      return url;
    });
    expect(defaultUrls.length).toBeGreaterThan(2);
    expect(defaultUrls.some((url) => !url.includes("jpl.nasa.gov"))).toBe(true);
    expect(defaultUrls[defaultUrls.length - 1]).toBe(
      "https://naif.jpl.nasa.gov/pub/naif/generic_kernels/spk/planets/a_old_versions/de421.bsp",
    );
    expect(script).toContain("REPO_LOCAL_EPHEMERIS_CANDIDATES=(");
    expect(script).toContain("${PROJECT_ROOT}/deploy/assets/de421.bsp");
    expect(script).toContain("${PROJECT_ROOT}/apps/astro-service/data/de421.bsp");
    expect(script).toContain("try_repo_local_ephemeris");
    expect(script).toContain("try_user_local_ephemeris");
    expect(script).toContain("try_existing_host_ephemeris");
    expect(script).toContain('add_ephemeris_url_list "${EPHEMERIS_URLS}"');
    expect(script).toContain('add_ephemeris_url_candidate "${EPHEMERIS_URL}"');
    expect(script).toContain("mask_ephemeris_url_for_log");
    expect(script).toContain('CONTAINER_EPHEMERIS_PATH="/app/data/de421.bsp"');
    expect(script).toContain("MIN_EPHEMERIS_BYTES=$((10 * 1024 * 1024))");
    expect(script).toContain("de421.bsp is required for core astronomy features");
    expect(script).toContain("verify_host_ephemeris_file");
    expect(script).toContain("download_ephemeris_url");
    expect(script).toContain("download_ephemeris_from_urls");
    expect(script).toContain("verify_container_ephemeris_file");
    expect(script).toContain(
      'compose cp "${EPHEMERIS_FILE}" "astro-service:${CONTAINER_EPHEMERIS_PATH}"',
    );
    expect(script).toContain('compose exec -T astro-service ls -lh "${CONTAINER_EPHEMERIS_PATH}"');
    expect(script).toContain("compose restart astro-service api web");
    expect(script).toContain("http://astro-service:4100/health");
    expect(script).toContain("ephemerisAvailable !== true");
    expect(script).toContain("body.ephemerisPath !== '${CONTAINER_EPHEMERIS_PATH}'");
    expect(script).toContain("PHOTO_WEATHER_EPHEMERIS_SOURCE_ONLY");
    const acquisitionFlow = script.slice(script.indexOf("download_ephemeris()"));
    expect(acquisitionFlow.indexOf("try_repo_local_ephemeris")).toBeLessThan(
      acquisitionFlow.indexOf("try_user_local_ephemeris"),
    );
    expect(acquisitionFlow.indexOf("try_user_local_ephemeris")).toBeLessThan(
      acquisitionFlow.indexOf("try_existing_host_ephemeris"),
    );
    expect(acquisitionFlow.indexOf("try_existing_host_ephemeris")).toBeLessThan(
      acquisitionFlow.indexOf("download_ephemeris_from_urls"),
    );
    expect(installer).toContain('section 9 "天文星历文件检查"');
    expect(installer).toContain("download_required_ephemeris");
    expect(installer).toContain("download-ephemeris.sh");
    expect(installer).toContain("输入 n 取消安装");
    expect(installer).toContain("de421.bsp 获取、写入或健康检查失败，安装已停止");
    expect(installer).toContain("EPHEMERIS_LOCAL_FILE");
    expect(installer).toContain("EPHEMERIS_URLS");
    expect(installer).not.toContain("EPHEMERIS_DOWNLOAD_SKIPPED");
    expect(installer).not.toContain("已跳过天文星历文件下载");
    expect(resume).toContain("ensure_ephemeris_available");
    expect(resume).toContain('bash "${SCRIPT_DIR}/download-ephemeris.sh"');
    expect(status).toContain("ephemerisAvailable");
    expect(status).toContain("ephemerisPath");
    expect(status).toContain("星历文件缺失，请执行 bash scripts/download-ephemeris.sh");
  });

  it("keeps the admin bootstrap role guard migration free of ambiguous id references", () => {
    const migration = readRepoFile(
      "packages/db/prisma/migrations/0008_admin_bootstrap_role_guard/migration.sql",
    );

    expect(migration).toContain('REGEXP_REPLACE("roles"."id"::text');
    expect(migration).not.toContain('REGEXP_REPLACE("id"');
  });

  it("adds idempotent trigram indexes for public location search fields", () => {
    const migration = readRepoFile(
      "packages/db/prisma/migrations/0009_search_trigram_indexes/migration.sql",
    );

    expect(migration).toContain("CREATE EXTENSION IF NOT EXISTS pg_trgm");
    for (const expected of [
      "ON locations USING GIN (name gin_trgm_ops)",
      "ON locations USING GIN (slug gin_trgm_ops)",
      "ON locations USING GIN (province gin_trgm_ops)",
      "ON locations USING GIN (city gin_trgm_ops)",
      "ON locations USING GIN (district gin_trgm_ops)",
      "ON photo_spots USING GIN (name gin_trgm_ops)",
      "ON photo_spots USING GIN (slug gin_trgm_ops)",
      "ON photo_spots USING GIN (description gin_trgm_ops)",
    ]) {
      expect(migration).toContain(expected);
    }
    expect(migration).toMatch(/CREATE INDEX IF NOT EXISTS/g);
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
    expect(script).toContain("parseStrategy:");
    expect(script).toContain("rawResponseSizeChars:");
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

  bashIt("prefers a repo-local de421.bsp before any network download", () => {
    if (!bashCommand) {
      throw new Error("bash is not available");
    }

    const tempDir = mkdtempSync(path.join(os.tmpdir(), "photo-weather-ephemeris-"));
    try {
      const sourceDir = path.join(tempDir, "repo-local");
      const outputDir = path.join(tempDir, "out");
      mkdirSync(sourceDir, { recursive: true });
      const sourceFile = path.join(sourceDir, "de421.bsp");
      writeFileSync(sourceFile, Buffer.alloc(10 * 1024 * 1024 + 1));

      const command = [
        "set -euo pipefail",
        "export PHOTO_WEATHER_EPHEMERIS_SOURCE_ONLY=1",
        `source ${quoteBash(bashPath("scripts/download-ephemeris.sh"))}`,
        `EPHEMERIS_DIR=${quoteBash(bashAbsolutePath(outputDir))}`,
        'EPHEMERIS_FILE="${EPHEMERIS_DIR}/de421.bsp"',
        `REPO_LOCAL_EPHEMERIS_CANDIDATES=(${quoteBash(bashAbsolutePath(sourceFile))})`,
        "EPHEMERIS_LOCAL_FILE=",
        "EPHEMERIS_URLS=",
        "EPHEMERIS_URL=",
        "download_tool_available() { echo network-not-allowed; return 1; }",
        "download_ephemeris_url() { echo network-called; return 1; }",
        "download_ephemeris",
      ].join("\n");

      const output = execFileSync(bashCommand, ["-lc", command], {
        cwd: root,
        encoding: "utf8",
        stdio: "pipe",
      });

      expect(output).toContain("来源：repo-local");
      expect(output).not.toContain("network-called");
      expect(output).not.toContain("network-not-allowed");
      expect(existsSync(path.join(outputDir, "de421.bsp"))).toBe(true);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  bashIt("accepts EPHEMERIS_LOCAL_FILE before URL sources", () => {
    if (!bashCommand) {
      throw new Error("bash is not available");
    }

    const tempDir = mkdtempSync(path.join(os.tmpdir(), "photo-weather-ephemeris-"));
    try {
      const sourceDir = path.join(tempDir, "operator");
      const outputDir = path.join(tempDir, "out");
      mkdirSync(sourceDir, { recursive: true });
      const sourceFile = path.join(sourceDir, "de421.bsp");
      writeFileSync(sourceFile, Buffer.alloc(10 * 1024 * 1024 + 1));

      const command = [
        "set -euo pipefail",
        "export PHOTO_WEATHER_EPHEMERIS_SOURCE_ONLY=1",
        `source ${quoteBash(bashPath("scripts/download-ephemeris.sh"))}`,
        `EPHEMERIS_DIR=${quoteBash(bashAbsolutePath(outputDir))}`,
        'EPHEMERIS_FILE="${EPHEMERIS_DIR}/de421.bsp"',
        "REPO_LOCAL_EPHEMERIS_CANDIDATES=()",
        `EPHEMERIS_LOCAL_FILE=${quoteBash(bashAbsolutePath(sourceFile))}`,
        "EPHEMERIS_URLS=https://network.example/de421.bsp",
        "download_ephemeris_url() { echo network-called; return 1; }",
        "download_ephemeris",
      ].join("\n");

      const output = execFileSync(bashCommand, ["-lc", command], {
        cwd: root,
        encoding: "utf8",
        stdio: "pipe",
      });

      expect(output).toContain("来源：EPHEMERIS_LOCAL_FILE");
      expect(output).not.toContain("network-called");
      expect(existsSync(path.join(outputDir, "de421.bsp"))).toBe(true);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  bashIt("parses EPHEMERIS_URLS and continues across failed URL sources", () => {
    if (!bashCommand) {
      throw new Error("bash is not available");
    }

    const tempDir = mkdtempSync(path.join(os.tmpdir(), "photo-weather-ephemeris-"));
    try {
      const outputDir = path.join(tempDir, "out");
      const command = [
        "set -euo pipefail",
        "export PHOTO_WEATHER_EPHEMERIS_SOURCE_ONLY=1",
        `source ${quoteBash(bashPath("scripts/download-ephemeris.sh"))}`,
        `EPHEMERIS_DIR=${quoteBash(bashAbsolutePath(outputDir))}`,
        'EPHEMERIS_FILE="${EPHEMERIS_DIR}/de421.bsp"',
        "REPO_LOCAL_EPHEMERIS_CANDIDATES=()",
        "EPHEMERIS_LOCAL_FILE=",
        "EPHEMERIS_URLS=$'https://first.example/de421.bsp,\\nhttps://second.example/de421.bsp'",
        "EPHEMERIS_URL=https://legacy.example/de421.bsp",
        "DEFAULT_EPHEMERIS_URLS=(https://default.example/de421.bsp)",
        "download_tool_available() { return 0; }",
        'download_ephemeris_url() { echo "mock-download:$1"; return 1; }',
        "download_ephemeris",
      ].join("\n");

      let failed = false;
      let output = "";
      try {
        execFileSync(bashCommand, ["-lc", command], {
          cwd: root,
          encoding: "utf8",
          stdio: "pipe",
        });
      } catch (caught) {
        failed = true;
        const error = caught as { stdout?: string; stderr?: string };
        output = `${error.stdout ?? ""}${error.stderr ?? ""}`;
      }

      expect(failed).toBe(true);
      expect(output).toContain("mock-download:https://first.example/de421.bsp");
      expect(output).toContain("mock-download:https://second.example/de421.bsp");
      expect(output).toContain("mock-download:https://legacy.example/de421.bsp");
      expect(output).toContain("mock-download:https://default.example/de421.bsp");
      expect(output).toContain("de421.bsp is required for core astronomy features");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
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
