import { defaultTimezone, formatZonedIso, getHourInTimezone } from "@photo-weather/calendar";
import type {
  AstroAnalysisResult,
  AstroEvidenceItem,
  AstroRecommendationLabel,
  AstroSummary,
  AstroWindow,
  DailyAstro,
  ForecastCalculationInput,
  GlowBackupPlan,
  MoonImpactLevel,
  NormalizedHourlyWeather,
} from "@photo-weather/shared";
import { averageHourly, averageWeightedScore, clampScore } from "./helpers.js";
import {
  precipitationAmountMm,
  precipitationRiskLevel,
} from "./weather-decision-metrics.js";

const minuteMs = 60_000;
const moonlessSampleStepMs = 30 * minuteMs;
const minimumWindowMinutes = 30;
const lightPollutionUnavailableNote = "暂未接入光污染数据，实际观星仍需结合现场环境判断。";

type ForecastTimeRange = {
  readonly forecastStart: string;
  readonly forecastEnd: string;
  readonly startMs: number;
  readonly endMs: number;
};

type MoonImpact = {
  readonly level: MoonImpactLevel;
  readonly score: number;
  readonly reasons: readonly string[];
};

type AstroScoreInput = {
  readonly starsScore: number;
  readonly milkyWayScore: number;
  readonly transparencyScore: number;
};

export function calculateAstroAnalysis(
  input: ForecastCalculationInput,
  scores: AstroScoreInput,
): AstroAnalysisResult {
  const forecastRange = parseForecastRange(input);
  const astronomicalNightWindows =
    input.astroWindowBundle?.astronomicalNightWindows ??
    (forecastRange ? buildAstronomicalNightWindows(input, forecastRange) : []);
  const moonlessNightWindows =
    input.astroWindowBundle?.moonlessNightWindows ??
    (forecastRange ? buildMoonlessNightWindows(input, astronomicalNightWindows) : []);
  const milkyWayCandidateWindows =
    input.astroWindowBundle?.milkyWayCandidateWindows ??
    (forecastRange ? buildMilkyWayCandidateWindows(input, forecastRange) : []);
  const recommendedMilkyWayWindows =
    input.astroWindowBundle?.recommendedMilkyWayWindows ??
    buildRecommendedMilkyWayWindows(input, milkyWayCandidateWindows, moonlessNightWindows);
  const dailyAstro = buildDailyAstro(
    input,
    astronomicalNightWindows,
    moonlessNightWindows,
    milkyWayCandidateWindows,
    recommendedMilkyWayWindows,
    scores,
  );
  const moonImpactScore = maxMoonImpactScore(input.astroSummaries, astronomicalNightWindows);
  const weatherBlockers = buildAstroWeatherBlockers(input, astronomicalNightWindows);
  const astroConditionScore = calculateAstroConditionScore({
    astronomicalNightWindows,
    moonlessNightWindows,
    milkyWayCandidateWindows,
    recommendedMilkyWayWindows,
    moonImpactScore,
  });
  const astroPracticalScore = calculateAstroPracticalScore(dailyAstro, weatherBlockers, scores);
  const astroWindowAvailable = dailyAstro.some((day) => day.astronomicalWindowAvailable);
  const astroShootable = dailyAstro.some((day) => day.astroShootable);
  const astroTravelScore = astroPracticalScore;
  const recommendationLabel = recommendationLabelForScore(astroTravelScore);
  const missingDataNotes = buildMissingDataNotes(input);
  const confidenceLevel = classifyConfidence(missingDataNotes);
  const cloudEvidence = buildCloudEvidence(input, astronomicalNightWindows);
  const visibilityEvidence = buildVisibilityEvidence(input, astronomicalNightWindows);
  const moonEvidence = buildMoonEvidence(input, astronomicalNightWindows);
  const terrainEvidence = buildTerrainEvidence(input);
  const lightPollutionEvidence: readonly AstroEvidenceItem[] = [
    {
      label: "光污染数据",
      value: "暂未接入",
      effect: "neutral",
      noteZh: lightPollutionUnavailableNote,
    },
  ];
  const bestAstroWindows = [...recommendedMilkyWayWindows, ...moonlessNightWindows]
    .sort(
      (left, right) => right.score - left.score || Date.parse(left.start) - Date.parse(right.start),
    )
    .slice(0, Math.max(3, input.calendarBasis.targetDates.length));

  return {
    starsScore: scores.starsScore,
    milkyWayScore: scores.milkyWayScore,
    astroConditionScore,
    astroPracticalScore,
    moonImpactScore,
    transparencyScore: scores.transparencyScore,
    astroTravelScore,
    recommendationLabel,
    confidenceLevel,
    astroWindowAvailable,
    astroShootable,
    bestAstroWindows,
    dailyAstro,
    moonInfo: input.astroSummaries[0]?.moonInfo,
    moonlessNightWindows,
    astronomicalNightWindows,
    milkyWayCandidateWindows,
    recommendedMilkyWayWindows,
    lightPollution: {
      lightPollutionSource: "unavailable",
      lightPollutionNoteZh: lightPollutionUnavailableNote,
    },
    cloudEvidence,
    visibilityEvidence,
    moonEvidence,
    terrainEvidence,
    lightPollutionEvidence,
    weatherBlockers,
    riskReasons: buildAstroRiskReasons(
      input,
      moonImpactScore,
      recommendedMilkyWayWindows,
      weatherBlockers,
    ),
    opportunityReasons: buildAstroOpportunityReasons(
      input,
      astronomicalNightWindows,
      moonlessNightWindows,
      recommendedMilkyWayWindows,
    ),
    travelRecommendations: buildAstroTravelRecommendations(
      scores,
      recommendedMilkyWayWindows,
      weatherBlockers,
    ),
    backupPlans: buildAstroBackupPlans(),
    missingDataNotes,
    dataMode: input.weatherDataMode,
  };
}

function buildAstronomicalNightWindows(
  input: ForecastCalculationInput,
  forecastRange: ForecastTimeRange,
): readonly AstroWindow[] {
  return input.astroSummaries.flatMap((astro) => {
    if (!astro.astronomicalNightStart || !astro.astronomicalNightEnd) {
      return [];
    }

    const clipped = clipWindow(
      astro.astronomicalNightStart,
      astro.astronomicalNightEnd,
      forecastRange,
    );
    if (!clipped) {
      return [];
    }

    const weatherWindow = weatherBetween(input.hourlyWeather, clipped.start, clipped.end);
    const score = calculateDailyStarsScore(input, astro, weatherWindow);

    return [
      {
        type: "astronomical_night",
        labelZh: "天文黑夜",
        date: astro.date,
        start: clipped.start,
        end: clipped.end,
        durationMinutes: durationMinutes(clipped.start, clipped.end),
        score,
        riskTags: riskTagsForWeather(
          weatherWindow,
          moonImpactForWindow(astro, clipped.start, clipped.end),
        ),
        noteZh: "太阳低于地平线约 18 度后，天空背景更适合星空、星轨和银河拍摄。",
      },
    ];
  });
}

