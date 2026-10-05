import {
  classifyTerrainMode,
  terrainModeUsesMountainSemantics,
  type ForecastCalculationResult,
  type ProfessionalHourlyDataPoint as Hour,
} from "@photo-weather/shared";
import { finiteWeatherValue as finite } from "./general-weather-data";

/** Use the viewpoint's terrain, never a place-name guess or elevation alone. */
export function photographyScene(result: ForecastCalculationResult) {
  const profile = result.terrainAnalysis?.isMock
    ? undefined
    : result.terrainAnalysis?.terrainProfile;
  const mode = classifyTerrainMode(profile ?? {});
  const type = profile?.terrainType ?? "unknown";
  const relief = profile?.localReliefMeters ?? profile?.elevationDiff5km;
  const elevatedView =
    ["summit", "ridge", "mountain_platform"].includes(type) || (finite(relief) && relief >= 300);
  const mountain =
    terrainModeUsesMountainSemantics(mode) &&
    elevatedView &&
    !["city", "lake", "valley"].includes(type);
  const known = mode !== "unknown";
  const subject = mountain
    ? "云海"
    : mode === "hill" || type === "valley"
      ? "云雾"
      : known
        ? "晨雾 / 低云"
        : "云雾";
  const lightSubject = mountain
    ? "山体光影"
    : type === "city"
      ? "建筑光影和街景"
      : type === "lake"
        ? "水面光影和岸边层次"
        : type === "valley"
          ? "谷地光影"
          : mode === "hill"
            ? "坡地与树林光影"
            : "景物光影和近景层次";
  const backup = mountain
    ? "山路、人文与局部明暗层次"
    : type === "city"
      ? "街景、人文与建筑细节"
      : type === "lake"
        ? "岸边植物、水面倒影和局部光影"
        : type === "valley"
          ? "谷地近景、树林和局部光影"
          : "近景、人文与局部明暗层次";
  return { mountain, known, subject, lightSubject, backup };
}

/** Lowland mist is not the mountain formation score with a different label. */
export function morningMistOutlook(rows: readonly Hour[]) {
  if (!rows.length) return "清晨资料不足，是否起雾待确认";
  const signals = rows.map((row) => {
    const spread =
      row.dewPointSpreadC ??
      (finite(row.displayedTemperatureC) && finite(row.dewPointC)
        ? row.displayedTemperatureC - row.dewPointC
        : null);
    if (
      ![
        row.relativeHumidityPercent,
        spread,
        row.windSpeedMs,
        row.visibilityMeters,
        row.precipitationAmountMm,
      ].every(finite)
    )
      return "unknown";
    if (row.precipitationAmountMm! > 0) return "rain";
    if (
      row.relativeHumidityPercent! >= 90 &&
      spread! <= 2 &&
      row.windSpeedMs! <= 3 &&
      row.visibilityMeters! <= 10000
    )
      return "mist";
    if (row.relativeHumidityPercent! < 80 || spread! > 4 || row.windSpeedMs! > 5) return "weak";
    return "uncertain";
  });
  if (signals.includes("mist")) return "有近地雾气形成条件，是否起雾还看现场";
  if (signals.includes("unknown")) return "资料不全，是否起雾待确认";
  if (signals.includes("rain")) return "降水可能压低能见度，不能直接当作起雾信号";
  if (signals.every((signal) => signal === "weak")) return "晨雾机会偏低，可留意低云变化";
  return "晨雾信号尚不明确，低云是否贴地待确认";
}
