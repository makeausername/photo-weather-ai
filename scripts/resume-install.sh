#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE=".env.production"
COMPOSE_FILE="docker-compose.prod.yml"
INSTALL_LOG="${PROJECT_ROOT}/deploy/install.log"
CHECK_ENV_SCRIPT="${SCRIPT_DIR}/check-env-production.sh"
INSTALLER_INPUT_LIB="${SCRIPT_DIR}/lib/installer-input.sh"

cd "${PROJECT_ROOT}"
mkdir -p "${PROJECT_ROOT}/deploy"

# shellcheck source=scripts/lib/installer-input.sh
. "${INSTALLER_INPUT_LIB}"

if [[ "$(id -u)" -eq 0 ]]; then
  SUDO=""
else
  SUDO="sudo"
fi

docker_cmd() {
  if [[ -n "${SUDO}" ]]; then
    sudo docker "$@"
  else
    docker "$@"
  fi
}

compose() {
  docker_cmd compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

mask_database_url() {
  local url="$1"
  if [[ -z "${url}" ]]; then
    printf '(empty)\n'
    return
  fi

  if command -v python3 >/dev/null 2>&1; then
    python3 -c 'import sys, urllib.parse
url = sys.argv[1]
parts = urllib.parse.urlsplit(url)
username = parts.username or ""
hostname = parts.hostname or ""
port = f":{parts.port}" if parts.port else ""
auth = f"{username}:***@" if username else ""
print(urllib.parse.urlunsplit((parts.scheme, f"{auth}{hostname}{port}", parts.path, parts.query, parts.fragment)))' "${url}" 2>/dev/null && return
  fi

  printf '%s\n' "${url}" | sed -E 's#(postgres(ql)?://[^:/@]+:)[^@]*(@)#\1***\3#'
}

print_database_diagnostics() {
  echo
  echo "Database diagnostics:"
  echo "DATABASE_URL=$(mask_database_url "${DATABASE_URL:-}")"
  echo "POSTGRES_DB=${POSTGRES_DB:-}"
  echo "POSTGRES_USER=${POSTGRES_USER:-}"
  echo
  echo "PostgreSQL container status:"
  compose ps postgres || true
  echo
  echo "Last 100 PostgreSQL log lines:"
  compose logs --tail=100 postgres || true
  echo
  echo "Last 100 installer log lines:"
  tail -n 100 "${INSTALL_LOG}" || true
}

run_logged_allow_fail() {
  local label="$1"
  shift

  echo "${label}..."
  printf '\n### %s\n' "${label}" >> "${INSTALL_LOG}"
  "$@" >> "${INSTALL_LOG}" 2>&1
}

run_logged() {
  local label="$1"
  shift

  if run_logged_allow_fail "${label}" "$@"; then
    echo "OK ${label}"
    return
  fi

  echo "${label} 失败。"
  exit 1
}

compose_service_exists() {
  local service="$1"
  compose config --services | grep -qx "${service}"
}

build_production_images() {
  local service
  for service in astro-service api web worker; do
    if compose_service_exists "${service}"; then
      run_logged "构建 ${service} 镜像" compose build "${service}"
    fi
  done
}

wait_for_postgres() {
  echo "等待 PostgreSQL 就绪..."
  for _ in $(seq 1 60); do
    local container_id=""
    local container_status=""
    container_id="$(compose ps -q postgres 2>/dev/null || true)"
    if [[ -n "${container_id}" ]]; then
      container_status="$(docker_cmd inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "${container_id}" 2>/dev/null || true)"
      case "${container_status}" in
        healthy|running)
          echo "OK PostgreSQL 容器状态正常。"
          break
          ;;
        unhealthy|exited|dead)
          echo "PostgreSQL 容器状态异常：${container_status}"
          print_database_diagnostics
          exit 1
          ;;
      esac
    fi
    sleep 2
  done

  for _ in $(seq 1 60); do
    if compose exec -T postgres pg_isready -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" >/dev/null 2>&1; then
      echo "OK PostgreSQL pg_isready 检查通过。"
      return
    fi
    sleep 2
  done

  echo "PostgreSQL 未在预期时间内就绪。"
  print_database_diagnostics
  exit 1
}

run_postgres_select_one() {
  if run_logged_allow_fail "执行 PostgreSQL SELECT 1 预检" compose exec -T postgres psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -v ON_ERROR_STOP=1 -c "SELECT 1;"; then
    echo "OK PostgreSQL SELECT 1 预检通过。"
    return
  fi

  echo "数据库连接失败，请检查 DATABASE_URL、POSTGRES_USER、POSTGRES_PASSWORD 是否一致。"
  print_database_diagnostics
  exit 1
}

preflight_database_connection() {
  wait_for_postgres
  run_postgres_select_one

  if run_logged_allow_fail "检查 API 容器内数据库连接" compose run --rm api node -e 'async function main() { let prisma; try { const { PrismaClient } = require("@prisma/client"); prisma = new PrismaClient(); await prisma.$queryRawUnsafe("SELECT 1"); } catch { console.error("数据库连接失败，请检查 DATABASE_URL、POSTGRES_USER、POSTGRES_PASSWORD 是否一致。"); process.exitCode = 1; } finally { if (prisma) { await prisma.$disconnect().catch(() => {}); } } } main();'; then
    echo "OK 数据库连接检查通过。"
    return
  fi

  echo "数据库连接失败，请检查 DATABASE_URL、POSTGRES_USER、POSTGRES_PASSWORD 是否一致。"
  print_database_diagnostics
  exit 1
}