function buildMoonlessNightWindows(
  input: ForecastCalculationInput,
  astronomicalNightWindows: readonly AstroWindow[],
): readonly AstroWindow[] {
  return astronomicalNightWindows.flatMap((nightWindow) => {
    const astro = input.astroSummaries.find((summary) => summary.date === nightWindow.date);
    if (!astro) {
      return [];
    }

    const segments = findMoonlessSegments(astro, nightWindow.start, nightWindow.end);

    return segments.map((segment) => {
      const weatherWindow = weatherBetween(input.hourlyWeather, segment.start, segment.end);
      const moonImpact = moonImpactForWindow(astro, segment.start, segment.end);
      const score = calculateDailyStarsScore(input, astro, weatherWindow);

      return {
        type: "moonless_night",
        labelZh: "无月黑夜",
        date: astro.date,
        start: segment.start,
        end: segment.end,
        durationMinutes: durationMinutes(segment.start, segment.end),
        score,
        riskTags: riskTagsForWeather(weatherWindow, moonImpact),
        noteZh:
          moonImpact.level === "low"
            ? "该窗口位于天文黑夜内，月亮低于地平线或月光影响较低。"
            : "该窗口位于天文黑夜内，但仍需现场复核月光方向和云量。",
      } satisfies AstroWindow;
    });
  });
}

function buildMilkyWayCandidateWindows(
  input: ForecastCalculationInput,
  forecastRange: ForecastTimeRange,
): readonly AstroWindow[] {
  return input.astroSummaries.flatMap((astro) => {
    if (!astro.milkyWayWindowStart || !astro.milkyWayWindowEnd) {
      return [];
    }

    const clipped = clipWindow(astro.milkyWayWindowStart, astro.milkyWayWindowEnd, forecastRange);
    if (!clipped) {
      return [];
    }

    const weatherWindow = weatherBetween(input.hourlyWeather, clipped.start, clipped.end);
    const moonImpact = moonImpactForWindow(astro, clipped.start, clipped.end);
    const score = calculateMilkyWayWindowScore(input, astro, clipped.start, clipped.end);

    return [
      {
        type: "milky_way_candidate",
        labelZh: "银河候选窗口",
        date: astro.date,
        start: clipped.start,
        end: clipped.end,
        durationMinutes: durationMinutes(clipped.start, clipped.end),
        score,
        riskTags: riskTagsForWeather(weatherWindow, moonImpact),
        noteZh: milkyWayCandidateNote(astro),
        directionZh: astro.milkyWayDirection,
        galacticCenterAltitude: astro.milkyWayGalacticCenterAltitude,
      },
    ];
  });
}

function buildRecommendedMilkyWayWindows(
  input: ForecastCalculationInput,
  candidates: readonly AstroWindow[],
  moonlessWindows: readonly AstroWindow[],
): readonly AstroWindow[] {
  return candidates.flatMap((candidate) => {
    const astro = input.astroSummaries.find((summary) => summary.date === candidate.date);
    if (!astro) {
      return [];
    }

    const intersections = moonlessWindows
      .filter((moonless) => moonless.date === candidate.date)
      .map((moonless) => intersectWindows(candidate, moonless))
      .filter((window): window is Pick<AstroWindow, "start" | "end"> => window !== undefined)
      .filter((window) => durationMinutes(window.start, window.end) >= minimumWindowMinutes);

    return intersections.map((window) => {
      const weatherWindow = weatherBetween(input.hourlyWeather, window.start, window.end);
      const moonImpact = moonImpactForWindow(astro, window.start, window.end);
      const score = calculateMilkyWayWindowScore(input, astro, window.start, window.end);

      return {
        type: "recommended_milky_way",
        labelZh: "推荐银河窗口",
        date: candidate.date,
        start: window.start,
        end: window.end,
        durationMinutes: durationMinutes(window.start, window.end),
        score,
        riskTags: riskTagsForWeather(weatherWindow, moonImpact),
        noteZh:
          "该窗口同时位于天文黑夜、低月光影响窗口和银心可见候选窗口内，适合作为银河拍摄优先时段。",
        directionZh: candidate.directionZh,
        galacticCenterAltitude: candidate.galacticCenterAltitude,
      } satisfies AstroWindow;
    });
  });
}

function buildDailyAstro(
  input: ForecastCalculationInput,
  astronomicalNightWindows: readonly AstroWindow[],
  moonlessNightWindows: readonly AstroWindow[],
  candidateWindows: readonly AstroWindow[],
  recommendedMilkyWayWindows: readonly AstroWindow[],
  scores: AstroScoreInput,
): readonly DailyAstro[] {
  return input.calendarBasis.targetDates.map((date) => {
    const astro = input.astroSummaries.find((summary) => summary.date === date);
    const astronomicalNightWindow = astronomicalNightWindows.find((window) => window.date === date);
    const moonlessNightWindow = moonlessNightWindows.find((window) => window.date === date);
    const recommendedMilkyWayWindow = recommendedMilkyWayWindows.find(
      (window) => window.date === date,
    );
    const candidateWindow = candidateWindows.find((window) => window.date === date);
    const weatherWindow = astronomicalNightWindow
      ? weatherBetween(
          input.hourlyWeather,
          astronomicalNightWindow.start,
          astronomicalNightWindow.end,
        )
      : nightlyWeatherForDate(input, date);
    const starsScore = astro
      ? calculateDailyStarsScore(input, astro, weatherWindow)
      : scores.starsScore;
    const milkyWayScore =
      recommendedMilkyWayWindow?.score ??
      candidateWindow?.score ??
      Math.min(58, scores.milkyWayScore);
    const moonImpact: MoonImpact = astro
      ? moonImpactForWindow(
          astro,
          astronomicalNightWindow?.start ?? astro.astronomicalNightStart,
          astronomicalNightWindow?.end ?? astro.astronomicalNightEnd,
        )
      : {
          level: "medium",
          score: 45,
          reasons: ["缺少月亮高度数据，按中等月光影响保守处理。"],
        };
    const travelScore = averageWeightedScore([
      { score: starsScore, weight: 0.35 },
      { score: milkyWayScore, weight: 0.35 },
      { score: scores.transparencyScore, weight: 0.18 },
      { score: 100 - moonImpact.score, weight: 0.12 },
    ]);
    const weatherBlockers = astroWeatherBlockers(weatherWindow);
    const astroConditionScore = clampScore(
      averageWeightedScore([
        { score: astronomicalNightWindow ? 82 : 22, weight: 0.28 },
        { score: moonlessNightWindow ? 82 : 45, weight: 0.24 },
        { score: candidateWindow ? 76 : 35, weight: 0.22 },
        { score: 100 - moonImpact.score, weight: 0.26 },
      ]),
    );
    const astroPracticalScore = applyAstroWeatherBlockers(travelScore, weatherWindow);
    const astroShootable =
      Boolean(astronomicalNightWindow) &&
      weatherBlockers.length === 0 &&
      astroPracticalScore >= 58 &&
      (Boolean(recommendedMilkyWayWindow) || Boolean(moonlessNightWindow));

    return {
      date,
      dateLabelZh: dateLabelForInput(input, date),
      lunarDateText: astro?.lunarDateText,
      starsScore,
      milkyWayScore,
      astroConditionScore,
      astroPracticalScore,
      astronomicalWindowAvailable: Boolean(astronomicalNightWindow),
      astroShootable,
      weatherBlockers,
      moonImpactLevel: moonImpact.level,
      astronomicalNightWindow,
      moonlessNightWindow,
      recommendedMilkyWayWindow,
      recommendationLabel: recommendationLabelForScore(astroPracticalScore),
      keyReason: dailyKeyReason(
        recommendedMilkyWayWindow,
        moonlessNightWindow,
        astronomicalNightWindow,
        weatherBlockers,
      ),
      riskNote: dailyRiskNote(weatherWindow, moonImpact, input),
    };
  });
}

