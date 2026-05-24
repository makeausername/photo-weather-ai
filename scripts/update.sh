#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${PROJECT_ROOT}/.env.production"
COMPOSE_FILE="${PROJECT_ROOT}/docker-compose.prod.yml"

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
  docker_cmd compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" "$@"
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
  echo "Missing .env.production. Run scripts/install.sh first."
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

echo "Running database migrations..."
compose run --rm api corepack pnpm db:migrate

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
