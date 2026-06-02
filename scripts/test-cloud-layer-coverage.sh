#!/usr/bin/env bash
set -Eeuo pipefail

echo "Cloud-layer coverage diagnostics"
echo "No API keys or raw provider JSON are printed."

OPEN_METEO_BASE_URL="${OPEN_METEO_BASE_URL:-https://api.open-meteo.com}"
OPEN_METEO_ICON_MODEL="${OPEN_METEO_ICON_MODEL:-icon_global}"
OPEN_METEO_FORECAST_HOURS="${OPEN_METEO_FORECAST_HOURS:-72}"
OPEN_METEO_TIMEZONE="${OPEN_METEO_TIMEZONE:-Asia/Shanghai}"
METEOBLUE_BASE_URL="${METEOBLUE_BASE_URL:-https://my.meteoblue.com}"
METEOBLUE_PACKAGES="${METEOBLUE_PACKAGES:-basic-1h,clouds-1h}"

OPEN_METEO_BASE_URL="$OPEN_METEO_BASE_URL" \
OPEN_METEO_ICON_MODEL="$OPEN_METEO_ICON_MODEL" \
OPEN_METEO_FORECAST_HOURS="$OPEN_METEO_FORECAST_HOURS" \
OPEN_METEO_TIMEZONE="$OPEN_METEO_TIMEZONE" \
METEOBLUE_BASE_URL="$METEOBLUE_BASE_URL" \
METEOBLUE_PACKAGES="$METEOBLUE_PACKAGES" \
METEOBLUE_API_KEY="${METEOBLUE_API_KEY:-}" \
node --input-type=module <<'NODE'
const hourlyFields = [
  "cloud_cover",
  "cloud_cover_low",
  "cloud_cover_mid",
  "cloud_cover_high",
  "temperature_2m",
  "relative_humidity_2m",
  "dew_point_2m",
  "precipitation",
  "precipitation_probability",
  "visibility",
  "wind_speed_10m",
  "wind_direction_10m",
  "wind_gusts_10m",
  "weather_code",
];

const coordinates = [
  { label: "generic-high-mountain", latitude: 46.8523, longitude: 9.532, elevationMeters: 1800 },
  { label: "generic-lowland-city", latitude: 31.2304, longitude: 121.4737 },
];

function endpointFromBaseUrl(value) {
  const trimmed = String(value || "https://api.open-meteo.com").trim().replace(/\/+$/, "");
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  if (/\/v1\/forecast$/i.test(withScheme)) {
    return withScheme;
  }
  return `${withScheme.replace(/\/v1$/i, "")}/v1/forecast`;
}

function openMeteoUrl(point, mode) {
  const url = new URL(endpointFromBaseUrl(process.env.OPEN_METEO_BASE_URL));
  url.searchParams.set("latitude", String(point.latitude));
  url.searchParams.set("longitude", String(point.longitude));
  url.searchParams.set("hourly", hourlyFields.join(","));
  url.searchParams.set("forecast_hours", process.env.OPEN_METEO_FORECAST_HOURS || "72");
  url.searchParams.set("timezone", process.env.OPEN_METEO_TIMEZONE || "Asia/Shanghai");
  url.searchParams.set("temperature_unit", "celsius");
  url.searchParams.set("wind_speed_unit", "ms");
  url.searchParams.set("precipitation_unit", "mm");
  if (mode === "icon") {
    url.searchParams.set("models", process.env.OPEN_METEO_ICON_MODEL || "icon_global");
  }
  if (Number.isFinite(point.elevationMeters)) {
    url.searchParams.set("elevation", String(point.elevationMeters));
  }
  return url;
}

function meteoblueUrl(point) {
  const packages = String(process.env.METEOBLUE_PACKAGES || "basic-1h,clouds-1h")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .join("_");
  const base = String(process.env.METEOBLUE_BASE_URL || "https://my.meteoblue.com").replace(/\/+$/, "");
  const url = new URL(`/packages/${packages}`, `${base}/`);
  url.searchParams.set("lat", String(point.latitude));
  url.searchParams.set("lon", String(point.longitude));
  if (Number.isFinite(point.elevationMeters)) {
    url.searchParams.set("asl", String(Math.round(point.elevationMeters)));
  }
  url.searchParams.set("tz", process.env.OPEN_METEO_TIMEZONE || "Asia/Shanghai");
  url.searchParams.set("format", "json");
  url.searchParams.set("apikey", process.env.METEOBLUE_API_KEY || "");
  return url;
}

function count(values) {
  return Array.isArray(values)
    ? values.filter((value) => typeof value === "number" && Number.isFinite(value)).length
    : 0;
}

function openMeteoCoverage(body) {
  const hourly = body?.hourly || {};
  return {
    returnedHours: Array.isArray(hourly.time) ? hourly.time.length : 0,
    cloudTotalHours: count(hourly.cloud_cover),
    cloudLowHours: count(hourly.cloud_cover_low),
    cloudMidHours: count(hourly.cloud_cover_mid),
    cloudHighHours: count(hourly.cloud_cover_high),
    dewPointHours: count(hourly.dew_point_2m),
    visibilityHours: count(hourly.visibility),
    precipitationProbabilityHours: count(hourly.precipitation_probability),
  };
}