function findMoonlessSegments(
  astro: AstroSummary,
  start: string,
  end: string,
): readonly Pick<AstroWindow, "start" | "end">[] {
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return [];
  }

  const timezone = astro.timezone || defaultTimezone;
  const moonsetMs = parseOptionalTime(astro.moonset);
  const moonriseMs = parseOptionalTime(astro.moonrise);
  const segments: Array<Pick<AstroWindow, "start" | "end">> = [];
  let segmentStartMs: number | undefined;

  for (let cursor = startMs; cursor < endMs; cursor += moonlessSampleStepMs) {
    const nextCursor = Math.min(cursor + moonlessSampleStepMs, endMs);
    const sampleMs = Math.min(cursor + moonlessSampleStepMs / 2, endMs);
    const impact = moonImpactAt(astro, sampleMs);
    const usable = impact <= 32;

    if (usable && segmentStartMs === undefined) {
      segmentStartMs =
        moonsetMs !== undefined && moonsetMs >= cursor && moonsetMs <= nextCursor
          ? moonsetMs
          : cursor;
    }

    if (!usable && segmentStartMs !== undefined) {
      const segmentEndMs =
        moonriseMs !== undefined && moonriseMs >= cursor && moonriseMs <= nextCursor
          ? moonriseMs
          : cursor;
      pushSegment(segments, segmentStartMs, segmentEndMs, timezone);
      segmentStartMs = undefined;
    }
  }

  if (segmentStartMs !== undefined) {
    pushSegment(segments, segmentStartMs, endMs, timezone);
  }

  return segments;
}

function pushSegment(
  segments: Array<Pick<AstroWindow, "start" | "end">>,
  startMs: number,
  endMs: number,
  timezone: string,
): void {
  if (endMs - startMs < minimumWindowMinutes * minuteMs) {
    return;
  }

  segments.push({
    start: formatZonedIso(new Date(startMs), timezone),
    end: formatZonedIso(new Date(endMs), timezone),
  });
}

function moonImpactForWindow(
  astro: AstroSummary,
  start: string | undefined,
  end: string | undefined,
): MoonImpact {
  const startMs = parseOptionalTime(start);
  const endMs = parseOptionalTime(end);
  const reasons: string[] = [];

  if (startMs === undefined || endMs === undefined || endMs <= startMs) {
    const fallbackScore = moonImpactAt(
      astro,
      parseOptionalTime(astro.astronomicalNightStart) ?? Date.now(),
    );
    return {
      level: moonImpactLevel(fallbackScore),
      score: fallbackScore,
      reasons: ["缺少完整夜间窗口，月光影响按可用月相和高度保守估算。"],
    };
  }

  const samples: number[] = [];
  for (let cursor = startMs; cursor <= endMs; cursor += moonlessSampleStepMs) {
    samples.push(moonImpactAt(astro, cursor));
  }

  const score = samples.length > 0 ? clampScore(Math.max(...samples)) : 45;
  const level = moonImpactLevel(score);
  const illuminationPercent = Math.round(normalizeIllumination(astro.moonIllumination) * 100);

  if (score <= 32) {
    reasons.push("月亮低于地平线或照明与高度较低，月光影响较轻。");
  } else if (illuminationPercent > 50) {
    reasons.push("月亮照明超过 50%，只要位于地平线上方就会明显压低银河对比度。");
  } else if (illuminationPercent >= 20) {
    reasons.push("月亮照明处于 20%-50% 区间，月亮高度会决定干扰强度。");
  } else {
    reasons.push("月亮照明较低，但仍需结合月亮高度和拍摄方向判断。");
  }

  if (!astro.moonAltitudeByHour && !astro.moonAltitudeSamples) {
    reasons.push("缺少逐小时月亮高度，月光影响置信度降低。");
  }

  return { level, score, reasons };
}

function moonImpactAt(astro: AstroSummary, timestamp: number): number {
  const illumination = normalizeIllumination(astro.moonIllumination);
  const altitude = moonAltitudeAt(astro, timestamp);

  if (altitude !== undefined && altitude <= 0) {
    return 0;
  }

  const altitudeValue = altitude === undefined ? 18 : Math.max(0, altitude);
  const illuminationPercent = illumination * 100;

  if (illuminationPercent > 50) {
    return clampScore(66 + Math.min(28, altitudeValue * 0.8));
  }
  if (illuminationPercent >= 20) {
    return clampScore(altitudeValue >= 25 ? 62 : altitudeValue >= 8 ? 44 : 28);
  }

  return clampScore(altitudeValue >= 25 ? 34 : altitudeValue >= 8 ? 22 : 12);
}

