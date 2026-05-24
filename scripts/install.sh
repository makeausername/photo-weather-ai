#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${PROJECT_ROOT}/.env.production"
COMPOSE_FILE="${PROJECT_ROOT}/docker-compose.prod.yml"
CADDY_TEMPLATE="${PROJECT_ROOT}/deploy/Caddyfile.template"
CADDY_FILE="${PROJECT_ROOT}/deploy/Caddyfile"
ENV_TEMPLATE="${PROJECT_ROOT}/deploy/env.production.template"
COMPOSE_PROJECT_NAME_DEFAULT="photo-weather-ai"

cd "${PROJECT_ROOT}"

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
  docker_cmd compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" "$@"
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
  echo "检测到已有 PostgreSQL 数据卷。PostgreSQL 首次初始化后的用户名和密码不会因修改 .env.production 自动改变。"
  echo "如果这是重新安装测试环境，可以选择清空数据卷。"
  echo "如果是正式环境，请先备份数据库。"
  echo

  local confirmation=""
  read -r -p "是否清空旧数据库卷重新初始化？输入 DELETE_DB_DATA 确认，否则中止安装: " confirmation
  if [[ "${confirmation}" != "DELETE_DB_DATA" ]]; then
    echo "已中止安装，避免误用旧数据库凭据。"
    exit 1
  fi

  echo "Stopping existing production stack before removing ${volume_name}..."
  compose down --remove-orphans || true
  docker_cmd volume rm "${volume_name}"
}

wait_for_postgres() {
  echo "Waiting for PostgreSQL..."
  for _ in $(seq 1 60); do
    if compose exec -T postgres pg_isready -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" >/dev/null 2>&1; then
      return
    fi
    sleep 2
  done

  echo "PostgreSQL did not become ready in time."
  compose logs --tail=80 postgres || true
  exit 1
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
  echo "Last 80 PostgreSQL log lines:"
  compose logs --tail=80 postgres || true
}

preflight_database_connection() {
  echo "Checking database connectivity from the API image..."
  if compose run --rm api node -e 'async function main() { let prisma; try { const { PrismaClient } = require("@prisma/client"); prisma = new PrismaClient(); await prisma.$queryRawUnsafe("SELECT 1"); } catch { console.error("数据库连接失败，请检查 DATABASE_URL、POSTGRES_USER、POSTGRES_PASSWORD 是否一致。"); process.exitCode = 1; } finally { if (prisma) { await prisma.$disconnect().catch(() => {}); } } } main();'; then
    return
  fi

  print_migration_diagnostics
  exit 1
}

run_migrations() {
  echo "Running database migrations..."
  if compose run --rm api corepack pnpm db:migrate; then
    return
  fi

  echo "数据库迁移失败。"
  echo "数据库连接失败，请检查 DATABASE_URL、POSTGRES_USER、POSTGRES_PASSWORD 是否一致。"
  print_migration_diagnostics
  exit 1
}

