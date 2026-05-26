#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${PROJECT_ROOT}/.env.production"

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

json_escape() {
  local value="$1"
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  value="${value//$'\n'/\\n}"
  value="${value//$'\r'/\\r}"
  value="${value//$'\t'/\\t}"
  printf '%s' "$value"
}

url_encode() {
  node -e "console.log(encodeURIComponent(process.argv[1] || ''))" "$1"
}

protect_file_excerpt() {
  local file="$1"
  node - "$file" <<'NODE'
const fs = require("fs");
const file = process.argv[2];
let text = "";
try {
  text = fs.readFileSync(file, "utf8").slice(0, 1200);
} catch {
  process.exit(0);
}
text = text
  .replace(/("(?:accessToken|refreshToken|apiKey|api_key|token|authorization|secret)"\s*:\s*)"[^"]*"/gi, '$1"[redacted]"')
  .replace(/((?:accessToken|refreshToken|apiKey|api_key|token|authorization|secret)=)[^&\s]+/gi, "$1[redacted]");
if (text) {
  console.error(text);
}
NODE
}

require_command() {
  local command_name="$1"
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Missing required command: ${command_name}" >&2
    exit 1
  fi
}

resolve_api_base_url() {
  local value="${PHOTO_WEATHER_API_BASE_URL:-${NEXT_PUBLIC_API_BASE_URL:-}}"
  if [[ -z "$value" ]]; then
    value="$(read_env_value "NEXT_PUBLIC_API_BASE_URL" "$ENV_FILE")"
  fi
  if [[ -z "$value" ]]; then
    value="http://127.0.0.1:4000"
  fi
  printf '%s' "${value%/}"
}

resolve_access_token() {
  local token="${PHOTO_WEATHER_ADMIN_ACCESS_TOKEN:-${ADMIN_ACCESS_TOKEN:-}}"
  if [[ -n "$token" ]]; then
    printf '%s' "$token"
    return
  fi

  local email="${ADMIN_EMAIL:-}"
  local password="${ADMIN_PASSWORD:-}"
  if [[ -z "$email" ]]; then
    email="$(read_env_value "ADMIN_EMAIL" "$ENV_FILE")"
  fi
  if [[ -z "$password" ]]; then
    password="$(read_env_value "ADMIN_PASSWORD" "$ENV_FILE")"
  fi
  if [[ -z "$email" || -z "$password" ]]; then
    echo "Set PHOTO_WEATHER_ADMIN_ACCESS_TOKEN, or set ADMIN_EMAIL and ADMIN_PASSWORD for login." >&2
    exit 1
  fi

  local payload_file response_file status_code
  payload_file="$(mktemp)"
  response_file="$(mktemp)"
  printf '{"email":"%s","password":"%s"}' "$(json_escape "$email")" "$(json_escape "$password")" >"$payload_file"

  status_code="$(
    curl -sS \
      --connect-timeout 10 \
      --max-time 60 \
      -H "Content-Type: application/json" \
      --data-binary "@${payload_file}" \
      -o "$response_file" \
      -w "%{http_code}" \
      "${API_BASE_URL}/auth/login" || true
  )"
  rm -f "$payload_file"

  if [[ ! "$status_code" =~ ^[0-9]{3}$ || "$status_code" -lt 200 || "$status_code" -ge 300 ]]; then
    echo "Admin login failed: HTTP ${status_code}" >&2
    protect_file_excerpt "$response_file"
    rm -f "$response_file"
    exit 1
  fi

  token="$(node - "$response_file" <<'NODE'
const fs = require("fs");
const body = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
process.stdout.write(body.accessToken || "");
NODE
)"
  rm -f "$response_file"
  if [[ -z "$token" ]]; then
    echo "Admin login did not return an access token." >&2
    exit 1
  fi
  printf '%s' "$token"
}

