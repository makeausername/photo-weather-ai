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

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Missing .env.production. Nothing to uninstall from this checkout."
  exit 0
fi

read -r -p "Stop the production stack for this checkout? Type STOP to continue: " confirmation
if [[ "${confirmation}" != "STOP" ]]; then
  echo "Aborted."
  exit 0
fi

read -r -p "Delete Docker volumes too? Type DELETE_DATA to remove database/Redis/Caddy/app volumes: " delete_data

if [[ "${delete_data}" == "DELETE_DATA" ]]; then
  compose down -v
  echo "Services stopped and Docker volumes removed."
else
  compose down
  echo "Services stopped. Docker volumes were kept."
fi

echo ".env.production was kept. Remove it manually only after you no longer need the deployment secrets."
