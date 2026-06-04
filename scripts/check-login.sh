#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE=".env.production"
INSTALLER_INPUT_LIB="${SCRIPT_DIR}/lib/installer-input.sh"

cd "${PROJECT_ROOT}"

# shellcheck source=scripts/lib/installer-input.sh
. "${INSTALLER_INPUT_LIB}"

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

json_escape() {
  local value="$1"
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  value="${value//$'\n'/\\n}"
  value="${value//$'\r'/\\r}"
  value="${value//$'\t'/\\t}"
  printf '%s' "${value}"
}

resolve_login_url() {
  if [[ -n "${CHECK_LOGIN_URL:-}" ]]; then
    printf '%s' "${CHECK_LOGIN_URL}"
    return
  fi

  local api_base="${NEXT_PUBLIC_API_BASE_URL:-}"
  if [[ -z "${api_base}" && -n "${PUBLIC_SITE_URL:-}" ]]; then
    api_base="${PUBLIC_SITE_URL%/}/api"
  fi
  if [[ -z "${api_base}" && -n "${SITE_URL:-}" ]]; then
    api_base="${SITE_URL%/}/api"
  fi
  if [[ -z "${api_base}" && -n "${DOMAIN:-}" ]]; then
    api_base="https://${DOMAIN}/api"
  fi
  if [[ -z "${api_base}" ]]; then
    api_base="$(prompt_required "请输入 API 地址" "https://example.com/api")"
  fi

  printf '%s/auth/login' "${api_base%/}"
}

if [[ -f "${ENV_FILE}" ]]; then
  set -a
  # shellcheck disable=SC1090
  . "${ENV_FILE}"
  set +a
fi

if ! command -v curl >/dev/null 2>&1; then
  echo "登录验证失败"
  echo "缺少 curl，无法调用登录接口。"
  exit 1
fi

ADMIN_EMAIL="${ADMIN_EMAIL:-}"
ADMIN_PASSWORD="$(resolve_admin_password_from_env 2>/dev/null || true)"

if [[ -z "${ADMIN_EMAIL}" ]]; then
  ADMIN_EMAIL="$(prompt_required "请输入管理员邮箱")"
fi

if [[ -z "${ADMIN_PASSWORD}" ]]; then
  ADMIN_PASSWORD="$(prompt_secret "请输入管理员密码")"
fi

if [[ -z "${ADMIN_PASSWORD}" ]]; then
  echo "登录验证失败"
  exit 1
fi

login_url="$(resolve_login_url)"
response_file="$(mktemp)"
trap 'rm -f "${response_file}"' EXIT

payload="$(printf '{"email":"%s","password":"%s"}' "$(json_escape "${ADMIN_EMAIL}")" "$(json_escape "${ADMIN_PASSWORD}")")"
status_code="$(
  curl -sS -o "${response_file}" -w "%{http_code}" \
    -H "Content-Type: application/json" \
    --data "${payload}" \
    "${login_url}" || true
)"

if [[ "${status_code}" == "200" ]]; then
  echo "登录验证成功"
  exit 0
fi

echo "登录验证失败"
exit 1
