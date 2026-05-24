#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE=".env.production"
COMPOSE_FILE="docker-compose.prod.yml"
CADDY_TEMPLATE="${PROJECT_ROOT}/deploy/Caddyfile.template"
CADDY_FILE="${PROJECT_ROOT}/deploy/Caddyfile"
ENV_TEMPLATE="${PROJECT_ROOT}/deploy/env.production.template"
COMPOSE_PROJECT_NAME_DEFAULT="photo-weather-ai"

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

validate_compose_config() {
  local compose_check="/tmp/photo-weather-compose-check.yml"
  local compose_err
  compose_err="$(mktemp /tmp/photo-weather-compose-check.err.XXXXXX)"

  : > "${compose_check}"
  chmod 600 "${compose_check}" "${compose_err}"

  if ! compose config > "${compose_check}" 2> "${compose_err}"; then
    echo "生产 Docker Compose 配置校验失败，请检查 .env.production 和 docker-compose.prod.yml。"
    cat "${compose_err}" >&2
    rm -f "${compose_check}" "${compose_err}"
    fail_install "生产 Docker Compose 配置校验失败。"
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
    echo "Value is required."
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

prompt_secret() {
  local label="$1"
  local value=""
  read -r -s -p "${label}: " value
  echo
  printf '%s' "${value}"
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

generate_secret() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 32
  else
    od -An -N32 -tx1 /dev/urandom | tr -d ' \n'
    echo
  fi
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

dotenv_quote() {
  local value="$1"
  value="${value//\'/\'\\\'\'}"
  printf "'%s'" "${value}"
}

write_env_line() {
  local key="$1"
  local value="$2"

  if [[ -z "${value}" ]]; then
    printf '%s=\n' "${key}"
  else
    printf '%s=%s\n' "${key}" "$(dotenv_quote "${value}")"
  fi
}

require_postgres_identifier() {
  local label="$1"
  local value="$2"

  if [[ ! "${value}" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
    echo "${label} must start with a letter or underscore and contain only letters, numbers, and underscores."
    exit 1
  fi
}

normalize_domain() {
  local value="$1"
  value="${value#http://}"
  value="${value#https://}"
  value="${value%%/*}"
  value="$(trim "${value}")"

  if [[ ! "${value}" =~ ^[A-Za-z0-9.-]+$ ]] || [[ "${value}" != *.* ]]; then
    echo "Domain must look like example.com or app.example.com."
    exit 1
  fi

  printf '%s' "${value,,}"
}

render_env_file() {
  local db_user_encoded db_password_encoded db_name_encoded database_url redis_password_encoded redis_url
  db_user_encoded="$(urlencode "${POSTGRES_USER}")"
  db_password_encoded="$(urlencode "${POSTGRES_PASSWORD}")"
  db_name_encoded="$(urlencode "${POSTGRES_DB}")"
  redis_password_encoded="$(urlencode "${REDIS_PASSWORD}")"
  database_url="postgresql://${db_user_encoded}:${db_password_encoded}@postgres:5432/${db_name_encoded}?schema=public"
  redis_url="redis://:${redis_password_encoded}@redis:6379"

  local tmp_file="${ENV_FILE}.tmp"
  : > "${tmp_file}"

  while IFS= read -r line || [[ -n "${line}" ]]; do
    if [[ "${line}" =~ ^([A-Z0-9_]+)= ]]; then
      key="${BASH_REMATCH[1]}"
      case "${key}" in
        NODE_ENV) write_env_line "${key}" "production" >> "${tmp_file}" ;;
        APP_ENV) write_env_line "${key}" "production" >> "${tmp_file}" ;;
        DOMAIN) write_env_line "${key}" "${DOMAIN}" >> "${tmp_file}" ;;
        SITE_URL|PUBLIC_SITE_URL) write_env_line "${key}" "https://${DOMAIN}" >> "${tmp_file}" ;;
        NEXT_PUBLIC_API_BASE_URL) write_env_line "${key}" "https://${DOMAIN}/api" >> "${tmp_file}" ;;
        POSTGRES_DB) write_env_line "${key}" "${POSTGRES_DB}" >> "${tmp_file}" ;;
        POSTGRES_USER) write_env_line "${key}" "${POSTGRES_USER}" >> "${tmp_file}" ;;
        POSTGRES_PASSWORD) write_env_line "${key}" "${POSTGRES_PASSWORD}" >> "${tmp_file}" ;;
        DATABASE_URL) write_env_line "${key}" "${database_url}" >> "${tmp_file}" ;;
        REDIS_PASSWORD) write_env_line "${key}" "${REDIS_PASSWORD}" >> "${tmp_file}" ;;
        REDIS_URL) write_env_line "${key}" "${redis_url}" >> "${tmp_file}" ;;
        JWT_SECRET) write_env_line "${key}" "${JWT_SECRET}" >> "${tmp_file}" ;;
        ADMIN_EMAIL) write_env_line "${key}" "${ADMIN_EMAIL}" >> "${tmp_file}" ;;
        ADMIN_PASSWORD) write_env_line "${key}" "${ADMIN_PASSWORD}" >> "${tmp_file}" ;;
        ADMIN_DISPLAY_NAME) write_env_line "${key}" "${ADMIN_DISPLAY_NAME}" >> "${tmp_file}" ;;
        QWEATHER_API_KEY) write_env_line "${key}" "${QWEATHER_API_KEY}" >> "${tmp_file}" ;;
        QWEATHER_API_HOST) write_env_line "${key}" "${QWEATHER_API_HOST}" >> "${tmp_file}" ;;
        AMAP_API_KEY) write_env_line "${key}" "${AMAP_API_KEY}" >> "${tmp_file}" ;;
        AMAP_WEB_SERVICE_KEY) write_env_line "${key}" "${AMAP_WEB_SERVICE_KEY}" >> "${tmp_file}" ;;
        DEEPSEEK_API_KEY) write_env_line "${key}" "${DEEPSEEK_API_KEY}" >> "${tmp_file}" ;;
        DEEPSEEK_BASE_URL) write_env_line "${key}" "${DEEPSEEK_BASE_URL}" >> "${tmp_file}" ;;
        OPEN_METEO_API_KEY) write_env_line "${key}" "${OPEN_METEO_API_KEY}" >> "${tmp_file}" ;;
        OPEN_METEO_MODE) write_env_line "${key}" "${OPEN_METEO_MODE}" >> "${tmp_file}" ;;
        OPEN_METEO_CUSTOMER_ENDPOINT) write_env_line "${key}" "${OPEN_METEO_CUSTOMER_ENDPOINT}" >> "${tmp_file}" ;;
        *) printf '%s\n' "${line}" >> "${tmp_file}" ;;
      esac
    else
      printf '%s\n' "${line}" >> "${tmp_file}"
    fi
  done < "${ENV_TEMPLATE}"

  mv "${tmp_file}" "${ENV_FILE}"
  chmod 600 "${ENV_FILE}"
}

