#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE=".env.production"
COMPOSE_FILE="docker-compose.prod.yml"
COMPOSE_PROJECT_NAME_DEFAULT="photo-weather-ai"

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

load_env_file() {
  if [[ -f "${ENV_FILE}" ]]; then
    set -a
    # shellcheck disable=SC1090
    . "${ENV_FILE}"
    set +a
  fi
}

compose_project_name() {
  printf '%s' "${COMPOSE_PROJECT_NAME:-${COMPOSE_PROJECT_NAME_DEFAULT}}"
}

remove_volume_if_exists() {
  local volume_name="$1"
  if docker_cmd volume inspect "${volume_name}" >/dev/null 2>&1; then
    docker_cmd volume rm "${volume_name}"
  else
    echo "Volume ${volume_name} does not exist; nothing to remove."
  fi
}

if [[ ! -f "${COMPOSE_FILE}" ]]; then
  echo "Missing docker-compose.prod.yml. Run this script from the project checkout."
  exit 1
fi

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "未找到 .env.production，请先运行 bash scripts/install.sh"
  exit 1
fi

load_env_file

echo "This reset helper is only for staging/test deployments."
echo "It stops the production Docker Compose stack and removes only the PostgreSQL data volume by default."
echo "It does not remove Caddy certificate data unless you explicitly confirm that separately."
echo

confirmation=""
read -r -p "Type DELETE_DB_DATA to remove the production PostgreSQL volume: " confirmation
if [[ "${confirmation}" != "DELETE_DB_DATA" ]]; then
  echo "Aborted. PostgreSQL data was not changed."
  exit 1
fi

project_name="$(compose_project_name)"
postgres_volume="${project_name}_postgres_data"

echo "Stopping production stack..."
compose down --remove-orphans || true

echo "Removing PostgreSQL volume: ${postgres_volume}"
remove_volume_if_exists "${postgres_volume}"

caddy_confirmation=""
read -r -p "Type DELETE_CADDY_DATA to also remove Caddy certificate/config volumes, or press Enter to keep them: " caddy_confirmation
if [[ "${caddy_confirmation}" == "DELETE_CADDY_DATA" ]]; then
  remove_volume_if_exists "${project_name}_caddy_data"
  remove_volume_if_exists "${project_name}_caddy_config"
else
  echo "Kept Caddy certificate/config volumes."
fi

echo
echo "Database reset complete."
echo "Next step: bash scripts/install.sh"