write_location_fields() {
  if [[ -n "${CALIBRATION_SPOT_ID:-}" ]]; then
    printf '  "spotId": "%s",\n' "$(json_escape "$CALIBRATION_SPOT_ID")"
    return
  fi

  if [[ -z "${CALIBRATION_LOCATION_NAME:-}" || -z "${CALIBRATION_LATITUDE_WGS84:-}" || -z "${CALIBRATION_LONGITUDE_WGS84:-}" ]]; then
    echo "Set CALIBRATION_SPOT_ID, or set CALIBRATION_LOCATION_NAME/CALIBRATION_LATITUDE_WGS84/CALIBRATION_LONGITUDE_WGS84." >&2
    exit 1
  fi

  printf '  "locationName": "%s",\n' "$(json_escape "$CALIBRATION_LOCATION_NAME")"
  printf '  "latitudeWgs84": %s,\n' "$CALIBRATION_LATITUDE_WGS84"
  printf '  "longitudeWgs84": %s,\n' "$CALIBRATION_LONGITUDE_WGS84"
  if [[ -n "${CALIBRATION_ELEVATION_METERS:-}" ]]; then
    printf '  "elevationMeters": %s,\n' "$CALIBRATION_ELEVATION_METERS"
  fi
}

write_fetch_payload() {
  local file="$1"
  {
    echo "{"
    write_location_fields
    printf '  "startDate": "%s",\n' "$(json_escape "$CALIBRATION_START_DATE")"
    printf '  "endDate": "%s",\n' "$(json_escape "$CALIBRATION_END_DATE")"
    printf '  "timezone": "%s",\n' "$(json_escape "$CALIBRATION_TIMEZONE")"
    printf '  "sourceProvider": "open_meteo_historical"\n'
    echo "}"
  } >"$file"
}

write_replay_payload() {
  local file="$1"
  local target="$2"
  {
    echo "{"
    write_location_fields
    printf '  "startDate": "%s",\n' "$(json_escape "$CALIBRATION_START_DATE")"
    printf '  "endDate": "%s",\n' "$(json_escape "$CALIBRATION_END_DATE")"
    printf '  "timezone": "%s",\n' "$(json_escape "$CALIBRATION_TIMEZONE")"
    printf '  "target": "%s",\n' "$(json_escape "$target")"
    printf '  "sourceProvider": "open_meteo_historical"\n'
    echo "}"
  } >"$file"
}

write_stats_payload() {
  local file="$1"
  local target="$2"
  {
    echo "{"
    write_location_fields
    printf '  "target": "%s"\n' "$(json_escape "$target")"
    echo "}"
  } >"$file"
}

request_api() {
  local method="$1"
  local path="$2"
  local payload_file="$3"
  local response_file="$4"
  local status_code
  local args=(
    -sS
    --connect-timeout
    10
    --max-time
    180
    -H
    "Authorization: Bearer ${ACCESS_TOKEN}"
    -H
    "Content-Type: application/json"
    -X
    "$method"
    -o
    "$response_file"
    -w
    "%{http_code}"
  )
  if [[ -n "$payload_file" ]]; then
    args+=(--data-binary "@${payload_file}")
  fi
  args+=("${API_BASE_URL}${path}")

  status_code="$(curl "${args[@]}" || true)"
  if [[ ! "$status_code" =~ ^[0-9]{3}$ || "$status_code" -lt 200 || "$status_code" -ge 300 ]]; then
    echo "Request failed: ${method} ${path} HTTP ${status_code}" >&2
    protect_file_excerpt "$response_file"
    exit 1
  fi
}

location_query() {
  if [[ -n "${CALIBRATION_SPOT_ID:-}" ]]; then
    printf 'spotId=%s' "$(url_encode "$CALIBRATION_SPOT_ID")"
    return
  fi

  local location_key="${CALIBRATION_LOCATION_KEY:-}"
  if [[ -z "$location_key" ]]; then
    location_key="$(node -e "const lat=Number(process.argv[1]); const lon=Number(process.argv[2]); console.log('wgs84:'+lat.toFixed(5)+','+lon.toFixed(5));" "$CALIBRATION_LATITUDE_WGS84" "$CALIBRATION_LONGITUDE_WGS84")"
  fi
  printf 'locationKey=%s' "$(url_encode "$location_key")"
}

summarize_fetch() {
  local response_file="$1"
  node - "$response_file" <<'NODE'
const fs = require("fs");
const body = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
console.log(`samples inserted: ${body.insertedCount ?? 0}`);
console.log(`samples skipped as duplicates: ${body.skippedDuplicateCount ?? 0}`);
console.log(`historical sample count returned: ${body.sampleCount ?? 0}`);
NODE
}

