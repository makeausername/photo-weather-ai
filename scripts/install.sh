#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE=".env.production"
COMPOSE_FILE="docker-compose.prod.yml"
CADDY_TEMPLATE="${PROJECT_ROOT}/deploy/Caddyfile.template"
CADDY_FILE="${PROJECT_ROOT}/deploy/Caddyfile"
ENV_TEMPLATE="${PROJECT_ROOT}/deploy/env.production.template"
CHECK_ENV_SCRIPT="${SCRIPT_DIR}/check-env-production.sh"
INSTALLER_INPUT_LIB="${SCRIPT_DIR}/lib/installer-input.sh"
COMPOSE_PROJECT_NAME_DEFAULT="photo-weather-ai"
INSTALL_REGION="${INSTALL_REGION:-${PHOTO_WEATHER_INSTALL_MODE:-global}}"
APT_MIRROR="${APT_MIRROR:-}"
PIP_INDEX_URL="${PIP_INDEX_URL:-}"
EPHEMERIS_LOCAL_FILE="${EPHEMERIS_LOCAL_FILE:-}"
EPHEMERIS_URLS="${EPHEMERIS_URLS:-}"
EPHEMERIS_URL="${EPHEMERIS_URL:-}"
DOCKER_REGISTRY_MIRRORS="${DOCKER_REGISTRY_MIRRORS:-}"
DOCKER_INSTALL_METHOD="${DOCKER_INSTALL_METHOD:-auto}"
DOCKER_INSTALL_METHOD_USED="not-run"
APT_LOCK_TIMEOUT_SECONDS="${APT_LOCK_TIMEOUT_SECONDS:-300}"

cd "${PROJECT_ROOT}"

VERBOSE=0
for arg in "$@"; do
  case "${arg}" in
    --verbose) VERBOSE=1 ;;
    -h|--help)
      echo "Usage: bash scripts/install.sh [--verbose]"
      exit 0
      ;;
    *)
      echo "Unknown option: ${arg}"
      echo "Usage: bash scripts/install.sh [--verbose]"
      exit 1
      ;;
  esac
done

INSTALL_LOG="${PROJECT_ROOT}/deploy/install.log"
mkdir -p "${PROJECT_ROOT}/deploy"
: > "${INSTALL_LOG}"
chmod 600 "${INSTALL_LOG}" 2>/dev/null || true

if [[ -t 1 ]] && command -v tput >/dev/null 2>&1 && [[ "$(tput colors 2>/dev/null || echo 0)" -ge 8 ]]; then
  COLOR_GREEN="$(tput setaf 2)"
  COLOR_YELLOW="$(tput setaf 3)"
  COLOR_RED="$(tput setaf 1)"
  COLOR_CYAN="$(tput setaf 6)"
  COLOR_RESET="$(tput sgr0)"
else
  COLOR_GREEN=""
  COLOR_YELLOW=""
  COLOR_RED=""
  COLOR_CYAN=""
  COLOR_RESET=""
fi

line() {
  printf '%s\n' "=================================================="
}

title() {
  line
  printf '%s\n' "逐光天气 一键部署安装程序"
  line
}

section() {
  local number="$1"
  local label="$2"
  echo
  line
  printf '%s%s. %s%s\n' "${COLOR_CYAN}" "${number}" "${label}" "${COLOR_RESET}"
  line
}

ok() {
  printf '%sOK%s %s\n' "${COLOR_GREEN}" "${COLOR_RESET}" "$1"
}

warn() {
  printf '%sWARNING%s %s\n' "${COLOR_YELLOW}" "${COLOR_RESET}" "$1"
}

error_message() {
  printf '%sERROR%s %s\n' "${COLOR_RED}" "${COLOR_RESET}" "$1"
}

# shellcheck source=scripts/lib/installer-input.sh
. "${INSTALLER_INPUT_LIB}"

show_log_tail() {
  if [[ -f "${INSTALL_LOG}" ]]; then
    echo
    echo "最近安装日志："
    tail -n 80 "${INSTALL_LOG}" || true
  fi
}

fail_install() {
  error_message "$1"
  echo "安装失败，请查看 deploy/install.log"
  show_log_tail
  exit 1
}

on_unhandled_error() {
  local status=$?
  if [[ "${status}" -ne 0 ]]; then
    error_message "安装失败，请查看 deploy/install.log"
    show_log_tail
  fi
}

trap on_unhandled_error ERR

run_logged_allow_fail() {
  local label="$1"
  shift

  printf '%s...\n' "${label}"
  printf '\n### %s\n' "${label}" >> "${INSTALL_LOG}"
  if [[ "${VERBOSE}" == "1" ]]; then
    "$@" 2>&1 | tee -a "${INSTALL_LOG}"
    return "${PIPESTATUS[0]}"
  fi

  "$@" >> "${INSTALL_LOG}" 2>&1
}

run_logged() {
  local label="$1"
  shift

  if run_logged_allow_fail "${label}" "$@"; then
    ok "${label}"
    return
  fi

  fail_install "${label}"
}

run_logged_with_heartbeat() {
  local label="$1"
  local heartbeat="$2"
  shift 2

  printf '%s...\n' "${label}"
  printf '\n### %s\n' "${label}" >> "${INSTALL_LOG}"
  if [[ "${VERBOSE}" == "1" ]]; then
    "$@" 2>&1 | tee -a "${INSTALL_LOG}"
    return "${PIPESTATUS[0]}"
  fi

  "$@" >> "${INSTALL_LOG}" 2>&1 &
  local pid=$!
  local elapsed=0
  while kill -0 "${pid}" >/dev/null 2>&1; do
    sleep 2
    elapsed=$((elapsed + 2))
    if [[ $((elapsed % 20)) -eq 0 ]] && kill -0 "${pid}" >/dev/null 2>&1; then
      echo "${heartbeat}"
    fi
  done

  wait "${pid}"
}

if [[ "$(id -u)" -eq 0 ]]; then
  SUDO=""
else
  SUDO="sudo"
fi

run_sudo() {
  if [[ -n "${SUDO}" ]]; then
    sudo "$@"
  else
    "$@"
  fi
}

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

require_env_file() {
  local message="${1:-未找到 .env.production，请先运行 bash scripts/install.sh}"
  if [[ ! -f "${ENV_FILE}" ]]; then
    echo "${message}"
    exit 1
  fi
}

env_file_is_valid() {
  bash "${CHECK_ENV_SCRIPT}" >/dev/null 2>&1
}

check_env_file() {
  if bash "${CHECK_ENV_SCRIPT}"; then
    return
  fi

  fail_install "生产环境配置文件格式错误，请检查 .env.production。"
}

validate_compose_config() {
  local compose_check="/tmp/photo-weather-compose-check.yml"
  local compose_err
  compose_err="$(mktemp /tmp/photo-weather-compose-check.err.XXXXXX)"

  : > "${compose_check}"
  chmod 600 "${compose_check}" "${compose_err}"

  if ! compose config > "${compose_check}" 2> "${compose_err}"; then
    echo "生产环境配置文件格式错误，请检查 .env.production。"
    local line_hint
    line_hint="$(grep -Eo 'line [0-9]+' "${compose_err}" | head -n 1 || true)"
    if [[ -n "${line_hint}" ]]; then
      echo "错误位置：${line_hint}"
    fi
    cat "${compose_err}" >&2
    rm -f "${compose_check}" "${compose_err}"
    fail_install "生产环境配置文件格式错误。"
  fi

  if grep -E "variable is not set|is not set\\. Defaulting" "${compose_err}" >/dev/null 2>&1; then
    echo "生产 Docker Compose 配置缺少变量，请检查 .env.production。"
    cat "${compose_err}" >&2
    rm -f "${compose_check}" "${compose_err}"
    fail_install "生产 Docker Compose 配置缺少变量。"
  fi

  rm -f "${compose_check}" "${compose_err}"
}

trim() {
  local value="$1"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  printf '%s' "${value}"
}

