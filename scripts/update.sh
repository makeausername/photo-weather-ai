#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE=".env.production"
COMPOSE_FILE="docker-compose.prod.yml"
INSTALLER_INPUT_LIB="${SCRIPT_DIR}/lib/installer-input.sh"

cd "${PROJECT_ROOT}"

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
}

compose_service_exists() {
  local service="$1"
  compose config --services | grep -qx "${service}"
}

build_production_images() {
  local service
  for service in astro-service api web worker; do
    if compose_service_exists "${service}"; then
      echo "Building ${service}..."
      compose build "${service}"
    fi
  done
}

wait_for_postgres() {
  echo "Waiting for PostgreSQL..."
  for _ in $(seq 1 60); do
    local container_id=""
    local container_status=""
    container_id="$(compose ps -q postgres 2>/dev/null || true)"
    if [[ -n "${container_id}" ]]; then
      container_status="$(docker_cmd inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "${container_id}" 2>/dev/null || true)"
      case "${container_status}" in
        healthy|running)
          echo "OK PostgreSQL container is running."
          break
          ;;
        unhealthy|exited|dead)
          echo "PostgreSQL container status: ${container_status}"
          print_database_diagnostics
          exit 1
          ;;
      esac
    fi
    sleep 2
  done

  for _ in $(seq 1 60); do
    if compose exec -T postgres pg_isready -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" >/dev/null 2>&1; then
      echo "OK PostgreSQL pg_isready passed."
      return
    fi
    sleep 2
  done

  echo "PostgreSQL did not become ready in time."
  print_database_diagnostics
  exit 1
}

run_postgres_select_one() {
  echo "Running PostgreSQL SELECT 1 preflight..."
  if compose exec -T postgres psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -v ON_ERROR_STOP=1 -c "SELECT 1;"; then
    echo "OK PostgreSQL SELECT 1 passed."
    return
  fi

  echo "数据库连接失败，请检查 DATABASE_URL、POSTGRES_USER、POSTGRES_PASSWORD 是否一致。"
  print_database_diagnostics
  exit 1
}

preflight_database_connection() {
  wait_for_postgres
  run_postgres_select_one

  echo "Checking database connectivity from the API image..."
  if compose run --rm api node -e 'async function main() { let prisma; try { const { PrismaClient } = require("@prisma/client"); prisma = new PrismaClient(); await prisma.$queryRawUnsafe("SELECT 1"); } catch { console.error("数据库连接失败，请检查 DATABASE_URL、POSTGRES_USER、POSTGRES_PASSWORD 是否一致。"); process.exitCode = 1; } finally { if (prisma) { await prisma.$disconnect().catch(() => {}); } } } main();'; then
    return
  fi

  echo "数据库连接失败，请检查 DATABASE_URL、POSTGRES_USER、POSTGRES_PASSWORD 是否一致。"
  print_database_diagnostics
  exit 1
}

run_migrations() {
  echo "Running database migrations..."
  if compose run --rm api corepack pnpm db:migrate; then
    return
  fi

  echo "数据库迁移失败。"
  echo "数据库连接失败，请检查 DATABASE_URL、POSTGRES_USER、POSTGRES_PASSWORD 是否一致。"
  print_database_diagnostics
  exit 1
}

create_and_verify_admin() {
  if [[ -z "${ADMIN_EMAIL:-}" ]]; then
    echo "ADMIN_EMAIL 未配置，跳过管理员账号更新。"
    return
  fi

  if ! prepare_admin_password_b64_from_env; then
    echo "ADMIN_INITIAL_PASSWORD_B64、ADMIN_PASSWORD 或 ADMIN_INITIAL_PASSWORD 未配置，跳过管理员账号更新。"
    return
  fi

  ADMIN_DISPLAY_NAME="${ADMIN_DISPLAY_NAME:-Super Admin}"
  export ADMIN_EMAIL ADMIN_INITIAL_PASSWORD_B64 ADMIN_DISPLAY_NAME

  echo "Creating or updating admin account..."
  compose run --rm \
    -e ADMIN_EMAIL \
    -e ADMIN_INITIAL_PASSWORD_B64 \
    -e ADMIN_DISPLAY_NAME \
    api pnpm bootstrap:admin

  echo "Verifying admin role and permissions..."
  bash "${SCRIPT_DIR}/verify-admin-bootstrap.sh"
}

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "未找到 .env.production，请先运行 bash scripts/install.sh"
  exit 1
fi

if [[ ! -f "${COMPOSE_FILE}" ]]; then
  echo "缺少 docker-compose.prod.yml，请在项目 checkout 根目录运行。"
  exit 1
fi

set -a
# shellcheck disable=SC1090
. "${ENV_FILE}"
set +a

compose config >/dev/null

if [[ -d .git ]]; then
  branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || true)"
  upstream="$(git rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>/dev/null || true)"
  if [[ -n "${branch}" && -n "${upstream}" ]]; then
    echo "Pulling latest code for ${branch}..."
    git pull --ff-only
  else
    echo "Git upstream is not configured; skipping git pull."
  fi
fi

echo "Rebuilding production images..."
build_production_images

echo "Starting database dependencies..."
compose up -d postgres redis astro-service

preflight_database_connection
run_migrations

echo "Running database seed..."
compose run --rm api corepack pnpm db:seed

create_and_verify_admin

echo "Restarting services..."
compose up -d --remove-orphans
compose restart api web worker caddy

echo "Update complete."
compose ps
if [[ -n "${DOMAIN:-}" ]]; then
  echo "Public URL: https://${DOMAIN}"
  echo "API health: https://${DOMAIN}/api/health"
fi