render_caddyfile() {
  mkdir -p "${PROJECT_ROOT}/deploy"
  sed "s/DOMAIN_PLACEHOLDER/${DOMAIN}/g" "${CADDY_TEMPLATE}" > "${CADDY_FILE}"
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

install_docker_packages() {
  if [[ ! -r /etc/os-release ]]; then
    echo "This installer targets Ubuntu/Debian servers."
    exit 1
  fi

  # shellcheck disable=SC1091
  . /etc/os-release
  case "${ID}" in
    ubuntu|debian) ;;
    *)
      echo "Unsupported distribution: ${ID}. Use Ubuntu 22.04/24.04 or Debian."
      exit 1
      ;;
  esac

  echo "Installing Docker packages..."
  run_sudo apt-get update
  run_sudo apt-get install -y ca-certificates curl gnupg
  run_sudo install -m 0755 -d /etc/apt/keyrings

  if [[ ! -f /etc/apt/keyrings/docker.gpg ]]; then
    curl -fsSL "https://download.docker.com/linux/${ID}/gpg" | run_sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    run_sudo chmod a+r /etc/apt/keyrings/docker.gpg
  fi

  local codename="${VERSION_CODENAME:-}"
  if [[ -z "${codename}" ]]; then
    codename="$(. /etc/os-release && printf '%s' "${VERSION_CODENAME}")"
  fi

  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/${ID} ${codename} stable" \
    | run_sudo tee /etc/apt/sources.list.d/docker.list >/dev/null

  run_sudo apt-get update
  run_sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
}

