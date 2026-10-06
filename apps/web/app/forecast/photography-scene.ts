import {
  classifyTerrainMode,
  terrainCloudSubject,
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
  const subject = terrainCloudSubject(profile ?? {});
  const mountain = subject === "云海";
  const known = mode !== "unknown";
  // Place-name hints select composition subjects only, never establish physical relief.
  const lakeScene = type === "lake" || /湖|海岸|海滨/.test(result.place?.name ?? "");
  const cityScene = type === "city" || /外滩|街|城区|广场/.test(result.place?.name ?? "");
  const lightSubject = mountain
    ? "山体光影"
    : cityScene
      ? "建筑光影和街景"
      : lakeScene
        ? "水面光影和岸边层次"
        : type === "valley"
          ? "谷地光影"
          : mode === "hill"
            ? "坡地与树林光影"
            : "景物光影和近景层次";
  const backup = mountain
    ? "山路、人文与局部明暗层次"
    : cityScene
      ? "街景、人文与建筑细节"
      : lakeScene
        ? "岸边植物、水面倒影和局部光影"
        : type === "valley"
          ? "谷地近景、树林和局部光影"
          : "近景、人文与局部明暗层次";
  const terrainIncomplete = subject === "云雾" && type === "unknown" && !finite(relief);
  return { mountain, known, subject, lightSubject, backup, terrainIncomplete };
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
  if (signals.includes("mist"))
    return `部分时段有近地雾气形成条件${signals.at(-1) === "weak" ? "，临近日出信号减弱" : "，是否起雾待确认"}`;
  if (signals.includes("unknown")) return "资料不全，是否起雾待确认";
  if (signals.includes("rain")) return "降水可能压低能见度，不能直接当作起雾信号";
  if (signals.every((signal) => signal === "weak")) return "晨雾机会偏低";
  return "近地雾气信号尚不明确";
}

/** Cloud cover describes cloud amount, not whether the viewpoint sits inside it. */
export function lowCloudOutlook(rows: readonly Hour[]) {
  const amounts = rows.map((r) => r.cloudLowPercent).filter(finite);
  if (!amounts.length) return "低云资料待确认";
  if (amounts.some((v) => v >= 75)) return "部分时段低云较多，是否贴近机位待确认";
  if (amounts.some((v) => v >= 40)) return "有低云变化，是否贴地待确认";
  return amounts.length < rows.length ? "低云资料不全" : "低云信号偏弱";
}