collect_configuration() {
  DOMAIN="$(normalize_domain "$(prompt_required "Domain, without path")")"
  ADMIN_EMAIL="$(prompt_required "Admin email")"

  while true; do
    ADMIN_PASSWORD="$(prompt_secret "Admin password")"
    local confirm_password
    confirm_password="$(prompt_secret "Confirm admin password")"
    if [[ "${ADMIN_PASSWORD}" == "${confirm_password}" && -n "${ADMIN_PASSWORD}" ]]; then
      break
    fi
    echo "Passwords did not match."
  done

  ADMIN_DISPLAY_NAME="$(prompt_required "Admin display name" "Super Admin")"
  POSTGRES_DB="$(prompt_required "Database name" "photo_weather_ai")"
  POSTGRES_USER="$(prompt_required "Database user" "${POSTGRES_DB}")"
  require_postgres_identifier "Database name" "${POSTGRES_DB}"
  require_postgres_identifier "Database user" "${POSTGRES_USER}"

  POSTGRES_PASSWORD="$(prompt_secret "Database password")"
  if [[ -z "${POSTGRES_PASSWORD}" ]]; then
    POSTGRES_PASSWORD="$(generate_secret)"
    echo "Generated database password."
  fi

  REDIS_PASSWORD="$(prompt_secret "Redis password (blank to auto-generate)")"
  if [[ -z "${REDIS_PASSWORD}" ]]; then
    REDIS_PASSWORD="$(generate_secret)"
    echo "Generated Redis password."
  fi

  JWT_SECRET="$(prompt_secret "JWT secret (blank to auto-generate)")"
  if [[ -z "${JWT_SECRET}" ]]; then
    JWT_SECRET="$(generate_secret)"
    echo "Generated JWT secret."
  fi

  AMAP_API_KEY=""
  AMAP_WEB_SERVICE_KEY=""
  if ask_yes_no "Configure Amap Web Service key now" "n"; then
    AMAP_API_KEY="$(prompt_secret "Amap Web Service key")"
    AMAP_WEB_SERVICE_KEY="${AMAP_API_KEY}"
  fi

  DEEPSEEK_API_KEY=""
  DEEPSEEK_BASE_URL="https://api.deepseek.com"
  if ask_yes_no "Configure DeepSeek key now" "n"; then
    DEEPSEEK_API_KEY="$(prompt_secret "DeepSeek API key")"
    DEEPSEEK_BASE_URL="$(prompt_optional "DeepSeek base URL" "${DEEPSEEK_BASE_URL}")"
  fi

  QWEATHER_API_KEY=""
  QWEATHER_API_HOST=""
  if ask_yes_no "Configure QWeather key and API Host now" "n"; then
    QWEATHER_API_KEY="$(prompt_secret "QWeather API key")"
    QWEATHER_API_HOST="$(prompt_required "QWeather API Host, for example xxxxx.qweatherapi.com")"
  fi

  OPEN_METEO_API_KEY=""
  OPEN_METEO_MODE="free"
  OPEN_METEO_CUSTOMER_ENDPOINT=""
  if ask_yes_no "Configure Open-Meteo commercial key now" "n"; then
    OPEN_METEO_API_KEY="$(prompt_secret "Open-Meteo API key")"
    OPEN_METEO_CUSTOMER_ENDPOINT="$(prompt_optional "Open-Meteo customer endpoint")"
    OPEN_METEO_MODE="customer"
  fi
}

bootstrap_stack() {
  echo "Building production images..."
  compose build

  echo "Starting database, Redis, and astro-service..."
  compose up -d postgres redis astro-service
  wait_for_postgres

  echo "Preparing astro-service ephemeris cache..."
  if ! compose run --rm astro-service python scripts/fetch_ephemeris.py; then
    echo "Warning: ephemeris download failed. Astro-service will report unhealthy until de421.bsp is available in the astro_data volume."
  fi

  preflight_database_connection
  run_migrations

  echo "Running database seed..."
  compose run --rm api corepack pnpm db:seed

  echo "Creating or verifying the first admin account..."
  compose run --rm \
    -e ADMIN_EMAIL="${ADMIN_EMAIL}" \
    -e ADMIN_PASSWORD="${ADMIN_PASSWORD}" \
    -e ADMIN_DISPLAY_NAME="${ADMIN_DISPLAY_NAME}" \
    api corepack pnpm create-admin

  echo "Starting full stack..."
  compose up -d --remove-orphans
  compose restart api web worker caddy
}

main() {
  if [[ ! -f "${COMPOSE_FILE}" || ! -f "${ENV_TEMPLATE}" || ! -f "${CADDY_TEMPLATE}" ]]; then
    echo "Missing deployment templates. Run this script from the project checkout."
    exit 1
  fi

  if [[ -f "${ENV_FILE}" ]]; then
    echo ".env.production already exists."
    if ask_yes_no "Reuse existing production environment" "y"; then
      load_env_file
      DOMAIN="${DOMAIN:-}"
      if [[ -z "${DOMAIN}" ]]; then
        echo "Existing .env.production does not define DOMAIN."
        exit 1
      fi
    else
      collect_configuration
      render_env_file
    fi
  else
    collect_configuration
    render_env_file
  fi

  load_env_file
  render_caddyfile
  ensure_docker
  check_ports
  check_dns
  handle_existing_postgres_volume
  bootstrap_stack

  echo
  echo "Deployment complete."
  echo "Public URL: https://${DOMAIN}"
  echo "API health: https://${DOMAIN}/api/health"
  echo "Admin login: https://${DOMAIN}/admin/login"
  echo "Status: bash scripts/status.sh"
  echo "Update: bash scripts/update.sh"
  echo "Backup: bash scripts/backup.sh"
}

main "$@"