normalize_install_settings() {
  INSTALL_REGION="$(trim "${INSTALL_REGION}")"
  INSTALL_REGION="${INSTALL_REGION,,}"
  case "${INSTALL_REGION}" in
    cn|china) INSTALL_REGION="cn" ;;
    global|"") INSTALL_REGION="global" ;;
    *)
      fail_install "INSTALL_REGION must be cn or global."
      ;;
  esac

  DOCKER_INSTALL_METHOD="$(trim "${DOCKER_INSTALL_METHOD}")"
  DOCKER_INSTALL_METHOD="${DOCKER_INSTALL_METHOD,,}"
  case "${DOCKER_INSTALL_METHOD}" in
    auto|ubuntu|official) ;;
    offical) DOCKER_INSTALL_METHOD="official" ;;
    *)
      fail_install "DOCKER_INSTALL_METHOD must be auto, ubuntu, or official."
      ;;
  esac

  APT_MIRROR="$(trim "${APT_MIRROR}")"
  APT_MIRROR="${APT_MIRROR%/}"
  PIP_INDEX_URL="$(trim "${PIP_INDEX_URL}")"
  DOCKER_REGISTRY_MIRRORS="$(trim "${DOCKER_REGISTRY_MIRRORS}")"
  APT_LOCK_TIMEOUT_SECONDS="$(trim "${APT_LOCK_TIMEOUT_SECONDS}")"
  if [[ ! "${APT_LOCK_TIMEOUT_SECONDS}" =~ ^[0-9]+$ || "${APT_LOCK_TIMEOUT_SECONDS}" -lt 30 ]]; then
    fail_install "APT_LOCK_TIMEOUT_SECONDS must be a number >= 30."
  fi
}

print_install_setting() {
  local key="$1"
  local value="$2"
  if [[ -z "${value}" ]]; then
    value="(empty)"
  fi
  printf '%s=%s\n' "${key}" "${value}"
}

log_install_settings() {
  printf '\n### Installer settings\n' >> "${INSTALL_LOG}"
  print_install_setting "INSTALL_REGION" "${INSTALL_REGION}" >> "${INSTALL_LOG}"
  print_install_setting "DOCKER_INSTALL_METHOD" "${DOCKER_INSTALL_METHOD}" >> "${INSTALL_LOG}"
  print_install_setting "APT_MIRROR" "${APT_MIRROR}" >> "${INSTALL_LOG}"
  print_install_setting "PIP_INDEX_URL" "${PIP_INDEX_URL}" >> "${INSTALL_LOG}"
  print_install_setting "DOCKER_REGISTRY_MIRRORS" "${DOCKER_REGISTRY_MIRRORS}" >> "${INSTALL_LOG}"
  print_install_setting "APT_LOCK_TIMEOUT_SECONDS" "${APT_LOCK_TIMEOUT_SECONDS}" >> "${INSTALL_LOG}"
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
    warn "此项不能为空。"
  done
}

prompt_optional() {
  local label="$1"
  local default_value="${2:-}"
  local value=""

  if [[ -n "${default_value}" ]]; then
    read -r -p "${label} [${default_value}]: " value
    value="${value:-${default_value}}"
  else
    read -r -p "${label}: " value
  fi

  trim "${value}"
}

ask_yes_no() {
  local label="$1"
  local default_value="${2:-y}"
  local suffix="[Y/n]"
  local answer=""

  if [[ "${default_value}" == "n" ]]; then
    suffix="[y/N]"
  fi

  read -r -p "${label} ${suffix}: " answer
  answer="$(trim "${answer}")"
  answer="${answer:-${default_value}}"
  case "${answer,,}" in
    y|yes) return 0 ;;
    *) return 1 ;;
  esac
}

confirm_continue() {
  local prompt="${1:-确认开始部署？}"
  local hint="${2:-直接回车继续，输入 n 取消:}"
  local answer=""

  while true; do
    echo
    echo "${prompt}"
    read -r -p "${hint} " answer
    answer="$(trim "${answer}")"
    case "${answer,,}" in
      ""|y|yes) return 0 ;;
      n|no) return 1 ;;
      *) warn "请输入 y/yes 继续，或 n/no 取消。" ;;
    esac
  done
}

confirm_dangerous_delete() {
  local expected="${1:-DELETE_DB_DATA}"
  local prompt="${2:-输入 DELETE_DB_DATA 确认删除测试数据库卷:}"
  local confirmation=""

  read -r -p "${prompt} " confirmation
  if [[ "${confirmation}" == "${expected}" ]]; then
    return 0
  fi

  warn "未输入 ${expected}，已取消危险操作。"
  return 1
}

generate_secret() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 32 | tr -d '\r\n'
  else
    od -An -N32 -tx1 /dev/urandom | tr -d ' \r\n'
  fi
}

is_url_safe_value() {
  local value="$1"
  [[ "${value}" =~ ^[A-Za-z0-9._~-]+$ ]]
}

urlencode() {
  local raw="$1"

  if command -v python3 >/dev/null 2>&1; then
    python3 -c 'import sys, urllib.parse; print(urllib.parse.quote(sys.argv[1], safe=""))' "${raw}"
    return
  fi

  local length="${#raw}"
  local encoded=""
  local char=""
  local hex=""

  LC_ALL=C
  for ((i = 0; i < length; i++)); do
    char="${raw:i:1}"
    case "${char}" in
      [a-zA-Z0-9.~_-]) encoded+="${char}" ;;
      *)
        printf -v hex '%%%02X' "'${char}"
        encoded+="${hex}"
        ;;
    esac
  done
  printf '%s' "${encoded}"
}

urlencode_password() {
  local raw="$1"

  if command -v python3 >/dev/null 2>&1; then
    python3 -c 'import sys, urllib.parse; print(urllib.parse.quote(sys.argv[1], safe=""))' "${raw}"
    return
  fi

  if is_url_safe_value "${raw}"; then
    printf '%s' "${raw}"
    return
  fi

  echo "当前系统未安装 python3，无法安全编码自定义数据库密码。请安装 python3，或将数据库密码留空让安装程序生成 URL-safe 密码。"
  exit 1
}

mask_database_url() {
  local url="$1"

  if [[ -z "${url}" ]]; then
    printf '(empty)\n'
    return
  fi

  if command -v python3 >/dev/null 2>&1; then
    python3 -c 'import sys, urllib.parse
url = sys.argv[1]
parts = urllib.parse.urlsplit(url)
username = parts.username or ""
hostname = parts.hostname or ""
port = f":{parts.port}" if parts.port else ""
auth = f"{username}:***@" if username else ""
print(urllib.parse.urlunsplit((parts.scheme, f"{auth}{hostname}{port}", parts.path, parts.query, parts.fragment)))' "${url}" 2>/dev/null && return
  fi

  printf '%s\n' "${url}" | sed -E 's#(postgres(ql)?://[^:/@]+:)[^@]*(@)#\1***\3#'
}

strip_env_value() {
  local value="${1-}"
  value="${value//$'\r'/}"
  value="${value//$'\n'/}"
  printf '%s' "${value}"
}

is_plain_env_value() {
  local value="$1"
  [[ "${value}" =~ ^[A-Za-z0-9_./:@%+=,?~-]*$ ]]
}

escape_env_value() {
  local value
  value="$(strip_env_value "${1-}")"

  if is_plain_env_value "${value}"; then
    printf '%s' "${value}"
    return
  fi

  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  value="${value//\$/\\$}"
  value="${value//\`/\\\`}"
  printf '"%s"' "${value}"
}

write_env_var() {
  local key="$1"
  local value="${2-}"

  if [[ -z "${key}" || ! "${key}" =~ ^[A-Z0-9_]+$ ]]; then
    echo "环境变量名称无效：${key:-<empty>}" >&2
    exit 1
  fi

  printf '%s=%s\n' "${key}" "$(escape_env_value "${value}")"
}

