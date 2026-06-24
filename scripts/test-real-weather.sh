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
FORECAST_LOCATIONS="${FORECAST_LOCATIONS:-huangshan nonseeded}"

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
    nonseeded)
      cat <<JSON
{
  "name": "非种子坐标测试点",
  "source": "amap",
  "latitudeGcj02": 30.2495,
  "longitudeGcj02": 120.1124,
  "latitudeWgs84": 30.2528,
  "longitudeWgs84": 120.1078,
  "horizon": "${FORECAST_HORIZON}",
  "target": "__TARGET__"
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
const terrainProfile = result.terrainAnalysis?.terrainProfile || {};

function value(input, fallback = "暂无") {
  return input === undefined || input === null || input === "" ? fallback : input;
}

function percent(input) {
  return typeof input === "number" ? `${Math.round(input)}%` : "暂无";
}

function number(input, suffix = "") {
  return typeof input === "number" ? `${Math.round(input * 10) / 10}${suffix}` : "暂无";
}

function dateTimeParts(input, timezone) {
  const timestamp = Date.parse(input);
  if (!Number.isFinite(timestamp)) {
    return undefined;
  }
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: timezone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    hourCycle: "h23",
  }).formatToParts(new Date(timestamp));
  const pick = (type) => parts.find((part) => part.type === type)?.value;
  return {
    year: Number(pick("year")),
    month: Number(pick("month")),
    day: Number(pick("day")),
    hour: pick("hour"),
    minute: pick("minute"),
  };
}

function dateLabel(parts, style = "full") {
  return style === "compact"
    ? `${parts.month}月${parts.day}日`
    : `${parts.year}年${parts.month}月${parts.day}日`;
}

function formatWindowLabel(window, timezone, style = "full") {
  const start = dateTimeParts(window.startTime || window.start, timezone);
  const end = dateTimeParts(window.endTime || window.end, timezone);
  if (!start || !end || !start.hour || !end.hour) {
    return "暂无明确窗口";
  }
  const sameDay = start.year === end.year && start.month === end.month && start.day === end.day;
  const startClock = `${start.hour}:${start.minute}`;
  const endClock = `${end.hour}:${end.minute}`;
  if (sameDay) {
    return `${dateLabel(start, style)} ${startClock}–${endClock}`;
  }
  const endDate =
    start.year === end.year && style === "full"
      ? `${end.month}月${end.day}日`
      : dateLabel(end, start.year === end.year ? "compact" : "full");
  return `${dateLabel(start, style)} ${startClock} – ${endDate} ${endClock}`;
}

function formatArrivalLabel(input, timezone) {
  const parts = dateTimeParts(input, timezone);
  return parts && parts.hour
    ? `建议到达：${dateLabel(parts)} ${parts.hour}:${parts.minute} 前`
    : "暂无明确到达时间";
}

const current = result.currentWeather || {};
const dailySummaries = Array.isArray(result.dailySummaries) ? result.dailySummaries : [];
const firstDailySummary = dailySummaries[0] || {};
const firstDaily = firstDailySummary.weather || {};
const bestWindows = Array.isArray(result.bestWindows) ? result.bestWindows : [];
const firstWindow = bestWindows[0] || {};
const firstArrival = firstWindow.arrivalAdvice || {};
const fusion = result.weatherFusionSummary || {};
const agreement = fusion.multiSourceAgreementContext || {};
const agreementFields = Array.isArray(agreement.fieldDisagreements) ? agreement.fieldDisagreements : [];
const clothing = result.clothingGuide || {};
const sources = Array.isArray(result.weatherSourceSummaries) ? result.weatherSourceSummaries : [];
const runtimeSnapshot = Array.isArray(result.weatherProviderRuntimeSnapshot) ? result.weatherProviderRuntimeSnapshot : [];
const meteoblue = sources.find((source) => source.providerCode === "meteoblue") || {};

