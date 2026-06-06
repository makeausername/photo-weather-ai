#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE=".env.production"
COMPOSE_FILE="docker-compose.prod.yml"
CHECK_ENV_SCRIPT="${SCRIPT_DIR}/check-env-production.sh"
EPHEMERIS_URL="${EPHEMERIS_URL:-}"
DEFAULT_EPHEMERIS_URLS=(
  "https://ssd.jpl.nasa.gov/ftp/eph/planets/bsp/de421.bsp"
  "https://naif.jpl.nasa.gov/pub/naif/generic_kernels/spk/planets/de421.bsp"
)
EPHEMERIS_URL_CANDIDATES=()
EPHEMERIS_DIR="${PROJECT_ROOT}/deploy/ephemeris"
EPHEMERIS_FILE="${EPHEMERIS_DIR}/de421.bsp"
CONTAINER_EPHEMERIS_PATH="/app/data/de421.bsp"
MIN_EPHEMERIS_BYTES=$((10 * 1024 * 1024))

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

file_size_bytes() {
  local path="$1"
  if stat -c%s "${path}" >/dev/null 2>&1; then
    stat -c%s "${path}"
  else
    wc -c < "${path}" | tr -d '[:space:]'
  fi
}

verify_ephemeris_file() {
  local path="$1"
  local size
  if [[ ! -f "${path}" ]]; then
    return 1
  fi

  size="$(file_size_bytes "${path}")"
  [[ "${size}" =~ ^[0-9]+$ ]] && [[ "${size}" -gt "${MIN_EPHEMERIS_BYTES}" ]]
}

add_ephemeris_url_candidate() {
  local candidate="$1"
  local existing

  if [[ -z "${candidate}" ]]; then
    return
  fi

  for existing in "${EPHEMERIS_URL_CANDIDATES[@]}"; do
    if [[ "${existing}" == "${candidate}" ]]; then
      return
    fi
  done

  EPHEMERIS_URL_CANDIDATES+=("${candidate}")
}

build_ephemeris_url_candidates() {
  local default_url
  EPHEMERIS_URL_CANDIDATES=()

  add_ephemeris_url_candidate "${EPHEMERIS_URL}"
  for default_url in "${DEFAULT_EPHEMERIS_URLS[@]}"; do
    add_ephemeris_url_candidate "${default_url}"
  done
}

download_tool_available() {
  command -v curl >/dev/null 2>&1 || command -v wget >/dev/null 2>&1
}

download_ephemeris_url() {
  local url="$1"
  local output_path="$2"

  if command -v curl >/dev/null 2>&1; then
    curl -fL --retry 3 --retry-delay 3 --connect-timeout 20 --max-time 300 -o "${output_path}" "${url}"
    return
  fi

  wget --tries=3 --timeout=20 --read-timeout=300 -O "${output_path}" "${url}"
}

download_ephemeris() {
  mkdir -p "${EPHEMERIS_DIR}"

  if verify_ephemeris_file "${EPHEMERIS_FILE}"; then
    echo "本地已存在有效 de421.bsp：${EPHEMERIS_FILE}"
    return
  fi

  if ! download_tool_available; then
    echo "缺少 curl 或 wget，无法下载 de421.bsp。"
    exit 1
  fi

  build_ephemeris_url_candidates

  local tmp_file url size
  for url in "${EPHEMERIS_URL_CANDIDATES[@]}"; do
    tmp_file="$(mktemp "${EPHEMERIS_FILE}.tmp.XXXXXX")"
    echo "正在下载 de421.bsp：${url}"

    if download_ephemeris_url "${url}" "${tmp_file}"; then
      if verify_ephemeris_file "${tmp_file}"; then
        mv "${tmp_file}" "${EPHEMERIS_FILE}"
        chmod 644 "${EPHEMERIS_FILE}"
        size="$(file_size_bytes "${EPHEMERIS_FILE}")"
        echo "OK 已获得有效 de421.bsp：${EPHEMERIS_FILE} (${size} bytes)"
        return
      fi

      size="$(file_size_bytes "${tmp_file}" 2>/dev/null || echo 0)"
      echo "下载结果无效：文件不存在或过小 (${size} bytes)，继续尝试下一个来源。"
    else
      echo "下载来源失败：${url}"
    fi

    rm -f "${tmp_file}"
  done

  echo "无法获得有效 de421.bsp。请检查网络，或设置 EPHEMERIS_URL 指向可访问的 de421.bsp 后重试。"
  exit 1
}

