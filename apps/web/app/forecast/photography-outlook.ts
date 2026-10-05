import {
  prioritizeForecastRisks,
  type ForecastCalculationResult,
  type ProfessionalHourlyDataPoint as Hour,
} from "@photo-weather/shared";
import {
  finiteWeatherValue as finite,
  weatherDateKey,
  weatherDates,
  providerNeutralProfessionalWeatherText,
} from "./general-weather-data";

import { photographyScene, morningMistOutlook, lowCloudOutlook } from "./photography-scene";
import { photographyEvidence } from "./photography-evidence";

const mean = (values: readonly (number | null | undefined)[]) => {
  const known = values.filter(finite);
  return known.length ? known.reduce((a, b) => a + b, 0) / known.length : null;
};
const maximum = (values: readonly (number | null | undefined)[]) => {
  const known = values.filter(finite);
  return known.length ? Math.max(...known) : null;
};
const minimum = (values: readonly (number | null | undefined)[]) => {
  const known = values.filter(finite);
  return known.length ? Math.min(...known) : null;
};
const grade = (score: number | null | undefined) =>
  !finite(score)
    ? "不确定"
    : score >= 70
      ? "机会较好"
      : score >= 45
        ? "有机会，要等变化"
        : "机会偏低";
const labelDate = (date: string) => `${Number(date.slice(5, 7))}月${Number(date.slice(8, 10))}日`;
const validDate = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date);

function statistics(rows: readonly Hour[]) {
  return {
    low: mean(rows.map((r) => r.cloudLowPercent)),
    cloud: mean(rows.map((r) => r.cloudTotalPercent)),
    visibility: minimum(rows.map((r) => r.visibilityMeters)),
    min: minimum(rows.map((r) => r.displayedTemperatureC)),
    max: maximum(rows.map((r) => r.displayedTemperatureC)),
    wind: maximum(rows.map((r) => r.windSpeedMs)),
    gust: maximum(rows.map((r) => r.windGustMs)),
    rain: maximum(rows.map((r) => r.precipitationAmountMm)),
    probability: maximum(rows.map((r) => r.precipitationProbabilityPercent)),
  };
}
function usable(row: Hour) {
  return (
    [
      row.cloudTotalPercent,
      row.cloudLowPercent,
      row.visibilityMeters,
      row.windSpeedMs,
      row.precipitationAmountMm,
      row.precipitationProbabilityPercent,
    ].every(finite) &&
    !((row.precipitationAmountMm ?? 0) > 0 && row.precipitationProbabilityPercent === 0)
  );
}
function weatherRisk(s: ReturnType<typeof statistics>) {
  if ((s.wind ?? 0) >= 10 || (s.gust ?? 0) >= 15) return "风大";
  if ((s.rain ?? 0) >= 1 || (s.probability ?? 0) >= 60) return "降水干扰";
  if ((s.low ?? 0) >= 75) return "低云偏多，可能遮住远景";
  if (s.visibility !== null && s.visibility < 5000) return "通透偏差";
  if ((s.cloud ?? 0) >= 85) return "云量偏高，开口不稳";
  if (s.visibility !== null && s.visibility < 15000) return "通透一般";
  if (s.min !== null && s.max !== null && s.max - s.min >= 10)
    return "温差较大，早晚等待时容易受冷";
  if (s.cloud !== null && s.cloud < 20) return "天空少云，霞光层次可能有限";
  return "云层开合仍需现场确认";
}
function quality(rows: readonly Hour[]) {
  if (!rows.length || !rows.every(usable)) return null;
  const s = statistics(rows);
  // An ordering aid only, never presented as a probability or photography score.
  return (
    100 -
    s.cloud! * 0.25 -
    s.probability! * 0.35 -
    Math.min(40, s.rain! * 15) -
    Math.max(0, s.wind! - 4) * 5 -
    ((s.low ?? 0) >= 75 ? 40 : 0) -
    ((s.gust ?? 0) >= 15 ? 40 : 0) -
    (s.visibility! < 5000 ? 35 : s.visibility! < 15000 ? 15 : 0)
  );
}
function eventRows(rows: readonly Hour[], time: string | undefined, step: number) {
  if (!time || !Number.isFinite(Date.parse(time))) return [];
  const at = Date.parse(time);
  // Require coverage of the actual event, not a daily average or a distant hour.
  return rows.filter((r) => Date.parse(r.time) <= at && at < Date.parse(r.time) + step);
}
function sunChance(rows: readonly Hour[]) {
  if (!rows.length || !rows.every(usable) || rows.some((r) => !finite(r.cloudLowPercent)))
    return "不确定";
  const s = statistics(rows);
  if (s.low! >= 75 || s.cloud! >= 90 || s.rain! >= 1 || s.visibility! < 3000) return "露面机会偏低";
  return s.cloud! < 45 && s.low! < 30 && s.probability! < 40
    ? "有望露面，地平线遮挡待确认"
    : "有机会从云缝露面";
}