ensure_docker() {
  if ! command -v docker >/dev/null 2>&1; then
    install_docker_packages
  fi

  if ! docker_cmd compose version >/dev/null 2>&1; then
    install_docker_packages
  fi

  if command -v systemctl >/dev/null 2>&1; then
    run_sudo systemctl enable --now docker
  fi
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
  echo "如果这是测试环境重新安装，可以清空旧数据库卷。"
  echo "如果是正式环境，请先备份数据库。"
  echo
  echo "请选择处理方式："
  echo "1. 保留现有数据并停止安装"
  echo "2. 备份数据库后继续"
  echo "3. 删除测试数据库卷并重新初始化"
  echo

  local choice=""
  read -r -p "请输入选项 [1/2/3]: " choice
  case "${choice}" in
    1)
      warn "已停止安装，保留现有 PostgreSQL 数据卷。"
      exit 1
      ;;
    2)
      backup_existing_database
      ;;
    3)
      local confirmation=""
      read -r -p "输入 DELETE_DB_DATA 确认删除测试数据库卷: " confirmation
      if [[ "${confirmation}" != "DELETE_DB_DATA" ]]; then
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
    print_migration_diagnostics
    fail_install "数据库备份失败，请确认 .env.production 中的数据库凭据与现有数据卷一致。"
  fi

  cp "${ENV_FILE}" "${backup_dir}/env.production.backup"
  chmod 600 "${backup_dir}/env.production.backup"
  ok "数据库备份完成：backups/${timestamp}"
}

wait_for_postgres() {
  echo "等待 PostgreSQL 就绪..."
  for _ in $(seq 1 60); do
    if compose exec -T postgres pg_isready -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" >/dev/null 2>&1; then
      ok "PostgreSQL 已就绪。"
      return
    fi
    sleep 2
  done

  echo "PostgreSQL 未在预期时间内就绪。"
  compose logs --tail=100 postgres || true
  fail_install "PostgreSQL 启动超时。"
}

print_migration_diagnostics() {
  echo
  echo "Migration diagnostics:"
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
  echo "Last 100 API log lines:"
  compose logs --tail=100 api || true
  echo
  echo "Last 100 installer log lines:"
  tail -n 100 "${INSTALL_LOG}" || true
}

preflight_database_connection() {
  if run_logged_allow_fail "检查 API 容器内数据库连接" compose run --rm api node -e 'async function main() { let prisma; try { const { PrismaClient } = require("@prisma/client"); prisma = new PrismaClient(); await prisma.$queryRawUnsafe("SELECT 1"); } catch { console.error("数据库连接失败，请检查 DATABASE_URL、POSTGRES_USER、POSTGRES_PASSWORD 是否一致。"); process.exitCode = 1; } finally { if (prisma) { await prisma.$disconnect().catch(() => {}); } } } main();'; then
    ok "数据库连接检查通过。"
    return
  fi

  echo "数据库连接失败，请检查 DATABASE_URL、POSTGRES_USER、POSTGRES_PASSWORD 是否一致。"
  print_migration_diagnostics
  fail_install "数据库连接预检失败。"
}