function moonAltitudeAt(astro: AstroSummary, timestamp: number): number | undefined {
  const sampleValue = moonAltitudeFromSamples(astro, timestamp);
  if (sampleValue !== undefined) {
    return sampleValue;
  }

  const hour = getHourInTimezone(new Date(timestamp), astro.timezone || defaultTimezone);
  const value = astro.moonAltitudeByHour?.[pad2(hour)];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function moonAltitudeFromSamples(astro: AstroSummary, timestamp: number): number | undefined {
  const samples = astro.moonAltitudeSamples
    ?.map((sample) => ({
      timestamp: Date.parse(sample.time),
      altitude: sample.altitude,
    }))
    .filter(
      (sample) =>
        Number.isFinite(sample.timestamp) &&
        typeof sample.altitude === "number" &&
        Number.isFinite(sample.altitude),
    )
    .sort((left, right) => left.timestamp - right.timestamp);

  if (!samples || samples.length === 0) {
    return undefined;
  }

  let nearest = samples[0]!;
  for (const sample of samples) {
    if (Math.abs(sample.timestamp - timestamp) < Math.abs(nearest.timestamp - timestamp)) {
      nearest = sample;
    }
  }

  return Math.abs(nearest.timestamp - timestamp) <= 45 * minuteMs ? nearest.altitude : undefined;
}

function milkyWayCandidateNote(astro: AstroSummary): string {
  if (astro.milkyWayCalculationPrecision === "skyfield") {
    return (
      astro.milkyWayNoteZh ??
      "银心方向与高度由本地天文服务计算；该候选窗口仍需继续叠加云量、光污染和地形遮挡判断。"
    );
  }

  return (
    astro.milkyWayNoteZh ??
    "银心方向与高度为简化本地估算；该候选窗口仍需继续叠加月光、云量、光污染和地形遮挡判断。"
  );
}

function calculateDailyStarsScore(
  input: ForecastCalculationInput,
  astro: AstroSummary,
  weatherWindow: readonly NormalizedHourlyWeather[],
): number {
  if (weatherWindow.length === 0) {
    return 45;
  }

  const cloudClearScore = 100 - averageHourly(weatherWindow, (hour) => hour.cloudTotal);
  const cloudLayerClearScore = calculateCloudLayerClearScore(weatherWindow);
  const visibilityScore = clampScore(averageHourly(weatherWindow, (hour) => hour.visibility) * 4);
  const humidityScore = 100 - averageHourly(weatherWindow, (hour) => hour.humidity);
  const precipitationScore =
    100 - averageHourly(weatherWindow, (hour) => hour.precipitationProbability);
  const moonScore =
    100 -
    moonImpactForWindow(
      astro,
      weatherWindow[0]?.time,
      weatherWindow[weatherWindow.length - 1]?.time,
    ).score;
  const terrainPenalty =
    typeof input.terrainAnalysis.horizonProfile.milkyWayHorizonAngle === "number"
      ? Math.max(0, input.terrainAnalysis.horizonProfile.milkyWayHorizonAngle - 10) * 1.8
      : 0;

  const score = clampScore(
    averageWeightedScore([
      { score: cloudClearScore, weight: 0.24 },
      { score: cloudLayerClearScore, weight: 0.12 },
      { score: visibilityScore, weight: 0.2 },
      { score: humidityScore, weight: 0.18 },
      { score: moonScore, weight: 0.18 },
      { score: precipitationScore, weight: 0.08 },
    ]) - terrainPenalty,
  );
  return applyAstroWeatherBlockers(score, weatherWindow);
}

function calculateMilkyWayWindowScore(
  input: ForecastCalculationInput,
  astro: AstroSummary,
  start: string,
  end: string,
): number {
  const weatherWindow = weatherBetween(input.hourlyWeather, start, end);
  const durationScore = clampScore((durationMinutes(start, end) / 150) * 100);
  const cloudClearScore =
    weatherWindow.length > 0 ? 100 - averageHourly(weatherWindow, (hour) => hour.cloudTotal) : 45;
  const visibilityScore =
    weatherWindow.length > 0
      ? clampScore(averageHourly(weatherWindow, (hour) => hour.visibility) * 4)
      : 45;
  const humidityScore =
    weatherWindow.length > 0 ? 100 - averageHourly(weatherWindow, (hour) => hour.humidity) : 45;
  const moonScore = 100 - moonImpactForWindow(astro, start, end).score;
  const altitudeScore =
    typeof astro.milkyWayGalacticCenterAltitude === "number"
      ? clampScore((astro.milkyWayGalacticCenterAltitude - 8) * 5)
      : 62;
  const terrainPenalty =
    typeof input.terrainAnalysis.horizonProfile.milkyWayHorizonAngle === "number"
      ? Math.max(0, input.terrainAnalysis.horizonProfile.milkyWayHorizonAngle - 8) * 2.4
      : 0;

  const score = clampScore(
    averageWeightedScore([
      { score: durationScore, weight: 0.18 },
      { score: cloudClearScore, weight: 0.2 },
      { score: visibilityScore, weight: 0.16 },
      { score: humidityScore, weight: 0.12 },
      { score: moonScore, weight: 0.22 },
      { score: altitudeScore, weight: 0.12 },
    ]) - terrainPenalty,
  );
  return applyAstroWeatherBlockers(score, weatherWindow);
}

function calculateCloudLayerClearScore(window: readonly NormalizedHourlyWeather[]): number {
  const values = window
    .map((hour) =>
      hour.cloudLow !== null && hour.cloudMid !== null && hour.cloudHigh !== null
        ? (hour.cloudLow + hour.cloudMid + hour.cloudHigh) / 3
        : undefined,
    )
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));

  if (values.length === 0) {
    return clampScore(100 - averageHourly(window, (hour) => hour.cloudTotal) * 0.72 - 8);
  }

  return clampScore(100 - values.reduce((sum, value) => sum + value, 0) / values.length);
}

function calculateAstroConditionScore(input: {
  readonly astronomicalNightWindows: readonly AstroWindow[];
  readonly moonlessNightWindows: readonly AstroWindow[];
  readonly milkyWayCandidateWindows: readonly AstroWindow[];
  readonly recommendedMilkyWayWindows: readonly AstroWindow[];
  readonly moonImpactScore: number;
}): number {
  return averageWeightedScore([
    { score: input.astronomicalNightWindows.length > 0 ? 84 : 20, weight: 0.28 },
    { score: input.moonlessNightWindows.length > 0 ? 82 : 42, weight: 0.24 },
    { score: input.milkyWayCandidateWindows.length > 0 ? 76 : 35, weight: 0.18 },
    { score: input.recommendedMilkyWayWindows.length > 0 ? 80 : 38, weight: 0.12 },
    { score: 100 - input.moonImpactScore, weight: 0.18 },
  ]);
}

function calculateAstroPracticalScore(
  dailyAstro: readonly DailyAstro[],
  weatherBlockers: readonly string[],
  scores: AstroScoreInput,
): number {
  const dailyBest = dailyAstro.length
    ? Math.max(...dailyAstro.map((day) => day.astroPracticalScore))
    : averageWeightedScore([
        { score: scores.starsScore, weight: 0.34 },
        { score: scores.milkyWayScore, weight: 0.34 },
        { score: scores.transparencyScore, weight: 0.32 },
      ]);
  if (weatherBlockers.length === 0) {
    return dailyBest;
  }
  return Math.min(dailyBest, weatherBlockers.length >= 3 ? 34 : 44);
}

function buildAstroWeatherBlockers(
  input: ForecastCalculationInput,
  windows: readonly AstroWindow[],
): readonly string[] {
  return astroWeatherBlockers(weatherForWindows(input.hourlyWeather, windows));
}

function applyAstroWeatherBlockers(
  score: number,
  weatherWindow: readonly NormalizedHourlyWeather[],
): number {
  const cap = astroWeatherBlockerCap(weatherWindow);
  return clampScore(Math.min(score, cap));
}

