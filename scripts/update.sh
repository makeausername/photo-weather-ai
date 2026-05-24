#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE=".env.production"
COMPOSE_FILE="docker-compose.prod.yml"

cd "${PROJECT_ROOT}"

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

  printf '%s\n' "${url}" | sed -E 's#(postgres(ql)?://[^:/@]+:)[^@]*(@)#\1***\3#'
}

print_migration_diagnostics() {
  echo
  echo "Migration diagnostics:"
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
  echo "Last 100 API log lines:"
  compose logs --tail=100 api || true
}

preflight_database_connection() {
  echo "Checking database connectivity from the API image..."
  if compose run --rm api node -e 'async function main() { let prisma; try { const { PrismaClient } = require("@prisma/client"); prisma = new PrismaClient(); await prisma.$queryRawUnsafe("SELECT 1"); } catch { console.error("数据库连接失败，请检查 DATABASE_URL、POSTGRES_USER、POSTGRES_PASSWORD 是否一致。"); process.exitCode = 1; } finally { if (prisma) { await prisma.$disconnect().catch(() => {}); } } } main();'; then
    return
  fi

  echo "数据库连接失败，请检查 DATABASE_URL、POSTGRES_USER、POSTGRES_PASSWORD 是否一致。"
  print_migration_diagnostics
  exit 1
}

run_migrations() {
  echo "Running database migrations..."
  if compose run --rm api corepack pnpm db:migrate; then
    return
  fi

  echo "数据库迁移失败。"
  echo "数据库连接失败，请检查 DATABASE_URL、POSTGRES_USER、POSTGRES_PASSWORD 是否一致。"
  print_migration_diagnostics
  exit 1
}

wait_for_postgres() {
  echo "Waiting for PostgreSQL..."
  for _ in $(seq 1 60); do
    if compose exec -T postgres pg_isready -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" >/dev/null 2>&1; then
      return
    fi
    sleep 2
  done

  echo "PostgreSQL did not become ready in time."
  compose logs --tail=80 postgres || true
  exit 1
}

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "未找到 .env.production，请先运行 bash scripts/install.sh"
  exit 1
fi

set -a
# shellcheck disable=SC1090
. "${ENV_FILE}"
set +a

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
compose build

echo "Starting database dependencies..."
compose up -d postgres redis astro-service
wait_for_postgres

preflight_database_connection
run_migrations

echo "Running database seed..."
compose run --rm api corepack pnpm db:seed

echo "Restarting services..."
compose up -d --remove-orphans
compose restart api web worker caddy

echo "Update complete."
compose ps
if [[ -n "${DOMAIN:-}" ]]; then
  echo "Public URL: https://${DOMAIN}"
  echo "API health: https://${DOMAIN}/api/health"
fi