require_postgres_identifier() {
  local label="$1"
  local value="$2"

  if [[ ! "${value}" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
    echo "${label} 必须以字母或下划线开头，且只能包含字母、数字和下划线。"
    exit 1
  fi
}

validate_db_password_for_env() {
  local value="$1"
  [[ "${value}" =~ ^[A-Za-z0-9._@%+=-]{8,128}$ ]]
}

set_database_config() {
  local input_db_name="$1"
  local input_db_user="$2"
  local input_db_password="$3"

  DB_NAME="$(trim "${input_db_name}")"
  DB_USER="$(trim "${input_db_user}")"
  DB_PASSWORD="$(strip_env_value "${input_db_password}")"

  require_postgres_identifier "DB_NAME" "${DB_NAME}"
  require_postgres_identifier "DB_USER" "${DB_USER}"
  if [[ -z "${DB_PASSWORD}" ]]; then
    echo "DB_PASSWORD 不能为空。"
    exit 1
  fi

  URL_ENCODED_DB_PASSWORD="$(urlencode_password "${DB_PASSWORD}")"
  POSTGRES_DB="${DB_NAME}"
  POSTGRES_USER="${DB_USER}"
  POSTGRES_PASSWORD="${DB_PASSWORD}"
  DATABASE_URL="postgresql://${DB_USER}:${URL_ENCODED_DB_PASSWORD}@postgres:5432/${DB_NAME}?schema=public"
}

load_existing_database_config() {
  if [[ -z "${POSTGRES_DB:-}" || -z "${POSTGRES_USER:-}" || -z "${POSTGRES_PASSWORD:-}" ]]; then
    fail_install ".env.production 缺少 POSTGRES_DB、POSTGRES_USER 或 POSTGRES_PASSWORD。"
  fi

  set_database_config "${POSTGRES_DB}" "${POSTGRES_USER}" "${POSTGRES_PASSWORD}"
}

sync_env_database_lines() {
  local tmp_file="${ENV_FILE}.tmp"
  local saw_postgres_db=0
  local saw_postgres_user=0
  local saw_postgres_password=0
  local saw_database_url=0

  : > "${tmp_file}"

  while IFS= read -r line || [[ -n "${line}" ]]; do
    if [[ "${line}" =~ ^POSTGRES_DB= ]]; then
      write_env_var "POSTGRES_DB" "${POSTGRES_DB}" >> "${tmp_file}"
      saw_postgres_db=1
    elif [[ "${line}" =~ ^POSTGRES_USER= ]]; then
      write_env_var "POSTGRES_USER" "${POSTGRES_USER}" >> "${tmp_file}"
      saw_postgres_user=1
    elif [[ "${line}" =~ ^POSTGRES_PASSWORD= ]]; then
      write_env_var "POSTGRES_PASSWORD" "${POSTGRES_PASSWORD}" >> "${tmp_file}"
      saw_postgres_password=1
    elif [[ "${line}" =~ ^DATABASE_URL= ]]; then
      write_env_var "DATABASE_URL" "${DATABASE_URL}" >> "${tmp_file}"
      saw_database_url=1
    else
      printf '%s\n' "${line}" >> "${tmp_file}"
    fi
  done < "${ENV_FILE}"

  if [[ "${saw_postgres_db}" == "0" ]]; then
    write_env_var "POSTGRES_DB" "${POSTGRES_DB}" >> "${tmp_file}"
  fi
  if [[ "${saw_postgres_user}" == "0" ]]; then
    write_env_var "POSTGRES_USER" "${POSTGRES_USER}" >> "${tmp_file}"
  fi
  if [[ "${saw_postgres_password}" == "0" ]]; then
    write_env_var "POSTGRES_PASSWORD" "${POSTGRES_PASSWORD}" >> "${tmp_file}"
  fi
  if [[ "${saw_database_url}" == "0" ]]; then
    write_env_var "DATABASE_URL" "${DATABASE_URL}" >> "${tmp_file}"
  fi

  mv "${tmp_file}" "${ENV_FILE}"
  chmod 600 "${ENV_FILE}"
}

print_database_config_summary() {
  echo
  echo "数据库配置摘要："
  echo "POSTGRES_DB=${POSTGRES_DB}"
  echo "POSTGRES_USER=${POSTGRES_USER}"
  echo "DATABASE_URL=$(mask_database_url "${DATABASE_URL}")"
  echo "POSTGRES_PASSWORD=已隐藏"
}

normalize_domain() {
  local value="$1"
  value="${value#http://}"
  value="${value#https://}"
  value="${value%%/*}"
  value="$(trim "${value}")"

  if [[ ! "${value}" =~ ^[A-Za-z0-9.-]+$ ]] || [[ "${value}" != *.* ]]; then
    echo "域名格式应类似 example.com 或 app.example.com。"
    exit 1
  fi

  printf '%s' "${value,,}"
}

render_env_file() {
  local redis_password_encoded redis_url
  redis_password_encoded="$(urlencode "${REDIS_PASSWORD}")"
  redis_url="redis://:${redis_password_encoded}@redis:6379"

  local tmp_file="${ENV_FILE}.tmp"
  : > "${tmp_file}"

  while IFS= read -r line || [[ -n "${line}" ]]; do
    if [[ "${line}" =~ ^([A-Z0-9_]+)= ]]; then
      key="${BASH_REMATCH[1]}"
      case "${key}" in
        NODE_ENV) write_env_var "${key}" "production" >> "${tmp_file}" ;;
        APP_ENV) write_env_var "${key}" "production" >> "${tmp_file}" ;;
        DOMAIN) write_env_var "${key}" "${DOMAIN}" >> "${tmp_file}" ;;
        SITE_URL|PUBLIC_SITE_URL) write_env_var "${key}" "https://${DOMAIN}" >> "${tmp_file}" ;;
        NEXT_PUBLIC_API_BASE_URL) write_env_var "${key}" "https://${DOMAIN}/api" >> "${tmp_file}" ;;
        POSTGRES_DB) write_env_var "${key}" "${POSTGRES_DB}" >> "${tmp_file}" ;;
        POSTGRES_USER) write_env_var "${key}" "${POSTGRES_USER}" >> "${tmp_file}" ;;
        POSTGRES_PASSWORD) write_env_var "${key}" "${POSTGRES_PASSWORD}" >> "${tmp_file}" ;;
        DATABASE_URL) write_env_var "${key}" "${DATABASE_URL}" >> "${tmp_file}" ;;
        REDIS_PASSWORD) write_env_var "${key}" "${REDIS_PASSWORD}" >> "${tmp_file}" ;;
        REDIS_URL) write_env_var "${key}" "${redis_url}" >> "${tmp_file}" ;;
        JWT_SECRET) write_env_var "${key}" "${JWT_SECRET}" >> "${tmp_file}" ;;
        ADMIN_EMAIL) write_env_var "${key}" "${ADMIN_EMAIL}" >> "${tmp_file}" ;;
        ADMIN_INITIAL_PASSWORD_B64) write_env_var "${key}" "${ADMIN_INITIAL_PASSWORD_B64}" >> "${tmp_file}" ;;
        ADMIN_DISPLAY_NAME) write_env_var "${key}" "${ADMIN_DISPLAY_NAME}" >> "${tmp_file}" ;;
        PIP_INDEX_URL) write_env_var "${key}" "${PIP_INDEX_URL}" >> "${tmp_file}" ;;
        EPHEMERIS_LOCAL_FILE) write_env_var "${key}" "${EPHEMERIS_LOCAL_FILE}" >> "${tmp_file}" ;;
        EPHEMERIS_URLS) write_env_var "${key}" "${EPHEMERIS_URLS}" >> "${tmp_file}" ;;
        QWEATHER_API_KEY) write_env_var "${key}" "${QWEATHER_API_KEY}" >> "${tmp_file}" ;;
        QWEATHER_API_HOST) write_env_var "${key}" "${QWEATHER_API_HOST}" >> "${tmp_file}" ;;
        AMAP_API_KEY) write_env_var "${key}" "${AMAP_API_KEY}" >> "${tmp_file}" ;;
        AMAP_WEB_SERVICE_KEY) write_env_var "${key}" "${AMAP_WEB_SERVICE_KEY}" >> "${tmp_file}" ;;
        DEEPSEEK_API_KEY) write_env_var "${key}" "${DEEPSEEK_API_KEY}" >> "${tmp_file}" ;;
        DEEPSEEK_BASE_URL) write_env_var "${key}" "${DEEPSEEK_BASE_URL}" >> "${tmp_file}" ;;
        OPEN_METEO_API_KEY) write_env_var "${key}" "${OPEN_METEO_API_KEY}" >> "${tmp_file}" ;;
        OPEN_METEO_MODE) write_env_var "${key}" "${OPEN_METEO_MODE}" >> "${tmp_file}" ;;
        OPEN_METEO_CUSTOMER_ENDPOINT) write_env_var "${key}" "${OPEN_METEO_CUSTOMER_ENDPOINT}" >> "${tmp_file}" ;;
        *) write_env_var "${key}" "${line#*=}" >> "${tmp_file}" ;;
      esac
    elif [[ -z "${line}" || "${line}" =~ ^[[:space:]]*# ]]; then
      printf '%s\n' "${line}" >> "${tmp_file}"
    else
      echo "环境模板存在无效行：${line}" >&2
      rm -f "${tmp_file}"
      exit 1
    fi
  done < "${ENV_TEMPLATE}"

  mv "${tmp_file}" "${ENV_FILE}"
  chmod 600 "${ENV_FILE}"
}

update_env_admin_lines() {
  local tmp_file="${ENV_FILE}.tmp"
  local saw_admin_email=0
  local saw_admin_password_b64=0
  local saw_admin_display_name=0

  : > "${tmp_file}"

  while IFS= read -r line || [[ -n "${line}" ]]; do
    if [[ "${line}" =~ ^ADMIN_EMAIL= ]]; then
      write_env_var "ADMIN_EMAIL" "${ADMIN_EMAIL}" >> "${tmp_file}"
      saw_admin_email=1
    elif [[ "${line}" =~ ^ADMIN_INITIAL_PASSWORD_B64= ]]; then
      write_env_var "ADMIN_INITIAL_PASSWORD_B64" "${ADMIN_INITIAL_PASSWORD_B64}" >> "${tmp_file}"
      saw_admin_password_b64=1
    elif [[ "${line}" =~ ^ADMIN_PASSWORD= || "${line}" =~ ^ADMIN_INITIAL_PASSWORD= ]]; then
      continue
    elif [[ "${line}" =~ ^ADMIN_DISPLAY_NAME= ]]; then
      write_env_var "ADMIN_DISPLAY_NAME" "${ADMIN_DISPLAY_NAME}" >> "${tmp_file}"
      saw_admin_display_name=1
    else
      printf '%s\n' "${line}" >> "${tmp_file}"
    fi
  done < "${ENV_FILE}"

  if [[ "${saw_admin_email}" == "0" ]]; then
    write_env_var "ADMIN_EMAIL" "${ADMIN_EMAIL}" >> "${tmp_file}"
  fi
  if [[ "${saw_admin_password_b64}" == "0" ]]; then
    write_env_var "ADMIN_INITIAL_PASSWORD_B64" "${ADMIN_INITIAL_PASSWORD_B64}" >> "${tmp_file}"
  fi
  if [[ "${saw_admin_display_name}" == "0" ]]; then
    write_env_var "ADMIN_DISPLAY_NAME" "${ADMIN_DISPLAY_NAME}" >> "${tmp_file}"
  fi

  mv "${tmp_file}" "${ENV_FILE}"
  chmod 600 "${ENV_FILE}"
}

render_caddyfile() {
  mkdir -p "${PROJECT_ROOT}/deploy"
  sed "s/DOMAIN_PLACEHOLDER/${DOMAIN}/g" "${CADDY_TEMPLATE}" > "${CADDY_FILE}"
}

ensure_caddyfile() {
  if [[ -f "${CADDY_FILE}" ]]; then
    warn "deploy/Caddyfile 已存在。"
    if confirm_continue "检测到已有 deploy/Caddyfile，是否重新生成？" "直接回车重新生成，输入 n 复用:"; then
      render_caddyfile
      ok "已重新生成 deploy/Caddyfile。"
    else
      ok "复用现有 deploy/Caddyfile。"
    fi
    return
  fi

  render_caddyfile
  ok "已生成 deploy/Caddyfile。"
}

load_env_file() {
  set -a
  # shellcheck disable=SC1090
  . "${ENV_FILE}"
  set +a
}

compose_project_name() {
  printf '%s' "${COMPOSE_PROJECT_NAME:-${COMPOSE_PROJECT_NAME_DEFAULT}}"
}

postgres_volume_name() {
  printf '%s_postgres_data' "$(compose_project_name)"
}

is_ignored_apt_lock_process_args() {
  local args="$1"
  [[ "${args}" == *"unattended-upgrade-shutdown --wait-for-signal"* ]]
}

process_args_for_pid() {
  local pid="$1"
  ps -p "${pid}" -o args= 2>/dev/null || true
}

print_real_apt_lock_process_table() {
  local saw_blocker=0
  local saw_ignored=0
  local pid ppid comm args

  while read -r pid ppid comm args; do
    if [[ -z "${pid:-}" ]]; then
      continue
    fi
    case "${comm:-} ${args:-}" in
      *apt*|*apt-get*|*dpkg*|*unattended-upgr*) ;;
      *) continue ;;
    esac
    if is_ignored_apt_lock_process_args "${args:-}"; then
      saw_ignored=1
      printf 'ignored non-blocking process: %s %s %s %s\n' "${pid}" "${ppid}" "${comm}" "${args}"
      continue
    fi
    saw_blocker=1
    printf '%s %s %s %s\n' "${pid}" "${ppid}" "${comm}" "${args}"
  done < <(ps -eo pid=,ppid=,comm=,args=)

  if [[ "${saw_blocker}" == "0" ]]; then
    echo "No real apt/dpkg blocker is running."
  fi
  if [[ "${saw_ignored}" == "1" ]]; then
    echo "unattended-upgrade-shutdown --wait-for-signal is informational and will not block this installer."
  fi
}

