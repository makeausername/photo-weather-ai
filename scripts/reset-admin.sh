#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE=".env.production"
COMPOSE_FILE="docker-compose.prod.yml"
INSTALLER_INPUT_LIB="${SCRIPT_DIR}/lib/installer-input.sh"

cd "${PROJECT_ROOT}"

# shellcheck source=scripts/lib/installer-input.sh
. "${INSTALLER_INPUT_LIB}"

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

ADMIN_PASSWORD="$(prompt_password_twice "请输入新的管理员密码" "请再次输入新的管理员密码")"
ADMIN_INITIAL_PASSWORD_B64="$(admin_password_to_b64 "${ADMIN_PASSWORD}")"
export ADMIN_INITIAL_PASSWORD_B64

update_admin_env_file() {
  local tmp_file="${ENV_FILE}.tmp"
  local saw_admin_email=0
  local saw_admin_password_b64=0

  : > "${tmp_file}"

  while IFS= read -r line || [[ -n "${line}" ]]; do
    if [[ "${line}" =~ ^ADMIN_EMAIL= ]]; then
      printf 'ADMIN_EMAIL=%s\n' "${ADMIN_EMAIL}" >> "${tmp_file}"
      saw_admin_email=1
    elif [[ "${line}" =~ ^ADMIN_INITIAL_PASSWORD_B64= ]]; then
      printf 'ADMIN_INITIAL_PASSWORD_B64=%s\n' "${ADMIN_INITIAL_PASSWORD_B64}" >> "${tmp_file}"
      saw_admin_password_b64=1
    elif [[ "${line}" =~ ^ADMIN_PASSWORD= || "${line}" =~ ^ADMIN_INITIAL_PASSWORD= ]]; then
      continue
    else
      printf '%s\n' "${line}" >> "${tmp_file}"
    fi
  done < "${ENV_FILE}"

  if [[ "${saw_admin_email}" == "0" ]]; then
    printf 'ADMIN_EMAIL=%s\n' "${ADMIN_EMAIL}" >> "${tmp_file}"
  fi
  if [[ "${saw_admin_password_b64}" == "0" ]]; then
    printf 'ADMIN_INITIAL_PASSWORD_B64=%s\n' "${ADMIN_INITIAL_PASSWORD_B64}" >> "${tmp_file}"
  fi

  mv "${tmp_file}" "${ENV_FILE}"
  chmod 600 "${ENV_FILE}"
}

compose_run_create_admin() {
  export ADMIN_EMAIL ADMIN_INITIAL_PASSWORD_B64 ADMIN_DISPLAY_NAME
  compose run --rm \
    -e ADMIN_EMAIL \
    -e ADMIN_INITIAL_PASSWORD_B64 \
    -e ADMIN_DISPLAY_NAME \
    api pnpm create-admin
}

compose_run_verify_admin() {
  export ADMIN_EMAIL ADMIN_INITIAL_PASSWORD_B64
  compose run --rm \
    -e ADMIN_EMAIL \
    -e ADMIN_INITIAL_PASSWORD_B64 \
    api pnpm verify-admin
}

update_admin_env_file

compose_run_create_admin
compose_run_verify_admin

compose restart api web >/dev/null 2>&1 || true

echo "管理员密码已重置。"
echo "后台地址：https://${DOMAIN:-}/admin/login"
echo "管理员邮箱：${ADMIN_EMAIL}"
echo "密码：已隐藏"
