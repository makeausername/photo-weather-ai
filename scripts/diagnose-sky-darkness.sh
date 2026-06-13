#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
COMPOSE_FILE="docker-compose.prod.yml"
ENV_FILE=".env.production"

cd "${PROJECT_ROOT}"

if [[ ! -f "${COMPOSE_FILE}" ]]; then
  echo "Missing ${COMPOSE_FILE}. Run this script from the project checkout."
  exit 1
fi

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

if [[ $# -eq 0 ]]; then
  echo "Usage: bash scripts/diagnose-sky-darkness.sh --coordinate lat,lon [--json] [--azimuth degrees] [--label text]"
  echo "This command queries only the local active WA/model and VIIRS datasets through astro-service."
  exit 2
fi

compose run --rm api \
  pnpm --filter @photo-weather/api exec tsx src/scripts/diagnose-sky-darkness.ts \
    --astro-service-url http://astro-service:4100 \
    "$@"