apt_lock_held() {
  local lock_paths=(
    /var/lib/dpkg/lock-frontend
    /var/lib/dpkg/lock
    /var/lib/apt/lists/lock
    /var/cache/apt/archives/lock
  )

  if command -v fuser >/dev/null 2>&1 && command -v ps >/dev/null 2>&1; then
    local pids raw_pid pid args
    for lock_path in "${lock_paths[@]}"; do
      pids="$(run_sudo fuser "${lock_path}" 2>/dev/null || true)"
      for raw_pid in ${pids}; do
        pid="${raw_pid//[^0-9]/}"
        if [[ -z "${pid}" ]]; then
          continue
        fi
        args="$(process_args_for_pid "${pid}")"
        if is_ignored_apt_lock_process_args "${args}"; then
          continue
        fi
        return 0
      done
    done
  fi

  if command -v pgrep >/dev/null 2>&1; then
    if pgrep -x apt >/dev/null 2>&1 ||
      pgrep -x apt-get >/dev/null 2>&1 ||
      pgrep -x dpkg >/dev/null 2>&1; then
      return 0
    fi
  fi

  return 1
}

print_apt_lock_processes() {
  echo "当前 apt/dpkg 相关进程："
  if command -v ps >/dev/null 2>&1; then
    print_real_apt_lock_process_table
  else
    echo "当前系统缺少 ps，无法列出阻塞进程。"
  fi
}

wait_for_apt_lock() {
  local max_seconds="${APT_LOCK_TIMEOUT_SECONDS}"
  local elapsed=0

  while apt_lock_held; do
    if [[ "${elapsed}" -ge "${max_seconds}" ]]; then
      print_apt_lock_processes
      fail_install "系统软件包管理器被占用超过 ${max_seconds} 秒，请稍后重试或检查 apt/dpkg 进程。"
    fi

    warn "系统软件包管理器被占用，等待 10 秒后重试。"
    print_apt_lock_processes
    sleep 10
    elapsed=$((elapsed + 10))
  done
}

run_apt_step() {
  local display_command="$1"
  local label="$2"
  shift 2

  echo "当前命令：${display_command}"
  wait_for_apt_lock

  if run_logged_with_heartbeat "${label}" "Docker 安装仍在进行，请稍候..." "$@"; then
    ok "${label}"
    return
  fi

  if apt_lock_held; then
    print_apt_lock_processes
    fail_install "系统软件包管理器被占用，请稍后重试或检查是否有其他 apt 进程。"
  fi

  fail_install "${label}"
}

run_apt_step_allow_fail() {
  local display_command="$1"
  local label="$2"
  shift 2

  echo "当前命令：${display_command}"
  wait_for_apt_lock

  if run_logged_with_heartbeat "${label}" "Docker 安装仍在进行，请稍候..." "$@"; then
    ok "${label}"
    return 0
  fi

  if apt_lock_held; then
    print_apt_lock_processes
    return 2
  fi

  warn "${label} failed. See deploy/install.log."
  return 1
}

docker_cli_available() {
  command -v docker >/dev/null 2>&1 && docker --version >/dev/null 2>&1
}

docker_compose_available() {
  docker_cli_available && docker compose version >/dev/null 2>&1
}

docker_install_needed() {
  ! docker_cli_available || ! docker_compose_available
}

docker_install_needed_label() {
  if docker_install_needed; then
    printf '%s' "是"
  else
    printf '%s' "否"
  fi
}

installer_os_id() {
  if [[ ! -r /etc/os-release ]]; then
    echo "This installer targets Ubuntu/Debian servers."
    return 1
  fi

  # shellcheck disable=SC1091
  . /etc/os-release
  case "${ID}" in
    ubuntu|debian) printf '%s' "${ID}" ;;
    *)
      echo "Unsupported distribution: ${ID}. Use Ubuntu 22.04/24.04 or Debian."
      return 1
      ;;
  esac
}

installer_os_codename() {
  # shellcheck disable=SC1091
  . /etc/os-release
  printf '%s' "${VERSION_CODENAME:-}"
}