function astroWeatherBlockerCap(weatherWindow: readonly NormalizedHourlyWeather[]): number {
  if (weatherWindow.length === 0) {
    return 45;
  }

  const totalCloud = averageHourly(weatherWindow, (hour) => hour.cloudTotal);
  const lowCloud = averageHourly(weatherWindow, (hour) => hour.cloudLow);
  const midCloud = averageHourly(weatherWindow, (hour) => hour.cloudMid);
  const highCloud = averageHourly(weatherWindow, (hour) => hour.cloudHigh);
  const visibility = averageHourly(weatherWindow, (hour) => hour.rawVisibilityKm ?? hour.visibility);
  const humidity = averageHourly(weatherWindow, (hour) => hour.humidity);
  const dewPointSpread = averageHourly(weatherWindow, (hour) => hour.dewPointSpread);
  const transparencyScore = averageHourly(weatherWindow, (hour) => hour.photographyTransparencyScore);
  const precipitationProbability = Math.max(
    ...weatherWindow.map((hour) => hour.precipitationProbability ?? 0),
    0,
  );
  const precipitationAmount = weatherWindow.reduce(
    (sum, hour) => sum + (precipitationAmountMm(hour) ?? 0),
    0,
  );
  const precipitationRisk = precipitationRiskLevel({
    probability: precipitationProbability,
    amountMm: precipitationAmount,
  });
  const textBlocked = weatherWindow.some((hour) =>
    /雨|雪|雾|霾|阴|overcast|rain|snow|fog|mist|heavy cloud/i.test(hour.weatherTextZh ?? ""),
  );

  let cap = 100;
  if (totalCloud >= 60) {
    cap = Math.min(cap, totalCloud >= 80 ? 22 : 42);
  }
  if (lowCloud >= 30) {
    cap = Math.min(cap, lowCloud >= 50 ? 22 : 38);
  }
  if (midCloud >= 60) {
    cap = Math.min(cap, 48);
  }
  if (highCloud >= 80) {
    cap = Math.min(cap, 54);
  }
  if (precipitationAmount > 0) {
    cap = Math.min(cap, precipitationAmount >= 0.3 ? 26 : 34);
  }
  if (precipitationRisk === "medium" || precipitationRisk === "high" || precipitationRisk === "severe") {
    cap = Math.min(cap, precipitationRisk === "medium" ? 34 : 22);
  }
  if (typeof transparencyScore === "number" && Number.isFinite(transparencyScore) && transparencyScore < 45) {
    cap = Math.min(cap, transparencyScore < 30 ? 24 : 34);
  }
  if (weatherWindow.some((hour) => hour.transparencyGrade === "poor")) {
    cap = Math.min(cap, 34);
  }
  if (visibility > 0 && visibility < 15) {
    cap = Math.min(cap, visibility < 8 ? 30 : 46);
  }
  if (humidity >= 90 && ((dewPointSpread > 0 && dewPointSpread <= 2.5) || lowCloud >= 30)) {
    cap = Math.min(cap, 36);
  }
  if (weatherWindow.some((hour) => /雨|雪|雾|霾|阴|大部多云|浓云|厚云/.test(hour.weatherTextZh ?? ""))) {
    cap = Math.min(cap, 30);
  }
  if (textBlocked) {
    cap = Math.min(cap, 30);
  }

  return cap;
}

function astroWeatherBlockers(
  weatherWindow: readonly NormalizedHourlyWeather[],
): readonly string[] {
  if (weatherWindow.length === 0) {
    return ["缺少窗口内天气数据，星空可拍性需要保守处理"];
  }

  const totalCloud = averageHourly(weatherWindow, (hour) => hour.cloudTotal);
  const lowCloud = averageHourly(weatherWindow, (hour) => hour.cloudLow);
  const midCloud = averageHourly(weatherWindow, (hour) => hour.cloudMid);
  const highCloud = averageHourly(weatherWindow, (hour) => hour.cloudHigh);
  const visibility = averageHourly(weatherWindow, (hour) => hour.rawVisibilityKm ?? hour.visibility);
  const humidity = averageHourly(weatherWindow, (hour) => hour.humidity);
  const dewPointSpread = averageHourly(weatherWindow, (hour) => hour.dewPointSpread);
  const transparencyScore = averageHourly(weatherWindow, (hour) => hour.photographyTransparencyScore);
  const precipitationProbability = Math.max(
    ...weatherWindow.map((hour) => hour.precipitationProbability ?? 0),
    0,
  );
  const precipitationAmount = weatherWindow.reduce(
    (sum, hour) => sum + (precipitationAmountMm(hour) ?? 0),
    0,
  );
  const precipitationRisk = precipitationRiskLevel({
    probability: precipitationProbability,
    amountMm: precipitationAmount,
  });
  const blockers: string[] = [];

  if (totalCloud >= 60) {
    blockers.push(
      totalCloud >= 80
        ? `总云量约 ${Math.round(totalCloud)}%，银河主体基本会被云层遮挡`
        : `总云量约 ${Math.round(totalCloud)}%，星点和银河主体可拍性明显下降`,
    );
  }
  if (lowCloud >= 30) {
    blockers.push(
      lowCloud >= 50
        ? `低云约 ${Math.round(lowCloud)}%，近地平线和地景星空基本不支持拍摄`
        : `低云约 ${Math.round(lowCloud)}%，会遮挡地景和低角度银河`,
    );
  }
  if (midCloud >= 60) {
    blockers.push(`中云约 ${Math.round(midCloud)}%，银河对比度和星点密度会明显下降`);
  }
  if (highCloud >= 80) {
    blockers.push(`高云约 ${Math.round(highCloud)}%，银河反差不足，仅适合作为备选观察`);
  }
  if (precipitationAmount > 0) {
    blockers.push(`窗口内预计降水 ${Math.round(precipitationAmount * 10) / 10}mm`);
  }
  if (typeof transparencyScore === "number" && Number.isFinite(transparencyScore) && transparencyScore < 45) {
    blockers.push("摄影通透度偏差，银河暗部和远山层次不可靠");
  }
  if (weatherWindow.some((hour) => hour.transparencyGrade === "poor")) {
    blockers.push("摄影通透度为差，不建议专程拍摄星空银河");
  }
  if (visibility > 0 && visibility < 15) {
    blockers.push(`能见度约 ${Math.round(visibility)} 公里，夜空透明度不足`);
  }
  if (humidity >= 90 && ((dewPointSpread > 0 && dewPointSpread <= 2.5) || lowCloud >= 30)) {
    blockers.push("湿度极高且露点差小，雾气和镜头结露风险高");
  }
  if (weatherWindow.some((hour) => /雨|雪|雾|霾|阴|大部多云|浓云|厚云/.test(hour.weatherTextZh ?? ""))) {
    blockers.push("天气现象包含雨、雾或厚云信号");
  }

  if (totalCloud >= 70) {
    blockers.push(`总云量约 ${Math.round(totalCloud)}%，星点和银河主体容易被遮挡`);
  }
  if (lowCloud >= 50) {
    blockers.push(`低云约 ${Math.round(lowCloud)}%，地景和近地平线星空可拍性差`);
  }
  if (precipitationRisk === "medium" || precipitationRisk === "high" || precipitationRisk === "severe") {
    blockers.push(`降水风险${precipitationRisk === "medium" ? "中" : "高"}，夜间窗口可能被打断`);
  }
  if (precipitationAmount >= 0.3) {
    blockers.push(`窗口内预计降水 ${Math.round(precipitationAmount * 10) / 10}mm`);
  }
  if (visibility > 0 && visibility < 10) {
    blockers.push(`能见度约 ${Math.round(visibility)} 公里，透明度不足`);
  }
  if (humidity >= 92 && lowCloud >= 45) {
    blockers.push("湿度极高且低云偏多，雾和镜头结露风险高");
  }
  if (
    weatherWindow.some((hour) =>
      /雨|雪|雾|霾|阴|overcast|rain|snow|fog|mist|heavy cloud/i.test(hour.weatherTextZh ?? ""),
    )
  ) {
    blockers.push("天气现象包含雨、雾或厚云信号");
  }

  return [...new Set(blockers)];
}

