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

FORECAST_TARGET="${FORECAST_TARGET:-astro}"
FORECAST_HORIZON="${FORECAST_HORIZON:-48h}"
PAYLOAD_FILE="$(mktemp)"
RESPONSE_FILE="$(mktemp)"
trap 'rm -f "$PAYLOAD_FILE" "$RESPONSE_FILE"' EXIT

cat >"$PAYLOAD_FILE" <<JSON
{
  "name": "黄山光明顶",
  "source": "local_photo_spot",
  "latitudeGcj02": 30.13254,
  "longitudeGcj02": 118.16876,
  "latitudeWgs84": 30.13012,
  "longitudeWgs84": 118.16389,
  "elevationMeters": 1860,
  "horizon": "${FORECAST_HORIZON}",
  "target": "${FORECAST_TARGET}",
  "photoSpotId": "spot-guangmingding"
}
JSON

echo "Real forecast smoke test: 黄山光明顶 ${FORECAST_TARGET} ${FORECAST_HORIZON}"
echo "Endpoint: ${API_BASE_URL}/forecast/calculate"
echo "No API keys or secrets will be printed."

HTTP_STATUS="$(
  curl -sS \
    --connect-timeout 10 \
    --max-time 90 \
    -H "Content-Type: application/json" \
    -X POST \
    --data-binary "@${PAYLOAD_FILE}" \
    -o "$RESPONSE_FILE" \
    -w "%{http_code}" \
    "${API_BASE_URL}/forecast/calculate"
)"

if [[ "$HTTP_STATUS" -lt 200 || "$HTTP_STATUS" -ge 300 ]]; then
  echo "Forecast request failed: HTTP ${HTTP_STATUS}" >&2
  if command -v python3 >/dev/null 2>&1; then
    python3 - "$RESPONSE_FILE" <<'PY'
import re
import sys
from pathlib import Path

text = Path(sys.argv[1]).read_text(encoding="utf-8", errors="replace")[:800]
text = re.sub(r'(?i)(apiKey|api_key|token|authorization|secret)(["\s:=]+)([^&\s,}"]+)', r'\1\2[redacted]', text)
text = re.sub(r'(?i)(apikey|key|token)=([^&\s]+)', r'\1=[redacted]', text)
if text:
    print(text)
PY
  fi
  exit 1
fi

if command -v node >/dev/null 2>&1; then
  node - "$RESPONSE_FILE" <<'NODE'
const fs = require("fs");
const result = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));

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

console.log(`dataStatusZh: ${value(fusion.dataStatusZh || result.weatherNoticeZh || result.dataNotice)}`);
console.log("sourceSummaries:");
for (const source of sources) {
  const warning = source.warningZh ? ` warning=${source.warningZh}` : "";
  console.log(
    `- ${value(source.providerLabelZh)} code=${value(source.providerCode)} mode=${value(source.dataMode)} status=${value(source.status)}${warning}`,
  );
}
console.log(
  `temperature: ${number(current.temperature, "°C")} feelsLike=${number(current.feelsLike, "°C")} humidity=${percent(current.humidity)} text=${value(current.weatherTextZh)}`,
);
console.log(
  `wind: speed=${number(current.windSpeed, "m/s")} gust=${number(current.windGust, "m/s")} direction=${value(current.windDirection)}`,
);
console.log(
  `visibility: ${number(current.visibility, "km")} precipitationProbability=${percent(current.precipitationProbability)}`,
);
console.log(
  `cloud fields current: total=${percent(current.cloudTotal)} low=${percent(current.cloudLow)} mid=${percent(current.cloudMid)} high=${percent(current.cloudHigh)}`,
);
if (hourly) {
  console.log(
    `cloud fields firstHour: total=${percent(hourly.cloudTotal)} low=${percent(hourly.cloudLow)} mid=${percent(hourly.cloudMid)} high=${percent(hourly.cloudHigh)}`,
  );
}
console.log(`clothing guide: ${value(clothing.titleZh)} / ${value(clothing.summaryZh)}`);
console.log(`clothing layers: ${(clothing.layers || []).join("、") || "暂无"}`);
console.log(`clothing accessories: ${(clothing.accessories || []).join("、") || "暂无"}`);
console.log(`confidence: ${value(fusion.confidenceLevel)} conflict=${value(fusion.conflictStatusZh)}`);
NODE
elif command -v python3 >/dev/null 2>&1; then
  python3 - "$RESPONSE_FILE" <<'PY'
import json
import sys
from pathlib import Path

result = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
current = result.get("currentWeather") or {}
hourly = (result.get("weatherTimeline") or [None])[0] or {}
fusion = result.get("weatherFusionSummary") or {}
clothing = result.get("clothingGuide") or {}
sources = result.get("weatherSourceSummaries") or []

def value(input_value, fallback="暂无"):
    return fallback if input_value is None or input_value == "" else input_value

def percent(input_value):
    return f"{round(input_value)}%" if isinstance(input_value, (int, float)) else "暂无"

def number(input_value, suffix=""):
    return f"{round(input_value, 1)}{suffix}" if isinstance(input_value, (int, float)) else "暂无"

print(f"dataStatusZh: {value(fusion.get('dataStatusZh') or result.get('weatherNoticeZh') or result.get('dataNotice'))}")
print("sourceSummaries:")
for source in sources:
    warning = f" warning={source.get('warningZh')}" if source.get("warningZh") else ""
    print(
        f"- {value(source.get('providerLabelZh'))} code={value(source.get('providerCode'))} "
        f"mode={value(source.get('dataMode'))} status={value(source.get('status'))}{warning}"
    )
print(
    f"temperature: {number(current.get('temperature'), '°C')} feelsLike={number(current.get('feelsLike'), '°C')} "
    f"humidity={percent(current.get('humidity'))} text={value(current.get('weatherTextZh'))}"
)
print(
    f"wind: speed={number(current.get('windSpeed'), 'm/s')} gust={number(current.get('windGust'), 'm/s')} "
    f"direction={value(current.get('windDirection'))}"
)
print(
    f"visibility: {number(current.get('visibility'), 'km')} "
    f"precipitationProbability={percent(current.get('precipitationProbability'))}"
)
print(
    f"cloud fields current: total={percent(current.get('cloudTotal'))} low={percent(current.get('cloudLow'))} "
    f"mid={percent(current.get('cloudMid'))} high={percent(current.get('cloudHigh'))}"
)
if hourly:
    print(
        f"cloud fields firstHour: total={percent(hourly.get('cloudTotal'))} low={percent(hourly.get('cloudLow'))} "
        f"mid={percent(hourly.get('cloudMid'))} high={percent(hourly.get('cloudHigh'))}"
    )
print(f"clothing guide: {value(clothing.get('titleZh'))} / {value(clothing.get('summaryZh'))}")
print(f"clothing layers: {'、'.join(clothing.get('layers') or []) or '暂无'}")
print(f"clothing accessories: {'、'.join(clothing.get('accessories') or []) or '暂无'}")
print(f"confidence: {value(fusion.get('confidenceLevel'))} conflict={value(fusion.get('conflictStatusZh'))}")
PY
else
  echo "Install node or python3 to print the normalized forecast summary." >&2
  exit 1
fi