configure_apt_mirror_if_requested() {
  if [[ -z "${APT_MIRROR}" ]]; then
    return
  fi

  local os_id codename components keyring source_file backup_dir tmp_file source_path
  os_id="$(installer_os_id)" || return 1
  codename="$(installer_os_codename)"
  if [[ -z "${codename}" ]]; then
    echo "APT_MIRROR is set but VERSION_CODENAME is unavailable."
    return 1
  fi

  backup_dir="/etc/apt/photo-weather-ai-backups/$(date +%Y%m%d-%H%M%S)"
  run_logged "Prepare APT mirror backup directory" run_sudo install -d -m 0755 "${backup_dir}"

  for source_path in /etc/apt/sources.list /etc/apt/sources.list.d/ubuntu.sources /etc/apt/sources.list.d/debian.sources; do
    if [[ -f "${source_path}" ]]; then
      run_logged "Back up APT source $(basename "${source_path}")" run_sudo cp "${source_path}" "${backup_dir}/$(basename "${source_path}").backup"
    fi
  done

  case "${os_id}" in
    ubuntu)
      components="main restricted universe multiverse"
      keyring="/usr/share/keyrings/ubuntu-archive-keyring.gpg"
      ;;
    debian)
      components="main contrib non-free non-free-firmware"
      keyring="/usr/share/keyrings/debian-archive-keyring.gpg"
      ;;
    *) return 1 ;;
  esac

  tmp_file="$(mktemp)"
  {
    printf 'Types: deb\n'
    printf 'URIs: %s\n' "${APT_MIRROR}"
    printf 'Suites: %s %s-updates %s-backports %s-security\n' "${codename}" "${codename}" "${codename}" "${codename}"
    printf 'Components: %s\n' "${components}"
    if [[ -f "${keyring}" ]]; then
      printf 'Signed-By: %s\n' "${keyring}"
    fi
  } > "${tmp_file}"

  source_file="/etc/apt/sources.list.d/photo-weather-ai-mirror.sources"
  run_logged "Write APT mirror source" run_sudo install -m 0644 "${tmp_file}" "${source_file}"
  rm -f "${tmp_file}"

  if [[ "${INSTALL_REGION}" == "cn" ]]; then
    for source_path in /etc/apt/sources.list /etc/apt/sources.list.d/ubuntu.sources /etc/apt/sources.list.d/debian.sources; do
      if [[ -f "${source_path}" ]]; then
        run_logged "Disable default APT source $(basename "${source_path}")" run_sudo mv "${source_path}" "${backup_dir}/$(basename "${source_path}").disabled"
      fi
    done
  fi

  echo "APT mirror configured: ${APT_MIRROR}" | tee -a "${INSTALL_LOG}"
}

install_docker_from_official_repo() {
  local os_id codename
  os_id="$(installer_os_id)" || return 1
  codename="$(installer_os_codename)"
  if [[ -z "${codename}" ]]; then
    echo "official Docker repository failed: VERSION_CODENAME is unavailable" | tee -a "${INSTALL_LOG}"
    return 1
  fi

  export DEBIAN_FRONTEND=noninteractive

  echo "正在安装 Docker，请稍候..."
  echo "Installing Docker from the official Docker repository..."
  wait_for_apt_lock
  run_apt_step_allow_fail "apt-get update" "Update system package index" run_sudo apt-get update || return 1
  run_apt_step_allow_fail "apt-get install -y ca-certificates curl gnupg" "Install Docker repository dependencies" run_sudo apt-get install -y ca-certificates curl gnupg || return 1
  run_logged "Create Docker apt keyring directory" run_sudo install -m 0755 -d /etc/apt/keyrings

  if [[ ! -f /etc/apt/keyrings/docker.gpg ]]; then
    echo "Current command: curl https://download.docker.com/linux/${os_id}/gpg"
    printf '\n### Download Docker apt GPG key\n' >> "${INSTALL_LOG}"
    if ! curl -fsSL "https://download.docker.com/linux/${os_id}/gpg" | run_sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg >> "${INSTALL_LOG}" 2>&1; then
      echo "official Docker repository failed: Docker apt GPG download" | tee -a "${INSTALL_LOG}"
      return 1
    fi
    run_logged "Set Docker apt GPG key permissions" run_sudo chmod a+r /etc/apt/keyrings/docker.gpg
  fi

  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/${os_id} ${codename} stable" \
    | run_sudo tee /etc/apt/sources.list.d/docker.list >> "${INSTALL_LOG}" >/dev/null

  run_apt_step_allow_fail "apt-get update" "Update Docker package index" run_sudo apt-get update || return 1
  run_apt_step_allow_fail "apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin" "Install Docker Engine and Compose plugin" run_sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin || return 1
  DOCKER_INSTALL_METHOD_USED="official"
}

install_ubuntu_compose_v2_package() {
  local package
  if docker_compose_available; then
    return 0
  fi

  for package in docker-compose-v2 docker-compose-plugin; do
    if apt-cache show "${package}" >/dev/null 2>&1; then
      if run_apt_step_allow_fail "apt-get install -y ${package}" "Install Docker Compose v2 package ${package}" run_sudo apt-get install -y "${package}"; then
        return 0
      fi
    fi
  done

  if docker_compose_available; then
    return 0
  fi

  return 1
}

install_docker_from_ubuntu_packages() {
  installer_os_id >/dev/null || return 1
  export DEBIAN_FRONTEND=noninteractive

  configure_apt_mirror_if_requested || return 1
  echo "正在安装 Docker，请稍候..."
  echo "Installing Docker from Ubuntu/Debian packages: docker.io + Compose v2..."
  run_apt_step "apt-get update" "Update system package index" run_sudo apt-get update
  run_apt_step "apt-get install -y ca-certificates curl gnupg docker.io" "Install docker.io package" run_sudo apt-get install -y ca-certificates curl gnupg docker.io
  if ! install_ubuntu_compose_v2_package; then
    fail_install "Docker Compose v2 package is unavailable. Try DOCKER_INSTALL_METHOD=official on a network that can reach download.docker.com."
  fi
  DOCKER_INSTALL_METHOD_USED="ubuntu"
}

install_docker_packages() {
  case "${DOCKER_INSTALL_METHOD}" in
    ubuntu)
      install_docker_from_ubuntu_packages
      ;;
    official)
      install_docker_from_official_repo || fail_install "official Docker repository failed."
      ;;
    auto)
      if install_docker_from_official_repo; then
        return
      fi
      echo "official Docker repository failed; falling back to Ubuntu docker.io + Compose v2 packages" | tee -a "${INSTALL_LOG}"
      install_docker_from_ubuntu_packages
      ;;
  esac
}