function firstNumber(...inputs) {
  return inputs.find((input) => typeof input === "number" && Number.isFinite(input));
}

function firstValue(...inputs) {
  return inputs.find((input) => input !== undefined && input !== null && input !== "");
}

function gradeZh(input) {
  return {
    excellent: "优秀",
    good: "较好",
    fair: "一般",
    poor: "较差",
  }[input] || value(input);
}

function probabilityText(input) {
  return typeof input === "number" && Number.isFinite(input) ? `${Math.round(input)}%` : "暂无";
}

function precipitationAmount(input) {
  return firstNumber(input.precipitationAmountMm, input.precipitation, input.rainAmountMm, input.snowAmountMm);
}

function disagreementRank(level) {
  return { high: 4, medium: 3, low: 2, unknown: 1, none: 0 }[level] || 0;
}

function fieldDisagreementSummary(...fields) {
  const item = agreementFields
    .filter((entry) => fields.includes(entry.field))
    .sort((left, right) => disagreementRank(right.level) - disagreementRank(left.level))[0];
  if (!item) {
    return "none";
  }
  const range = typeof item.range === "number" ? ` range=${item.range}${item.unit ? ` ${item.unit}` : ""}` : "";
  const sources = typeof item.sourcesAvailable === "number" ? ` sources=${item.sourcesAvailable}` : "";
  const message = item.messageZh ? ` message=${item.messageZh}` : "";
  return `level=${value(item.level)}${range}${sources}${message}`;
}

function sourceLine(source) {
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
    Array.isArray(source.extractedFields) ? `fields=${source.extractedFields.join(",")}` : "",
    Array.isArray(source.missingFields) ? `missing=${source.missingFields.join(",")}` : "",
    typeof source.providerElevationMeters === "number" ? `providerElevationMeters=${source.providerElevationMeters}` : "",
    typeof source.selectedSpotElevationMeters === "number" ? `selectedSpotElevationMeters=${source.selectedSpotElevationMeters}` : "",
    typeof source.elevationDifferenceMeters === "number" ? `elevationDifferenceMeters=${source.elevationDifferenceMeters}` : "",
    typeof source.terrainAdjustmentApplied === "boolean" ? `terrainAdjustmentApplied=${source.terrainAdjustmentApplied}` : "",
    source.terrainAdjustmentReason ? `terrainAdjustmentReason=${source.terrainAdjustmentReason}` : "",
  ].filter(Boolean).join(" ");
  return `- ${value(source.providerLabelZh)} ${status} message=${value(source.messageZh || source.warningZh)}`;
}