function maxMoonImpactScore(
  astroSummaries: readonly AstroSummary[],
  nightWindows: readonly AstroWindow[],
): number {
  const scores = nightWindows
    .map((window) => {
      const astro = astroSummaries.find((summary) => summary.date === window.date);
      return astro ? moonImpactForWindow(astro, window.start, window.end).score : undefined;
    })
    .filter((score): score is number => typeof score === "number" && Number.isFinite(score));

  return scores.length > 0 ? Math.max(...scores) : 45;
}

function buildCloudEvidence(
  input: ForecastCalculationInput,
  windows: readonly AstroWindow[],
): readonly AstroEvidenceItem[] {
  const weather = weatherForWindows(input.hourlyWeather, windows);
  const totalCloud = averageHourly(weather, (hour) => hour.cloudTotal);
  const lowCloud = averageHourly(weather, (hour) => hour.cloudLow);
  const midCloud = averageHourly(weather, (hour) => hour.cloudMid);
  const highCloud = averageHourly(weather, (hour) => hour.cloudHigh);

  return [
    {
      label: "总云量",
      value: weather.length > 0 ? `${Math.round(totalCloud)}%` : "暂无数据",
      effect: totalCloud <= 35 ? "positive" : totalCloud >= 65 ? "risk" : "neutral",
      noteZh: "总云量直接决定星点和银河主体是否会被遮挡。",
    },
    {
      label: "低云 / 中云 / 高云",
      value: hasMissingCloudLayerFields(input.weatherMissingFields)
        ? "分层缺失"
        : `${Math.round(lowCloud)}% / ${Math.round(midCloud)}% / ${Math.round(highCloud)}%`,
      effect: hasMissingCloudLayerFields(input.weatherMissingFields) ? "neutral" : "negative",
      noteZh: "低云遮挡地景和近地平线，中高云会影响银河反差和星点密度。",
    },
  ];
}

function buildVisibilityEvidence(
  input: ForecastCalculationInput,
  windows: readonly AstroWindow[],
): readonly AstroEvidenceItem[] {
  const weather = weatherForWindows(input.hourlyWeather, windows);
  const visibility = averageHourly(weather, (hour) => hour.visibility);
  const humidity = averageHourly(weather, (hour) => hour.humidity);
  const precipitation = averageHourly(weather, (hour) => hour.precipitationProbability);

  return [
    {
      label: "能见度",
      value: weather.length > 0 ? `${Math.round(visibility)} 公里` : "暂无数据",
      effect: visibility >= 20 ? "positive" : visibility <= 10 ? "risk" : "neutral",
      noteZh: "能见度影响银河暗部、远山层次和夜景空气感。",
    },
    {
      label: "湿度 / 降水",
      value:
        weather.length > 0
          ? `${Math.round(humidity)}% / ${Math.round(precipitation)}%`
          : "暂无数据",
      effect: humidity >= 85 || precipitation >= 45 ? "risk" : "neutral",
      noteZh: "高湿和降水概率会降低透明度，也会增加镜头结露风险。",
    },
    ...(input.weatherMissingFields.includes("visibility")
      ? [
          {
            label: "能见度缺失",
            value: "置信度降低",
            effect: "neutral" as const,
            noteZh: "当前天气源缺少能见度字段，通透度判断需要保守参考。",
          },
        ]
      : []),
  ];
}

function buildMoonEvidence(
  input: ForecastCalculationInput,
  windows: readonly AstroWindow[],
): readonly AstroEvidenceItem[] {
  return input.astroSummaries.map((astro) => {
    const window = windows.find((item) => item.date === astro.date);
    const impact = moonImpactForWindow(astro, window?.start, window?.end);

    return {
      label: dateLabelForInput(input, astro.date),
      value: `${astro.moonPhaseNameZh} / ${Math.round(normalizeIllumination(astro.moonIllumination) * 100)}%`,
      effect:
        impact.level === "high" ? "risk" : impact.level === "medium" ? "negative" : "positive",
      noteZh: `${impact.reasons.join(" ")} 月出 ${formatOptionalTime(astro.moonrise)}，月落 ${formatOptionalTime(
        astro.moonset,
      )}。`,
    };
  });
}

function buildTerrainEvidence(input: ForecastCalculationInput): readonly AstroEvidenceItem[] {
  const horizon = input.terrainAnalysis.horizonProfile;
  const angle = horizon.milkyWayHorizonAngle;

  return [
    {
      label: "银河方向地平遮挡",
      value: typeof angle === "number" ? `${angle.toFixed(1)}°` : "暂无数据",
      effect: typeof angle === "number" && angle > 12 ? "risk" : "neutral",
      noteZh: horizon.obstructionNoteZh,
    },
    {
      label: "地形数据",
      value: input.terrainAnalysis.dataSourceLabelZh,
      effect: input.terrainAnalysis.isMock ? "neutral" : "positive",
      noteZh: input.terrainAnalysis.honestyNoteZh,
    },
  ];
}

function buildAstroRiskReasons(
  input: ForecastCalculationInput,
  moonImpactScore: number,
  recommendedWindows: readonly AstroWindow[],
  weatherBlockers: readonly string[],
): readonly string[] {
  return [
    ...weatherBlockers.map((blocker) => `星空银河天气阻断：${blocker}。`),
    ...(weatherBlockers.length > 0
      ? ["天文窗口存在，但云量/降水/低云不支持拍摄；星空银河仅作为备选，不建议为此熬夜。"]
      : []),
    ...(recommendedWindows.length === 0
      ? ["当前没有同时满足天文黑夜、低月光影响和银心可见的推荐银河窗口。"]
      : []),
    ...(moonImpactScore >= 65 ? ["月光影响偏强，银河对比度会明显下降。"] : []),
    ...(input.weatherMissingFields.includes("visibility")
      ? ["缺少能见度数据，透明度判断需要保守参考。"]
      : []),
    ...(hasMissingCloudLayerFields(input.weatherMissingFields)
      ? ["缺少低云/中云/高云分层数据，云量判断置信度降低。"]
      : []),
    lightPollutionUnavailableNote,
  ];
}