function meteoblueCoverage(body) {
  const hourly = body?.data_1h || {};
  return {
    returnedHours: Array.isArray(hourly.time) ? hourly.time.length : 0,
    cloudTotalHours: count(hourly.cloudcover || hourly.cloud_cover),
    cloudLowHours: count(hourly.lowclouds || hourly.low_clouds || hourly.cloud_cover_low),
    cloudMidHours: count(hourly.midclouds || hourly.mediumclouds || hourly.cloud_cover_mid),
    cloudHighHours: count(hourly.highclouds || hourly.high_clouds || hourly.cloud_cover_high),
    dewPointHours: count(hourly.dewpointtemperature || hourly.dew_point_2m),
    visibilityHours: count(hourly.visibility),
    precipitationProbabilityHours: count(hourly.precipitation_probability),
  };
}

function sampleRows(body) {
  const hourly = body?.hourly || {};
  const times = Array.isArray(hourly.time) ? hourly.time : [];
  const indexes = [...times.slice(0, 3).map((_, index) => index)];
  const lastStart = Math.max(0, times.length - 3);
  indexes.push(...times.slice(lastStart).map((_, index) => lastStart + index));
  return [...new Set(indexes)].map((index) => ({
    index,
    time: hourly.time?.[index] ?? null,
    total: hourly.cloud_cover?.[index] ?? null,
    low: hourly.cloud_cover_low?.[index] ?? null,
    mid: hourly.cloud_cover_mid?.[index] ?? null,
    high: hourly.cloud_cover_high?.[index] ?? null,
  }));
}

async function fetchJson(url, providerId) {
  const response = await fetch(url);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    return { providerId, error: body.reason || body.error || `HTTP ${response.status}` };
  }
  return { providerId, body };
}

function printProviderSummary(summary) {
  if (summary.error) {
    console.log(`${summary.providerId}: error=${summary.error}`);
    return;
  }
  const coverage = summary.coverage;
  console.log(`${summary.providerId}: returnedHours=${coverage.returnedHours} cloudTotal=${coverage.cloudTotalHours} low=${coverage.cloudLowHours} mid=${coverage.cloudMidHours} high=${coverage.cloudHighHours} dewPoint=${coverage.dewPointHours} visibility=${coverage.visibilityHours} precipitationProbability=${coverage.precipitationProbabilityHours}`);
}

for (const point of coordinates) {
  console.log("");
  console.log(`== ${point.label} ==`);
  console.log(`requestForecastHours: ${process.env.OPEN_METEO_FORECAST_HOURS || "72"}`);
  const results = [];

  for (const mode of ["icon", "best-match"]) {
    const providerId = mode === "icon" ? "open_meteo_icon" : "open_meteo_forecast_best_match";
    const result = await fetchJson(openMeteoUrl(point, mode), providerId);
    results.push({
      ...result,
      coverage: result.body ? openMeteoCoverage(result.body) : undefined,
    });
  }

  if (process.env.METEOBLUE_API_KEY) {
    const result = await fetchJson(meteoblueUrl(point), "meteoblue_forecast_optional");
    results.push({
      ...result,
      coverage: result.body ? meteoblueCoverage(result.body) : undefined,
    });
  } else {
    results.push({ providerId: "meteoblue_forecast_optional", error: "skipped_no_key" });
  }

  console.log("providerCoverageSummary:");
  for (const result of results) {
    printProviderSummary(result);
  }

  const best = results.find((result) => result.coverage && result.coverage.cloudLowHours > 0 && result.coverage.cloudMidHours > 0 && result.coverage.cloudHighHours > 0);
  const coverage = best?.coverage || { returnedHours: 0, cloudTotalHours: 0, cloudLowHours: 0, cloudMidHours: 0, cloudHighHours: 0, dewPointHours: 0, visibilityHours: 0 };
  const total = Math.max(1, Math.min(Number(process.env.OPEN_METEO_FORECAST_HOURS || 72), coverage.returnedHours || 0));
  const layerMin = Math.min(coverage.cloudLowHours, coverage.cloudMidHours, coverage.cloudHighHours);
  console.log(`fieldCoverageSummary: totalHours=${coverage.returnedHours} cloudTotal=${coverage.cloudTotalHours} low=${coverage.cloudLowHours} mid=${coverage.cloudMidHours} high=${coverage.cloudHighHours} dewPoint=${coverage.dewPointHours} visibility=${coverage.visibilityHours}`);
  console.log(`layerCoverageAtLeast90: ${layerMin / total >= 0.9 ? "yes" : "no"}`);
  if (best?.body) {
    console.log(`firstLastRows: ${JSON.stringify(sampleRows(best.body))}`);
  }
}
NODE
