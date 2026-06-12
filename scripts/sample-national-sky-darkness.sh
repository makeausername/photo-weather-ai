#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
COMPOSE_FILE="docker-compose.prod.yml"
ENV_FILE=".env.production"
LIGHT_DATA_DIR="${PROJECT_ROOT}/deploy/light-pollution"
RUNTIME_DIR="${PROJECT_ROOT}/deploy/calibration/runtime"

cd "${PROJECT_ROOT}"

if [[ ! -f "${COMPOSE_FILE}" ]]; then
  echo "Missing ${COMPOSE_FILE}. Run this script from the project checkout."
  exit 1
fi

mkdir -p "${LIGHT_DATA_DIR}/incoming" "${LIGHT_DATA_DIR}/current" "${LIGHT_DATA_DIR}/backups" "${RUNTIME_DIR}"

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

echo "Sampling active VIIRS raster into national sky-darkness runtime statistics..."
compose run --rm --no-deps \
  -v "${LIGHT_DATA_DIR}:/app/data/light-pollution" \
  -v "${RUNTIME_DIR}:/app/deploy/calibration/runtime" \
  astro-service \
  python -m scripts.national_sky_darkness_stats \
    --data-dir /app/data/light-pollution \
    --output /app/deploy/calibration/runtime/national-sky-darkness-stats.json \
    "$@"

echo "OK national sky-darkness stats written under deploy/calibration/runtime/."
echo "Runtime stats are ignored by Git; review and promote only through an explicit model-config change."
