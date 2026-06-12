#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
COMPOSE_FILE="docker-compose.prod.yml"
ENV_FILE=".env.production"
DATA_DIR="${PROJECT_ROOT}/deploy/terrain-dem"

cd "${PROJECT_ROOT}"

if [[ ! -f "${COMPOSE_FILE}" ]]; then
  echo "Missing ${COMPOSE_FILE}. Run this script from the project checkout."
  exit 1
fi

mkdir -p "${DATA_DIR}/incoming" "${DATA_DIR}/current" "${DATA_DIR}/backups"

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

source_args=()
cli_args=()
after_separator=0
for arg in "$@"; do
  if [[ "${arg}" == "--" ]]; then
    after_separator=1
    continue
  fi
  if [[ "${after_separator}" -eq 1 ]]; then
    cli_args+=("${arg}")
  else
    source_args+=("${arg}")
  fi
done

container_source_args=()
for source in "${source_args[@]}"; do
  if [[ "${source}" == "${DATA_DIR}"* ]]; then
    relative="${source#${DATA_DIR}/}"
    container_source_args+=("/app/data/terrain-dem/${relative}")
  elif [[ "${source}" = /* ]]; then
    container_source_args+=("${source}")
  else
    container_source_args+=("/app/data/terrain-dem/${source}")
  fi
done

if [[ ${#container_source_args[@]} -eq 0 ]]; then
  echo "Usage: bash scripts/import-terrain-dem.sh incoming/<file-or-directory> [-- --dataset-name NAME --dataset-year 2024 --dataset-version VERSION --source-name SOURCE]"
  echo "Place legally obtained GeoTIFF/COG DEM files under deploy/terrain-dem/incoming/ first. This script does not download DEM data."
  exit 2
fi

echo "Importing local terrain DEM raster through astro-service..."
compose run --rm --no-deps \
  -v "${DATA_DIR}:/app/data/terrain-dem" \
  astro-service \
  python -m scripts.import_terrain_dem \
    --data-dir /app/data/terrain-dem \
    "${container_source_args[@]}" \
    "${cli_args[@]}"

echo "Restarting astro-service so workers observe the active terrain DEM dataset..."
compose restart astro-service >/dev/null 2>&1 || true
echo "OK terrain DEM dataset import finished."