console.log(`locationName: ${value(result.place?.name || payload.name)}`);
console.log(`latitudeWgs84: ${value(result.calendarBasis?.wgs84Coordinates?.latitude ?? payload.latitudeWgs84)}`);
console.log(`longitudeWgs84: ${value(result.calendarBasis?.wgs84Coordinates?.longitude ?? payload.longitudeWgs84)}`);
console.log(`elevationMeters: ${value(terrainProfile.elevationMeters ?? terrainProfile.locationElevation)}`);
console.log(`elevationSource: ${value(terrainProfile.elevationSource)}`);
console.log(`elevationConfidence: ${value(terrainProfile.elevationConfidence)}`);
console.log(`terrainProfile: ${JSON.stringify({
  terrainType: terrainProfile.terrainType,
  exposureType: terrainProfile.exposureType,
  elevationMeters: terrainProfile.elevationMeters ?? terrainProfile.locationElevation ?? null,
  elevationSource: terrainProfile.elevationSource ?? "unknown",
  elevationConfidence: terrainProfile.elevationConfidence ?? "low",
  nearbyValleyElevationMeters: terrainProfile.nearbyValleyElevationMeters ?? null,
  localReliefMeters: terrainProfile.localReliefMeters ?? null,
  elevationDiff5km: terrainProfile.elevationDiff5km ?? null,
})}`);
console.log(`selectedLocation: ${payload.name} (${payload.source}) WGS84=${payload.latitudeWgs84},${payload.longitudeWgs84} payloadElevation=${value(payload.elevationMeters)}`);
console.log(`target: ${payload.target} horizon=${payload.horizon}`);
console.log(`dataStatusZh: ${value(fusion.dataStatusZh || result.weatherNoticeZh || result.dataNotice)}`);
console.log(`dataConfidence: ${value(fusion.confidenceLevel)}`);
console.log(`agreementLevel: ${value(agreement.agreementLevel)}`);
console.log(`disagreementLevel: ${value(agreement.disagreementLevel)}`);
console.log(`cloudTotalDisagreement: ${fieldDisagreementSummary("cloudTotal")}`);
console.log(`cloudLowDisagreement: ${fieldDisagreementSummary("cloudLow")}`);
console.log(`cloudMidHighDisagreement: ${fieldDisagreementSummary("cloudMid", "cloudHigh")}`);
console.log(`precipitationDisagreement: ${fieldDisagreementSummary("precipitationAmountMm", "precipitationProbability")}`);
console.log(`temperatureDisagreement: ${fieldDisagreementSummary("temperature")}`);
console.log(`agreementUserSummaryZh: ${value(agreement.userSummaryZh)}`);
console.log(`agreementShouldLowerConfidence: ${value(agreement.shouldLowerConfidence)}`);
console.log(`meteoblueAttempted: ${value(meteoblue.attempted)}`);
console.log(`meteoblueSuccess: ${value(meteoblue.success)}`);
console.log(`meteobluePartial: ${value(meteoblue.partial)}`);
console.log(`meteoblueStatusCode: ${value(meteoblue.statusCode)}`);
console.log(`meteoblueTopLevelKeys: ${Array.isArray(meteoblue.topLevelKeys) ? meteoblue.topLevelKeys.join(",") || "暂无" : "暂无"}`);
console.log(`meteobluePackages: ${Array.isArray(meteoblue.packages) ? meteoblue.packages.join(",") || "暂无" : "暂无"}`);
console.log(`meteoblueErrorCategory: ${value(meteoblue.errorCategory)}`);
console.log(`meteoblueMessageZh: ${value(meteoblue.messageZh || meteoblue.warningZh)}`);
console.log(`meteoblueValuesExtracted: ${Array.isArray(meteoblue.extractedFields) ? meteoblue.extractedFields.length > 0 : Array.isArray(meteoblue.availableFields) && meteoblue.availableFields.length > 0}`);
console.log(`meteoblueExtractedFields: ${Array.isArray(meteoblue.extractedFields) ? meteoblue.extractedFields.join(",") || "暂无" : Array.isArray(meteoblue.availableFields) ? meteoblue.availableFields.join(",") || "暂无" : "暂无"}`);
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
  console.log(sourceLine(source));
}
const tempAdjustment = current.temperatureAdjustment || firstDaily.temperatureAdjustment || {};
const rawTemp = firstNumber(current.rawTemperature, current.temperature, firstDaily.rawTempMin);
const adjustedTemp = firstNumber(current.elevationAdjustedTemperature, current.temperature, firstDaily.elevationAdjustedTempMin);
const rawDailyMin = firstNumber(firstDaily.rawTempMin, firstDaily.tempMin);
const rawDailyMax = firstNumber(firstDaily.rawTempMax, firstDaily.tempMax);
const correctedDailyMin = firstNumber(firstDaily.elevationAdjustedTempMin, firstDaily.tempMin);
const correctedDailyMax = firstNumber(firstDaily.elevationAdjustedTempMax, firstDaily.tempMax);
const precipAmount = precipitationAmount(current) ?? precipitationAmount(firstDaily);
const precipProbability = firstValue(current.precipitationProbability, firstDaily.precipitationProbability);
const precipRisk = current.precipitationRisk || firstDaily.precipitationRisk || firstWindow.precipitationRisk || {};
const rawVisibility = firstNumber(current.rawVisibilityKm, current.visibility, firstDaily.rawVisibilityKm, firstDaily.visibility);
const transparencyScore = firstNumber(current.photographyTransparencyScore, firstDaily.photographyTransparencyScore);
const transparencyGrade = firstValue(current.transparencyGrade, firstDaily.transparencyGrade);
const astroAnalysis = result.astroAnalysis || {};
const astroAssessment = astroAnalysis.assessment || {};
const astroBlockers = Array.isArray(astroAnalysis.weatherBlockers) ? astroAnalysis.weatherBlockers : [];
const timezone = result.calendarBasis?.timezone || "Asia/Shanghai";
const cloudSeaAnalysis = result.cloudSeaAnalysis || {};
const bestCloudSeaWindow =
  cloudSeaAnalysis.bestCloudSeaWindow ||
  (Array.isArray(cloudSeaAnalysis.bestCloudSeaWindows) ? cloudSeaAnalysis.bestCloudSeaWindows[0] : undefined) ||
  {};