function buildAstroOpportunityReasons(
  input: ForecastCalculationInput,
  astronomicalNightWindows: readonly AstroWindow[],
  moonlessNightWindows: readonly AstroWindow[],
  recommendedMilkyWayWindows: readonly AstroWindow[],
): readonly string[] {
  return [
    astronomicalNightWindows.length > 0
      ? `共找到 ${astronomicalNightWindows.length} 个天文黑夜窗口。`
      : "所选范围内暂未形成完整天文黑夜窗口。",
    moonlessNightWindows.length > 0
      ? `共找到 ${moonlessNightWindows.length} 个无月黑夜窗口。`
      : "月光或预报范围限制导致无月黑夜窗口不明确。",
    recommendedMilkyWayWindows.length > 0
      ? `共找到 ${recommendedMilkyWayWindows.length} 个推荐银河窗口。`
      : "银心候选窗口与低月光窗口交集不足。",
    input.terrainAnalysis.horizonProfile.milkyWayHorizonAngle !== undefined
      ? "演示地形遮挡已纳入银河方向风险判断。"
      : "地形遮挡角暂缺，现场视野仍需复核。",
  ];
}

function buildAstroTravelRecommendations(
  scores: AstroScoreInput,
  recommendedWindows: readonly AstroWindow[],
  weatherBlockers: readonly string[] = [],
): readonly string[] {
  const bestWindow = recommendedWindows[0];

  if (weatherBlockers.length > 0) {
    return [
      "天文窗口存在，但云量/降水/低云不支持拍摄。",
      "星空银河仅作为备选，不建议为此熬夜；优先等待短临云图和雷达改善。",
      ...weatherBlockers.slice(0, 2).map((blocker) => `主要阻断：${blocker}。`),
    ];
  }

  return [
    bestWindow
      ? `优先关注 ${formatTimeRange(bestWindow.start, bestWindow.end)} 的推荐银河窗口，提前完成构图和对焦。`
      : "若没有推荐银河窗口，不建议只为银河专程远途出发。",
    "月落后优先拍摄银河，月亮未落前可转拍月光风景或星轨堆栈。",
    "若银河窗口较短，建议提前完成构图和对焦。",
    scores.starsScore >= 65
      ? "星空条件可用时，可同步准备星轨、深空或山脊夜景素材。"
      : "若云量偏高，可优先选择城市夜景、月景或等待云缝。",
    "光污染较强时，优先避开城市方向或选择高海拔暗场机位。",
    scores.transparencyScore >= 65 && scores.milkyWayScore < 65
      ? "透明度好但银河条件一般时，可转拍星轨或山脊夜景。"
      : "出行前仍需复核最新云量、景区通行和现场安全条件。",
  ];
}

function buildAstroBackupPlans(): readonly GlowBackupPlan[] {
  return [
    {
      condition: "银河受月光影响",
      action: "转拍月景、月光山脊、星轨",
      detail: "月亮未落或照明偏强时，把月光作为环境光，保留夜景层次和前景质感。",
    },
    {
      condition: "云量偏高",
      action: "等待云缝或转城市夜景",
      detail: "银河主体被云遮挡时，优先观察云缝移动，也可转拍城市灯光、山体剪影或蓝调夜景。",
    },
    {
      condition: "透明度较好但银河低",
      action: "转拍星空环境人像或广角星轨",
      detail: "银心高度不足时，利用高透明度拍摄星点、星轨和地景关系。",
    },
    {
      condition: "光污染强",
      action: "调整朝向，避开城市光源方向",
      detail: "优先选择背离城市光源的方向，必要时换到更高海拔或更暗场机位。",
    },
  ];
}

function buildMissingDataNotes(input: ForecastCalculationInput): readonly string[] {
  const notes = [
    ...(hasMissingCloudLayerFields(input.weatherMissingFields)
      ? ["当前天气源缺少低云/中云/高云分层数据，星空银河判断置信度会降低。"]
      : []),
    ...(input.weatherMissingFields.includes("visibility")
      ? ["当前天气源缺少能见度数据，透明度判断置信度会降低。"]
      : []),
    ...(input.astroSummaries.some(
      (astro) => !astro.moonAltitudeByHour && !astro.moonAltitudeSamples,
    )
      ? ["缺少逐小时月亮高度，月光影响只能保守估算。"]
      : []),
    ...(input.astroSummaries.some(
      (astro) => astro.milkyWayCalculationPrecision === "v1_approximate",
    )
      ? ["银河窗口为简化本地估算，尚未完整建模银河拱桥、地形遮挡和光污染。"]
      : []),
    lightPollutionUnavailableNote,
    ...(input.weatherDataMode === "real"
      ? []
      : ["天气数据当前为演示数据，正式出行前需要复核真实预报。"]),
    ...(input.terrainAnalysis.isMock ? ["地形数据当前为演示数据，现场地平线遮挡仍需复核。"] : []),
  ];

  return Array.from(new Set(notes));
}

function classifyConfidence(notes: readonly string[]): AstroAnalysisResult["confidenceLevel"] {
  const highImpactNotes = notes.filter(
    (note) =>
      note.includes("缺少") ||
      note.includes("演示数据") ||
      note.includes("简化") ||
      note.includes("光污染"),
  );

  if (highImpactNotes.length >= 5) {
    return "low";
  }
  if (highImpactNotes.length >= 2) {
    return "medium";
  }
  return "high";
}

function dailyKeyReason(
  recommended: AstroWindow | undefined,
  moonless: AstroWindow | undefined,
  astronomicalNight: AstroWindow | undefined,
  weatherBlockers: readonly string[] = [],
): string {
  if (astronomicalNight && weatherBlockers.length > 0) {
    return "天文窗口存在，但云量/降水/低云不支持拍摄。";
  }
  if (recommended) {
    return `推荐银河窗口 ${formatTimeRange(recommended.start, recommended.end)}，方向 ${recommended.directionZh ?? "需现场复核"}。`;
  }
  if (moonless) {
    return `无月黑夜 ${formatTimeRange(moonless.start, moonless.end)}，可优先考虑星空、星轨和夜景。`;
  }
  if (astronomicalNight) {
    return `有天文黑夜 ${formatTimeRange(astronomicalNight.start, astronomicalNight.end)}，但月光或银心窗口限制较明显。`;
  }
  return "所选范围内缺少完整夜间窗口，建议扩大预报范围或更换日期。";
}

function dailyRiskNote(
  weatherWindow: readonly NormalizedHourlyWeather[],
  moonImpact: MoonImpact,
  input: ForecastCalculationInput,
): string {
  const blockers = astroWeatherBlockers(weatherWindow);
  if (blockers.length > 0) {
    return blockers[0]!;
  }
  const cloudTotal = averageHourly(weatherWindow, (hour) => hour.cloudTotal);
  if (cloudTotal >= 65) {
    return "云量偏高";
  }
  if (moonImpact.level === "high") {
    return "月光偏强";
  }
  if (
    input.terrainAnalysis.horizonProfile.milkyWayHorizonAngle !== undefined &&
    input.terrainAnalysis.horizonProfile.milkyWayHorizonAngle > 12
  ) {
    return "地形遮挡";
  }
  return "风险可控";
}

