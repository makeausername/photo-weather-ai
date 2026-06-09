#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
COMPOSE_FILE="docker-compose.prod.yml"
ENV_FILE=".env.production"
DATA_DIR="${PROJECT_ROOT}/deploy/light-pollution"

cd "${PROJECT_ROOT}"
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

echo "Active light-pollution dataset:"
compose run --rm --no-deps \
  -v "${DATA_DIR}:/app/data/light-pollution" \
  astro-service \
  python -m scripts.import_light_pollution --check --data-dir /app/data/light-pollution

echo
echo "Astro-service health light-pollution fields:"
if compose ps -q api >/dev/null 2>&1; then
  compose run --rm api node -e 'fetch("http://astro-service:4100/health").then(async (response) => { const body = await response.json(); for (const key of ["lightPollutionAvailable","lightPollutionMetadataAvailable","lightPollutionDatasetYear","lightPollutionDatasetVersion","lightPollutionChecksumShort","lightPollutionLoadError"]) console.log(`${key}=${body[key] ?? ""}`); }).catch((error) => { console.error(error.message); process.exit(1); })'
else
  echo "api service is not available; inspect /health after starting production services."
fi
