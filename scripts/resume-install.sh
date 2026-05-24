#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE=".env.production"
COMPOSE_FILE="docker-compose.prod.yml"
INSTALL_LOG="${PROJECT_ROOT}/deploy/install.log"

cd "${PROJECT_ROOT}"
mkdir -p "${PROJECT_ROOT}/deploy"

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

run_logged() {
  local label="$1"
  shift

  echo "${label}..."
  printf '\n### %s\n' "${label}" >> "${INSTALL_LOG}"
  "$@" >> "${INSTALL_LOG}" 2>&1
  echo "OK ${label}"
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
    if compose exec -T postgres pg_isready -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" >/dev/null 2>&1; then
      echo "OK PostgreSQL 已就绪。"
      return
    fi
    sleep 2
  done

  echo "PostgreSQL 未在预期时间内就绪。"
  compose logs --tail=100 postgres || true
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

if [[ -z "${ADMIN_EMAIL:-}" || -z "${ADMIN_PASSWORD:-}" ]]; then
  echo "ADMIN_EMAIL 或 ADMIN_PASSWORD 未配置，无法继续管理员验证。"
  exit 1
fi

if [[ ! -f "${COMPOSE_FILE}" ]]; then
  echo "缺少 docker-compose.prod.yml，请在项目 checkout 根目录运行。"
  exit 1
fi

compose config >/dev/null

build_production_images

run_logged "启动数据库、Redis 和星历服务" compose up -d postgres redis astro-service
wait_for_postgres

if ! compose run --rm astro-service python scripts/fetch_ephemeris.py >> "${INSTALL_LOG}" 2>&1; then
  echo "星历缓存下载失败。astro-service 会在 astro_data 卷中缺少 de421.bsp 时显示为不健康。"
fi

run_logged "运行数据库迁移" compose run --rm api corepack pnpm db:migrate
run_logged "写入数据库种子数据" compose run --rm api corepack pnpm db:seed

run_logged "创建或更新管理员账号" compose run --rm \
  -e ADMIN_EMAIL="${ADMIN_EMAIL}" \
  -e ADMIN_PASSWORD="${ADMIN_PASSWORD}" \
  -e ADMIN_DISPLAY_NAME="${ADMIN_DISPLAY_NAME:-Super Admin}" \
  api pnpm create-admin

run_logged "验证管理员账号" compose run --rm \
  -e ADMIN_EMAIL="${ADMIN_EMAIL}" \
  -e ADMIN_PASSWORD="${ADMIN_PASSWORD}" \
  api pnpm verify-admin

run_logged "启动完整生产服务" compose up -d --remove-orphans postgres redis astro-service api web caddy worker
run_logged "重启应用服务" compose restart api web worker caddy

echo "部署恢复完成。"
echo "Website: https://${DOMAIN:-}"
echo "Admin login: https://${DOMAIN:-}/admin/login"
echo "Admin email: ${ADMIN_EMAIL}"
echo "Password: hidden"
compose ps
