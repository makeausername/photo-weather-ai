import type { ForecastCalculationResult } from "@photo-weather/shared";
import { finiteWeatherValue as finite } from "./general-weather-data";

/** Carry structured provider disagreement into the short narrative as well. */
export function photographyEvidence(result: ForecastCalculationResult) {
  const agreement = result.weatherFusionSummary?.multiSourceAgreementContext;
  const fields = (agreement?.fieldDisagreements ?? []).filter(
    (f) => f.level === "high" || f.level === "medium",
  );
  const has = (...names: string[]) => fields.some((f) => names.includes(f.field));
  const temperature = fields.find((f) => f.field === "temperature");
  const temperatureNote = temperature
    ? `气温预报存在${finite(temperature.range) ? `约 ${Math.round(temperature.range * 10) / 10}°C 的` : "较大"}分歧，温度需复核`
    : undefined;
  const cloudLayerConflict = (result.professionalHourlyData ?? []).some(
    (r) =>
      Date.parse(r.time) >= Date.parse(result.forecastStart) &&
      Date.parse(r.time) < Date.parse(result.forecastEnd) &&
      finite(r.cloudTotalPercent) &&
      [r.cloudLowPercent, r.cloudMidPercent, r.cloudHighPercent].some(
        (v) => finite(v) && v > r.cloudTotalPercent! + 5,
      ),
  );
  const cloud = cloudLayerConflict || has("cloudLow", "cloudMid", "cloudHigh", "cloudTotal");
  const visibility = has("visibility");
  const moisture = has("humidity", "dewPoint", "dewPointSpread", "precipitationAmountMm");
  const review =
    agreement?.shouldLowerConfidence === true || fields.length > 0 || cloudLayerConflict;
  const notes = [
    temperatureNote,
    cloudLayerConflict
      ? "云量口径不一致，云雾和霞光机会需复核"
      : cloud
        ? "云层预报分歧较大，云雾和霞光机会需复核"
        : undefined,
    visibility ? "能见度预报有分歧，远景通透待确认" : undefined,
    has("precipitationAmountMm", "precipitationProbability") ? "降水时段或强度存在分歧" : undefined,
  ].filter((n): n is string => Boolean(n));
  return {
    review,
    temperatureNote,
    cloud,
    visibility,
    moisture,
    note:
      notes.slice(0, 2).join("；") || (review ? "天气预报存在分歧，拍摄条件需临近复核" : undefined),
  };
}
