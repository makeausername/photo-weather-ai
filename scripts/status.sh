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

echo "Service status:"
compose ps

echo
echo "Recent logs:"
for service in web api astro-service caddy; do
  echo "--- ${service} ---"
  compose logs --tail=60 "${service}" || true
done

if [[ -n "${DOMAIN:-}" ]]; then
  echo
  echo "Domain health:"
  if curl -fsS --max-time 10 "https://${DOMAIN}" >/dev/null; then
    echo "OK https://${DOMAIN}"
  else
    echo "FAIL https://${DOMAIN}"
  fi

  if curl -fsS --max-time 10 "https://${DOMAIN}/api/health" >/dev/null; then
    echo "OK https://${DOMAIN}/api/health"
  else
    echo "FAIL https://${DOMAIN}/api/health"
  fi
fi

echo
echo "Internal astro-service health from the app network:"
compose exec -T api node -e "fetch('http://astro-service:4100/health').then(async r => { console.log(r.status, await r.text()) }).catch(e => { console.error(e.message); process.exit(1) })" || true
