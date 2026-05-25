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

API_BASE_URL="${PHOTO_WEATHER_API_BASE_URL:-${NEXT_PUBLIC_API_BASE_URL:-}}"
if [[ -z "$API_BASE_URL" ]]; then
  API_BASE_URL="$(read_env_value "NEXT_PUBLIC_API_BASE_URL" "$ENV_FILE")"
fi
if [[ -z "$API_BASE_URL" ]]; then
  API_BASE_URL="http://127.0.0.1:4000"
fi
API_BASE_URL="${API_BASE_URL%/}"

FORECAST_HORIZON="${FORECAST_HORIZON:-48h}"
FORECAST_TARGETS="${FORECAST_TARGETS:-general cloud_sea glow astro}"

payload_for_location() {
  case "$1" in
    huangshan)
      cat <<JSON
{
  "name": "黄山光明顶",
  "source": "local_photo_spot",
  "latitudeGcj02": 30.13254,
  "longitudeGcj02": 118.16876,
  "latitudeWgs84": 30.13012,
  "longitudeWgs84": 118.16389,
  "elevationMeters": 1860,
  "horizon": "${FORECAST_HORIZON}",
  "target": "__TARGET__",
  "photoSpotId": "spot-guangmingding"
}
JSON
      ;;
    laojunshan)
      cat <<JSON
{
  "name": "老君山金顶",
  "source": "local_photo_spot",
  "latitudeGcj02": 33.7867,
  "longitudeGcj02": 111.6462,
  "latitudeWgs84": 33.7852,
  "longitudeWgs84": 111.6402,
  "elevationMeters": 2217,
  "horizon": "${FORECAST_HORIZON}",
  "target": "__TARGET__",
  "photoSpotId": "spot-laojunshan-jinding"
}
JSON
      ;;
    *)
      echo "Unknown location: $1" >&2
      return 1
      ;;
  esac
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