const watchableCloudSeaWindows = Array.isArray(cloudSeaAnalysis.watchableCloudSeaWindows)
  ? cloudSeaAnalysis.watchableCloudSeaWindows
  : [];
const terrainSupport = cloudSeaAnalysis.terrainSupport || {};
const rainOpening = cloudSeaAnalysis.rainOpening || {};
const cloudSeaReasons = [
  ...(Array.isArray(cloudSeaAnalysis.opportunityReasons) ? cloudSeaAnalysis.opportunityReasons : []),
  ...(Array.isArray(cloudSeaAnalysis.whiteoutReasons) ? cloudSeaAnalysis.whiteoutReasons : []),
];
const glowAnalysis = result.glowAnalysis || {};
const bestGlowWindow =
  glowAnalysis.bestGlowWindow ||
  (Array.isArray(glowAnalysis.bestGlowWindows) ? glowAnalysis.bestGlowWindows[0] : undefined) ||
  {};
const glowReasons = [
  ...(Array.isArray(glowAnalysis.opportunityReasons) ? glowAnalysis.opportunityReasons : []),
  ...(Array.isArray(glowAnalysis.riskReasons) ? glowAnalysis.riskReasons : []),
];
console.log(`rawTemperature: ${number(rawTemp, "°C")}`);
console.log(`elevationAdjustedTemperature: ${number(adjustedTemp, "°C")}`);
console.log(`rawProviderDailyTemperature: min=${number(rawDailyMin, "°C")} max=${number(rawDailyMax, "°C")}`);
console.log(`correctedDailyTemperature: min=${number(correctedDailyMin, "°C")} max=${number(correctedDailyMax, "°C")}`);
console.log(`providerElevationMeters: ${number(firstNumber(tempAdjustment.providerElevationMeters, current.providerElevationMeters, firstDaily.providerElevationMeters), "m")}`);
console.log(`selectedSpotElevationMeters: ${number(firstNumber(tempAdjustment.selectedSpotElevationMeters, payload.elevationMeters), "m")}`);
console.log(`providerElevationKnown: ${value(tempAdjustment.providerElevationKnown)}`);
console.log(`temperatureCorrectionApplied: ${value(tempAdjustment.correctionApplied)}`);
console.log(`temperatureCorrectionReason: ${value(tempAdjustment.correctionReason)}`);
console.log(`temperatureCorrectionMeters: ${number(tempAdjustment.correctionMeters, "m")}`);
console.log(`temperatureCorrectionCelsius: ${number(tempAdjustment.correctionCelsius, "°C")}`);
console.log(`dayCorrectionRatio: ${value(tempAdjustment.dayCorrectionRatio)}`);
console.log(`nightCorrectionRatio: ${value(tempAdjustment.nightCorrectionRatio)}`);
console.log(`correctedTemperature: ${number(adjustedTemp, "°C")}`);
console.log(`feelsLike: ${number(current.feelsLike, "°C")}`);
console.log(`mountainFeelsLikeC: ${number(firstNumber(current.mountainFeelsLikeC, firstDaily.mountainFeelsLikeC), "°C")}`);
console.log(`precipitationProbability: ${probabilityText(precipProbability)}`);
console.log(`precipitationAmount: ${number(precipAmount, "mm")} type=${value(current.precipitationType || firstDaily.precipitationType)}`);
console.log(`precipitationRisk: level=${value(precipRisk.rainRiskLevel)} label=${value(precipRisk.rainRiskLabelZh)} amount=${number(precipRisk.precipitationAmountMm, "mm")} probability=${probabilityText(precipRisk.precipitationProbabilityPercent)}`);
console.log(`precipitationAffectedWindows: ${Array.isArray(precipRisk.affectedWindows) ? precipRisk.affectedWindows.join(",") || "无" : "暂无"}`);
console.log(`precipitationRecommendation: ${value(precipRisk.recommendationZh)}`);
console.log(`rainAmount: ${number(firstNumber(current.rainAmountMm, firstDaily.rainAmountMm), "mm")}`);
console.log(`snowAmount: ${number(firstNumber(current.snowAmountMm, firstDaily.snowAmountMm), "mm")}`);
console.log(`wind: speed=${number(current.windSpeed, "m/s")} gust=${number(current.windGust, "m/s")} direction=${value(current.windDirection)} ridgeRisk=${value(current.exposedRidgeWindRisk || firstDaily.exposedRidgeWindRisk)} tripodStabilityRisk=${value(current.tripodStabilityRisk || firstDaily.tripodStabilityRisk)}`);
console.log(`windChillNoteZh: ${value(current.windChillNoteZh || firstDaily.windChillNoteZh)}`);
console.log(`clothingRiskNoteZh: ${value(current.clothingRiskNoteZh || firstDaily.clothingRiskNoteZh)}`);
console.log(`rawVisibility: ${number(rawVisibility, "km")} transparencyGrade=${gradeZh(transparencyGrade)} transparencyScore=${number(transparencyScore)}`);
console.log(`humidity: ${percent(current.humidity)} dewPointSpread=${number(firstNumber(current.dewPointSpread, firstDaily.dewPointSpread), "°C")}`);
console.log(`cloud: total=${percent(firstNumber(current.cloudTotal, firstDaily.cloudTotal))} low=${percent(firstNumber(current.cloudLow, firstDaily.cloudLow))} mid=${percent(firstNumber(current.cloudMid, firstDaily.cloudMid))} high=${percent(firstNumber(current.cloudHigh, firstDaily.cloudHigh))}`);
console.log(`cloudSeaChance: ${number(result.scores?.cloudSea?.score)} whiteoutRisk=${number(result.scores?.whiteoutRisk?.score)} cloudFogRisk=${value(current.cloudFogObstructionRisk || firstDaily.cloudFogObstructionRisk)}`);
console.log(`cloudSeaFormationScore: ${number(cloudSeaAnalysis.formationScore ?? cloudSeaAnalysis.cloudSeaOpportunityScore)}`);
console.log(`cloudSeaShootableScore: ${number(cloudSeaAnalysis.shootableScore ?? cloudSeaAnalysis.travelScore)}`);
console.log(`whiteoutRiskScore: ${number(cloudSeaAnalysis.whiteoutRiskScore ?? result.scores?.whiteoutRisk?.score)}`);
console.log(`lightAlignedScore: ${number(cloudSeaAnalysis.lightAlignedScore)}`);
console.log(`bestCloudSeaWindow: ${bestCloudSeaWindow.startTime && bestCloudSeaWindow.endTime ? formatWindowLabel(bestCloudSeaWindow, timezone) : "暂无明确窗口"} label=${value(bestCloudSeaWindow.label)} score=${number(bestCloudSeaWindow.score)} formation=${number(bestCloudSeaWindow.formationScore)} shootable=${number(bestCloudSeaWindow.shootableScore)} whiteout=${number(bestCloudSeaWindow.whiteoutRiskScore)}`);
console.log(`watchableCloudSeaWindows: ${watchableCloudSeaWindows.map((window) => `${formatWindowLabel(window, timezone)} score=${number(window.score)} risk=${value(window.riskTag)}`).join(" | ") || "none"}`);
console.log(`terrainSupport: level=${value(terrainSupport.level)} score=${number(terrainSupport.score)} selected=${number(terrainSupport.selectedSpotElevationMeters, "m")} valley=${number(terrainSupport.nearbyValleyElevationMeters, "m")} relief=${number(terrainSupport.localReliefMeters, "m")} providerElevation=${number(terrainSupport.providerElevationMeters, "m")} type=${value(terrainSupport.terrainType)} exposure=${value(terrainSupport.exposureType)} confidence=${value(terrainSupport.confidence)} message=${value(terrainSupport.messageZh)}`);
console.log(`rainSupportSignal: ${value(rainOpening.rainSupportSignal)}`);
console.log(`activeRainDuringWindow: ${value(rainOpening.activeRainDuringWindow)}`);
console.log(`postRainOpeningChance: ${value(rainOpening.postRainOpeningChance)}`);
console.log(`cloudSeaConfidence: score=${number(cloudSeaAnalysis.confidence)} level=${value(cloudSeaAnalysis.confidenceLevel)}`);
console.log(`cloudSeaReasons: ${cloudSeaReasons.slice(0, 8).join(" | ") || "暂无"}`);
console.log(`sunriseGlowScore: ${number(glowAnalysis.sunriseGlowScore)}`);
console.log(`sunsetGlowScore: ${number(glowAnalysis.sunsetGlowScore)}`);
console.log(`colorCarrierScore: ${number(glowAnalysis.colorCarrierScore)}`);
console.log(`lowCloudObstructionRisk: ${number(glowAnalysis.lowCloudObstructionRisk)}`);
console.log(`visibilityColorQualityScore: ${number(glowAnalysis.visibilityColorQualityScore)}`);
console.log(`precipitationDisruptionRisk: ${number(glowAnalysis.precipitationDisruptionRisk)}`);
console.log(`rainOverlapsSunriseWindow: ${value(glowAnalysis.rainOverlapsSunriseWindow)}`);
console.log(`rainOverlapsSunsetWindow: ${value(glowAnalysis.rainOverlapsSunsetWindow)}`);
console.log(`postRainOpeningChance: ${value(glowAnalysis.postRainOpeningChance)}`);
console.log(`glowWindowRainRisk: ${value(glowAnalysis.glowWindowRainRisk)}`);
console.log(`bestGlowWindow: ${bestGlowWindow.start && bestGlowWindow.end ? formatWindowLabel(bestGlowWindow, timezone) : "暂无高确定性霞光窗口"} label=${value(bestGlowWindow.labelZh)} score=${number(bestGlowWindow.score)} condition=${number(bestGlowWindow.conditionScore)} practical=${number(bestGlowWindow.practicalScore)} carrier=${number(bestGlowWindow.colorCarrierScore)} lowCloud=${number(bestGlowWindow.lowCloudObstructionRisk)} rain=${value(bestGlowWindow.glowWindowRainRisk)}`);
console.log(`glowConfidence: score=${number(glowAnalysis.confidence)} level=${value(glowAnalysis.confidenceLevel)}`);
console.log(`glowReasons: ${glowReasons.slice(0, 8).join(" | ") || "暂无"}`);
const recommendedMilkyWayWindow =
  astroAnalysis.recommendedMilkyWayWindow ||
  astroAssessment.recommendedMilkyWayWindow ||
  (Array.isArray(astroAnalysis.recommendedMilkyWayWindows) ? astroAnalysis.recommendedMilkyWayWindows[0] : undefined) ||
  {};
