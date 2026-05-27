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

api_node() {
  compose exec -T api node "$@"
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

api_node --input-type=module -e '
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
started_ms="$(api_node -e 'console.log(Date.now())')"

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
ended_ms="$(api_node -e 'console.log(Date.now())')"
latency_ms="$((ended_ms - started_ms))"

api_node --input-type=module -e '
const chunks = [];
for await (const chunk of process.stdin) {
  chunks.push(Buffer.from(chunk));
}
const status = Number(process.argv[1]);
const latencyMs = Number(process.argv[2]);
const text = Buffer.concat(chunks).toString("utf8");
let payload = {};
try {
  payload = text ? JSON.parse(text) : {};
} catch {
  payload = {};
}

const diagnostics = payload.diagnostics && typeof payload.diagnostics === "object"
  ? payload.diagnostics
  : {};
const hasInterpretation = Boolean(payload.explanation || payload.interpretation || payload.sections);
const deepSeekSuccess = status >= 200 && status < 300 && payload.success === true && payload.fallback !== true && hasInterpretation;
const errorCategory = payload.errorCategory || diagnostics.errorCategory || payload.error || "none";
const model = payload.model || diagnostics.model || "unknown";
const promptSizeChars = typeof diagnostics.promptSizeChars === "number"
  ? diagnostics.promptSizeChars
  : typeof payload.promptSizeChars === "number"
    ? payload.promptSizeChars
    : "unknown";
const timeoutMs = typeof diagnostics.timeoutMs === "number"
  ? diagnostics.timeoutMs
  : typeof payload.timeoutMs === "number"
    ? payload.timeoutMs
    : "unknown";
const parseSuccess = typeof diagnostics.parseSuccess === "boolean"
  ? diagnostics.parseSuccess
  : typeof payload.parseSuccess === "boolean"
    ? payload.parseSuccess
    : "unknown";
const retryable = typeof payload.retryable === "boolean"
  ? payload.retryable
  : "unknown";
const fallback = payload.fallback === true || Boolean(diagnostics.fallback);
const responseLatencyMs = typeof payload.latencyMs === "number" ? payload.latencyMs : latencyMs;
const rendered = payload.explanation || payload.interpretation || payload.sections;
const sectionKeys = rendered && typeof rendered === "object" && !Array.isArray(rendered)
  ? Object.keys(rendered).filter((key) => key !== "metadata")
  : [];
const message =
  payload.messageZh ||
  payload.message ||
  payload.error ||
  (success ? "智能解读生成成功。" : "智能解读暂时不可用，确定性判断结果仍可正常参考。");

console.log(`model: ${model}`);
console.log(`promptSizeChars: ${promptSizeChars}`);
console.log(`timeoutMs: ${timeoutMs}`);
console.log(`success: ${deepSeekSuccess}`);
console.log(`parseSuccess: ${parseSuccess}`);
console.log(`errorCategory: ${errorCategory}`);
console.log(`retryable: ${retryable}`);
console.log(`latencyMs: ${responseLatencyMs}`);
if (deepSeekSuccess) {
  console.log(`sectionKeys: ${sectionKeys.join(",")}`);
}
console.log(`statusCode: ${status}`);
console.log(`fallback: ${fallback}`);
console.log(`messageZh: ${message}`);
' "$http_status" "$latency_ms" < "$response_file"

if [[ "$http_status" -lt 200 || "$http_status" -ge 300 ]]; then
  protect_file_excerpt "$response_file"
  rm -f "$payload_file" "$response_file"
  exit 1
fi

rm -f "$payload_file" "$response_file"
