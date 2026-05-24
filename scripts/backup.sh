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
  docker_cmd compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" "$@"
}

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "未找到 .env.production，请先运行 bash scripts/install.sh"
  exit 1
fi

set -a
# shellcheck disable=SC1090
. "${ENV_FILE}"
set +a

timestamp="$(date +%Y%m%d-%H%M%S)"
backup_dir="${PROJECT_ROOT}/backups/${timestamp}"
mkdir -p "${backup_dir}"
chmod 700 "${PROJECT_ROOT}/backups" "${backup_dir}"

echo "Backing up PostgreSQL database to backups/${timestamp}/postgres.dump..."
compose exec -T postgres pg_dump -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -Fc -f - > "${backup_dir}/postgres.dump"

cp "${ENV_FILE}" "${backup_dir}/env.production.backup"
chmod 600 "${backup_dir}/env.production.backup"

echo "Backup complete: backups/${timestamp}"
echo "The .env.production backup was saved with mode 600. Do not share it or commit it; it contains secrets."
