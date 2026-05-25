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

read_env_value() {
  local name="$1"
  local file="$2"
  local line value

  if [[ ! -f "$file" ]]; then
    return 0
  fi

  line="$(grep -E "^(export[[:space:]]+)?${name}=" "$file" | tail -n 1 || true)"
  if [[ -z "$line" ]]; then
    return 0
  fi

  value="${line#*=}"
  value="${value%$'\r'}"
  value="${value#\"}"
  value="${value%\"}"
  value="${value#\'}"
  value="${value%\'}"
  printf '%s' "$value"
}

protect_file_excerpt() {
  local file="$1"
  if command -v python3 >/dev/null 2>&1; then
    python3 - "$file" <<'PY'
import re
import sys
from pathlib import Path

text = Path(sys.argv[1]).read_text(encoding="utf-8", errors="replace")[:1200]
text = re.sub(r'(?i)(apiKey|api_key|token|authorization|secret)(["\s:=]+)([^&\s,}"]+)', r'\1\2[redacted]', text)
text = re.sub(r'(?i)(apikey|key|token)=([^&\s]+)', r'\1=[redacted]', text)
if text:
    print(text)
PY
  fi
}

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "未找到 .env.production，请先运行 bash scripts/install.sh"
  exit 1
fi

if ! bash "${CHECK_ENV_SCRIPT}" >/dev/null; then
  echo "生产环境配置文件格式错误，请检查 .env.production。"
  exit 1
fi

API_BASE_URL="${PHOTO_WEATHER_API_BASE_URL:-${NEXT_PUBLIC_API_BASE_URL:-}}"
if [[ -z "$API_BASE_URL" ]]; then
  API_BASE_URL="$(read_env_value "NEXT_PUBLIC_API_BASE_URL" "$ENV_FILE")"
fi
if [[ -z "$API_BASE_URL" ]]; then
  API_BASE_URL="http://127.0.0.1:4000"
fi
API_BASE_URL="${API_BASE_URL%/}"

echo "DeepSeek interpretation diagnostics"
echo "No API keys or secrets will be printed."

compose run --rm api node --input-type=module -e '
const { readRuntimeDeepSeekConfig } = await import("./apps/api/dist/ai-provider.js");
const config = await readRuntimeDeepSeekConfig();
console.log(`providerEnabled: ${config.providerEnabled}`);
console.log(`realCallEnabled: ${config.realCallEnabled}`);
console.log(`apiKeyPresent: ${config.apiKeyPresent}`);
console.log(`model: ${config.model}`);
console.log(`timeoutMs: ${config.timeoutMs}`);
if (config.model !== "deepseek-v4-pro") {
  console.error("modelPolicyError: expected deepseek-v4-pro");
  process.exit(1);
}
'

payload_file="$(mktemp)"
response_file="$(mktemp)"
started_ms="$(node -e 'console.log(Date.now())')"

cat >"$payload_file" <<'JSON'
{
  "name": "黄山光明顶",
  "source": "local_photo_spot",
  "latitudeGcj02": 30.13254,
  "longitudeGcj02": 118.16876,
  "latitudeWgs84": 30.13012,
  "longitudeWgs84": 118.16389,
  "elevationMeters": 1860,
  "horizon": "24h",
  "target": "general",
  "photoSpotId": "spot-guangmingding"
}
JSON

http_status="$(
  curl -sS \
    --connect-timeout 10 \
    --max-time 130 \
    -H "Content-Type: application/json" \
    -X POST \
    --data-binary "@${payload_file}" \
    -o "$response_file" \
    -w "%{http_code}" \
    "${API_BASE_URL}/forecast/ai-explain"
)"
ended_ms="$(node -e 'console.log(Date.now())')"
latency_ms="$((ended_ms - started_ms))"

node - "$response_file" "$http_status" "$latency_ms" <<'NODE'
const fs = require("fs");
const file = process.argv[2];
const status = Number(process.argv[3]);
const latencyMs = Number(process.argv[4]);
const text = fs.readFileSync(file, "utf8");
let payload = {};
try {
  payload = text ? JSON.parse(text) : {};
} catch {
  payload = {};
}

const success = status >= 200 && status < 300 && Boolean(payload.explanation);
const message =
  payload.message ||
  payload.error ||
  (success ? "DeepSeek 解读生成成功。" : "DeepSeek 解读暂时不可用，已保留确定性分析结果。");

console.log(`success: ${success}`);
console.log(`statusCode: ${status}`);
console.log(`latencyMs: ${latencyMs}`);
console.log(`messageZh: ${message}`);
NODE

if [[ "$http_status" -lt 200 || "$http_status" -ge 300 ]]; then
  protect_file_excerpt "$response_file"
  rm -f "$payload_file" "$response_file"
  exit 1
fi

rm -f "$payload_file" "$response_file"