run_migrations() {
  if run_logged_allow_fail "运行数据库迁移" compose run --rm api corepack pnpm db:migrate; then
    ok "数据库迁移完成。"
    return
  fi

  echo "数据库迁移失败。"
  echo "数据库连接失败，请检查 DATABASE_URL、POSTGRES_USER、POSTGRES_PASSWORD 是否一致。"
  print_migration_diagnostics
  fail_install "数据库迁移失败。"
}

collect_configuration() {
  section 2 "域名配置"
  DOMAIN="$(normalize_domain "$(prompt_required "请输入绑定域名，例如 example.com")")"

  section 3 "数据库配置"
  POSTGRES_DB="$(prompt_required "请输入数据库名称" "photo_weather_ai")"
  POSTGRES_USER="$(prompt_required "请输入数据库用户" "${POSTGRES_DB}")"
  require_postgres_identifier "Database name" "${POSTGRES_DB}"
  require_postgres_identifier "Database user" "${POSTGRES_USER}"

  POSTGRES_PASSWORD="$(prompt_secret "请输入数据库密码（留空自动生成）")"
  if [[ -z "${POSTGRES_PASSWORD}" ]]; then
    POSTGRES_PASSWORD="$(generate_secret)"
    ok "已自动生成数据库密码。"
  fi

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

  section 4 "管理员账号"
  ADMIN_EMAIL="$(prompt_required "请输入管理员邮箱")"

  while true; do
    ADMIN_PASSWORD="$(prompt_secret "请输入管理员密码")"
    local confirm_password
    confirm_password="$(prompt_secret "请再次输入管理员密码")"
    if [[ "${ADMIN_PASSWORD}" == "${confirm_password}" && -n "${ADMIN_PASSWORD}" ]]; then
      break
    fi
    warn "两次输入的管理员密码不一致，请重新输入。"
  done

  ADMIN_DISPLAY_NAME="$(prompt_required "请输入管理员显示名称" "Super Admin")"

  section 5 "第三方服务配置"
  AMAP_API_KEY=""
  AMAP_WEB_SERVICE_KEY=""
  if ask_yes_no "现在配置高德 Web Service Key" "n"; then
    AMAP_API_KEY="$(prompt_secret "请输入高德 Web Service Key")"
    AMAP_WEB_SERVICE_KEY="${AMAP_API_KEY}"
  fi

  DEEPSEEK_API_KEY=""
  DEEPSEEK_BASE_URL="https://api.deepseek.com"
  if ask_yes_no "现在配置 DeepSeek Key" "n"; then
    DEEPSEEK_API_KEY="$(prompt_secret "请输入 DeepSeek API Key")"
    DEEPSEEK_BASE_URL="$(prompt_optional "请输入 DeepSeek Base URL" "${DEEPSEEK_BASE_URL}")"
  fi

  QWEATHER_API_KEY=""
  QWEATHER_API_HOST=""
  if ask_yes_no "现在配置和风天气 Key 与 API Host" "n"; then
    QWEATHER_API_KEY="$(prompt_secret "请输入和风天气 API Key")"
    QWEATHER_API_HOST="$(prompt_required "请输入和风天气 API Host，例如 xxxxx.qweatherapi.com")"
  fi

  OPEN_METEO_API_KEY=""
  OPEN_METEO_MODE="free"
  OPEN_METEO_CUSTOMER_ENDPOINT=""
  if ask_yes_no "现在配置 Open-Meteo 商业 Key" "n"; then
    OPEN_METEO_API_KEY="$(prompt_secret "请输入 Open-Meteo API Key")"
    OPEN_METEO_CUSTOMER_ENDPOINT="$(prompt_optional "请输入 Open-Meteo Customer Endpoint")"
    OPEN_METEO_MODE="customer"
  fi
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
  printf 'Domain: %s\n' "${DOMAIN}"
  printf 'Database name: %s\n' "${POSTGRES_DB}"
  printf 'Database user: %s\n' "${POSTGRES_USER}"
  printf 'Admin email: %s\n' "${ADMIN_EMAIL}"
  printf 'Providers configured: Amap=%s / QWeather=%s / DeepSeek=%s / Open-Meteo=%s\n' \
    "$(provider_enabled_label "${AMAP_API_KEY:-}")" \
    "$(provider_enabled_label "${QWEATHER_API_KEY:-}")" \
    "$(provider_enabled_label "${DEEPSEEK_API_KEY:-}")" \
    "$(provider_enabled_label "${OPEN_METEO_API_KEY:-}")"
  echo "Passwords and API keys are hidden."
}