console.log(`astronomicalWindowScore: ${number(astroAnalysis.astronomicalWindowScore ?? astroAssessment.astronomicalWindowScore)}`);
console.log(`skyConditionScore: ${number(astroAnalysis.skyConditionScore ?? astroAssessment.skyConditionScore)}`);
console.log(`milkyWayGeometryScore: ${number(astroAnalysis.milkyWayGeometryScore ?? astroAssessment.milkyWayGeometryScore)}`);
console.log(`moonlightImpactScore: ${number(astroAnalysis.moonlightImpactScore ?? astroAssessment.moonlightImpactScore)}`);
console.log(`transparencyScore: ${number(astroAnalysis.transparencyScore ?? astroAssessment.transparencyScore)}`);
console.log(`dewRiskScore: ${number(astroAnalysis.dewRiskScore ?? astroAssessment.dewRiskScore)}`);
console.log(`practicalAstroScore: ${number(astroAnalysis.practicalAstroScore ?? astroAssessment.practicalAstroScore ?? astroAnalysis.astroPracticalScore)}`);
console.log(`astroConditionScore: ${number(astroAnalysis.astroConditionScore)}`);
console.log(`astroPracticalScore: ${number(astroAnalysis.astroPracticalScore)}`);
console.log(`astroWindowAvailable: ${value(astroAnalysis.astroWindowAvailable)}`);
console.log(`astroShootable: ${value(astroAnalysis.astroShootable)}`);
console.log(`astroWeatherBlockers: ${astroBlockers.length > 0 ? astroBlockers.join(" | ") : "无"}`);
console.log(`recommendedMilkyWayWindow: ${recommendedMilkyWayWindow.start || recommendedMilkyWayWindow.startTime ? formatWindowLabel(recommendedMilkyWayWindow, timezone) : "none"} direction=${value(recommendedMilkyWayWindow.directionZh)} score=${number(recommendedMilkyWayWindow.score)}`);
console.log(`moonImpact: level=${value(astroAnalysis.labels?.moonlightImpact || astroAssessment.labels?.moonlightImpact)} score=${number(astroAnalysis.moonlightImpactScore ?? astroAnalysis.moonImpactScore ?? astroAssessment.moonlightImpactScore)} reasons=${Array.isArray(astroAssessment.moonImpactReasonsZh) ? astroAssessment.moonImpactReasonsZh.join(" | ") : "暂无"}`);
console.log(`cloudBlockers: level=${value(astroAnalysis.labels?.cloudBlocker || astroAssessment.labels?.cloudBlocker)} blockers=${astroBlockers.length > 0 ? astroBlockers.join(" | ") : "无"}`);
console.log(`dewRisk: level=${value(astroAnalysis.labels?.dewRisk || astroAssessment.labels?.dewRisk)} score=${number(astroAnalysis.dewRiskScore ?? astroAssessment.dewRiskScore)} gear=${Array.isArray(astroAnalysis.gearAdviceZh || astroAssessment.gearAdviceZh) ? (astroAnalysis.gearAdviceZh || astroAssessment.gearAdviceZh).join(" | ") : "暂无"}`);
console.log(`bestWindowFullLabel: ${formatWindowLabel(firstWindow, timezone)}`);
console.log(`bestWindow: ${value(firstWindow.label)} score=${number(firstWindow.score)} practical=${number(firstWindow.practicalScore)} condition=${number(firstWindow.conditionScore)} kind=${value(firstWindow.practicalKind)} light=${value(firstWindow.lightPhase)} windowLevel=${value(firstWindow.windowLevel)} executable=${value(firstWindow.executableForDedicatedTrip)} nearby=${value(firstWindow.suitableIfNearby)}`);
console.log(`generalBestSubject: ${value(firstWindow.subjectPriorityLabel || result.recommendationLabel)}`);
console.log(`bestWindowCopyReason: ${value(firstWindow.copyReasonZh || firstWindow.practicalNoteZh)}`);
console.log(`arrivalAdvice: ${value(firstArrival.recommendedArrivalLabel)} time=${value(firstArrival.recommendedArrivalTime)} setup=${number(firstArrival.setupBufferMinutes, "min")} warning=${value(firstArrival.warningZh, "无")}`);
console.log(`recommendedArrivalFullLabel: ${firstArrival.recommendedArrivalTime ? formatArrivalLabel(firstArrival.recommendedArrivalTime, timezone) : "暂无明确到达时间"}`);
console.log("topRankedWindows:");
for (const window of bestWindows.slice(0, 5)) {
  const blockers = Array.isArray(window.blockerReasons) ? window.blockerReasons : window.weatherBlockers;
  console.log(`- ${formatWindowLabel(window, timezone)} ${value(window.subjectPriorityLabel || window.label)} windowLevel=${value(window.windowLevel)} recommendationLevel=${value(window.recommendationLevel)} practical=${number(window.practicalScore)} condition=${number(window.conditionScore)} executable=${value(window.executableForDedicatedTrip)} nearby=${value(window.suitableIfNearby)} blockers=${Array.isArray(blockers) ? blockers.join("|") || "none" : "none"}`);
}
console.log(`dailyFirst: date=${value(firstDailySummary.date)} score=${number(firstDailySummary.score)} advice=${value(firstDailySummary.shortAdvice)}`);
console.log(`dedicatedTripRecommendation: ${value(firstDailySummary.dedicatedTripRecommendation)}`);
console.log(`nearbyObservationRecommendation: ${value(firstDailySummary.nearbyObservationRecommendation)}`);
console.log(`dailyPracticalScores: opportunity=${number(firstDailySummary.weatherOpportunityScore)} riskPenalty=${number(firstDailySummary.riskPenalty)} practicalTrip=${number(firstDailySummary.practicalTripScore)} nearbyObservation=${number(firstDailySummary.nearbyObservationScore)}`);
console.log(`mainPrecipitationPeriodLabelZh: ${value(firstDailySummary.mainPrecipitationPeriodLabelZh || firstDaily.mainPrecipitationPeriodLabelZh)}`);
console.log(`watchableWindows: ${Array.isArray(firstDailySummary.watchableWindows) ? firstDailySummary.watchableWindows.map((window) => `${value(window.subject)}@${window.startTime && window.endTime ? formatWindowLabel(window, timezone) : "time-tbd"} windowLevel=${value(window.windowLevel)} recommendationLevel=${value(window.recommendationLevel)} nearby=${value(window.suitableIfNearby)}`).join(" | ") || "none" : "none"}`);
console.log(`bestShootableWindow: ${firstDailySummary.bestShootableWindow ? `${formatWindowLabel(firstDailySummary.bestShootableWindow, timezone)} ${value(firstDailySummary.bestShootableWindow.subjectPriorityLabel || firstDailySummary.bestShootableWindow.label)} windowLevel=${value(firstDailySummary.bestShootableWindow.windowLevel)} recommendationLevel=${value(firstDailySummary.bestShootableWindow.recommendationLevel)} executable=${value(firstDailySummary.bestShootableWindow.executableForDedicatedTrip)}` : "none"}`);
console.log(`temperatureCorrectionSummary: rawMin=${number(rawDailyMin, "掳C")} correctedMin=${number(correctedDailyMin, "掳C")} rawMax=${number(rawDailyMax, "掳C")} correctedMax=${number(correctedDailyMax, "掳C")} reason=${value(tempAdjustment.correctionReason)}`);
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
echo "Locations: 黄山光明顶, 非种子坐标测试点"
echo "Targets: ${FORECAST_TARGETS}"
echo "No API keys or secrets will be printed."

for location in ${FORECAST_LOCATIONS}; do
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