summarize_replay() {
  local target="$1"
  local replay_file="$2"
  local results_file="$3"
  local stats_file="$4"
  node - "$target" "$replay_file" "$results_file" "$stats_file" <<'NODE'
const fs = require("fs");
const target = process.argv[2];
const replay = JSON.parse(fs.readFileSync(process.argv[3], "utf8"));
const resultBody = JSON.parse(fs.readFileSync(process.argv[4], "utf8"));
const statsBody = JSON.parse(fs.readFileSync(process.argv[5], "utf8"));
const results = Array.isArray(resultBody.results) ? resultBody.results : [];
const stats = statsBody.stats || {};

console.log(`target: ${target}`);
console.log(`replay run: ${replay.run?.id || "unknown"} status=${replay.run?.status || "unknown"}`);
console.log(`replay results count: ${replay.resultCount ?? results.length}`);
console.log("predicted recommendations:");
for (const result of results.slice(0, 10)) {
  const date = String(result.forecastDate || "").slice(0, 10);
  const score = typeof result.overallScore === "number" ? Math.round(result.overallScore) : "n/a";
  const windowStart = result.bestWindowStart ? String(result.bestWindowStart).slice(11, 16) : "none";
  const windowEnd = result.bestWindowEnd ? String(result.bestWindowEnd).slice(11, 16) : "none";
  console.log(`- ${date} score=${score} label=${result.recommendationLabel || "n/a"} window=${windowStart}-${windowEnd}`);
}
if (typeof stats.sampleCount === "number" && stats.sampleCount > 0) {
  console.log(
    `calibration stats: samples=${stats.sampleCount} hitRate=${Math.round((stats.hitRate || 0) * 100)}% falsePositive=${Math.round((stats.falsePositiveRate || 0) * 100)}% falseNegative=${Math.round((stats.falseNegativeRate || 0) * 100)}%`,
  );
} else {
  console.log("calibration stats: no observed labels yet");
}
NODE
}

require_command curl
require_command node

API_BASE_URL="$(resolve_api_base_url)"
CALIBRATION_SPOT_ID="${CALIBRATION_SPOT_ID:-spot-guangmingding}"
CALIBRATION_START_DATE="${CALIBRATION_START_DATE:-2026-05-01}"
CALIBRATION_END_DATE="${CALIBRATION_END_DATE:-2026-05-07}"
CALIBRATION_TIMEZONE="${CALIBRATION_TIMEZONE:-Asia/Shanghai}"
CALIBRATION_TARGETS="${CALIBRATION_TARGETS:-general cloud_sea}"
ACCESS_TOKEN="$(resolve_access_token)"

echo "Historical calibration smoke test"
echo "Endpoint: ${API_BASE_URL}"
echo "Date range: ${CALIBRATION_START_DATE} to ${CALIBRATION_END_DATE}"
echo "Targets: ${CALIBRATION_TARGETS}"
echo "No API keys or secrets will be printed."

fetch_payload="$(mktemp)"
fetch_response="$(mktemp)"
write_fetch_payload "$fetch_payload"
request_api "POST" "/admin/calibration/fetch-history" "$fetch_payload" "$fetch_response"
summarize_fetch "$fetch_response"
rm -f "$fetch_payload" "$fetch_response"

query="$(location_query)"
for target in ${CALIBRATION_TARGETS}; do
  replay_payload="$(mktemp)"
  replay_response="$(mktemp)"
  results_response="$(mktemp)"
  stats_payload="$(mktemp)"
  stats_response="$(mktemp)"

  echo
  write_replay_payload "$replay_payload" "$target"
  request_api "POST" "/admin/calibration/replay" "$replay_payload" "$replay_response"
  request_api "GET" "/admin/calibration/replay-results?${query}&target=$(url_encode "$target")&limit=20" "" "$results_response"
  write_stats_payload "$stats_payload" "$target"
  request_api "POST" "/admin/calibration/stats/rebuild" "$stats_payload" "$stats_response"
  summarize_replay "$target" "$replay_response" "$results_response" "$stats_response"

  rm -f "$replay_payload" "$replay_response" "$results_response" "$stats_payload" "$stats_response"
done
