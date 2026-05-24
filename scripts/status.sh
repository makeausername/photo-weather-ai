#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE=".env.production"
COMPOSE_FILE="docker-compose.prod.yml"
CHECK_ENV_SCRIPT="${SCRIPT_DIR}/check-env-production.sh"

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
  docker_cmd compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "未找到 .env.production，请先运行 bash scripts/install.sh"
  exit 1
fi

if ! bash "${CHECK_ENV_SCRIPT}"; then
  echo "生产环境配置文件格式错误，请检查 .env.production。"
  exit 1
fi

set -a
# shellcheck disable=SC1090
. "${ENV_FILE}"
set +a

echo "Service status:"
compose ps

if [[ -n "${DOMAIN:-}" ]]; then
  echo
  echo "Public URL:"
  echo "https://${DOMAIN}"
  echo
  echo "API health:"
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
echo "Database status:"
compose exec -T postgres pg_isready -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" || true

echo
echo "Caddy status:"
compose ps caddy || true

echo
echo "Internal astro-service health from the app network:"
compose exec -T api node -e "fetch('http://astro-service:4100/health').then(async r => { console.log(r.status, await r.text()) }).catch(e => { console.error(e.message); process.exit(1) })" || true

echo
echo "Recent service logs:"
for service in web api worker astro-service caddy postgres redis; do
  echo "--- ${service} ---"
  compose logs --tail=40 "${service}" || true
done

echo
echo "Recent error logs:"
for service in web api worker astro-service caddy postgres redis; do
  echo "--- ${service} errors ---"
  compose logs --tail=160 "${service}" 2>/dev/null | grep -Ei "error|failed|exception|prisma|p1000|p1001|panic|fatal" || true
done
