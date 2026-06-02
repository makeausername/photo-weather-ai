#!/usr/bin/env bash
set -Eeuo pipefail

echo "Open-Meteo ICON cloud-layer diagnostics"
echo "No API keys or secrets are required or printed."

OPEN_METEO_BASE_URL="${OPEN_METEO_BASE_URL:-https://api.open-meteo.com}"
OPEN_METEO_ICON_MODEL="${OPEN_METEO_ICON_MODEL:-icon_global}"
OPEN_METEO_FORECAST_HOURS="${OPEN_METEO_FORECAST_HOURS:-72}"
OPEN_METEO_TIMEZONE="${OPEN_METEO_TIMEZONE:-Asia/Shanghai}"

OPEN_METEO_BASE_URL="$OPEN_METEO_BASE_URL" \
OPEN_METEO_ICON_MODEL="$OPEN_METEO_ICON_MODEL" \
OPEN_METEO_FORECAST_HOURS="$OPEN_METEO_FORECAST_HOURS" \
OPEN_METEO_TIMEZONE="$OPEN_METEO_TIMEZONE" \
node --input-type=module <<'NODE'
const requiredFields = [
  "cloud_cover",
  "cloud_cover_low",
  "cloud_cover_mid",
  "cloud_cover_high",
];
const hourlyFields = [
  ...requiredFields,
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
  {
    label: "generic-high-mountain",
    latitude: 46.8523,
    longitude: 9.532,
    elevationMeters: 1800,
  },
  {
    label: "generic-low-elevation",
    latitude: 31.2304,
    longitude: 121.4737,
  },
];

function endpointFromBaseUrl(value) {
  const trimmed = String(value || "https://api.open-meteo.com").trim().replace(/\/+$/, "");
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  if (/\/v1\/(?:forecast|dwd-icon)$/i.test(withScheme)) {
    return withScheme;
  }
  const withoutVersion = withScheme.replace(/\/v1$/i, "");
  return `${withoutVersion}/v1/forecast`;
}

function buildUrl(point) {
  const url = new URL(endpointFromBaseUrl(process.env.OPEN_METEO_BASE_URL));
  url.searchParams.set("latitude", String(point.latitude));
  url.searchParams.set("longitude", String(point.longitude));
  url.searchParams.set("hourly", hourlyFields.join(","));
  url.searchParams.set("forecast_hours", process.env.OPEN_METEO_FORECAST_HOURS || "72");
  url.searchParams.set("timezone", process.env.OPEN_METEO_TIMEZONE || "Asia/Shanghai");
  url.searchParams.set("temperature_unit", "celsius");
  url.searchParams.set("wind_speed_unit", "ms");
  url.searchParams.set("precipitation_unit", "mm");
  url.searchParams.set("models", process.env.OPEN_METEO_ICON_MODEL || "icon_global");
  if (Number.isFinite(point.elevationMeters)) {
    url.searchParams.set("elevation", String(point.elevationMeters));
  }
  return url;
}

function sampleRows(hourly, indexes) {
  return indexes.map((index) => ({
    index,
    time: hourly.time?.[index] ?? null,
    cloud_cover: hourly.cloud_cover?.[index] ?? null,
    cloud_cover_low: hourly.cloud_cover_low?.[index] ?? null,
    cloud_cover_mid: hourly.cloud_cover_mid?.[index] ?? null,
    cloud_cover_high: hourly.cloud_cover_high?.[index] ?? null,
  }));
}

function count(values) {
  return Array.isArray(values)
    ? values.filter((value) => typeof value === "number" && Number.isFinite(value)).length
    : 0;
}

let failures = 0;

for (const point of coordinates) {
  const url = buildUrl(point);
  url.searchParams.delete("apikey");
  console.log("");
  console.log(`== ${point.label} ==`);
  console.log(`requestForecastHours: ${process.env.OPEN_METEO_FORECAST_HOURS || "72"}`);
  console.log(`elevationBasis: ${Number.isFinite(point.elevationMeters) ? "explicit_elevation" : "default_dem"}`);

  try {
    const response = await fetch(url);
    console.log(`httpStatus: ${response.status}`);
    const body = await response.json();
    if (!response.ok) {
      failures += 1;
      console.log(`providerFailure: ${body.reason || body.error || "request_failed"}`);
      continue;
    }

    const hourly = body.hourly || {};
    const times = Array.isArray(hourly.time) ? hourly.time : [];
    console.log(`returnedHours: ${times.length}`);
    const lowCoverage = count(hourly.cloud_cover_low);
    const midCoverage = count(hourly.cloud_cover_mid);
    const highCoverage = count(hourly.cloud_cover_high);
    console.log(`coverage: total=${count(hourly.cloud_cover)}/${times.length} low=${lowCoverage}/${times.length} mid=${midCoverage}/${times.length} high=${highCoverage}/${times.length}`);
    console.log(`layerCoverageAtLeast90: ${Math.min(lowCoverage, midCoverage, highCoverage) / Math.max(1, times.length) >= 0.9 ? "yes" : "no"}`);
    for (const field of requiredFields) {
      console.log(`${field}: ${Array.isArray(hourly[field]) ? "available" : "missing"}`);
    }

    const firstIndexes = times.slice(0, 3).map((_, index) => index);
    const lastStart = Math.max(0, times.length - 3);
    const lastIndexes = times.slice(lastStart).map((_, index) => lastStart + index);
    console.log(`firstRows: ${JSON.stringify(sampleRows(hourly, firstIndexes))}`);
    console.log(`lastRows: ${JSON.stringify(sampleRows(hourly, lastIndexes))}`);

    if (requiredFields.some((field) => !Array.isArray(hourly[field]))) {
      failures += 1;
    }
  } catch (error) {
    failures += 1;
    console.log(`providerFailure: ${error instanceof Error ? error.message : String(error)}`);
  }
}

if (failures > 0) {
  process.exitCode = 1;
}
NODE