print_result_summary() {
  local response_file="$1"
  local payload_file="$2"
  if ! command -v node >/dev/null 2>&1; then
    echo "Install node to print the normalized forecast summary." >&2
    return 1
  fi

  node - "$response_file" "$payload_file" <<'NODE'
const fs = require("fs");
const result = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const payload = JSON.parse(fs.readFileSync(process.argv[3], "utf8"));

function value(input, fallback = "暂无") {
  return input === undefined || input === null || input === "" ? fallback : input;
}

function percent(input) {
  return typeof input === "number" ? `${Math.round(input)}%` : "暂无";
}

function number(input, suffix = "") {
  return typeof input === "number" ? `${Math.round(input * 10) / 10}${suffix}` : "暂无";
}

const current = result.currentWeather || {};
const hourly = Array.isArray(result.weatherTimeline) ? result.weatherTimeline[0] : undefined;
const fusion = result.weatherFusionSummary || {};
const clothing = result.clothingGuide || {};
const sources = Array.isArray(result.weatherSourceSummaries) ? result.weatherSourceSummaries : [];
const runtimeSnapshot = Array.isArray(result.weatherProviderRuntimeSnapshot) ? result.weatherProviderRuntimeSnapshot : [];
const meteoblue = sources.find((source) => source.providerCode === "meteoblue") || {};

console.log(`selectedLocation: ${payload.name} (${payload.source}) WGS84=${payload.latitudeWgs84},${payload.longitudeWgs84} elevation=${value(payload.elevationMeters)}`);
console.log(`target: ${payload.target} horizon=${payload.horizon}`);
console.log(`dataStatusZh: ${value(fusion.dataStatusZh || result.weatherNoticeZh || result.dataNotice)}`);
console.log(`dataConfidence: ${value(fusion.confidenceLevel)}`);
console.log(`meteoblueAttempted: ${value(meteoblue.attempted)}`);
console.log(`meteoblueSuccess: ${value(meteoblue.success)}`);
console.log(`meteoblueErrorCategory: ${value(meteoblue.errorCategory)}`);
console.log(`meteoblueMessageZh: ${value(meteoblue.messageZh || meteoblue.warningZh)}`);
console.log(`meteoblueValuesExtracted: ${Array.isArray(meteoblue.availableFields) && meteoblue.availableFields.length > 0}`);
console.log(`meteoblueAvailableFields: ${Array.isArray(meteoblue.availableFields) ? meteoblue.availableFields.join(",") || "暂无" : "暂无"}`);
console.log(`meteoblueMissingFields: ${Array.isArray(meteoblue.missingFields) ? meteoblue.missingFields.join(",") || "无" : "暂无"}`);
console.log(`cacheHit: ${sources.some((source) => source.cacheHit === true)}`);
console.log("providerRuntimeSnapshot:");
for (const provider of runtimeSnapshot) {
  const fields = [
    `code=${value(provider.providerCode)}`,
    `enabled=${value(provider.enabled)}`,
    `real=${value(provider.realCallEnabled)}`,
    `apiKeyPresent=${value(provider.apiKeyPresent)}`,
    provider.host ? `host=${provider.host}` : "",
    provider.baseUrl ? `baseUrl=${provider.baseUrl}` : "",
    provider.endpoint ? `endpoint=${provider.endpoint}` : "",
    Array.isArray(provider.packages) ? `packages=${provider.packages.join(",")}` : "",
    provider.configUpdatedAt ? `updatedAt=${provider.configUpdatedAt}` : "",
  ].filter(Boolean).join(" ");
  console.log(`- ${fields}`);
}
console.log("sourceSummaries:");
for (const source of sources) {
  const status = [
    `code=${value(source.providerCode)}`,
    `enabled=${value(source.enabled)}`,
    `real=${value(source.realCallEnabled)}`,
    `attempted=${value(source.attempted)}`,
    `success=${value(source.success)}`,
    `status=${value(source.status)}`,
    source.statusCode ? `http=${source.statusCode}` : "",
    source.latencyMs ? `${Math.round(source.latencyMs)}ms` : "",
    source.cacheHit === true ? "cacheHit=true" : "",
    source.errorCategory ? `error=${source.errorCategory}` : "",
  ].filter(Boolean).join(" ");
  console.log(`- ${value(source.providerLabelZh)} ${status} message=${value(source.messageZh || source.warningZh)}`);
}
console.log(`temperature: current=${number(current.temperature, "°C")} feelsLike=${number(current.feelsLike, "°C")}`);
console.log(`wind: speed=${number(current.windSpeed, "m/s")} gust=${number(current.windGust, "m/s")} direction=${value(current.windDirection)}`);
console.log(`humidity: ${percent(current.humidity)} visibility=${number(current.visibility, "km")}`);
console.log(`cloud current: total=${percent(current.cloudTotal)} low=${percent(current.cloudLow)} mid=${percent(current.cloudMid)} high=${percent(current.cloudHigh)}`);
if (hourly) {
  console.log(`cloud firstHour: total=${percent(hourly.cloudTotal)} low=${percent(hourly.cloudLow)} mid=${percent(hourly.cloudMid)} high=${percent(hourly.cloudHigh)}`);
}
console.log(`clothingGuide: ${value(clothing.titleZh)} / ${value(clothing.summaryZh)}`);
console.log(`clothingLayers: ${(clothing.layers || []).join("、") || "暂无"}`);
console.log(`confidenceByTarget: ${JSON.stringify(fusion.confidenceByTarget || {})}`);
const providerErrors = sources.filter((source) => source.success === false || source.status === "failed" || source.status === "skipped");
console.log("providerErrors:");
for (const source of providerErrors) {
  console.log(`- ${value(source.providerLabelZh)} ${value(source.errorCategory)} ${value(source.messageZh || source.warningZh)}`);
}
NODE
}

echo "Real weather smoke tests"
echo "Endpoint: ${API_BASE_URL}/forecast/calculate"
echo "Locations: 黄山光明顶, 老君山金顶"
echo "Targets: ${FORECAST_TARGETS}"
echo "No API keys or secrets will be printed."

for location in huangshan laojunshan; do
  for target in ${FORECAST_TARGETS}; do
    payload_file="$(mktemp)"
    response_file="$(mktemp)"
    payload_for_location "$location" | sed "s/__TARGET__/${target}/g" >"$payload_file"

    echo
    echo "== ${location} / ${target} =="
    http_status="$(
      curl -sS \
        --connect-timeout 10 \
        --max-time 120 \
        -H "Content-Type: application/json" \
        -X POST \
        --data-binary "@${payload_file}" \
        -o "$response_file" \
        -w "%{http_code}" \
        "${API_BASE_URL}/forecast/calculate"
    )"

    if [[ "$http_status" -lt 200 || "$http_status" -ge 300 ]]; then
      echo "Forecast request failed: HTTP ${http_status}" >&2
      protect_file_excerpt "$response_file"
      rm -f "$payload_file" "$response_file"
      exit 1
    fi

    print_result_summary "$response_file" "$payload_file"
    rm -f "$payload_file" "$response_file"
  done
done