confirm_deployment() {
  local confirmation=""
  echo
  read -r -p "确认开始部署？输入 YES 继续: " confirmation
  if [[ "${confirmation}" != "YES" ]]; then
    warn "已取消部署，未启动 Docker 服务。"
    exit 1
  fi
}

bootstrap_stack() {
  local production_services=(postgres redis astro-service api web caddy worker)

  section 7 "启动 Docker 服务"
  run_logged "构建生产镜像" compose build

  run_logged "启动数据库、Redis 和星历服务" compose up -d postgres redis astro-service
  wait_for_postgres

  if ! run_logged_allow_fail "准备 astro-service 星历缓存" compose run --rm astro-service python scripts/fetch_ephemeris.py; then
    warn "星历缓存下载失败。astro-service 会在 astro_data 卷中缺少 de421.bsp 时显示为不健康。"
  fi

  section 8 "数据库初始化"
  preflight_database_connection
  run_migrations

  run_logged "写入数据库种子数据" compose run --rm api corepack pnpm db:seed

  run_logged "创建或确认初始管理员账号" compose run --rm \
    -e ADMIN_EMAIL="${ADMIN_EMAIL}" \
    -e ADMIN_PASSWORD="${ADMIN_PASSWORD}" \
    -e ADMIN_DISPLAY_NAME="${ADMIN_DISPLAY_NAME}" \
    api corepack pnpm create-admin

  run_logged "启动完整生产服务" compose up -d --remove-orphans "${production_services[@]}"
  run_logged "重启应用服务" compose restart api web worker caddy
  echo "生产服务状态："
  compose ps
}

check_https_after_start() {
  section 9 "HTTPS 检查"
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
  title
  section 1 "环境检查"
  local should_render_env=0
  if [[ ! -f "${COMPOSE_FILE}" || ! -f "${ENV_TEMPLATE}" || ! -f "${CADDY_TEMPLATE}" ]]; then
    fail_install "缺少部署模板，请在项目 checkout 根目录运行。"
  fi
  ok "部署模板检查通过。"

  if [[ -f "${ENV_FILE}" ]]; then
    warn ".env.production 已存在。"
    if ask_yes_no "是否复用现有生产环境配置" "y"; then
      load_env_file
      DOMAIN="${DOMAIN:-}"
      if [[ -z "${DOMAIN}" ]]; then
        fail_install "现有 .env.production 未定义 DOMAIN。"
      fi
    else
      collect_configuration
      should_render_env=1
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
  load_env_file
  render_caddyfile
  ok "已生成 deploy/Caddyfile。"
  print_deployment_summary
  confirm_deployment
  ensure_docker
  ok "Docker 与 Docker Compose 检查通过。"
  validate_compose_config
  ok "生产 Docker Compose 配置校验通过。"
  check_ports
  check_dns
  handle_existing_postgres_volume
  bootstrap_stack
  check_https_after_start

  section 10 "完成"
  echo
  ok "部署完成。"
  echo "Public URL: https://${DOMAIN}"
  echo "API health: https://${DOMAIN}/api/health"
  echo "Admin login: https://${DOMAIN}/admin/login"
  echo "Status: bash scripts/status.sh"
  echo "Update: bash scripts/update.sh"
  echo "Backup: bash scripts/backup.sh"
}

main "$@"
