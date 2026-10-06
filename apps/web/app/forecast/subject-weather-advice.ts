import type { ForecastCalculationResult } from "@photo-weather/shared";
import { finiteWeatherValue as finite } from "./general-weather-data";

export function subjectWeatherAdvice(
  result: ForecastCalculationResult,
  start?: string | null,
  end?: string | null,
  label = "参考时段",
) {
  if (!start || !end) return "拍摄时段尚未确认，温度和风况待更新后再安排衣物。";
  const step = (result.professionalHourlyDataTimeBasis?.stepMinutes ?? 60) * 60_000;
  const rows = (result.professionalHourlyData ?? [])
    .filter(
      (row) =>
        Date.parse(row.time) + step > Date.parse(start) && Date.parse(row.time) < Date.parse(end),
    )
    .sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
  const complete =
    rows.length > 0 &&
    Date.parse(rows[0]!.time) <= Date.parse(start) &&
    Date.parse(rows.at(-1)!.time) + step >= Date.parse(end) &&
    rows.every((row, i) => i === 0 || Date.parse(row.time) - Date.parse(rows[i - 1]!.time) <= step);
  const temperatures = rows.map((row) => row.displayedTemperatureC).filter(finite);
  const winds = rows.map((row) => row.windSpeedMs).filter(finite);
  const low = temperatures.length ? Math.min(...temperatures) : null;
  const high = temperatures.length ? Math.max(...temperatures) : null;
  const maxWind = winds.length ? Math.max(...winds) : null;
  const rain = rows.some(
    (row) => finite(row.precipitationAmountMm) && row.precipitationAmountMm > 0.2,
  );
  const temperature =
    low === null || high === null
      ? "温度待确认"
      : `约 ${Math.round(low)}～${Math.round(high)}°C${rows.some((row) => row.temperatureBasis === "terrain_adjusted") ? "（按机位海拔估算）" : ""}`;
  const clothes =
    low === null
      ? "先确认体感温度再备衣物"
      : low <= 0
        ? "带厚保暖层、手套和防风外层，备用电池贴身保温"
        : low <= 10
          ? "带保暖中层和防风外套，久等时加衣"
          : low <= 20
            ? "带长袖和轻薄外套，停下来守候时加一层"
            : "穿透气衣物，备薄外套应对风起";
  const wind =
    maxWind === null
      ? "风况待确认"
      : `风速最高约 ${Math.round(maxWind * 10) / 10} m/s；${maxWind >= 10 ? "不在暴露位置架机，优先撤到避风处" : maxWind >= 5 ? "压低三脚架，避免迎风换镜头" : "架稳三脚架后再检查画面抖动"}`;
  return `${label}：${temperature}；${clothes}。${wind}。${rain ? "备器材防水罩与擦镜布，持续降雨时停止露天守候。" : ""}${!complete || temperatures.length < rows.length || winds.length < rows.length ? "资料未覆盖全部时段，缺失部分待确认。" : ""}`;
}
