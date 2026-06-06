#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE=".env.production"
COMPOSE_FILE="docker-compose.prod.yml"
CHECK_ENV_SCRIPT="${SCRIPT_DIR}/check-env-production.sh"
EPHEMERIS_LOCAL_FILE="${EPHEMERIS_LOCAL_FILE:-}"
EPHEMERIS_URL="${EPHEMERIS_URL:-}"
EPHEMERIS_URLS="${EPHEMERIS_URLS:-}"
DEFAULT_EPHEMERIS_URLS=(
  "https://datacenter.stix.i4ds.net/pub/spice/latest/kernels/spk/de421.bsp"
  "https://p2sadev.esac.esa.int/p2sa-files/spice/swap/kernels/spk/de421.bsp"
  "https://ssd.jpl.nasa.gov/ftp/eph/planets/bsp/de421.bsp"
  "https://naif.jpl.nasa.gov/pub/naif/generic_kernels/spk/planets/a_old_versions/de421.bsp"
)
EPHEMERIS_URL_CANDIDATES=()
REPO_LOCAL_EPHEMERIS_CANDIDATES=(
  "${PROJECT_ROOT}/deploy/assets/de421.bsp"
  "${PROJECT_ROOT}/apps/astro-service/data/de421.bsp"
)
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

trim() {
  local value="$1"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  printf '%s' "${value}"
}

file_size_bytes() {
  local path="$1"
  if stat -c%s "${path}" >/dev/null 2>&1; then
    stat -c%s "${path}"
  else
    wc -c < "${path}" | tr -d '[:space:]'
  fi
}

