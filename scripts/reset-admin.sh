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
  docker_cmd compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

trim() {
  local value="$1"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  printf '%s' "${value}"
}

prompt_required() {
  local label="$1"
  local default_value="${2:-}"
  local value=""

  while true; do
    if [[ -n "${default_value}" ]]; then
      read -r -p "${label} [${default_value}]: " value
      value="${value:-${default_value}}"
    else
      read -r -p "${label}: " value
    fi

    value="$(trim "${value}")"
    if [[ -n "${value}" ]]; then
      printf '%s' "${value}"
      return
    fi
    echo "此项不能为空。"
  done
}

prompt_secret() {
  local label="$1"
  local value=""
  read -r -s -p "${label}: " value
  echo
  printf '%s' "${value}"
}

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "未找到 .env.production，请先运行 bash scripts/install.sh"
  exit 1
fi

set -a
# shellcheck disable=SC1090
. "${ENV_FILE}"
set +a

ADMIN_EMAIL="$(prompt_required "请输入管理员邮箱" "${ADMIN_EMAIL:-}")"
ADMIN_DISPLAY_NAME="${ADMIN_DISPLAY_NAME:-Super Admin}"

while true; do
  ADMIN_PASSWORD="$(prompt_secret "请输入新的管理员密码")"
  repeat_password="$(prompt_secret "请再次输入新的管理员密码")"
  if [[ -z "${ADMIN_PASSWORD}" ]]; then
    echo "管理员密码不能为空。"
    continue
  fi
  if [[ "${ADMIN_PASSWORD}" != "${repeat_password}" ]]; then
    echo "两次输入的管理员密码不一致，请重新输入。"
    continue
  fi
  break
done

compose run --rm \
  -e ADMIN_EMAIL="${ADMIN_EMAIL}" \
  -e ADMIN_PASSWORD="${ADMIN_PASSWORD}" \
  -e ADMIN_DISPLAY_NAME="${ADMIN_DISPLAY_NAME}" \
  api pnpm create-admin

compose run --rm \
  -e ADMIN_EMAIL="${ADMIN_EMAIL}" \
  -e ADMIN_PASSWORD="${ADMIN_PASSWORD}" \
  api pnpm verify-admin

compose restart api web >/dev/null 2>&1 || true

echo "管理员密码已重置。"
echo "后台地址：https://${DOMAIN:-}/admin/login"
echo "管理员邮箱：${ADMIN_EMAIL}"
echo "密码：已隐藏"
