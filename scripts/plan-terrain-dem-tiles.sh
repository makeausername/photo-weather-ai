#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
COMPOSE_FILE="docker-compose.prod.yml"
ENV_FILE=".env.production"
DATA_DIR="${PROJECT_ROOT}/deploy/terrain-dem"

cd "${PROJECT_ROOT}"
mkdir -p "${DATA_DIR}/incoming" "${DATA_DIR}/current" "${DATA_DIR}/backups" "${DATA_DIR}/regions"

docker_cmd() {
  if command -v sudo >/dev/null 2>&1 && ! docker info >/dev/null 2>&1; then
    sudo docker "$@"
  else
    docker "$@"
  fi
}

compose() {
  docker_cmd compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

compose run --rm --no-deps \
  -v "${DATA_DIR}:/app/data/terrain-dem" \
  astro-service \
  python -m scripts.plan_terrain_dem_tiles \
    --data-dir /app/data/terrain-dem \
    "$@"