export function buildPhotographyOutlook(result: ForecastCalculationResult) {
  const scene = photographyScene(result);
  const evidence = photographyEvidence(result);
  const timezone =
    result.professionalHourlyDataTimeBasis?.timezone ??
    result.calendarBasis?.timezone ??
    "Asia/Shanghai";
  const step = (result.professionalHourlyDataTimeBasis?.stepMinutes ?? 60) * 60_000;
  const real = result.weatherDataMode === "real" && !result.isMock;
  const start = Date.parse(result.forecastStart);
  const end = Date.parse(result.forecastEnd);
  const rows = real
    ? [
        ...new Map(
          (result.professionalHourlyData ?? [])
            .filter(
              (r) =>
                Number.isFinite(Date.parse(r.time)) &&
                (!Number.isFinite(start) || Date.parse(r.time) >= start) &&
                (!Number.isFinite(end) || Date.parse(r.time) < end),
            )
            .map((r) => [r.time, r]),
        ).values(),
      ].sort((a, b) => Date.parse(a.time) - Date.parse(b.time))
    : [];
  const dates = [
    ...new Set([
      ...(result.targetDates ?? []),
      ...weatherDates(rows, timezone),
      ...(result.dailySummaries ?? []).map((d) => d.date),
    ]),
  ]
    .filter(validDate)
    .sort();
  if (!dates.length && Number.isFinite(start))
    dates.push(weatherDateKey(result.forecastStart, timezone));
  const compact =
    Number.isFinite(start) && Number.isFinite(end) ? end - start > 48 * 3600_000 : dates.length > 2;
  const flags = prioritizeForecastRisks(real ? result.riskFlags ?? [] : []);
  const severe =
    flags.some((r) => r.level === "high") ||
    (result.weatherAlerts ?? []).some((a) => a.level === "red" || a.level === "orange");
  const uncertain =
    !real ||
    result.weatherEvidenceStatus === "insufficient" ||
    result.weatherEvidenceStatus === "stale" ||
    result.weatherDataFreshness === "stale" ||
    ["wait_for_update", "data_insufficient"].includes(result.decisionMode ?? "");
  const noTrip =
    severe ||
    result.decisionMode === "not_recommended" ||
    result.finalRecommendationLevel === "not_recommended";
  const hourOf = (time: string) =>
    Number(
      new Intl.DateTimeFormat("en-GB", {
        timeZone: timezone,
        hour: "2-digit",
        hourCycle: "h23",
      }).format(new Date(time)),
    );
  const timeOf = (time: string) =>
    new Intl.DateTimeFormat("zh-CN", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(new Date(time));
  const days = dates.map((date, index) => {
    const hours = rows.filter((r) => weatherDateKey(r.time, timezone) === date);
    const s = statistics(hours);
    const daily = real ? result.dailySummaries?.find((d) => d.date === date) : undefined;
    const metric = real ? result.targetDailyBreakdown?.find((d) => d.date === date) : undefined;
    const astro = result.astroSummaries?.find((d) => d.date === date);
    const morning = eventRows(hours, astro?.sunrise, step);
    const riseAt = Date.parse(astro?.sunrise ?? "");
    // Look across the night and early morning, including the previous local date.
    const mistHours = Number.isFinite(riseAt)
      ? rows.filter(
          (r) =>
            Date.parse(r.time) >= riseAt - 6 * 3600_000 && Date.parse(r.time) <= riseAt + 3600_000,
        )
      : [];
    const evening = eventRows(hours, astro?.sunset, step);
    const sun = (event: readonly Hour[]) =>
      uncertain || !event.length || !event.every(usable)
        ? "不确定"
        : evidence.cloud || evidence.visibility
          ? `${sunChance(event)}（预报有分歧，需复核）`
          : sunChance(event);
    const sunrise = sun(morning);
    const sunset = sun(evening);
    const glow = (event: readonly Hour[], score: number | undefined) =>
      event.length &&
      event.every(usable) &&
      event.every(
        (r) => finite(r.cloudLowPercent) && finite(r.cloudMidPercent) && finite(r.cloudHighPercent),
      ) &&
      !uncertain
        ? evidence.cloud
          ? `${sunChance(event) === "露面机会偏低" && finite(score) ? "机会偏低" : grade(score)}（云层有分歧，需复核）`
          : sunChance(event) === "露面机会偏低" && finite(score)
            ? "机会偏低"
            : grade(score)
        : "不确定";
    const dawn = glow(morning, metric?.sunriseGlow?.score);
    const dusk = glow(evening, metric?.sunsetGlow?.score);
    const eventNote = (time: string | undefined, label: string) => {
      const at = Date.parse(time ?? "");
      if (Number.isFinite(at) && Number.isFinite(start) && at < start)
        return `${label}已过本次预报起点，不作追溯判断。`;
      if (Number.isFinite(at) && Number.isFinite(end) && at >= end)
        return `${label}在本次范围之外，需延长预报范围再确认。`;
      return undefined;
    };
    // Select consecutive, known daylight hours; do not bridge gaps or recommend the night.
    const candidates = hours
      .flatMap((r, i) => {
        const next = hours[i + 1];
        const rise = Date.parse(astro?.sunrise ?? "");
        const set = Date.parse(astro?.sunset ?? "");
        if (
          !next ||
          Date.parse(next.time) - Date.parse(r.time) !== step ||
          !Number.isFinite(rise) ||
          !Number.isFinite(set) ||
          Date.parse(r.time) < rise ||
          Date.parse(next.time) + step > set ||
          (Number.isFinite(end) && Date.parse(next.time) + step > end)
        )
          return [];
        const rank = quality([r, next]);
        return rank === null || rank < 45
          ? []
          : [{ rank, start: r.time, end: new Date(Date.parse(next.time) + step).toISOString() }];
      })
      .sort((a, b) => b.rank - a.rank);
    const best = candidates[0];
    const daySevere = noTrip || daily?.riskFlags?.some((r) => r.level === "high");
    const window = best
      ? `${hourOf(best.start) < 12 ? "上午" : "下午"} ${timeOf(best.start)}–${timeOf(best.end)}`
      : "暂无值得守候且资料完整的连续白天窗口";
    const score =
      !uncertain && hours.length && hours.every(usable)
        ? daily?.practicalTripScore ?? daily?.score
        : undefined;
    const restrictedTrip =
      [
        "谨慎前往",
        "谨慎参考",
        "不建议专程前往",
        "已在附近可观察",
        "可等云雾变化",
        "仅作备选",
        "等待转机",
      ].includes(daily?.dedicatedTripRecommendation ?? "") ||
      result.finalRecommendationLevel === "cautious" ||
      result.decisionMode === "nearby_watch";
    const allowed =
      !uncertain &&
      !daySevere &&
      !restrictedTrip &&
      !evidence.review &&
      finite(score) &&
      score >= 65 &&
      best &&
      best.rank >= 60;
    const scoreText = finite(score)
      ? `${Math.round(Math.max(0, Math.min(100, score)))}/100（条件参考）`
      : "待确认";
    const low = s.min ?? daily?.weather?.tempMin;
    const high = s.max ?? daily?.weather?.tempMax;
    const temperatureValue =
      finite(low) && finite(high)
        ? `${Math.round(low) === Math.round(high) ? Math.round(low) : `${Math.round(low)}～${Math.round(high)}`}°C${hours.length ? "（已覆盖时段）" : ""}`
        : "待确认";
    const temperature = `${temperatureValue}${evidence.temperatureNote ? "（预报分歧较大，需复核）" : hours.some((h) => h.temperatureBasis === "terrain_adjusted") ? "（按机位海拔估算）" : ""}`;
    const wet = (s.rain ?? 0) > 0 || (s.probability ?? 0) >= 40;
    const sky = !hours.length
      ? providerNeutralProfessionalWeatherText(daily?.weather?.weatherTextZh) ?? "天气大势待确认"
      : wet
        ? "有降水信号，拍摄要留出避雨余地"
        : hours.some(
              (r) => !finite(r.precipitationAmountMm) || !finite(r.precipitationProbabilityPercent),
            )
          ? "降水情况不确定"
          : s.cloud === null
            ? "云况待确认"
            : s.cloud >= 80
              ? "云量偏多，适合留意短暂开口"
              : s.cloud < 30
                ? `整体较晴朗，可以留意${scene.lightSubject}`
                : "晴云相间，光影值得等一等";
    const transparency = evidence.visibility
      ? "能见度预报有分歧，通透待确认"
      : s.visibility === null
        ? "通透不确定"
        : s.visibility < 5000
          ? "通透偏差，远景容易发灰"
          : s.visibility < 15000
            ? "通透一般，近景和层次更稳"
            : "能见度较好，远景可留意；实际通透还看现场";
    const cloudMist = scene.mountain
      ? !uncertain &&
        hours.length &&
        hours.every((r) => usable(r) && finite(r.relativeHumidityPercent))
        ? evidence.cloud || evidence.moisture
          ? `${grade(metric?.cloudSeaFormation?.score)}（预报有分歧，需复核；能否俯拍还看云层高度）`
          : `${grade(metric?.cloudSeaFormation?.score)}（仅形成条件，能否俯拍还看云层高度）`
        : "不确定"
      : uncertain || !scene.known
        ? "地形或天气资料不足，是否起雾待确认"
        : morningMistOutlook(mistHours);
    const lowCloud = lowCloudOutlook(hours);
    const mistLine = scene.mountain
      ? `云海：${cloudMist}`
      : uncertain
        ? `${scene.subject}：天气资料不足，待确认`
        : scene.subject === "云雾"
          ? `云雾：${lowCloud}；晨雾：${cloudMist.replace(/^晨雾/, "")}${scene.terrainIncomplete ? "；地形高差与云层高度待确认" : ""}`
          : `晨雾：${cloudMist.replace(/^晨雾/, "")}；${lowCloud}`;
    const fogCaution =
      !scene.mountain && (evidence.moisture || evidence.cloud) ? "（云雾信号有分歧，需复核）" : "";
    const recommendation = daySevere
      ? "❌ 不建议专程去，拍摄以安全近景为限"
      : allowed
        ? "✅ 适合安排拍摄，推荐抓住这个窗口"
        : best && finite(score) && score >= 45
          ? "⚠️ 普通题材可顺带拍，暂不建议为特殊天气专程去"
          : "⚠️ 拍摄条件仍需观察，暂不推荐专程去";
    const previousHours = index
      ? rows.filter((r) => weatherDateKey(r.time, timezone) === dates[index - 1])
      : [];
    const previous = statistics(previousHours);
    const lead =
      s.min !== null && previous.min !== null && s.min < previous.min - 3
        ? "比前一天冷一些，"
        : s.cloud !== null && previous.cloud !== null && s.cloud < previous.cloud - 25
          ? "云比前一天少了，"
          : s.cloud !== null && previous.cloud !== null && s.cloud > previous.cloud + 25
            ? "云比前一天多了，"
            : index
              ? "这天"
              : "当天";
    const lines = [
      `${lead}${sky}；温度 ${temperature}。`,
      `${mistLine}${fogCaution}。`,
      `${transparency}。`,
      eventNote(astro?.sunrise, "日出和朝霞") ?? `日出${sunrise}；朝霞${dawn}。`,
      eventNote(astro?.sunset, "日落和晚霞") ?? `日落${sunset}；晚霞${dusk}。`,
      `${recommendation}。出片指数 ${scoreText}。${compact ? `参考窗口：${window}。` : ""}`,
      ...(!compact ? [`${allowed ? "建议" : "参考"}窗口：${window}；${weatherRisk(s)}。`] : []),
    ];
    return {
      date,
      label: labelDate(date),
      lines,
      best,
      score,
      allowed: Boolean(allowed),
      dawn,
      dusk,
      sunrise,
      sunset,
      sunriseInRange: Number.isFinite(riseAt) && riseAt >= start && riseAt < end,
      sunsetInRange:
        Number.isFinite(Date.parse(astro?.sunset ?? "")) &&
        Date.parse(astro!.sunset!) >= start &&
        Date.parse(astro!.sunset!) < end,
      sunriseTimeKnown: Number.isFinite(riseAt),
      sunsetTimeKnown: Number.isFinite(Date.parse(astro?.sunset ?? "")),
    };
  });
  const ranked = [...days].filter((d) => d.best).sort((a, b) => b.best!.rank - a.best!.rank);
  const bestDay = ranked.find((d) => d.allowed) ?? ranked[0];
  const s = statistics(rows);
  const risk =
    providerNeutralProfessionalWeatherText(
      result.weatherAlerts?.find((a) => a.level === "orange" || a.level === "red")?.title,
    ) ??
    providerNeutralProfessionalWeatherText(flags[0]?.label) ??
    (!rows.length ? "天气资料不足，能见度与降水待确认" : evidence.note ?? weatherRisk(s));
  const bestText = bestDay?.best
    ? `${bestDay.label}${hourOf(bestDay.best.start) < 12 ? "上午" : "下午"} ${timeOf(bestDay.best.start)}–${timeOf(bestDay.best.end)}`
    : "待确认，目前不足以选出更稳的半天";
  const overallEvent = (key: "sunrise" | "sunset" | "dawn" | "dusk") => {
    const rising = key === "sunrise" || key === "dawn";
    const relevant = days.filter((d) =>
      rising ? d.sunriseInRange || !d.sunriseTimeKnown : d.sunsetInRange || !d.sunsetTimeKnown,
    );
    const values = relevant.map((d) => d[key]);
    if (!values.length) return "不在本次范围内";
    if (values.some((v) => v.includes("分歧")))
      return values.some((v) => /有望|有机会|机会较好/.test(v))
        ? "有机会但需复核"
        : values.every((v) => v.includes("机会偏低"))
          ? "机会偏低，仍需复核"
          : "预报有分歧，待确认";
    return values.some((v) => /有望|有机会|机会较好/.test(v))
      ? "部分时段有机会"
      : !values.length || values.some((v) => v === "不确定")
        ? "不确定"
        : "整体机会偏低";
  };
  const conclusion = [
    noTrip
      ? "❌ 这段时间不建议专程去，先避开不利天气。"
      : !uncertain && bestDay?.allowed
        ? "✅ 这段时间值得择窗去，建议围绕较稳的白天时段安排。"
        : !uncertain &&
            bestDay?.best &&
            bestDay.best.rank >= 45 &&
            finite(bestDay.score) &&
            bestDay.score >= 45
          ? "⚠️ 这段时间适合就近看天气、顺带拍，不建议为特殊天气专程去。"
          : "⚠️ 这段时间先观望，临近再决定是否专程去。",
    `${!noTrip && !uncertain && bestDay?.allowed ? "最建议" : "可留意的备选窗口"}：${bestText}。`,
    `日出${overallEvent("sunrise")}，朝霞${overallEvent("dawn")}；日落${overallEvent("sunset")}，晚霞${overallEvent("dusk")}。`,
    `最大风险：${risk}。${uncertain ? "资料不足或更新延迟，以上机会需复核。" : evidence.note && risk !== evidence.note ? `${evidence.note}。` : ""}`,
  ];
  const wet = (s.rain ?? 0) > 0 || (s.probability ?? 0) >= 40;
  const windy = (s.wind ?? 0) >= 6 || (s.gust ?? 0) >= 10;
  const poor = (s.visibility !== null && s.visibility < 5000) || (s.low ?? 0) >= 75;
  const shooting = [
    poor
      ? "先看远处轮廓能否变清楚；有雾才等雾散，有低云才等云层抬升，再尝试大场景。"
      : wet
        ? "等雨势减弱、云裂或边缘透光；风起云退后，再看远景是否变清楚。"
        : s.cloud !== null && s.cloud < 20
          ? `天空较空时，重点看低角度侧光和${scene.lightSubject}，不必专等霞光铺满天空。`
          : `先看云缝是否打开、边缘有没有透光，再观察${scene.lightSubject}。`,
    poor
      ? `优先拍近景氛围和长焦细节；确有雾气时，用${scene.mountain ? "山路" : "近处景物"}轮廓做层次。`
      : `优先拍${scene.lightSubject}，用长焦挑局部；有霞光再拍金边、剪影，${scene.mountain ? "云海出现时抓住云层边缘" : "雾气出现时再拍朦胧轮廓"}。`,
    "通透差或低云压顶，就转拍局部、层次和雾感，不要死等大场景。",
    `如果日出或日落扑空，同一天改拍${scene.backup}，少把时间耗在同一个机位。`,
  ];
  const clothing = [
    evidence.temperatureNote
      ? `${evidence.temperatureNote}，最低${s.min === null ? "待确认" : `约 ${Math.round(s.min)}°C（估计值）`}；备保暖中层和防风外壳${scene.mountain || s.min === null || s.min <= 10 ? "，带帽子和手套" : "，停下等光时多备一层"}。`
      : s.min === null
        ? "温度待确认：先准备可增减的内层、保暖中层和防风外壳，出发前再核对最低温。"
        : s.min <= 5
          ? `最低约 ${Math.round(s.min)}°C：保暖中层加防风外壳，带帽子和手套；清晨静候时体感可能更低。`
          : s.min <= 15
            ? `最低约 ${Math.round(s.min)}°C：长袖配保暖中层，随身带防风外壳；清晨等待时及时加衣。`
            : `最低约 ${Math.round(s.min)}°C：透气内层配轻薄外壳，白天活动时及时减衣，停下等光再加一层。`,
    `${windy ? "风较大，外壳选带帽且能收紧袖口的款式。" : s.wind === null ? "风况待确认，防风外壳随身带。" : "露天等待时备好防风层。"}${wet ? "带雨具、相机防雨罩，穿防滑鞋。" : s.rain === null || s.probability === null ? "降水待确认，备轻便雨具和防滑鞋。" : "穿防滑鞋，雨具轻装备用。"}`,
  ];
  const alerts = result.weatherAlerts ?? [];
  const risks = [
    `重点留意${risk === evidence.note ? weatherRisk(s) : risk}；${windy ? "风大时体感会突然下降，避免在暴露位置久等。" : poor ? "低能见度时缩短移动距离，等视线恢复再换机位。" : wet ? "雨中路面湿滑，换机位前先确认脚下路况。" : "局地天气可能变化，出发前和到场后各复核一次。"}`,
    evidence.note
      ? `${evidence.note}；出发前复核临近预报与现场情况。`
      : rows.length
        ? s.cloud !== null && s.cloud < 20
          ? "天空少云时优先拍低角度光影，不必久等大面积霞光，控制等待成本。"
          : "清晨或傍晚的光线窗口短；云缝一直不开，就及时改拍近景，控制等待成本。"
        : "能见度、风和降水仍待确认，暂不据此安排清晨或傍晚长时间等待。",
    alerts.length
      ? `当地预警：${alerts.map((a) => a.title).join("；")}。出发前查看预警详情与现场通行提示。`
      : result.weatherAlertsStatus !== "available"
        ? "当地天气预警待确认，出发前查看最新预警和通行情况。"
        : `移动途中留意能见度变化，${scene.mountain ? "山路或" : ""}湿滑地面优先稳步通行。`,
  ];
  return { conclusion, days, shooting, clothing, risks, compact };
}