function riskTagsForWeather(
  weatherWindow: readonly NormalizedHourlyWeather[],
  moonImpact: MoonImpact,
): readonly string[] {
  const cloudTotal = averageHourly(weatherWindow, (hour) => hour.cloudTotal);
  const lowCloud = averageHourly(weatherWindow, (hour) => hour.cloudLow);
  const visibility = averageHourly(weatherWindow, (hour) => hour.visibility);
  const humidity = averageHourly(weatherWindow, (hour) => hour.humidity);
  const precipitationAmount = weatherWindow.reduce(
    (sum, hour) => sum + (precipitationAmountMm(hour) ?? 0),
    0,
  );
  const precipitationRisk = precipitationRiskLevel({
    probability: Math.max(...weatherWindow.map((hour) => hour.precipitationProbability ?? 0), 0),
    amountMm: precipitationAmount,
  });

  return [
    ...(moonImpact.level === "high"
      ? ["月光偏强"]
      : moonImpact.level === "medium"
        ? ["月光中等"]
        : ["月光较低"]),
    ...(cloudTotal >= 65 ? ["云量偏高"] : []),
    ...(lowCloud >= 50 ? ["低云阻挡"] : []),
    ...(precipitationRisk === "medium" ||
    precipitationRisk === "high" ||
    precipitationRisk === "severe"
      ? ["降水干扰"]
      : []),
    ...(visibility > 0 && visibility < 12 ? ["能见度偏低"] : []),
    ...(humidity >= 85 ? ["湿度偏高"] : []),
  ];
}

function weatherForWindows(
  hourlyWeather: readonly NormalizedHourlyWeather[],
  windows: readonly AstroWindow[],
): readonly NormalizedHourlyWeather[] {
  const collected = windows.flatMap((window) =>
    weatherBetween(hourlyWeather, window.start, window.end),
  );
  return collected.length > 0 ? collected : hourlyWeather;
}

function weatherBetween(
  hourlyWeather: readonly NormalizedHourlyWeather[],
  start: string,
  end: string,
): readonly NormalizedHourlyWeather[] {
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return [];
  }

  return hourlyWeather.filter((hour) => {
    const timestamp = Date.parse(hour.time);
    return Number.isFinite(timestamp) && timestamp >= startMs && timestamp <= endMs;
  });
}

function nightlyWeatherForDate(
  input: ForecastCalculationInput,
  date: string,
): readonly NormalizedHourlyWeather[] {
  return input.hourlyWeather.filter((hour) => {
    const localDate = formatZonedIso(hour.time, input.calendarBasis.timezone).slice(0, 10);
    const localHour = getHourInTimezone(hour.time, input.calendarBasis.timezone);
    return localDate === date && (localHour >= 20 || localHour <= 5);
  });
}

function parseForecastRange(input: ForecastCalculationInput): ForecastTimeRange | undefined {
  const startMs = Date.parse(input.calendarBasis.forecastStart);
  const endMs = Date.parse(input.calendarBasis.forecastEnd);

  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return undefined;
  }

  return {
    forecastStart: input.calendarBasis.forecastStart,
    forecastEnd: input.calendarBasis.forecastEnd,
    startMs,
    endMs,
  };
}

function clipWindow(
  start: string,
  end: string,
  forecastRange: ForecastTimeRange,
): Pick<AstroWindow, "start" | "end"> | undefined {
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  if (
    !Number.isFinite(startMs) ||
    !Number.isFinite(endMs) ||
    endMs <= startMs ||
    endMs <= forecastRange.startMs ||
    startMs >= forecastRange.endMs
  ) {
    return undefined;
  }

  const clippedStart = startMs < forecastRange.startMs ? forecastRange.forecastStart : start;
  const clippedEnd = endMs > forecastRange.endMs ? forecastRange.forecastEnd : end;

  if (Date.parse(clippedEnd) <= Date.parse(clippedStart)) {
    return undefined;
  }

  return {
    start: clippedStart,
    end: clippedEnd,
  };
}

function intersectWindows(
  left: Pick<AstroWindow, "start" | "end">,
  right: Pick<AstroWindow, "start" | "end">,
): Pick<AstroWindow, "start" | "end"> | undefined {
  const leftStart = Date.parse(left.start);
  const leftEnd = Date.parse(left.end);
  const rightStart = Date.parse(right.start);
  const rightEnd = Date.parse(right.end);
  const startMs = Math.max(leftStart, rightStart);
  const endMs = Math.min(leftEnd, rightEnd);

  if (
    !Number.isFinite(startMs) ||
    !Number.isFinite(endMs) ||
    endMs <= startMs ||
    endMs - startMs < minimumWindowMinutes * minuteMs
  ) {
    return undefined;
  }

  const timezone = timezoneFromIso(left.start) ?? defaultTimezone;
  return {
    start: formatZonedIso(new Date(startMs), timezone),
    end: formatZonedIso(new Date(endMs), timezone),
  };
}

function durationMinutes(start: string, end: string): number {
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);

  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return 0;
  }

  return Math.round((endMs - startMs) / minuteMs);
}

function recommendationLabelForScore(score: number): AstroRecommendationLabel {
  if (score >= 80) {
    return "推荐重点关注";
  }
  if (score >= 65) {
    return "值得等待";
  }
  if (score >= 50) {
    return "谨慎参考";
  }
  return "不建议专程";
}

function moonImpactLevel(score: number): MoonImpactLevel {
  if (score >= 65) {
    return "high";
  }
  if (score >= 35) {
    return "medium";
  }
  return "low";
}

function normalizeIllumination(value: number): number {
  return value > 1 && value <= 100 ? value / 100 : Math.min(1, Math.max(0, value));
}

function hasMissingCloudLayerFields(fields: readonly string[]): boolean {
  return ["cloudLow", "cloudMid", "cloudHigh"].some((field) => fields.includes(field));
}

function dateLabelForInput(input: ForecastCalculationInput, date: string): string {
  const calendarDay = input.calendarBasis.calendarDays.find((day) => day.date === date);
  if (calendarDay) {
    return calendarDay.dateLabel;
  }

  const index = input.calendarBasis.targetDates.indexOf(date);
  return input.calendarBasis.targetDateLabels[index] ?? date;
}

function formatTimeRange(start: string, end: string): string {
  return `${formatOptionalTime(start)} - ${formatOptionalTime(end)}`;
}

function formatOptionalTime(value: string | undefined): string {
  if (!value || !Number.isFinite(Date.parse(value))) {
    return "暂无数据";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function parseOptionalTime(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

function timezoneFromIso(value: string): string | undefined {
  if (value.endsWith("+08:00")) {
    return "Asia/Shanghai";
  }
  if (value.endsWith("Z")) {
    return "UTC";
  }
  return undefined;
}

function pad2(value: number): string {
  return value.toString().padStart(2, "0");
}
