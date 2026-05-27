#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE=".env.production"
COMPOSE_FILE="docker-compose.prod.yml"
CHECK_ENV_SCRIPT="${SCRIPT_DIR}/check-env-production.sh"
REQUEST_TIMEOUT_SECONDS=130

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

print_timeout_result() {
  echo "promptSizeChars: unknown"
  echo "success: false"
  echo "source: fallback"
  echo "parseSuccess: false"
  echo "latencyMs: $((REQUEST_TIMEOUT_SECONDS * 1000))"
  echo "errorCategory: timeout"
  echo "retryable: true"
  echo "fallbackSuccess: false"
}

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "missingEnvFile: .env.production"
  echo "messageZh: 未找到 .env.production，请先运行 bash scripts/install.sh"
  exit 1
fi

echo "step: validate-production-env"
if ! bash "${CHECK_ENV_SCRIPT}" >/dev/null; then
  echo "envValidation: failed"
  echo "messageZh: 生产环境配置文件格式错误，请检查 .env.production。"
  exit 1
fi
echo "envValidation: ok"

echo "DeepSeek interpretation diagnostics"
echo "No API keys or secrets will be printed."

echo "step: read-runtime-config"
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

echo "step: request-forecast-ai-explain"
request_output="$(mktemp)"
request_error="$(mktemp)"
cleanup() {
  rm -f "$request_output" "$request_error"
}
trap cleanup EXIT

set +e
if [[ -n "${SUDO}" ]]; then
  timeout 130s sudo docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T api node --input-type=module >"$request_output" 2>"$request_error" <<'NODE'
const payload = {
  name: "黄山光明顶",
  source: "local_photo_spot",
  latitudeGcj02: 30.13254,
  longitudeGcj02: 118.16876,
  latitudeWgs84: 30.13012,
  longitudeWgs84: 118.16389,
  elevationMeters: 1860,
  horizon: "24h",
  target: "general",
  photoSpotId: "spot-guangmingding",
};

const startedAt = Date.now();
let statusCode = 0;
let text = "";
let fetchError = null;

