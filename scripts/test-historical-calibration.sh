#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE=".env.production"
COMPOSE_FILE="docker-compose.prod.yml"
CHECK_ENV_SCRIPT="${SCRIPT_DIR}/check-env-production.sh"

cd "${PROJECT_ROOT}"

# Runs docker compose --env-file .env.production -f docker-compose.prod.yml
# and executes pnpm inside the api container.
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
  docker_cmd compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Missing .env.production. Run bash scripts/install.sh first." >&2
  exit 1
fi

if ! bash "${CHECK_ENV_SCRIPT}" >/dev/null; then
  echo "Production environment file validation failed. Check .env.production." >&2
  exit 1
fi

CALIBRATION_LOCATION_NAME="${CALIBRATION_LOCATION_NAME:-黄山光明顶}"
CALIBRATION_LATITUDE_WGS84="${CALIBRATION_LATITUDE_WGS84:-30.1321}"
CALIBRATION_LONGITUDE_WGS84="${CALIBRATION_LONGITUDE_WGS84:-118.1691}"
CALIBRATION_ELEVATION_METERS="${CALIBRATION_ELEVATION_METERS:-1800}"
CALIBRATION_START_DATE="${CALIBRATION_START_DATE:-2026-05-01}"
CALIBRATION_END_DATE="${CALIBRATION_END_DATE:-2026-05-02}"
CALIBRATION_TIMEZONE="${CALIBRATION_TIMEZONE:-Asia/Shanghai}"
CALIBRATION_TARGETS="${CALIBRATION_TARGETS:-general}"
CALIBRATION_OBSERVED_RESULT="${CALIBRATION_OBSERVED_RESULT:-partial}"
CALIBRATION_SOURCE_PROVIDER="open_meteo_historical"

echo "Historical calibration smoke test"
echo "provider: ${CALIBRATION_SOURCE_PROVIDER}"
echo "location: ${CALIBRATION_LOCATION_NAME} ${CALIBRATION_LATITUDE_WGS84},${CALIBRATION_LONGITUDE_WGS84}"
echo "date range: ${CALIBRATION_START_DATE} to ${CALIBRATION_END_DATE}"
echo "targets: ${CALIBRATION_TARGETS}"
echo "observed result label: ${CALIBRATION_OBSERVED_RESULT}"
echo "No API keys or secrets will be printed."

args=(
  "--provider"
  "${CALIBRATION_SOURCE_PROVIDER}"
  "--location-name"
  "${CALIBRATION_LOCATION_NAME}"
  "--lat"
  "${CALIBRATION_LATITUDE_WGS84}"
  "--lng"
  "${CALIBRATION_LONGITUDE_WGS84}"
  "--elevation"
  "${CALIBRATION_ELEVATION_METERS}"
  "--start-date"
  "${CALIBRATION_START_DATE}"
  "--end-date"
  "${CALIBRATION_END_DATE}"
  "--timezone"
  "${CALIBRATION_TIMEZONE}"
  "--targets"
  "${CALIBRATION_TARGETS}"
)

if [[ -n "${CALIBRATION_SPOT_ID:-}" ]]; then
  args+=("--spot-id" "${CALIBRATION_SPOT_ID}")
fi

if [[ -n "${CALIBRATION_LOCATION_KEY:-}" ]]; then
  args+=("--location-key" "${CALIBRATION_LOCATION_KEY}")
fi

compose run --rm -e CALIBRATION_OBSERVED_RESULT="${CALIBRATION_OBSERVED_RESULT}" api pnpm --filter @photo-weather/api calibration:test -- "${args[@]}"