wait_for_astro_container() {
  for _ in $(seq 1 30); do
    if [[ -n "$(compose ps -q astro-service 2>/dev/null || true)" ]]; then
      return
    fi
    sleep 1
  done

  echo "astro-service 容器未启动，无法写入星历文件。"
  exit 1
}

install_into_volume() {
  echo "启动 astro-service 以创建持久化 astro_data 卷..."
  compose up -d astro-service
  wait_for_astro_container

  compose exec -T astro-service mkdir -p /app/data
  compose cp "${EPHEMERIS_FILE}" "astro-service:${CONTAINER_EPHEMERIS_PATH}"
  compose exec -T astro-service ls -lh "${CONTAINER_EPHEMERIS_PATH}"
  verify_container_ephemeris_file
}

verify_container_ephemeris_file() {
  compose exec -T astro-service sh -c '
    path="$1"
    min_bytes="$2"
    if [ ! -f "${path}" ]; then
      echo "容器内缺少 de421.bsp：${path}"
      exit 1
    fi
    size="$(wc -c < "${path}" | tr -d "[:space:]")"
    if ! printf "%s" "${size}" | grep -Eq "^[0-9]+$"; then
      echo "容器内 de421.bsp 文件大小不可读：${path}"
      exit 1
    fi
    if [ "${size}" -le "${min_bytes}" ]; then
      echo "容器内 de421.bsp 文件过小：${path} (${size} bytes)"
      exit 1
    fi
    echo "OK 容器内 de421.bsp 已验证：${path} (${size} bytes)"
  ' sh "${CONTAINER_EPHEMERIS_PATH}" "${MIN_EPHEMERIS_BYTES}"
}

restart_services() {
  echo "重启 astro-service api web..."
  if compose restart astro-service api web; then
    return
  fi

  echo "部分应用服务尚未创建，已继续重启 astro-service。"
  compose restart astro-service
}

verify_health_from_api_container() {
  local output=""
  echo "通过 API 容器检查 astro-service /health..."
  for _ in $(seq 1 30); do
    if output="$(compose run --rm api node -e "fetch('http://astro-service:4100/health').then(async (response) => { const text = await response.text(); console.log(text); if (!response.ok) process.exit(1); const body = JSON.parse(text); if (body.ephemerisAvailable !== true) process.exit(2); if (body.ephemerisPath !== '${CONTAINER_EPHEMERIS_PATH}') process.exit(3); }).catch((error) => { console.error(error.message); process.exit(1); })" 2>&1)"; then
      echo "${output}"
      echo "OK astro-service 星历文件可用。"
      return
    fi
    sleep 2
  done

  echo "${output}"
  echo "星历文件仍不可用，请检查 EPHEMERIS_PATH 和 /app/data/de421.bsp 权限。"
  exit 1
}

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "未找到 .env.production，请先运行 bash scripts/install.sh"
  exit 1
fi

if [[ ! -f "${COMPOSE_FILE}" ]]; then
  echo "缺少 docker-compose.prod.yml，请在项目 checkout 根目录运行。"
  exit 1
fi

if [[ -f "${CHECK_ENV_SCRIPT}" ]]; then
  bash "${CHECK_ENV_SCRIPT}" >/dev/null
fi

download_ephemeris
install_into_volume
restart_services
verify_health_from_api_container