write_docker_daemon_json_with_mirrors() {
  local daemon_json="$1"
  local mirrors="$2"
  local tmp_file
  tmp_file="$(mktemp)"

  if command -v python3 >/dev/null 2>&1; then
    python3 - "${daemon_json}" "${mirrors}" > "${tmp_file}" <<'PY'
import json
import os
import re
import sys

daemon_path = sys.argv[1]
raw_mirrors = sys.argv[2]
mirrors = [item.strip() for item in re.split(r"[\s,]+", raw_mirrors) if item.strip()]
if not mirrors:
    raise SystemExit("No Docker registry mirrors were provided.")

data = {}
if os.path.exists(daemon_path) and os.path.getsize(daemon_path) > 0:
    with open(daemon_path, "r", encoding="utf-8") as handle:
        data = json.load(handle)
if not isinstance(data, dict):
    raise SystemExit("Docker daemon.json must contain a JSON object.")

existing = data.get("registry-mirrors", [])
if not isinstance(existing, list):
    existing = []

merged = []
for value in [*mirrors, *existing]:
    if isinstance(value, str) and value and value not in merged:
        merged.append(value)

data["registry-mirrors"] = merged
json.dump(data, sys.stdout, ensure_ascii=False, indent=2)
sys.stdout.write("\n")
PY
  else
    if [[ -s "${daemon_json}" ]]; then
      rm -f "${tmp_file}"
      fail_install "python3 is required to preserve existing /etc/docker/daemon.json settings."
    fi
    local mirror_json=""
    local mirror
    for mirror in ${mirrors//,/ }; do
      if [[ -z "${mirror_json}" ]]; then
        mirror_json="\"${mirror}\""
      else
        mirror_json="${mirror_json}, \"${mirror}\""
      fi
    done
    printf '{\n  "registry-mirrors": [%s]\n}\n' "${mirror_json}" > "${tmp_file}"
  fi

  run_sudo install -m 0644 "${tmp_file}" "${daemon_json}"
  rm -f "${tmp_file}"
}

restart_docker_service() {
  if command -v systemctl >/dev/null 2>&1; then
    run_logged "Restart Docker after registry mirror update" run_sudo systemctl restart docker
  elif command -v service >/dev/null 2>&1; then
    run_logged "Restart Docker after registry mirror update" run_sudo service docker restart
  else
    warn "Cannot find systemctl or service; restart Docker manually after daemon.json update."
  fi
}

configure_docker_registry_mirrors() {
  if [[ -z "${DOCKER_REGISTRY_MIRRORS}" ]]; then
    return
  fi

  local daemon_dir="/etc/docker"
  local daemon_json="${daemon_dir}/daemon.json"
  local backup_path="${daemon_json}.backup-$(date +%Y%m%d-%H%M%S)"

  run_logged "Prepare Docker daemon directory" run_sudo install -d -m 0755 "${daemon_dir}"
  if [[ -f "${daemon_json}" ]]; then
    run_logged "Back up Docker daemon.json" run_sudo cp "${daemon_json}" "${backup_path}"
    echo "Docker daemon.json backup: ${backup_path}" | tee -a "${INSTALL_LOG}"
  fi

  write_docker_daemon_json_with_mirrors "${daemon_json}" "${DOCKER_REGISTRY_MIRRORS}"
  echo "Docker registry mirrors configured: ${DOCKER_REGISTRY_MIRRORS}" | tee -a "${INSTALL_LOG}"
  restart_docker_service
  run_logged "Verify Docker registry mirror configuration" docker_cmd info
}

verify_docker_installation() {
  if ! docker_cli_available; then
    fail_install "Docker verification failed: docker --version is unavailable."
  fi
  if ! docker_compose_available; then
    fail_install "Docker verification failed: docker compose version is unavailable."
  fi

  docker --version | tee -a "${INSTALL_LOG}"
  docker compose version | tee -a "${INSTALL_LOG}"
  print_install_setting "DOCKER_INSTALL_METHOD_USED" "${DOCKER_INSTALL_METHOD_USED}" >> "${INSTALL_LOG}"
}

ensure_docker() {
  if ! docker_install_needed; then
    DOCKER_INSTALL_METHOD_USED="existing"
    docker --version
    docker compose version
    ok "Docker already installed; skipping Docker installation."
    configure_docker_registry_mirrors
    verify_docker_installation
    return
  fi

  local needs_install=0

  if docker_cli_available; then
    docker --version
    ok "Docker 已安装，跳过安装。"
  else
    needs_install=1
  fi

  if docker_compose_available; then
    docker compose version
    ok "Docker Compose 插件可用。"
  else
    needs_install=1
  fi

  if [[ "${needs_install}" == "1" ]]; then
    install_docker_packages
  fi

  if ! docker_cli_available || ! docker_compose_available; then
    fail_install "Docker 安装失败，请查看 deploy/install.log"
  fi

  if command -v systemctl >/dev/null 2>&1; then
    run_logged "设置 Docker 开机自启" run_sudo systemctl enable docker
    run_logged "启动 Docker 服务" run_sudo systemctl start docker
  fi

  configure_docker_registry_mirrors
  verify_docker_installation

  if ! docker --version >> "${INSTALL_LOG}" 2>&1 || ! docker_cmd compose version >> "${INSTALL_LOG}" 2>&1; then
    fail_install "Docker 安装失败，请查看 deploy/install.log"
  fi
}

read_meminfo_mb() {
  local key="$1"
  local value
  value="$(awk -v key="${key}" '$1 == key ":" { printf "%d", $2 / 1024 }' /proc/meminfo 2>/dev/null || true)"
  printf '%s' "${value:-0}"
}

ensure_swap_capacity() {
  if [[ ! -r /proc/meminfo ]]; then
    warn "无法读取 /proc/meminfo，跳过内存与 swap 检查。"
    return
  fi

  local memory_mb swap_mb
  memory_mb="$(read_meminfo_mb "MemTotal")"
  swap_mb="$(read_meminfo_mb "SwapTotal")"

  echo "内存：${memory_mb} MB，Swap：${swap_mb} MB。"
  if [[ "${memory_mb}" -ge 4096 || "${swap_mb}" -ge 4096 ]]; then
    ok "系统内存与 swap 检查通过。"
    return
  fi

  warn "当前内存低于 4GB 且 swap 低于 4GB，构建镜像可能失败。"
  if ! ask_yes_no "是否创建 4GB /swapfile" "y"; then
    warn "已跳过 swap 创建，低内存服务器构建可能失败。"
    return
  fi

  if [[ -e /swapfile ]]; then
    warn "/swapfile 已存在，未覆盖现有文件。"
    return
  fi

  if ! run_logged_allow_fail "创建 4GB swap 文件" run_sudo fallocate -l 4G /swapfile; then
    run_logged "创建 4GB swap 文件" run_sudo dd if=/dev/zero of=/swapfile bs=1M count=4096 status=progress
  fi
  run_logged "设置 swap 文件权限" run_sudo chmod 600 /swapfile
  run_logged "格式化 swap 文件" run_sudo mkswap /swapfile
  run_logged "启用 swap 文件" run_sudo swapon /swapfile

  if ! grep -Eq '^[[:space:]]*/swapfile[[:space:]]+none[[:space:]]+swap[[:space:]]+' /etc/fstab 2>/dev/null; then
    echo "/swapfile none swap sw 0 0" | run_sudo tee -a /etc/fstab >> "${INSTALL_LOG}" >/dev/null
  fi

  ok "4GB swap 已创建并写入 /etc/fstab。"
}

port_in_use() {
  local port="$1"
  if command -v ss >/dev/null 2>&1; then
    ss -ltn "( sport = :${port} )" | awk 'NR > 1 { found = 1 } END { exit found ? 0 : 1 }'
  elif command -v lsof >/dev/null 2>&1; then
    lsof -iTCP:"${port}" -sTCP:LISTEN >/dev/null 2>&1
  else
    return 1
  fi
}

check_ports() {
  for port in 80 443; do
    if port_in_use "${port}"; then
      echo "Port ${port} appears to be in use."
      if ! ask_yes_no "Continue anyway" "n"; then
        exit 1
      fi
    fi
  done
}

check_dns() {
  local server_ip domain_ips
  server_ip="$(curl -4fsS --max-time 5 https://api.ipify.org 2>/dev/null || true)"
  domain_ips="$(getent ahostsv4 "${DOMAIN}" 2>/dev/null | awk '{print $1}' | sort -u | tr '\n' ' ' || true)"

  if [[ -z "${server_ip}" || -z "${domain_ips}" ]]; then
    echo "DNS check was inconclusive. Continue if the domain A record points to this server."
    return
  fi

  if [[ " ${domain_ips} " == *" ${server_ip} "* ]]; then
    echo "DNS check passed: ${DOMAIN} resolves to ${server_ip}."
  else
    echo "DNS warning: ${DOMAIN} resolves to ${domain_ips}, but this server appears to be ${server_ip}."
    echo "Caddy certificate issuance may fail until DNS points to this server."
  fi
}

handle_existing_postgres_volume() {
  local volume_name
  volume_name="$(postgres_volume_name)"

  if ! docker_cmd volume inspect "${volume_name}" >/dev/null 2>&1; then
    return
  fi

  echo
  warn "检测到已有 PostgreSQL 数据卷。"
  echo "PostgreSQL 首次初始化后的用户名和密码不会因为修改 .env.production 自动改变。"
  echo
  echo "请选择处理方式："
  echo "1. 保留现有数据并停止安装"
  echo "2. 删除测试数据库卷并重新初始化"
  echo

  local choice=""
  read -r -p "请输入选项 [1/2]: " choice
  case "${choice}" in
    1)
      warn "已停止安装，保留现有 PostgreSQL 数据卷。"
      exit 1
      ;;
    2)
      if ! confirm_dangerous_delete "DELETE_DB_DATA" "输入 DELETE_DB_DATA 确认删除测试数据库卷:"; then
        warn "未确认删除，已停止安装。"
        exit 1
      fi
      run_logged_allow_fail "停止现有生产服务" compose down --remove-orphans || true
      run_logged "删除 PostgreSQL 数据卷 ${volume_name}" docker_cmd volume rm "${volume_name}"
      ;;
    *)
      warn "未选择有效选项，已停止安装。"
      exit 1
      ;;
  esac
}

backup_existing_database() {
  local timestamp backup_dir
  timestamp="$(date +%Y%m%d-%H%M%S)"
  backup_dir="${PROJECT_ROOT}/backups/${timestamp}"
  mkdir -p "${backup_dir}"
  chmod 700 "${PROJECT_ROOT}/backups" "${backup_dir}"

  run_logged "启动 PostgreSQL 以执行备份" compose up -d postgres
  wait_for_postgres

  echo "正在备份 PostgreSQL 数据库到 backups/${timestamp}/postgres.dump..."
  if ! compose exec -T postgres pg_dump -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -Fc -f - > "${backup_dir}/postgres.dump"; then
    print_database_diagnostics
    fail_install "数据库备份失败，请确认 .env.production 中的数据库凭据与现有数据卷一致。"
  fi

  cp "${ENV_FILE}" "${backup_dir}/env.production.backup"
  chmod 600 "${backup_dir}/env.production.backup"
  ok "数据库备份完成：backups/${timestamp}"
}