run_migrations() {
  if run_logged_allow_fail "运行数据库迁移" compose run --rm api corepack pnpm db:migrate; then
    echo "OK 数据库迁移完成。"
    return
  fi

  echo "数据库迁移失败。"
  echo "数据库连接失败，请检查 DATABASE_URL、POSTGRES_USER、POSTGRES_PASSWORD 是否一致。"
  print_database_diagnostics
  exit 1
}

create_and_verify_admin() {
  if [[ -z "${ADMIN_EMAIL:-}" ]]; then
    echo "ADMIN_EMAIL 未配置，无法继续管理员创建与验证。"
    exit 1
  fi

  if ! prepare_admin_password_b64_from_env; then
    echo "ADMIN_INITIAL_PASSWORD_B64、ADMIN_PASSWORD 或 ADMIN_INITIAL_PASSWORD 未配置或校验失败，无法继续管理员创建与验证。"
    exit 1
  fi

  ADMIN_DISPLAY_NAME="${ADMIN_DISPLAY_NAME:-Super Admin}"
  export ADMIN_EMAIL ADMIN_INITIAL_PASSWORD_B64 ADMIN_DISPLAY_NAME

  run_logged "创建或更新管理员账号" compose run --rm \
    -e ADMIN_EMAIL \
    -e ADMIN_INITIAL_PASSWORD_B64 \
    -e ADMIN_DISPLAY_NAME \
    api pnpm bootstrap:admin

  run_logged "验证管理员角色与权限" bash "${SCRIPT_DIR}/verify-admin-bootstrap.sh"
}

ensure_light_pollution_directories() {
  mkdir -p \
    "${PROJECT_ROOT}/deploy/light-pollution/incoming" \
    "${PROJECT_ROOT}/deploy/light-pollution/current" \
    "${PROJECT_ROOT}/deploy/light-pollution/backups" \
    "${PROJECT_ROOT}/deploy/sky-brightness/incoming" \
    "${PROJECT_ROOT}/deploy/sky-brightness/current" \
    "${PROJECT_ROOT}/deploy/sky-brightness/backups" \
    "${PROJECT_ROOT}/deploy/terrain-dem/incoming" \
    "${PROJECT_ROOT}/deploy/terrain-dem/current" \
    "${PROJECT_ROOT}/deploy/terrain-dem/backups"
  chmod 755 "${PROJECT_ROOT}/deploy/light-pollution" \
    "${PROJECT_ROOT}/deploy/light-pollution/incoming" \
    "${PROJECT_ROOT}/deploy/light-pollution/current" \
    "${PROJECT_ROOT}/deploy/light-pollution/backups" \
    "${PROJECT_ROOT}/deploy/sky-brightness" \
    "${PROJECT_ROOT}/deploy/sky-brightness/incoming" \
    "${PROJECT_ROOT}/deploy/sky-brightness/current" \
    "${PROJECT_ROOT}/deploy/sky-brightness/backups" \
    "${PROJECT_ROOT}/deploy/terrain-dem" \
    "${PROJECT_ROOT}/deploy/terrain-dem/incoming" \
    "${PROJECT_ROOT}/deploy/terrain-dem/current" \
    "${PROJECT_ROOT}/deploy/terrain-dem/backups" 2>/dev/null || true
  echo "Light-pollution raster storage is ready at deploy/light-pollution; existing data are preserved."
  echo "Sky-brightness raster storage is ready at deploy/sky-brightness; existing data are preserved."
  echo "Terrain DEM raster storage is ready at deploy/terrain-dem; existing data are preserved."
}

ensure_ephemeris_available() {
  echo "检查天文星历文件..."
  if compose run --rm api node -e "fetch('http://astro-service:4100/health').then(async (response) => { const text = await response.text(); if (!response.ok) process.exit(1); const body = JSON.parse(text); if (body.ephemerisAvailable !== true) process.exit(2); console.log(text); }).catch(() => process.exit(1));"; then
    echo "OK 天文星历文件可用。"
    return
  fi

  echo "星历文件缺失，正在执行 bash scripts/download-ephemeris.sh"
  bash "${SCRIPT_DIR}/download-ephemeris.sh"
}

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "未找到 .env.production，请先运行 bash scripts/install.sh"
  exit 1
fi

if [[ ! -f "${COMPOSE_FILE}" ]]; then
  echo "缺少 docker-compose.prod.yml，请在项目 checkout 根目录运行。"
  exit 1
fi

if ! bash "${CHECK_ENV_SCRIPT}"; then
  echo "生产环境配置文件格式错误，请检查 .env.production。"
  exit 1
fi

set -a
# shellcheck disable=SC1090
. "${ENV_FILE}"
set +a

ensure_light_pollution_directories
compose config >/dev/null

build_production_images

run_logged "启动数据库、Redis 和星历服务" compose up -d postgres redis astro-service

ensure_ephemeris_available

preflight_database_connection
run_migrations
run_logged "写入数据库种子数据" compose run --rm api corepack pnpm db:seed
create_and_verify_admin

run_logged "启动完整生产服务" compose up -d --remove-orphans postgres redis astro-service api web caddy worker
run_logged "重启应用服务" compose restart api web worker caddy

echo "部署恢复完成。"
echo "Website: https://${DOMAIN:-}"
echo "Admin login: https://${DOMAIN:-}/admin/login"
echo "Admin email: ${ADMIN_EMAIL}"
echo "Password: hidden"
compose ps
