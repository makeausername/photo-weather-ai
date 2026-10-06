import type { ForecastCalculationResult } from "@photo-weather/shared";
import { finiteWeatherValue as finite } from "./general-weather-data";

/** Carry structured provider disagreement into the short narrative as well. */
export function photographyEvidence(
  result: ForecastCalculationResult,
  window?: { target: "cloud_sea" | "glow" | "astro"; start?: string; end?: string },
) {
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
      Date.parse(r.time) >= Date.parse(window?.start ?? result.forecastStart) &&
      Date.parse(r.time) < Date.parse(window?.end ?? result.forecastEnd) &&
      finite(r.cloudTotalPercent) &&
      (window?.target === "cloud_sea"
        ? [r.cloudLowPercent]
        : [r.cloudLowPercent, r.cloudMidPercent, r.cloudHighPercent]
      ).some((v) => finite(v) && v > r.cloudTotalPercent! + 5),
  );
  const cloud = cloudLayerConflict || has("cloudLow", "cloudMid", "cloudHigh", "cloudTotal");
  const visibility = has("visibility");
  const moisture = has("humidity", "dewPoint", "dewPointSpread", "precipitationAmountMm");
  // Aggregated provider disagreement has no window timestamp. Retain the caution,
  // but do not veto every subject/date (or a clear night) for daytime/temperature differences.
  const review =
    cloudLayerConflict ||
    (!window &&
      (fields.some((f) => f.field !== "temperature") ||
        (fields.length === 0 && agreement?.shouldLowerConfidence === true)));
  const subject =
    window?.target === "astro"
      ? "星空可拍条件"
      : window?.target === "glow"
        ? "霞光机会"
        : "云雾机会";
  const notes = [
    temperatureNote,
    cloudLayerConflict
      ? `所选时段云量口径不一致，${subject}需复核`
      : cloud
        ? `云层预报存在分歧，${subject}需临近复核`
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
      notes.slice(0, 2).join("；") ||
      (review || agreement?.shouldLowerConfidence
        ? "天气预报存在分歧，拍摄条件需临近复核"
        : undefined),
  };
}