wait_for_postgres() {
  echo "等待 PostgreSQL 就绪..."
  for _ in $(seq 1 60); do
    local container_id=""
    local container_status=""
    container_id="$(compose ps -q postgres 2>/dev/null || true)"
    if [[ -n "${container_id}" ]]; then
      container_status="$(docker_cmd inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "${container_id}" 2>/dev/null || true)"
      case "${container_status}" in
        healthy|running)
          ok "PostgreSQL 容器状态正常。"
          break
          ;;
        unhealthy|exited|dead)
          echo "PostgreSQL 容器状态异常：${container_status}"
          print_database_diagnostics
          fail_install "PostgreSQL 容器状态异常。"
          ;;
      esac
    fi
    sleep 2
  done

  for _ in $(seq 1 60); do
    if compose exec -T postgres pg_isready -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" >/dev/null 2>&1; then
      ok "PostgreSQL pg_isready 检查通过。"
      return
    fi
    sleep 2
  done

  echo "PostgreSQL 未在预期时间内就绪。"
  print_database_diagnostics
  fail_install "PostgreSQL 启动超时。"
}

print_database_diagnostics() {
  echo
  echo "Database diagnostics:"
  echo "DATABASE_URL=$(mask_database_url "${DATABASE_URL:-}")"
  echo "POSTGRES_DB=${POSTGRES_DB:-}"
  echo "POSTGRES_USER=${POSTGRES_USER:-}"
  echo
  echo "PostgreSQL container status:"
  compose ps postgres || true
  echo
  echo "Last 100 PostgreSQL log lines:"
  compose logs --tail=100 postgres || true
  echo
  echo "Last 100 installer log lines:"
  tail -n 100 "${INSTALL_LOG}" || true
}

run_postgres_select_one() {
  if run_logged_allow_fail "执行 PostgreSQL SELECT 1 预检" compose exec -T postgres psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -v ON_ERROR_STOP=1 -c "SELECT 1;"; then
    ok "PostgreSQL SELECT 1 预检通过。"
    return
  fi

  echo "数据库连接失败，请检查 DATABASE_URL、POSTGRES_USER、POSTGRES_PASSWORD 是否一致。"
  print_database_diagnostics
  fail_install "PostgreSQL SELECT 1 预检失败。"
}

preflight_database_connection() {
  wait_for_postgres
  run_postgres_select_one

  if run_logged_allow_fail "检查 API 容器内数据库连接" compose run --rm api node -e 'async function main() { let prisma; try { const { PrismaClient } = require("@prisma/client"); prisma = new PrismaClient(); await prisma.$queryRawUnsafe("SELECT 1"); } catch { console.error("数据库连接失败，请检查 DATABASE_URL、POSTGRES_USER、POSTGRES_PASSWORD 是否一致。"); process.exitCode = 1; } finally { if (prisma) { await prisma.$disconnect().catch(() => {}); } } } main();'; then
    ok "数据库连接检查通过。"
    return
  fi

  echo "数据库连接失败，请检查 DATABASE_URL、POSTGRES_USER、POSTGRES_PASSWORD 是否一致。"
  print_database_diagnostics
  fail_install "数据库连接预检失败。"
}

run_migrations() {
  if run_logged_allow_fail "运行数据库迁移" compose run --rm api corepack pnpm db:migrate; then
    ok "数据库迁移完成。"
    return
  fi

  echo "数据库迁移失败。"
  echo "数据库连接失败，请检查 DATABASE_URL、POSTGRES_USER、POSTGRES_PASSWORD 是否一致。"
  print_database_diagnostics
  fail_install "数据库迁移失败。"
}

collect_admin_configuration() {
  local default_email="${1:-${ADMIN_EMAIL:-}}"
  local default_display_name="${2:-${ADMIN_DISPLAY_NAME:-Super Admin}}"
  local env_password=""

  section 4 "管理员账号"
  ADMIN_EMAIL="$(prompt_required "请输入管理员邮箱" "${default_email}")"

  if env_password="$(resolve_admin_password_from_env 2>/dev/null)"; then
    if [[ -n "${ADMIN_PASSWORD:-}" || -n "${ADMIN_INITIAL_PASSWORD:-}" ]]; then
      warn "检测到通过环境变量传入管理员密码，命令行环境可能被 shell 历史记录保存；推荐使用交互式隐藏输入。"
    fi
    if ! validate_admin_password_strength "${env_password}"; then
      error_message "管理员密码校验失败。"
      exit 1
    fi
    ADMIN_PASSWORD="${env_password}"
  else
    if [[ -n "${ADMIN_INITIAL_PASSWORD_B64:-}" ]]; then
      error_message "ADMIN_INITIAL_PASSWORD_B64 不是有效的 base64 编码。"
      exit 1
    fi
    ADMIN_PASSWORD="$(prompt_password_twice "请输入管理员密码" "请再次输入管理员密码")"
  fi

  ADMIN_INITIAL_PASSWORD_B64="$(admin_password_to_b64 "${ADMIN_PASSWORD}")"
  export ADMIN_INITIAL_PASSWORD_B64

  ADMIN_DISPLAY_NAME="$(prompt_required "请输入管理员显示名称" "${default_display_name}")"
}

collect_configuration() {
  section 2 "域名配置"
  DOMAIN="$(normalize_domain "$(prompt_required "请输入域名" "example.com")")"

  section 3 "数据库配置"
  DB_NAME="$(prompt_required "请输入数据库名称" "photo_weather_ai")"
  DB_USER="$(prompt_required "请输入数据库用户" "photo_weather_ai")"
  require_postgres_identifier "DB_NAME" "${DB_NAME}"
  require_postgres_identifier "DB_USER" "${DB_USER}"

  while true; do
    DB_PASSWORD="$(prompt_secret "请输入数据库密码（留空自动生成）")"
    if [[ -z "${DB_PASSWORD}" ]]; then
      DB_PASSWORD="$(generate_secret)"
      ok "已自动生成数据库密码。"
      break
    fi
    DB_PASSWORD="$(strip_env_value "${DB_PASSWORD}")"
    if validate_db_password_for_env "${DB_PASSWORD}"; then
      break
    fi
    warn "数据库密码包含暂不支持的特殊字符，请使用字母、数字和 . _ @ % + = -，或留空自动生成。"
  done
  set_database_config "${DB_NAME}" "${DB_USER}" "${DB_PASSWORD}"

  REDIS_PASSWORD="$(prompt_secret "请输入 Redis 密码（留空自动生成）")"
  if [[ -z "${REDIS_PASSWORD}" ]]; then
    REDIS_PASSWORD="$(generate_secret)"
    ok "已自动生成 Redis 密码。"
  fi

  JWT_SECRET="$(prompt_secret "请输入 JWT 密钥（留空自动生成）")"
  if [[ -z "${JWT_SECRET}" ]]; then
    JWT_SECRET="$(generate_secret)"
    ok "已自动生成 JWT 密钥。"
  fi

  collect_admin_configuration "${ADMIN_EMAIL:-}" "Super Admin"

  section 5 "第三方服务配置"
  AMAP_API_KEY=""
  AMAP_WEB_SERVICE_KEY=""
  QWEATHER_API_KEY=""
  QWEATHER_API_HOST=""
  DEEPSEEK_API_KEY=""
  DEEPSEEK_BASE_URL="https://api.deepseek.com"
  OPEN_METEO_API_KEY=""
  OPEN_METEO_MODE="free"
  OPEN_METEO_CUSTOMER_ENDPOINT=""
  echo "第三方服务 Key 建议部署完成后在后台管理中配置，本安装器不会写入初始 API Key。"
}

provider_enabled_label() {
  local value="$1"
  if [[ -n "${value}" ]]; then
    printf '%s' "是"
  else
    printf '%s' "否"
  fi
}

print_deployment_summary() {
  echo
  line
  echo "部署摘要"
  line
  printf '域名：%s\n' "${DOMAIN}"
  printf '数据库名称：%s\n' "${POSTGRES_DB}"
  printf '数据库用户：%s\n' "${POSTGRES_USER}"
  printf '管理员邮箱：%s\n' "${ADMIN_EMAIL}"
  printf '第三方服务：Amap=%s / QWeather=%s / DeepSeek=%s / Open-Meteo=%s\n' \
    "$(provider_enabled_label "${AMAP_API_KEY:-}")" \
    "$(provider_enabled_label "${QWEATHER_API_KEY:-}")" \
    "$(provider_enabled_label "${DEEPSEEK_API_KEY:-}")" \
    "$(provider_enabled_label "${OPEN_METEO_API_KEY:-}")"
  printf '需要安装 Docker：%s\n' "$(docker_install_needed_label)"
  printf 'Install region: %s\n' "${INSTALL_REGION}"
  printf 'Requested Docker install method: %s\n' "${DOCKER_INSTALL_METHOD}"
  printf 'APT mirror: %s\n' "${APT_MIRROR:-none}"
  printf 'PIP index URL: %s\n' "${PIP_INDEX_URL:-none}"
  printf 'Docker registry mirrors: %s\n' "${DOCKER_REGISTRY_MIRRORS:-none}"
  echo "密码与 API Key 均已隐藏。"
}