try {
  const response = await fetch("http://127.0.0.1:4000/forecast/ai-explain", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  statusCode = response.status;
  text = await response.text();
} catch (error) {
  fetchError = error;
}

const latencyMs = Date.now() - startedAt;
let body = {};
let bodyParsed = false;
try {
  body = text ? JSON.parse(text) : {};
  bodyParsed = true;
} catch {
  body = {};
}

const diagnostics =
  body && typeof body.diagnostics === "object" && body.diagnostics !== null
    ? body.diagnostics
    : {};
const interpretation = body.interpretation || body.explanation || body.sections;
const fallbackInterpretation =
  body.fallbackInterpretation ||
  (body.source === "fallback" ? interpretation : null) ||
  (body.fallback === true ? body.explanation : null);
const deepSeekSuccess =
  statusCode >= 200 &&
  statusCode < 300 &&
  body.success === true &&
  body.source === "deepseek" &&
  Boolean(interpretation);
const fallbackSuccess =
  statusCode >= 200 &&
  statusCode < 300 &&
  body.source === "fallback" &&
  Boolean(fallbackInterpretation);
const source = body.source || (deepSeekSuccess ? "deepseek" : fallbackSuccess ? "fallback" : "unknown");
const promptSizeChars =
  typeof body.promptSizeChars === "number"
    ? body.promptSizeChars
    : typeof diagnostics.promptSizeChars === "number"
      ? diagnostics.promptSizeChars
      : "unknown";
const parseSuccess =
  typeof body.parseSuccess === "boolean"
    ? body.parseSuccess
    : typeof diagnostics.parseSuccess === "boolean"
      ? diagnostics.parseSuccess
      : false;
const retryable = typeof body.retryable === "boolean" ? body.retryable : false;
const errorCategory =
  body.errorCategory ||
  diagnostics.errorCategory ||
  (fetchError ? "network_error" : bodyParsed ? "none" : "empty_response");
const responseLatencyMs =
  typeof body.latencyMs === "number"
    ? body.latencyMs
    : typeof diagnostics.latencyMs === "number"
      ? diagnostics.latencyMs
      : latencyMs;

console.log(`promptSizeChars: ${promptSizeChars}`);
console.log(`success: ${deepSeekSuccess}`);
console.log(`source: ${source}`);
console.log(`parseSuccess: ${parseSuccess}`);
console.log(`latencyMs: ${responseLatencyMs}`);
console.log(`errorCategory: ${errorCategory}`);
console.log(`retryable: ${retryable}`);
console.log(`fallbackSuccess: ${fallbackSuccess}`);
console.log(`statusCode: ${statusCode}`);

if (fetchError) {
  console.log(`messageZh: 请求 /forecast/ai-explain 失败，无法取得智能解读或确定性兜底。`);
  process.exit(1);
}

if (!deepSeekSuccess && !fallbackSuccess) {
  console.log(
    `messageZh: ${
      body.messageZh ||
      body.message ||
      "DeepSeek 未成功，且后端没有返回可用的确定性兜底解读。"
    }`,
  );
  process.exit(1);
}

if (body.messageZh) {
  console.log(`messageZh: ${body.messageZh}`);
}
NODE
else
  timeout 130s docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T api node --input-type=module >"$request_output" 2>"$request_error" <<'NODE'
const payload = {
  name: "黄山光明顶",
  source: "local_photo_spot",
  latitudeGcj02: 30.13254,
  longitudeGcj02: 118.16876,
  latitudeWgs84: 30.13012,
  longitudeWgs84: 118.16389,
  elevationMeters: 1860,
  horizon: "24h",
  target: "general",
  photoSpotId: "spot-guangmingding",
};

const startedAt = Date.now();
let statusCode = 0;
let text = "";
let fetchError = null;

try {
  const response = await fetch("http://127.0.0.1:4000/forecast/ai-explain", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  statusCode = response.status;
  text = await response.text();
} catch (error) {
  fetchError = error;
}

const latencyMs = Date.now() - startedAt;
let body = {};
let bodyParsed = false;
try {
  body = text ? JSON.parse(text) : {};
  bodyParsed = true;
} catch {
  body = {};
}

const diagnostics =
  body && typeof body.diagnostics === "object" && body.diagnostics !== null
    ? body.diagnostics
    : {};
const interpretation = body.interpretation || body.explanation || body.sections;
const fallbackInterpretation =
  body.fallbackInterpretation ||
  (body.source === "fallback" ? interpretation : null) ||
  (body.fallback === true ? body.explanation : null);
const deepSeekSuccess =
  statusCode >= 200 &&
  statusCode < 300 &&
  body.success === true &&
  body.source === "deepseek" &&
  Boolean(interpretation);
const fallbackSuccess =
  statusCode >= 200 &&
  statusCode < 300 &&
  body.source === "fallback" &&
  Boolean(fallbackInterpretation);
const source = body.source || (deepSeekSuccess ? "deepseek" : fallbackSuccess ? "fallback" : "unknown");
const promptSizeChars =
  typeof body.promptSizeChars === "number"
    ? body.promptSizeChars
    : typeof diagnostics.promptSizeChars === "number"
      ? diagnostics.promptSizeChars
      : "unknown";
const parseSuccess =
  typeof body.parseSuccess === "boolean"
    ? body.parseSuccess
    : typeof diagnostics.parseSuccess === "boolean"
      ? diagnostics.parseSuccess
      : false;
const retryable = typeof body.retryable === "boolean" ? body.retryable : false;
const errorCategory =
  body.errorCategory ||
  diagnostics.errorCategory ||
  (fetchError ? "network_error" : bodyParsed ? "none" : "empty_response");
const responseLatencyMs =
  typeof body.latencyMs === "number"
    ? body.latencyMs
    : typeof diagnostics.latencyMs === "number"
      ? diagnostics.latencyMs
      : latencyMs;

console.log(`promptSizeChars: ${promptSizeChars}`);
console.log(`success: ${deepSeekSuccess}`);
console.log(`source: ${source}`);
console.log(`parseSuccess: ${parseSuccess}`);
console.log(`latencyMs: ${responseLatencyMs}`);
console.log(`errorCategory: ${errorCategory}`);
console.log(`retryable: ${retryable}`);
console.log(`fallbackSuccess: ${fallbackSuccess}`);
console.log(`statusCode: ${statusCode}`);

if (fetchError) {
  console.log(`messageZh: 请求 /forecast/ai-explain 失败，无法取得智能解读或确定性兜底。`);
  process.exit(1);
}

if (!deepSeekSuccess && !fallbackSuccess) {
  console.log(
    `messageZh: ${
      body.messageZh ||
      body.message ||
      "DeepSeek 未成功，且后端没有返回可用的确定性兜底解读。"
    }`,
  );
  process.exit(1);
}

if (body.messageZh) {
  console.log(`messageZh: ${body.messageZh}`);
}
NODE
fi
request_status=$?
set -e

if [[ "$request_status" -eq 124 ]]; then
  cat "$request_output"
  print_timeout_result
  exit 1
fi

if [[ -s "$request_error" ]]; then
  echo "step: request-stderr"
  sed -E 's/(apiKey|api_key|token|authorization|secret)(["[:space:]:=]+)([^&[:space:],}"]+)/\1\2[redacted]/Ig' "$request_error"
fi

cat "$request_output"

if [[ "$request_status" -ne 0 ]]; then
  exit "$request_status"
fi

echo "step: done"
