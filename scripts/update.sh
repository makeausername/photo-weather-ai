#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE=".env.production"
COMPOSE_FILE="docker-compose.prod.yml"
DEPLOY_BRANCH="${DEPLOY_BRANCH:-main}"
DEPLOY_REVISION="unknown"
CADDY_TEMPLATE="${PROJECT_ROOT}/deploy/Caddyfile.template"
CADDY_FILE="${PROJECT_ROOT}/deploy/Caddyfile"
INSTALLER_INPUT_LIB="${SCRIPT_DIR}/lib/installer-input.sh"

cd "${PROJECT_ROOT}"

# shellcheck source=scripts/lib/installer-input.sh
. "${INSTALLER_INPUT_LIB}"
. "${SCRIPT_DIR}/lib/deployment-runtime.sh"

if [[ "$(id -u)" -eq 0 ]]; then
  SUDO=""
else
  SUDO="sudo"
fi

docker_cmd() {
  if [[ -n "${SUDO}" ]]; then
    sudo --preserve-env=APP_GIT_SHA,COMPOSE_PROJECT_NAME docker "$@"
  else
    docker "$@"
  fi
}

compose() {
  local profiles=()
  if [[ "${ENABLE_ASTRO_SERVICE:-false}" == "true" ]]; then profiles=(--profile astro); fi
  docker_cmd compose "${profiles[@]}" --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

render_caddyfile() {
  if [[ -z "${DOMAIN:-}" ]]; then
    echo "DOMAIN is missing in .env.production; cannot render deploy/Caddyfile."
    exit 1
  fi

  if [[ ! -f "${CADDY_TEMPLATE}" ]]; then
    echo "Missing deploy/Caddyfile.template; run this script from the project checkout."
    exit 1
  fi

  mkdir -p "${PROJECT_ROOT}/deploy"
  sed "s/DOMAIN_PLACEHOLDER/${DOMAIN}/g" "${CADDY_TEMPLATE}" > "${CADDY_FILE}"
  echo "Rendered deploy/Caddyfile from deploy/Caddyfile.template."
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
  local services=(api web)
  if [[ "${ENABLE_ASTRO_SERVICE:-false}" == "true" ]]; then services=(astro-service "${services[@]}"); fi
  for service in "${services[@]}"; do
    if compose_service_exists "${service}"; then
      echo "Building ${service}..."
      compose build "${service}"
    fi
  done
}

update_checkout() {
  if [[ ! -d .git ]]; then
    echo "Git metadata is unavailable; rebuilding the current checkout without pulling."
    return
  fi

  if ! git check-ref-format --branch "${DEPLOY_BRANCH}" >/dev/null 2>&1; then
    echo "Invalid DEPLOY_BRANCH: ${DEPLOY_BRANCH}"
    exit 1
  fi

  if ! git remote get-url origin >/dev/null 2>&1; then
    echo "Git remote 'origin' is missing; cannot update the production checkout."
    exit 1
  fi

  if ! git diff --quiet || ! git diff --cached --quiet || [[ -n "$(git ls-files --others --exclude-standard)" ]]; then
    echo "The production checkout has uncommitted files; refusing to switch branches or build mixed source."
    echo "Review 'git status --short' and preserve or remove those files before retrying."
    exit 1
  fi

  echo "Fetching production branch origin/${DEPLOY_BRANCH}..."
  git fetch origin "${DEPLOY_BRANCH}"

  if git show-ref --verify --quiet "refs/heads/${DEPLOY_BRANCH}"; then
    git switch -- "${DEPLOY_BRANCH}"
  elif git show-ref --verify --quiet "refs/remotes/origin/${DEPLOY_BRANCH}"; then
    git switch --track -c "${DEPLOY_BRANCH}" "origin/${DEPLOY_BRANCH}"
  else
    echo "Remote deployment branch origin/${DEPLOY_BRANCH} was not found."
    exit 1
  fi

  git pull --ff-only origin "${DEPLOY_BRANCH}"
  DEPLOY_REVISION="$(git rev-parse HEAD)"
  export APP_GIT_SHA="${DEPLOY_REVISION}"
  echo "Production source revision: ${DEPLOY_REVISION} (${DEPLOY_BRANCH})"
}

verify_web_revision() {
  if [[ "${DEPLOY_REVISION}" == "unknown" ]]; then
    return
  fi

  local container_id
  local running_revision
  container_id="$(compose ps -q web 2>/dev/null || true)"
  if [[ -z "${container_id}" ]]; then
    echo "Web container is not running after the update."
    exit 1
  fi

  running_revision="$(docker_cmd inspect --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}' "${container_id}" 2>/dev/null || true)"
  if [[ "${running_revision}" != "${DEPLOY_REVISION}" ]]; then
    echo "Web revision verification failed: expected ${DEPLOY_REVISION}, running ${running_revision:-unlabeled}."
    exit 1
  fi

  echo "OK Web container revision verified: ${running_revision}"
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
          return 1
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
  return 1
}

run_postgres_select_one() {
  echo "Running PostgreSQL SELECT 1 preflight..."
  if compose exec -T postgres psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -v ON_ERROR_STOP=1 -c "SELECT 1;"; then
    echo "OK PostgreSQL SELECT 1 passed."
    return
  fi

  echo "数据库连接失败，请检查 DATABASE_URL、POSTGRES_USER、POSTGRES_PASSWORD 是否一致。"
  print_database_diagnostics
  return 1
}

preflight_database_connection() {
  wait_for_postgres || return 1
  run_postgres_select_one || return 1

  echo "Checking database connectivity from the API image..."
  if compose run --rm --no-deps -w /app/packages/db api node -e 'async function main() { let prisma; try { const { PrismaClient } = require("@prisma/client"); prisma = new PrismaClient(); await prisma.$queryRawUnsafe("SELECT 1"); } catch (error) { console.error(error.code === "MODULE_NOT_FOUND" ? "数据库客户端依赖缺失，请重新构建 API 镜像。" : "数据库连接失败，请检查 DATABASE_URL、POSTGRES_USER、POSTGRES_PASSWORD 是否一致。"); process.exitCode = 1; } finally { if (prisma) { await prisma.$disconnect().catch(() => {}); } } } main();'; then
    return
  fi

  echo "数据库连接失败，请检查 DATABASE_URL、POSTGRES_USER、POSTGRES_PASSWORD 是否一致。"
  print_database_diagnostics
  return 1
}

run_migrations() {
  echo "Running database migrations..."
  if compose run --rm api corepack pnpm db:migrate; then
    return
  fi

  echo "数据库迁移失败。"
  echo "数据库连接失败，请检查 DATABASE_URL、POSTGRES_USER、POSTGRES_PASSWORD 是否一致。"
  print_database_diagnostics
  return 1
}

create_and_verify_admin() {
  compose run --rm --no-deps api corepack pnpm db:seed:free
  VERIFY_ADMIN_PASSWORD=false bash "${SCRIPT_DIR}/verify-admin-bootstrap.sh"
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

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "未找到 .env.production，请先运行 bash scripts/install.sh"
  exit 1
fi

if [[ ! -f "${COMPOSE_FILE}" ]]; then
  echo "缺少 docker-compose.prod.yml，请在项目 checkout 根目录运行。"
  exit 1
fi

ensure_host_dependencies
bash "${SCRIPT_DIR}/check-env-production.sh"
set -a
# shellcheck disable=SC1090
. "${ENV_FILE}"
set +a

ensure_light_pollution_directories
compose config >/dev/null

update_checkout

render_caddyfile
bash "${SCRIPT_DIR}/check-cloudflare.sh"

echo "Rebuilding production images..."
build_production_images

echo "Starting database dependencies..."
compose up -d postgres redis
if [[ "${ENABLE_ASTRO_SERVICE:-false}" == "true" ]]; then
  compose up -d astro-service
  bash "${SCRIPT_DIR}/download-ephemeris.sh"
fi
preflight_database_connection
# Snapshot before applying migrations; a failed migration never switches application containers.
bash "${SCRIPT_DIR}/backup.sh"
run_migrations
create_and_verify_admin

echo "Restarting verified free-edition services..."
compose up -d --wait --wait-timeout 180 --remove-orphans --force-recreate api web caddy
verify_web_revision
verify_public_https

echo "Update complete."
compose ps
if [[ -n "${DOMAIN:-}" ]]; then
  echo "Public URL: https://${DOMAIN}"
  echo "API health: https://${DOMAIN}/api/service/health"
fi