confirm_deployment() {
  if ! confirm_continue "确认开始部署？" "直接回车继续，输入 n 取消:"; then
    warn "已取消部署，未启动 Docker 服务。"
    exit 1
  fi
}

download_required_ephemeris() {
  if ! confirm_continue "需要准备本地天文星历文件 de421.bsp，用于精确计算月相、月出月落和银河窗口；可使用仓库内文件、本地文件或多个下载来源。" "直接回车继续，输入 n 取消安装:"; then
    fail_install "未安装 de421.bsp，无法完成生产部署。可设置 EPHEMERIS_LOCAL_FILE 或 EPHEMERIS_URLS 后重新运行安装器。"
  fi

  if run_logged_with_heartbeat \
    "下载并安装天文星历文件" \
    "de421.bsp 下载或写入仍在进行，请稍候..." \
    bash "${SCRIPT_DIR}/download-ephemeris.sh"; then
    ok "天文星历文件检查通过。"
    return
  fi

  fail_install "de421.bsp 获取、写入或健康检查失败，安装已停止。可设置 EPHEMERIS_LOCAL_FILE 或 EPHEMERIS_URLS 后重试。"
}

compose_service_exists() {
  local service="$1"
  compose config --services | grep -qx "${service}"
}

build_production_images() {
  local service
  for service in astro-service api web worker; do
    if compose_service_exists "${service}"; then
      run_logged "构建 ${service} 镜像" compose build "${service}"
    fi
  done
}

compose_run_bootstrap_admin() {
  export ADMIN_EMAIL ADMIN_INITIAL_PASSWORD_B64 ADMIN_DISPLAY_NAME
  compose run --rm \
    -e ADMIN_EMAIL \
    -e ADMIN_INITIAL_PASSWORD_B64 \
    -e ADMIN_DISPLAY_NAME \
    api pnpm bootstrap:admin
}

create_admin_account() {
  run_logged "创建或更新管理员账号" compose_run_bootstrap_admin
}

verify_admin_account() {
  if run_logged_allow_fail "验证管理员角色与权限" bash "${SCRIPT_DIR}/verify-admin-bootstrap.sh"; then
    ok "管理员账号验证通过。"
    return
  fi

  echo "管理员账号、角色或权限验证失败，部署未完成。"
  echo "可执行 bash scripts/reset-admin.sh 重新设置管理员密码。"
  show_log_tail
  exit 1
}

bootstrap_stack() {
  local production_services=(postgres redis astro-service api web caddy worker)

  section 8 "构建并启动服务"
  build_production_images

  run_logged "启动数据库、Redis 和星历服务" compose up -d postgres redis astro-service

  section 9 "天文星历文件检查"
  download_required_ephemeris

  section 10 "数据库连接预检"
  preflight_database_connection

  section 11 "数据库迁移"
  run_migrations
  run_logged "写入数据库种子数据" compose run --rm api corepack pnpm db:seed

  section 12 "管理员创建与验证"
  create_admin_account
  verify_admin_account

  run_logged "启动完整生产服务" compose up -d --remove-orphans "${production_services[@]}"
  run_logged "重启应用服务" compose restart api web worker caddy
  echo "生产服务状态："
  compose ps
}

check_https_after_start() {
  section 13 "HTTPS 与健康检查"
  if curl -fsS --max-time 15 "https://${DOMAIN}" >/dev/null 2>&1; then
    ok "HTTPS 首页可访问：https://${DOMAIN}"
  else
    warn "暂时无法访问 https://${DOMAIN}。请确认 DNS、80/443 端口和 Caddy 证书签发状态。"
  fi

  if curl -fsS --max-time 15 "https://${DOMAIN}/api/health" >/dev/null 2>&1; then
    ok "API 健康检查可访问：https://${DOMAIN}/api/health"
  else
    warn "暂时无法访问 API 健康检查：https://${DOMAIN}/api/health"
  fi
}

main() {
  normalize_install_settings
  log_install_settings
  title
  section 1 "环境检查"
  local should_render_env=0
  if [[ ! -f "${COMPOSE_FILE}" || ! -f "${ENV_TEMPLATE}" || ! -f "${CADDY_TEMPLATE}" ]]; then
    fail_install "缺少部署模板，请在项目 checkout 根目录运行。"
  fi
  ok "部署模板检查通过。"

  if [[ -f "${ENV_FILE}" ]]; then
    if ! env_file_is_valid; then
      warn "检测到现有 .env.production 格式错误。"
      if ask_yes_no "是否备份并重新生成配置？" "y"; then
        local broken_env_backup
        broken_env_backup="${ENV_FILE}.broken-$(date +%Y%m%d-%H%M%S)"
        mv "${ENV_FILE}" "${broken_env_backup}"
        ok "已备份损坏配置：${broken_env_backup}"
        collect_configuration
        should_render_env=1
      else
        warn "已停止安装，请修复 .env.production 后重试。"
        exit 1
      fi
    else
      warn ".env.production 已存在。"
      if ask_yes_no "是否复用现有生产环境配置" "y"; then
        check_env_file
        load_env_file
        load_existing_database_config
        sync_env_database_lines
        check_env_file
        load_env_file
        DOMAIN="${DOMAIN:-}"
        if [[ -z "${DOMAIN}" ]]; then
          fail_install "现有 .env.production 未定义 DOMAIN。"
        fi
        if [[ -n "${ADMIN_INITIAL_PASSWORD_B64:-}" ]] && ! resolve_admin_password_from_env >/dev/null 2>&1; then
          fail_install "ADMIN_INITIAL_PASSWORD_B64 不是有效的 base64 编码。"
        fi
        if resolve_admin_password_from_env >/dev/null 2>&1; then
          if ask_yes_no "是否重置管理员账号凭据" "n"; then
            ADMIN_PASSWORD=""
            ADMIN_INITIAL_PASSWORD=""
            ADMIN_INITIAL_PASSWORD_B64=""
            collect_admin_configuration "${ADMIN_EMAIL:-}" "${ADMIN_DISPLAY_NAME:-Super Admin}"
            update_env_admin_lines
          else
            prepare_admin_password_b64_from_env
            ok "复用现有管理员凭据。"
          fi
        else
          warn ".env.production 缺少可用于管理员创建与验证的密码配置，需要重新设置管理员凭据。"
          collect_admin_configuration "${ADMIN_EMAIL:-}" "${ADMIN_DISPLAY_NAME:-Super Admin}"
          update_env_admin_lines
        fi
        check_env_file
        load_env_file
        load_existing_database_config
        ok "已更新 .env.production 中的数据库连接与管理员账号。"
      else
        collect_configuration
        should_render_env=1
      fi
    fi
  else
    collect_configuration
    should_render_env=1
  fi

  section 6 "生成配置文件"
  if [[ "${should_render_env}" == "1" ]]; then
    render_env_file
    ok "已生成 .env.production。"
  else
    ok "复用现有 .env.production。"
  fi
  require_env_file "未生成 .env.production，请检查安装输入后重试。"
  check_env_file
  load_env_file
  load_existing_database_config
  if ! prepare_admin_password_b64_from_env; then
    fail_install ".env.production 缺少有效的管理员初始密码配置。"
  fi
  print_database_config_summary
  ensure_caddyfile
  print_deployment_summary
  confirm_deployment

  section 7 "Docker 与系统资源检查"
  ensure_docker
  ok "Docker 与 Docker Compose 检查通过。"
  ensure_swap_capacity
  validate_compose_config
  ok "生产 Docker Compose 配置校验通过。"
  check_ports
  check_dns
  handle_existing_postgres_volume
  bootstrap_stack
  check_https_after_start

  section 14 "完成"
  echo
  ok "部署完成。"
  echo "Website: https://${DOMAIN}"
  echo "Admin login: https://${DOMAIN}/admin/login"
  echo "Admin email: ${ADMIN_EMAIL}"
  echo "Password: hidden"
  echo "Reset admin: bash scripts/reset-admin.sh"
  echo "Status: bash scripts/status.sh"
  echo "Update: bash scripts/update.sh"
  echo "Backup: bash scripts/backup.sh"
  echo "Docker install method used: ${DOCKER_INSTALL_METHOD_USED}"
}

if [[ "${PHOTO_WEATHER_INSTALLER_SOURCE_ONLY:-0}" != "1" ]]; then
  main "$@"
fi