file_size_bytes_or_zero() {
  local path="$1"
  if [[ -f "${path}" ]]; then
    file_size_bytes "${path}"
  else
    printf '0'
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

canonical_existing_file_path() {
  local path="$1"
  local dir base
  dir="$(cd -- "$(dirname -- "${path}")" 2>/dev/null && pwd -P)" || {
    printf '%s' "${path}"
    return
  }
  base="$(basename -- "${path}")"
  printf '%s/%s' "${dir}" "${base}"
}

stage_ephemeris_file() {
  local source_path="$1"
  local source_label="$2"
  local size source_abs dest_abs

  if ! verify_ephemeris_file "${source_path}"; then
    size="$(file_size_bytes_or_zero "${source_path}")"
    echo "星历文件无效或过小：${source_label} (${source_path}, ${size} bytes)"
    return 1
  fi

  mkdir -p "${EPHEMERIS_DIR}"
  if [[ -f "${EPHEMERIS_FILE}" ]]; then
    source_abs="$(canonical_existing_file_path "${source_path}")"
    dest_abs="$(canonical_existing_file_path "${EPHEMERIS_FILE}")"
  else
    source_abs=""
    dest_abs=""
  fi

  if [[ -f "${EPHEMERIS_FILE}" && "${source_abs}" == "${dest_abs}" ]]; then
    :
  elif ! cp "${source_path}" "${EPHEMERIS_FILE}"; then
    echo "无法复制 de421.bsp 到本地缓存：${EPHEMERIS_FILE}"
    return 1
  fi

  chmod 644 "${EPHEMERIS_FILE}"
  if ! verify_ephemeris_file "${EPHEMERIS_FILE}"; then
    size="$(file_size_bytes_or_zero "${EPHEMERIS_FILE}")"
    echo "本地缓存 de421.bsp 校验失败：${EPHEMERIS_FILE} (${size} bytes)"
    return 1
  fi

  size="$(file_size_bytes "${EPHEMERIS_FILE}")"
  echo "OK 已准备有效 de421.bsp：${EPHEMERIS_FILE} (${size} bytes, 来源：${source_label})"
}

try_repo_local_ephemeris() {
  local candidate
  for candidate in "${REPO_LOCAL_EPHEMERIS_CANDIDATES[@]}"; do
    if [[ ! -f "${candidate}" ]]; then
      continue
    fi

    echo "检查仓库内 de421.bsp：${candidate}"
    if stage_ephemeris_file "${candidate}" "repo-local"; then
      return 0
    fi
    echo "仓库内 de421.bsp 无效，继续检查其他来源。"
  done

  return 1
}

try_user_local_ephemeris() {
  if [[ -z "${EPHEMERIS_LOCAL_FILE}" ]]; then
    return 1
  fi

  echo "检查 EPHEMERIS_LOCAL_FILE：${EPHEMERIS_LOCAL_FILE}"
  if stage_ephemeris_file "${EPHEMERIS_LOCAL_FILE}" "EPHEMERIS_LOCAL_FILE"; then
    return 0
  fi

  echo "EPHEMERIS_LOCAL_FILE 指向的文件无效，继续尝试下载来源。"
  return 1
}

try_existing_host_ephemeris() {
  if verify_ephemeris_file "${EPHEMERIS_FILE}"; then
    echo "本地缓存已存在有效 de421.bsp：${EPHEMERIS_FILE}"
    stage_ephemeris_file "${EPHEMERIS_FILE}" "host-cache"
    return 0
  fi

  if [[ -f "${EPHEMERIS_FILE}" ]]; then
    echo "本地缓存 de421.bsp 无效或过小，继续尝试其他来源：${EPHEMERIS_FILE}"
  fi
  return 1
}

add_ephemeris_url_candidate() {
  local candidate="$1"
  local existing

  candidate="$(trim "${candidate}")"
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

add_ephemeris_url_list() {
  local raw="$1"
  local candidate

  while IFS= read -r candidate || [[ -n "${candidate}" ]]; do
    add_ephemeris_url_candidate "${candidate}"
  done < <(printf '%s' "${raw}" | tr ',' '\n')
}

build_ephemeris_url_candidates() {
  local default_url
  EPHEMERIS_URL_CANDIDATES=()

  add_ephemeris_url_list "${EPHEMERIS_URLS}"
  add_ephemeris_url_candidate "${EPHEMERIS_URL}"
  for default_url in "${DEFAULT_EPHEMERIS_URLS[@]}"; do
    add_ephemeris_url_candidate "${default_url}"
  done
}

mask_ephemeris_url_for_log() {
  local url="$1"
  if [[ "${url}" == *\?* ]]; then
    printf '%s?***' "${url%%\?*}"
    return
  fi
  printf '%s' "${url}"
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

download_ephemeris_from_urls() {
  build_ephemeris_url_candidates

  local tmp_file url size log_url
  for url in "${EPHEMERIS_URL_CANDIDATES[@]}"; do
    tmp_file="$(mktemp "${EPHEMERIS_FILE}.tmp.XXXXXX")"
    log_url="$(mask_ephemeris_url_for_log "${url}")"
    echo "尝试下载 de421.bsp 来源：${log_url}"

    if download_ephemeris_url "${url}" "${tmp_file}"; then
      if verify_ephemeris_file "${tmp_file}"; then
        mv "${tmp_file}" "${EPHEMERIS_FILE}"
        chmod 644 "${EPHEMERIS_FILE}"
        size="$(file_size_bytes "${EPHEMERIS_FILE}")"
        echo "OK 已获得有效 de421.bsp：${EPHEMERIS_FILE} (${size} bytes, 来源：${log_url})"
        return 0
      fi

      size="$(file_size_bytes_or_zero "${tmp_file}")"
      echo "下载结果无效：文件不存在或过小 (${size} bytes)，继续尝试下一个来源。"
    else
      echo "下载来源失败，继续尝试下一个来源：${log_url}"
    fi

    rm -f "${tmp_file}"
  done

  return 1
}

fail_missing_ephemeris() {
  echo "无法获得有效 de421.bsp。de421.bsp is required for core astronomy features."
  echo "请提供大于 10 MB 的 deploy/assets/de421.bsp、apps/astro-service/data/de421.bsp，或设置 EPHEMERIS_LOCAL_FILE / EPHEMERIS_URLS 后重试。"
  exit 1
}

download_ephemeris() {
  mkdir -p "${EPHEMERIS_DIR}"

  if try_repo_local_ephemeris; then
    return
  fi

  if try_user_local_ephemeris; then
    return
  fi

  if try_existing_host_ephemeris; then
    return
  fi

  if ! download_tool_available; then
    echo "缺少 curl 或 wget，无法下载 de421.bsp。"
    fail_missing_ephemeris
  fi

  if download_ephemeris_from_urls; then
    return
  fi

  fail_missing_ephemeris
}

verify_host_ephemeris_file() {
  local size
  if ! verify_ephemeris_file "${EPHEMERIS_FILE}"; then
    size="$(file_size_bytes_or_zero "${EPHEMERIS_FILE}")"
    echo "本地主机缺少有效 de421.bsp：${EPHEMERIS_FILE} (${size} bytes)"
    exit 1
  fi

  size="$(file_size_bytes "${EPHEMERIS_FILE}")"
  echo "OK 本地主机 de421.bsp 已验证：${EPHEMERIS_FILE} (${size} bytes)"
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

main() {
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
  verify_host_ephemeris_file
  install_into_volume
  restart_services
  verify_health_from_api_container
}

if [[ "${PHOTO_WEATHER_EPHEMERIS_SOURCE_ONLY:-0}" != "1" ]]; then
  main "$@"
fi
