import {
  defaultTimezone,
  formatChineseDateTimeRange,
  formatZonedIso,
  getHourInTimezone,
} from "@photo-weather/calendar";
import type {
  AstroAnalysisResult,
  AstroEvidenceItem,
  AstroPhotographyAssessment,
  AstroRiskLevel,
  AstroRecommendationLabel,
  AstroSummary,
  AstroWindow,
  DailyAstro,
  DirectionalLightPollutionRisk,
  ForecastCalculationInput,
  GlowBackupPlan,
  LightPollutionInfo,
  LightPollutionRiskLevel,
  MoonImpactLevel,
  NormalizedHourlyWeather,
} from "@photo-weather/shared";
import { averageHourly, averageWeightedScore, clampScore } from "./helpers.js";
import {
  calculatePhotographyTransparencyScore,
  precipitationAmountMm,
  precipitationRiskLevel,
} from "./weather-decision-metrics.js";
import {
  estimateBortleRangeForLightPollution,
  unavailableEstimatedBortleRange,
} from "./light-pollution-bortle.js";

const minuteMs = 60_000;
const moonlessSampleStepMs = 30 * minuteMs;
const minimumWindowMinutes = 30;
const lightPollutionUnavailableNote =
  "光污染数据暂缺；未按无光污染处理，需现场确认城市光穹与地平线环境。";
const defaultLightPollutionInfo: LightPollutionInfo = {
  available: false,
  dataAvailable: false,
  unavailableReason: "dataset_missing",
  ambientRiskLevel: "insufficient",
  ambientRiskLevelLabelZh: "数据不足",
  directionalRisk: [],
  confidence: "low",
  sampleCount: 0,
  validSampleCount: 0,
  estimatedBortleRange: unavailableEstimatedBortleRange("dataset_missing"),
  lightPollutionNoteZh: lightPollutionUnavailableNote,
  starPenalty: 0,
  milkyWayPenalty: 0,
  scoringMode: "heuristic",
};

export type ResolvedDirectionalLightPollutionRisk = {
  readonly azimuthDegrees: number;
  readonly riskIndex: number;
  readonly riskLevel: LightPollutionRiskLevel;
  readonly riskLevelLabelZh: string;
  readonly interpolationBasis: "exact" | "interpolated";
  readonly fromAzimuthDegrees: number;
  readonly toAzimuthDegrees: number;
};

export function lightPollutionRiskLevelFromIndex(index: number | null | undefined): {
  readonly level: LightPollutionRiskLevel;
  readonly labelZh: string;
} {
  if (typeof index !== "number" || !Number.isFinite(index)) {
    return { level: "insufficient", labelZh: "数据不足" };
  }
  if (index < 20) {
    return { level: "very_low", labelZh: "极低" };
  }
  if (index < 40) {
    return { level: "low", labelZh: "低" };
  }
  if (index < 60) {
    return { level: "medium", labelZh: "中" };
  }
  if (index < 80) {
    return { level: "high", labelZh: "高" };
  }
  return { level: "very_high", labelZh: "很高" };
}

export function resolveDirectionalLightPollutionRisk(
  targetAzimuthDegrees: number | null | undefined,
  directionalRisk: readonly DirectionalLightPollutionRisk[] | null | undefined,
): ResolvedDirectionalLightPollutionRisk | undefined {
  if (typeof targetAzimuthDegrees !== "number" || !Number.isFinite(targetAzimuthDegrees)) {
    return undefined;
  }
  const validSectors = (directionalRisk ?? [])
    .map((sector) => ({
      azimuthDegrees: normalizeAzimuth(sector.azimuthDegrees),
      riskIndex:
        typeof sector.riskIndex === "number" && Number.isFinite(sector.riskIndex)
          ? sector.riskIndex
          : undefined,
    }))
    .filter(
      (sector): sector is { readonly azimuthDegrees: number; readonly riskIndex: number } =>
        sector.riskIndex !== undefined && Number.isFinite(sector.azimuthDegrees),
    )
    .sort((left, right) => left.azimuthDegrees - right.azimuthDegrees);

  if (validSectors.length < 2) {
    return undefined;
  }

  const azimuth = normalizeAzimuth(targetAzimuthDegrees);
  const exact = validSectors.find(
    (sector) => circularDistanceDegrees(azimuth, sector.azimuthDegrees) < 0.0001,
  );
  if (exact) {
    const level = lightPollutionRiskLevelFromIndex(exact.riskIndex);
    return {
      azimuthDegrees: round1(azimuth),
      riskIndex: exact.riskIndex,
      riskLevel: level.level,
      riskLevelLabelZh: level.labelZh,
      interpolationBasis: "exact",
      fromAzimuthDegrees: exact.azimuthDegrees,
      toAzimuthDegrees: exact.azimuthDegrees,
    };
  }

  for (let index = 0; index < validSectors.length; index += 1) {
    const left = validSectors[index]!;
    const right = validSectors[(index + 1) % validSectors.length]!;
    const span = clockwiseDeltaDegrees(left.azimuthDegrees, right.azimuthDegrees);
    if (span <= 0) {
      continue;
    }
    const delta = clockwiseDeltaDegrees(left.azimuthDegrees, azimuth);
    if (delta >= 0 && delta <= span) {
      const weight = delta / span;
      const riskIndex = Math.round(left.riskIndex * (1 - weight) + right.riskIndex * weight);
      const level = lightPollutionRiskLevelFromIndex(riskIndex);
      return {
        azimuthDegrees: round1(azimuth),
        riskIndex,
        riskLevel: level.level,
        riskLevelLabelZh: level.labelZh,
        interpolationBasis: "interpolated",
        fromAzimuthDegrees: left.azimuthDegrees,
        toAzimuthDegrees: right.azimuthDegrees,
      };
    }
  }

  return undefined;
}

export function lightPollutionWithTargetAzimuth(
  lightPollution: LightPollutionInfo,
  targetAzimuthDegrees: number | null | undefined,
): LightPollutionInfo {
  const normalizedTargetAzimuth =
    typeof targetAzimuthDegrees === "number" && Number.isFinite(targetAzimuthDegrees)
      ? round1(normalizeAzimuth(targetAzimuthDegrees))
      : null;
  const resolved = lightPollution.available
    ? resolveDirectionalLightPollutionRisk(normalizedTargetAzimuth, lightPollution.directionalRisk)
    : undefined;
  const next: LightPollutionInfo = {
    ...lightPollution,
    targetAzimuthDegrees: normalizedTargetAzimuth,
    targetDirectionRisk: resolved?.riskIndex ?? null,
    targetDirectionLevel: resolved?.riskLevel ?? null,
    targetDirectionLevelLabelZh: resolved?.riskLevelLabelZh ?? null,
  };
  const penalties = lightPollutionPenalties(next);
  return {
    ...next,
    starPenalty: penalties.starPenalty,
    milkyWayPenalty: penalties.milkyWayPenalty,
    estimatedBortleRange: estimateBortleRangeForLightPollution(next),
    scoringMode: "heuristic",
  };
}

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

type WeatherWindowStats = {
  readonly hasData: boolean;
  readonly totalCloudAvg: number;
  readonly totalCloudMax: number;
  readonly lowCloudAvg?: number;
  readonly lowCloudMax?: number;
  readonly midCloudAvg?: number;
  readonly highCloudAvg?: number;
  readonly visibilityAvg?: number;
  readonly visibilityMin?: number;
  readonly humidityAvg?: number;
  readonly humidityMax?: number;
  readonly dewPointSpreadAvg?: number;
  readonly dewPointSpreadMin?: number;
  readonly transparencyScoreAvg?: number;
  readonly transparencyScoreMin?: number;
  readonly precipitationProbabilityMax?: number;
  readonly precipitationAmountTotal: number;
  readonly precipitationRisk: ReturnType<typeof precipitationRiskLevel>;
  readonly windSpeedAvg?: number;
  readonly windGustMax?: number;
  readonly temperatureMin?: number;
  readonly weatherText: string;
};

type AssessmentBuildInput = {
  readonly input: ForecastCalculationInput;
  readonly astro?: AstroSummary;
  readonly astronomicalNightWindow?: AstroWindow;
  readonly moonlessNightWindow?: AstroWindow;
  readonly candidateWindow?: AstroWindow;
  readonly recommendedMilkyWayWindow?: AstroWindow;
  readonly weatherWindow: readonly NormalizedHourlyWeather[];
  readonly scores: AstroScoreInput;
  readonly lightPollution: LightPollutionInfo;
};

function normalizeLightPollutionInfo(input: LightPollutionInfo | undefined): LightPollutionInfo {
  if (!input) {
    return defaultLightPollutionInfo;
  }
  const normalized: LightPollutionInfo = {
    ...defaultLightPollutionInfo,
    ...input,
    ambientRiskLevel: input.ambientRiskLevel ?? defaultLightPollutionInfo.ambientRiskLevel,
    ambientRiskLevelLabelZh:
      input.ambientRiskLevelLabelZh ?? defaultLightPollutionInfo.ambientRiskLevelLabelZh,
    directionalRisk: input.directionalRisk ?? [],
    scoringMode: "heuristic",
  };
  return lightPollutionWithTargetAzimuth(normalized, input.targetAzimuthDegrees);
}

function lightPollutionPenalties(lightPollution: LightPollutionInfo): {
  readonly starPenalty: number;
  readonly milkyWayPenalty: number;
} {
  if (!lightPollution.available) {
    return { starPenalty: 0, milkyWayPenalty: 0 };
  }

  const ambientRisk = finiteNumber(lightPollution.ambientRiskIndex);
  const targetRisk = finiteNumber(lightPollution.targetDirectionRisk);
  const starPenalty =
    ambientRisk === undefined ? 0 : Math.min(20, Math.round((ambientRisk / 100) * 20));
  const milkyWayRisk =
    targetRisk !== undefined
      ? ambientRisk !== undefined
        ? ambientRisk * 0.55 + targetRisk * 0.45
        : targetRisk
      : ambientRisk;
  const milkyWayPenalty =
    milkyWayRisk === undefined ? 0 : Math.min(35, Math.round((milkyWayRisk / 100) * 35));

  return { starPenalty, milkyWayPenalty };
}

function finiteNumber(value: number | null | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function normalizeAzimuth(value: number): number {
  const normalized = value % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

function clockwiseDeltaDegrees(from: number, to: number): number {
  return (normalizeAzimuth(to) - normalizeAzimuth(from) + 360) % 360;
}

function circularDistanceDegrees(left: number, right: number): number {
  return Math.abs(((normalizeAzimuth(left) - normalizeAzimuth(right) + 180) % 360) - 180);
}

function round1(value: number): number {
  return Number(value.toFixed(1));
}

function applyLightPollutionToAstroScores(
  scores: AstroScoreInput,
  lightPollution: LightPollutionInfo,
): AstroScoreInput {
  if (!lightPollution.available) {
    return scores;
  }
  return {
    ...scores,
    starsScore: clampScore(scores.starsScore - lightPollution.starPenalty),
    milkyWayScore: clampScore(scores.milkyWayScore - lightPollution.milkyWayPenalty),
  };
}

function lightPollutionPracticalPenalty(
  lightPollution: LightPollutionInfo,
  hasMilkyWayWindow: boolean,
): number {
  if (!lightPollution.available) {
    return 0;
  }
  return hasMilkyWayWindow ? lightPollution.milkyWayPenalty : lightPollution.starPenalty;
}

function buildLightPollutionEvidence(
  lightPollution: LightPollutionInfo,
): readonly AstroEvidenceItem[] {
  if (!lightPollution.available) {
    return [
      {
        label: "光污染影响",
        value: "数据暂缺",
        effect: "neutral",
        noteZh: lightPollution.lightPollutionNoteZh || lightPollutionUnavailableNote,
      },
    ];
  }
  const targetLabel = lightPollution.targetDirectionLevelLabelZh
    ? `；银河方向光害${lightPollution.targetDirectionLevelLabelZh}`
    : "；银河方向角不足，未推断目标方向光害";
  const penaltyText = `星空指数-${lightPollution.starPenalty}，银河指数-${lightPollution.milkyWayPenalty}`;
  const bortleText = lightPollution.estimatedBortleRange?.available
    ? `；波特尔估算：${lightPollution.estimatedBortleRange.rangeLabelZh} · ${lightPollution.estimatedBortleRange.skyQualityLabelZh}`
    : "";
  return [
    {
      label: "光污染影响",
      value: `环境${lightPollution.ambientRiskLevelLabelZh}`,
      effect:
        (lightPollution.ambientRiskIndex ?? 0) >= 60 ||
        (lightPollution.targetDirectionRisk ?? 0) >= 60
          ? "risk"
          : "neutral",
      noteZh: `${lightPollutionDecisionText(lightPollution)}${targetLabel}${bortleText}；${penaltyText}。`,
    },
  ];
}

function lightPollutionDecisionText(lightPollution: LightPollutionInfo): string {
  const ambientRisk = finiteNumber(lightPollution.ambientRiskIndex);
  const targetRisk = finiteNumber(lightPollution.targetDirectionRisk);
  const risk = Math.max(ambientRisk ?? 0, targetRisk ?? 0);

  if (targetRisk !== undefined && targetRisk >= 60 && (ambientRisk ?? targetRisk) < 60) {
    return "银河方向光害偏高，建议避开城市方向构图或向更暗一侧取景。";
  }
  if (risk >= 80) {
    return "光污染很强，即使天气较好，银河细节也可能偏弱。";
  }
  if (risk >= 60) {
    return "光污染较强，即使天空较清，银河背景也容易被光害压亮。";
  }
  if (risk >= 40) {
    return "光污染中等，银河细节依赖透明度和避开城市方向的构图。";
  }
  return "光污染较低，银河背景更暗，有利于拍摄。";
}

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
  const baseLightPollution = normalizeLightPollutionInfo(input.lightPollution);
  const dailyAstro = buildDailyAstro(
    input,
    astronomicalNightWindows,
    moonlessNightWindows,
    milkyWayCandidateWindows,
    recommendedMilkyWayWindows,
    scores,
    baseLightPollution,
  );
  const topDailyAstro = selectTopDailyAstro(dailyAstro);
  const lightPollution = topDailyAstro?.lightPollution ?? baseLightPollution;
  const adjustedScores = applyLightPollutionToAstroScores(scores, lightPollution);
  const assessment =
    topDailyAstro?.assessment ??
    buildAstroPhotographyAssessment({
      input,
      astro: input.astroSummaries[0],
      weatherWindow: input.hourlyWeather,
      scores,
      lightPollution,
    });
  const weatherBlockers = buildAstroWeatherBlockers(input, astronomicalNightWindows);
  const moonImpactScore = assessment.moonlightImpactScore;
  const astroConditionScore = assessment.astronomicalWindowScore;
  const astroPracticalScore = assessment.practicalAstroScore;
  const astroWindowAvailable = dailyAstro.some((day) => day.astroWindowAvailable);
  const astroShootable = dailyAstro.some((day) => day.astroShootable);
  const astroTravelScore = astroPracticalScore;
  const recommendationLabel = recommendationLabelForScore(astroTravelScore);
  const missingDataNotes = buildMissingDataNotes(input, lightPollution);
  const confidenceLevel = classifyConfidence(missingDataNotes);
  const cloudEvidence = buildCloudEvidence(input, astronomicalNightWindows);
  const visibilityEvidence = buildVisibilityEvidence(input, astronomicalNightWindows);
  const moonEvidence = buildMoonEvidence(input, astronomicalNightWindows);
  const terrainEvidence = buildTerrainEvidence(input);
  const lightPollutionEvidence = buildLightPollutionEvidence(lightPollution);
  const bestAstroWindows = [...recommendedMilkyWayWindows, ...moonlessNightWindows]
    .sort(
      (left, right) => right.score - left.score || Date.parse(left.start) - Date.parse(right.start),
    )
    .slice(0, Math.max(3, input.calendarBasis.targetDates.length));

  return {
    starsScore: adjustedScores.starsScore,
    milkyWayScore: adjustedScores.milkyWayScore,
    astroConditionScore,
    astroPracticalScore,
    astronomicalWindowScore: assessment.astronomicalWindowScore,
    skyConditionScore: assessment.skyConditionScore,
    milkyWayGeometryScore: assessment.milkyWayGeometryScore,
    moonlightImpactScore: assessment.moonlightImpactScore,
    moonImpactScore,
    transparencyScore: assessment.transparencyScore,
    dewRiskScore: assessment.dewRiskScore,
    practicalAstroScore: assessment.practicalAstroScore,
    astroTravelScore,
    recommendationLabel,
    confidenceLevel,
    astroWindowAvailable,
    astroShootable,
    labels: assessment.labels,
    cloudBlockerLevel: assessment.cloudBlockerLevel,
    dewRiskLevel: assessment.dewRiskLevel,
    tripodWindRisk: assessment.tripodWindRisk,
    assessment,
    recommendedMilkyWayWindow: assessment.recommendedMilkyWayWindow,
    gearAdviceZh: assessment.gearAdviceZh,
    warmthAdviceZh: assessment.warmthAdviceZh,
    bestAstroWindows,
    dailyAstro,
    moonInfo: input.astroSummaries[0]?.moonInfo,
    moonlessNightWindows,
    astronomicalNightWindows,
    milkyWayCandidateWindows,
    recommendedMilkyWayWindows,
    lightPollution,
    cloudEvidence,
    visibilityEvidence,
    moonEvidence,
    terrainEvidence,
    lightPollutionEvidence,
    weatherBlockers,
    riskReasons: buildAstroRiskReasons(
      input,
      assessment,
      recommendedMilkyWayWindows,
      weatherBlockers,
      lightPollution,
    ),
    opportunityReasons: buildAstroOpportunityReasons(
      input,
      astronomicalNightWindows,
      moonlessNightWindows,
      recommendedMilkyWayWindows,
    ),
    travelRecommendations: buildAstroTravelRecommendations(
      adjustedScores,
      assessment,
      recommendedMilkyWayWindows,
      weatherBlockers,
      lightPollution,
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
        galacticCenterAzimuth: astro.milkyWayGalacticCenterAzimuth,
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

    return intersections.flatMap((window) => {
      const weatherWindow = weatherBetween(input.hourlyWeather, window.start, window.end);
      const moonImpact = moonImpactForWindow(astro, window.start, window.end);
      const score = calculateMilkyWayWindowScore(input, astro, window.start, window.end);
      if (!weatherSupportsMilkyWayWindow(weatherWindow) || score < 50) {
        return [];
      }

      return [
        {
          type: "recommended_milky_way",
          labelZh: "推荐银河窗口",
          date: candidate.date,
          start: window.start,
          end: window.end,
          durationMinutes: durationMinutes(window.start, window.end),
          score,
          riskTags: riskTagsForWeather(weatherWindow, moonImpact),
          noteZh:
            "该窗口同时位于天文黑夜、低月光影响窗口、银心可见候选窗口和可接受天气窗口内，适合作为银河拍摄优先时段。",
          directionZh: candidate.directionZh,
          galacticCenterAltitude: candidate.galacticCenterAltitude,
          galacticCenterAzimuth: candidate.galacticCenterAzimuth,
        } satisfies AstroWindow,
      ];
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
  lightPollution: LightPollutionInfo,
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
    const baseStarsScore = astro
      ? calculateDailyStarsScore(input, astro, weatherWindow)
      : scores.starsScore;
    const baseMilkyWayScore =
      recommendedMilkyWayWindow?.score ??
      candidateWindow?.score ??
      Math.min(58, scores.milkyWayScore);
    const dailyLightPollution = lightPollutionWithTargetAzimuth(
      lightPollution,
      dailyMilkyWayTargetAzimuth(recommendedMilkyWayWindow, candidateWindow),
    );
    const starsScore = dailyLightPollution.available
      ? clampScore(baseStarsScore - dailyLightPollution.starPenalty)
      : baseStarsScore;
    const milkyWayScore = dailyLightPollution.available
      ? clampScore(baseMilkyWayScore - dailyLightPollution.milkyWayPenalty)
      : baseMilkyWayScore;
    const assessment = buildAstroPhotographyAssessment({
      input,
      astro,
      astronomicalNightWindow,
      moonlessNightWindow,
      candidateWindow,
      recommendedMilkyWayWindow,
      weatherWindow,
      scores: {
        ...scores,
        starsScore,
        milkyWayScore,
      },
      lightPollution: dailyLightPollution,
    });
    const weatherBlockers = assessment.astroWeatherBlockers;
    const astroConditionScore = assessment.astronomicalWindowScore;
    const astroPracticalScore = assessment.practicalAstroScore;

    return {
      date,
      dateLabelZh: dateLabelForInput(input, date),
      lunarDateText: astro?.lunarDateText,
      starsScore,
      milkyWayScore,
      astroConditionScore,
      astroPracticalScore,
      astronomicalWindowScore: assessment.astronomicalWindowScore,
      skyConditionScore: assessment.skyConditionScore,
      milkyWayGeometryScore: assessment.milkyWayGeometryScore,
      moonlightImpactScore: assessment.moonlightImpactScore,
      transparencyScore: assessment.transparencyScore,
      dewRiskScore: assessment.dewRiskScore,
      practicalAstroScore: assessment.practicalAstroScore,
      astronomicalWindowAvailable: Boolean(astronomicalNightWindow),
      astroWindowAvailable: assessment.astroWindowAvailable,
      astroShootable: assessment.astroShootable,
      weatherBlockers,
      moonImpactLevel: assessment.moonImpactLevel,
      cloudBlockerLevel: assessment.cloudBlockerLevel,
      dewRiskLevel: assessment.dewRiskLevel,
      tripodWindRisk: assessment.tripodWindRisk,
      labels: assessment.labels,
      gearAdviceZh: assessment.gearAdviceZh,
      warmthAdviceZh: assessment.warmthAdviceZh,
      astronomicalNightWindow,
      moonlessNightWindow,
      recommendedMilkyWayWindow,
      assessment,
      lightPollution: dailyLightPollution,
      recommendationLabel: recommendationLabelForScore(astroPracticalScore),
      keyReason: dailyKeyReason(
        recommendedMilkyWayWindow,
        moonlessNightWindow,
        astronomicalNightWindow,
        candidateWindow,
        assessment,
        weatherBlockers,
      ),
      riskNote: dailyRiskNote(weatherWindow, assessment, input),
    };
  });
}

function dailyMilkyWayTargetAzimuth(
  recommendedMilkyWayWindow: AstroWindow | undefined,
  candidateWindow: AstroWindow | undefined,
): number | undefined {
  const azimuth =
    recommendedMilkyWayWindow?.galacticCenterAzimuth ?? candidateWindow?.galacticCenterAzimuth;
  return typeof azimuth === "number" && Number.isFinite(azimuth) ? azimuth : undefined;
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

function buildAstroWeatherBlockers(
  input: ForecastCalculationInput,
  windows: readonly AstroWindow[],
): readonly string[] {
  return astroWeatherBlockers(weatherForWindows(input.hourlyWeather, windows));
}

function buildAstroPhotographyAssessment({
  input,
  astro,
  astronomicalNightWindow,
  moonlessNightWindow,
  candidateWindow,
  recommendedMilkyWayWindow,
  weatherWindow,
  scores,
  lightPollution,
}: AssessmentBuildInput): AstroPhotographyAssessment {
  const stats = summarizeWeatherWindow(weatherWindow);
  const moonImpact = astro
    ? moonImpactForWindow(
        astro,
        astronomicalNightWindow?.start ?? astro.astronomicalNightStart,
        astronomicalNightWindow?.end ?? astro.astronomicalNightEnd,
      )
    : {
        level: "medium" as const,
        score: 45,
        reasons: ["缺少月亮高度数据，按中等月光影响保守处理。"],
      };
  const milkyWayGeometryScore = calculateMilkyWayGeometryScore(input, candidateWindow);
  const astronomicalWindowScore = calculateAstronomicalWindowScore({
    astronomicalNightWindow,
    moonlessNightWindow,
    candidateWindow,
    milkyWayGeometryScore,
    moonImpactScore: moonImpact.score,
  });
  const skyConditionScore = calculateSkyConditionScore(stats);
  const transparencyScore = calculateWindowTransparencyScore(
    weatherWindow,
    stats,
    scores.transparencyScore,
  );
  const dewRiskScore = calculateDewRiskScore(stats);
  const cloudBlockerLevel = cloudBlockerLevelForStats(stats);
  const dewRiskLevel = riskLevelFromRiskScore(dewRiskScore);
  const tripodWindRisk = tripodWindRiskForStats(stats);
  const astroWeatherBlockers = astroWeatherBlockersForStats(stats);
  const astroWindowAvailable =
    Boolean(astronomicalNightWindow) && (Boolean(moonlessNightWindow) || moonImpact.score < 65);
  const rawPracticalScore = averageWeightedScore([
    { score: astronomicalWindowScore, weight: 0.24 },
    { score: skyConditionScore, weight: 0.3 },
    { score: transparencyScore, weight: 0.18 },
    {
      score: recommendedMilkyWayWindow
        ? milkyWayGeometryScore
        : Math.min(milkyWayGeometryScore, 62),
      weight: 0.14,
    },
    { score: 100 - moonImpact.score, weight: 0.08 },
    { score: 100 - dewRiskScore, weight: 0.06 },
  ]);
  const basePracticalAstroScore = Math.min(
    rawPracticalScore,
    astroPracticalWeatherCap(stats, astroWeatherBlockers, moonImpact, astroWindowAvailable),
  );
  const practicalAstroScore = clampScore(
    basePracticalAstroScore -
      lightPollutionPracticalPenalty(
        lightPollution,
        Boolean(recommendedMilkyWayWindow || candidateWindow),
      ),
  );
  const weatherAllows =
    astroWeatherBlockers.length === 0 &&
    skyConditionScore >= 55 &&
    transparencyScore >= 45 &&
    stats.precipitationRisk !== "medium" &&
    stats.precipitationRisk !== "high" &&
    stats.precipitationRisk !== "severe";
  const dewManageable = dewRiskScore < 88;
  const astroShootable =
    astroWindowAvailable &&
    weatherAllows &&
    dewManageable &&
    practicalAstroScore >= 58 &&
    (Boolean(recommendedMilkyWayWindow) || Boolean(moonlessNightWindow));
  const labels = buildAstroPhotographyLabels({
    astroWindowAvailable,
    astroShootable,
    practicalAstroScore,
    recommendedMilkyWayWindow,
    candidateWindow,
    milkyWayGeometryScore,
    moonImpactLevel: moonImpact.level,
    cloudBlockerLevel,
    dewRiskLevel,
  });

  return {
    astronomicalWindowScore,
    skyConditionScore,
    milkyWayGeometryScore,
    moonlightImpactScore: moonImpact.score,
    transparencyScore,
    dewRiskScore,
    practicalAstroScore,
    astroWindowAvailable,
    astroShootable,
    labels,
    moonImpactLevel: moonImpact.level,
    cloudBlockerLevel,
    dewRiskLevel,
    tripodWindRisk,
    astroWeatherBlockers,
    recommendedMilkyWayWindow: astroShootable ? recommendedMilkyWayWindow : undefined,
    moonImpactReasonsZh: moonImpact.reasons,
    gearAdviceZh: buildGearAdviceZh(stats, dewRiskLevel, tripodWindRisk, moonImpact.level),
    warmthAdviceZh: buildWarmthAdviceZh(stats),
  };
}

function selectTopDailyAstro(dailyAstro: readonly DailyAstro[]): DailyAstro | undefined {
  return [...dailyAstro].sort(
    (left, right) =>
      Number(right.assessment.astroShootable) - Number(left.assessment.astroShootable) ||
      right.assessment.practicalAstroScore - left.assessment.practicalAstroScore ||
      right.assessment.astronomicalWindowScore - left.assessment.astronomicalWindowScore,
  )[0];
}

function summarizeWeatherWindow(
  weatherWindow: readonly NormalizedHourlyWeather[],
): WeatherWindowStats {
  const precipitationProbabilityMax =
    maxOptionalNumber(weatherWindow.map((hour) => hour.precipitationProbability ?? undefined)) ?? 0;
  const precipitationAmountTotal = weatherWindow.reduce(
    (sum, hour) => sum + (precipitationAmountMm(hour) ?? 0),
    0,
  );

  return {
    hasData: weatherWindow.length > 0,
    totalCloudAvg: averageOptionalNumber(weatherWindow.map((hour) => hour.cloudTotal)) ?? 0,
    totalCloudMax: maxOptionalNumber(weatherWindow.map((hour) => hour.cloudTotal)) ?? 0,
    lowCloudAvg: averageOptionalNumber(weatherWindow.map((hour) => hour.cloudLow ?? undefined)),
    lowCloudMax: maxOptionalNumber(weatherWindow.map((hour) => hour.cloudLow ?? undefined)),
    midCloudAvg: averageOptionalNumber(weatherWindow.map((hour) => hour.cloudMid ?? undefined)),
    highCloudAvg: averageOptionalNumber(weatherWindow.map((hour) => hour.cloudHigh ?? undefined)),
    visibilityAvg: averageOptionalNumber(
      weatherWindow.map((hour) => hour.rawVisibilityKm ?? hour.visibility ?? undefined),
    ),
    visibilityMin: minOptionalNumber(
      weatherWindow.map((hour) => hour.rawVisibilityKm ?? hour.visibility ?? undefined),
    ),
    humidityAvg: averageOptionalNumber(weatherWindow.map((hour) => hour.humidity)),
    humidityMax: maxOptionalNumber(weatherWindow.map((hour) => hour.humidity)),
    dewPointSpreadAvg: averageOptionalNumber(
      weatherWindow.map((hour) => hour.dewPointSpread ?? undefined),
    ),
    dewPointSpreadMin: minOptionalNumber(
      weatherWindow.map((hour) => hour.dewPointSpread ?? undefined),
    ),
    transparencyScoreAvg: averageOptionalNumber(
      weatherWindow.map((hour) => hour.photographyTransparencyScore),
    ),
    transparencyScoreMin: minOptionalNumber(
      weatherWindow.map((hour) => hour.photographyTransparencyScore),
    ),
    precipitationProbabilityMax,
    precipitationAmountTotal,
    precipitationRisk: precipitationRiskLevel({
      probability: precipitationProbabilityMax,
      amountMm: precipitationAmountTotal,
    }),
    windSpeedAvg: averageOptionalNumber(weatherWindow.map((hour) => hour.windSpeed)),
    windGustMax: maxOptionalNumber(
      weatherWindow.map((hour) => hour.windGust ?? hour.windSpeed ?? undefined),
    ),
    temperatureMin: minOptionalNumber(
      weatherWindow.map(
        (hour) => hour.elevationAdjustedTemperature ?? hour.temperature ?? undefined,
      ),
    ),
    weatherText: weatherWindow
      .map((hour) => hour.weatherTextZh)
      .filter((text): text is string => typeof text === "string" && text.length > 0)
      .join(" "),
  };
}

function calculateAstronomicalWindowScore(input: {
  readonly astronomicalNightWindow?: AstroWindow;
  readonly moonlessNightWindow?: AstroWindow;
  readonly candidateWindow?: AstroWindow;
  readonly milkyWayGeometryScore: number;
  readonly moonImpactScore: number;
}): number {
  const nightDurationScore = input.astronomicalNightWindow
    ? clampScore((input.astronomicalNightWindow.durationMinutes / 360) * 100)
    : 0;
  const moonWindowScore = input.moonlessNightWindow ? 90 : clampScore(100 - input.moonImpactScore);
  const geometryScore = input.candidateWindow
    ? input.milkyWayGeometryScore
    : input.astronomicalNightWindow
      ? 48
      : 0;

  return averageWeightedScore([
    { score: nightDurationScore, weight: 0.46 },
    { score: moonWindowScore, weight: 0.28 },
    { score: geometryScore, weight: 0.26 },
  ]);
}

function calculateMilkyWayGeometryScore(
  input: ForecastCalculationInput,
  candidateWindow: AstroWindow | undefined,
): number {
  if (!candidateWindow) {
    return 20;
  }

  const durationScore = clampScore((candidateWindow.durationMinutes / 150) * 100);
  const altitudeScore =
    typeof candidateWindow.galacticCenterAltitude === "number"
      ? clampScore((candidateWindow.galacticCenterAltitude - 8) * 5)
      : 58;
  const directionScore = candidateWindow.directionZh ? 76 : 52;
  const horizonAngle = input.terrainAnalysis.horizonProfile.milkyWayHorizonAngle;
  const horizonPenalty =
    typeof horizonAngle === "number" && Number.isFinite(horizonAngle)
      ? Math.max(0, horizonAngle - 8) * 3
      : 0;

  return clampScore(
    averageWeightedScore([
      { score: durationScore, weight: 0.36 },
      { score: altitudeScore, weight: 0.44 },
      { score: directionScore, weight: 0.2 },
    ]) - horizonPenalty,
  );
}

function calculateSkyConditionScore(stats: WeatherWindowStats): number {
  if (!stats.hasData) {
    return 35;
  }

  const lowCloudAvg = stats.lowCloudAvg ?? Math.min(100, stats.totalCloudAvg * 0.45);
  const cloudScore = calculateAstroCloudScore(stats);
  const precipitationScore =
    100 -
    (stats.precipitationRisk === "severe"
      ? 96
      : stats.precipitationRisk === "high"
        ? 86
        : stats.precipitationRisk === "medium"
          ? 62
          : stats.precipitationRisk === "low"
            ? 30
            : 0);
  const visibilityScore =
    stats.visibilityAvg !== undefined ? clampScore(Math.min(stats.visibilityAvg, 36) * 2.6) : 55;
  const weatherTextPenalty = hasRainFogMistText(stats.weatherText)
    ? 34
    : hasThickCloudText(stats.weatherText)
      ? 16
      : 0;

  return clampScore(
    averageWeightedScore([
      { score: cloudScore, weight: 0.46 },
      { score: precipitationScore, weight: 0.2 },
      { score: visibilityScore, weight: 0.18 },
      { score: 100 - lowCloudAvg, weight: 0.16 },
    ]) - weatherTextPenalty,
  );
}

function calculateAstroCloudScore(stats: WeatherWindowStats): number {
  const lowCloudAvg = stats.lowCloudAvg ?? Math.min(100, stats.totalCloudAvg * 0.45);
  const midCloudAvg = stats.midCloudAvg ?? Math.min(100, stats.totalCloudAvg * 0.35);
  const highCloudAvg = stats.highCloudAvg ?? Math.min(100, stats.totalCloudAvg * 0.35);
  let score = 100 - stats.totalCloudAvg * 0.68 - lowCloudAvg * 0.95;

  if (stats.totalCloudAvg <= 25 && lowCloudAvg <= 15) {
    score += 10;
  }
  if (stats.totalCloudAvg >= 70) {
    score -= stats.totalCloudAvg >= 85 ? 42 : 26;
  }
  if (lowCloudAvg >= 30) {
    score -= lowCloudAvg >= 50 ? 46 : 28;
  }
  if (midCloudAvg >= 70) {
    score -= 14;
  }
  if (highCloudAvg >= 85) {
    score -= 12;
  }

  return clampScore(score);
}

function calculateWindowTransparencyScore(
  weatherWindow: readonly NormalizedHourlyWeather[],
  stats: WeatherWindowStats,
  fallbackScore: number,
): number {
  const directScore =
    stats.transparencyScoreAvg ??
    averageOptionalNumber(weatherWindow.map((hour) => calculatePhotographyTransparencyScore(hour)));
  if (directScore !== undefined) {
    return clampScore(directScore);
  }
  if (!stats.hasData) {
    return Math.min(45, fallbackScore);
  }

  const visibilityScore =
    stats.visibilityAvg !== undefined ? clampScore(Math.min(stats.visibilityAvg, 40) * 2.4) : 55;
  const humidityScore = stats.humidityAvg !== undefined ? 100 - stats.humidityAvg : 55;
  const lowCloudScore =
    stats.lowCloudAvg !== undefined
      ? 100 - stats.lowCloudAvg * 0.55
      : 100 - stats.totalCloudAvg * 0.35;
  const precipitationScore =
    stats.precipitationRisk === "none"
      ? 95
      : stats.precipitationRisk === "low"
        ? 74
        : stats.precipitationRisk === "medium"
          ? 40
          : 18;

  return averageWeightedScore([
    { score: visibilityScore, weight: 0.32 },
    { score: humidityScore, weight: 0.22 },
    { score: lowCloudScore, weight: 0.2 },
    { score: precipitationScore, weight: 0.26 },
  ]);
}

function calculateDewRiskScore(stats: WeatherWindowStats): number {
  if (!stats.hasData) {
    return 38;
  }

  const humidity = Math.max(stats.humidityAvg ?? 0, stats.humidityMax ?? 0);
  const spread = stats.dewPointSpreadMin ?? stats.dewPointSpreadAvg;
  const wind = stats.windSpeedAvg ?? 0;
  let score = 18;

  if (humidity >= 90 && spread !== undefined && spread <= 2 && wind <= 2) {
    score = 90;
  } else if (humidity >= 90 && spread !== undefined && spread <= 2.5) {
    score = 78;
  } else if (humidity >= 85 && spread !== undefined && spread <= 3) {
    score = 64;
  } else if (humidity >= 80 && spread !== undefined && spread <= 4) {
    score = 46;
  } else if (humidity >= 90) {
    score = 42;
  }

  if (hasRainFogMistText(stats.weatherText)) {
    score = Math.max(score, 76);
  }

  return clampScore(score);
}

function astroPracticalWeatherCap(
  stats: WeatherWindowStats,
  blockers: readonly string[],
  moonImpact: MoonImpact,
  astroWindowAvailable: boolean,
): number {
  if (!astroWindowAvailable) {
    return 35;
  }
  if (!stats.hasData) {
    return 45;
  }

  const lowCloudAvg = stats.lowCloudAvg ?? Math.min(100, stats.totalCloudAvg * 0.45);
  let cap = 100;

  if (stats.totalCloudAvg >= 70 || stats.totalCloudMax >= 85) {
    cap = Math.min(cap, stats.totalCloudAvg >= 85 || stats.totalCloudMax >= 90 ? 20 : 34);
  }
  if (lowCloudAvg >= 30 || (stats.lowCloudMax ?? 0) >= 50) {
    cap = Math.min(cap, lowCloudAvg >= 50 || (stats.lowCloudMax ?? 0) >= 65 ? 22 : 32);
  }
  if ((stats.midCloudAvg ?? 0) >= 70) {
    cap = Math.min(cap, 46);
  }
  if ((stats.highCloudAvg ?? 0) >= 85) {
    cap = Math.min(cap, 52);
  }
  if (stats.precipitationAmountTotal > 0) {
    cap = Math.min(cap, stats.precipitationAmountTotal >= 0.3 ? 26 : 34);
  }
  if (
    stats.precipitationRisk === "medium" ||
    stats.precipitationRisk === "high" ||
    stats.precipitationRisk === "severe"
  ) {
    cap = Math.min(cap, stats.precipitationRisk === "medium" ? 34 : 22);
  }
  if ((stats.transparencyScoreMin ?? stats.transparencyScoreAvg ?? 100) < 45) {
    cap = Math.min(cap, (stats.transparencyScoreMin ?? 100) < 30 ? 24 : 36);
  }
  if ((stats.visibilityMin ?? 99) < 10) {
    cap = Math.min(cap, (stats.visibilityMin ?? 99) < 6 ? 24 : 36);
  }
  if (calculateDewRiskScore(stats) >= 80) {
    cap = Math.min(cap, 58);
  }
  if (moonImpact.level === "high") {
    cap = Math.min(cap, 58);
  }
  if (blockers.length >= 3) {
    cap = Math.min(cap, 34);
  }
  if (hasRainFogMistText(stats.weatherText) || hasThickCloudText(stats.weatherText)) {
    cap = Math.min(cap, 30);
  }

  return cap;
}

function buildAstroPhotographyLabels(input: {
  readonly astroWindowAvailable: boolean;
  readonly astroShootable: boolean;
  readonly practicalAstroScore: number;
  readonly recommendedMilkyWayWindow?: AstroWindow;
  readonly candidateWindow?: AstroWindow;
  readonly milkyWayGeometryScore: number;
  readonly moonImpactLevel: MoonImpactLevel;
  readonly cloudBlockerLevel: AstroRiskLevel;
  readonly dewRiskLevel: AstroRiskLevel;
}): AstroPhotographyAssessment["labels"] {
  return {
    astronomicalWindow: input.astroWindowAvailable ? "有" : "无",
    starShootability: input.astroShootable
      ? shootabilityLabel(input.practicalAstroScore)
      : input.practicalAstroScore >= 50
        ? "中"
        : "低",
    milkyWayShootability:
      input.astroShootable && input.recommendedMilkyWayWindow
        ? shootabilityLabel(Math.max(input.practicalAstroScore, input.milkyWayGeometryScore))
        : input.candidateWindow && input.milkyWayGeometryScore >= 50
          ? "中"
          : "低",
    moonlightImpact: riskLabelZh(input.moonImpactLevel),
    cloudBlocker: riskLabelZh(input.cloudBlockerLevel),
    dewRisk: riskLabelZh(input.dewRiskLevel),
    windowRecommendation:
      input.astroShootable && input.recommendedMilkyWayWindow
        ? "推荐银河窗口"
        : input.astroWindowAvailable
          ? "仅作备选窗口"
          : "不建议窗口",
  };
}

function weatherSupportsMilkyWayWindow(weatherWindow: readonly NormalizedHourlyWeather[]): boolean {
  const stats = summarizeWeatherWindow(weatherWindow);
  return (
    astroWeatherBlockersForStats(stats).length === 0 &&
    calculateSkyConditionScore(stats) >= 55 &&
    calculateWindowTransparencyScore(weatherWindow, stats, 55) >= 45 &&
    cloudBlockerLevelForStats(stats) !== "high"
  );
}

function applyAstroWeatherBlockers(
  score: number,
  weatherWindow: readonly NormalizedHourlyWeather[],
): number {
  const cap = astroWeatherBlockerCap(weatherWindow);
  return clampScore(Math.min(score, cap));
}

function astroWeatherBlockerCap(weatherWindow: readonly NormalizedHourlyWeather[]): number {
  const stats = summarizeWeatherWindow(weatherWindow);
  return astroPracticalWeatherCap(
    stats,
    astroWeatherBlockersForStats(stats),
    { level: "low", score: 0, reasons: [] },
    true,
  );
}

function astroWeatherBlockers(
  weatherWindow: readonly NormalizedHourlyWeather[],
): readonly string[] {
  return astroWeatherBlockersForStats(summarizeWeatherWindow(weatherWindow));
}

function astroWeatherBlockersForStats(stats: WeatherWindowStats): readonly string[] {
  if (!stats.hasData) {
    return ["缺少窗口内天气数据，星空可拍性需要保守处理"];
  }

  const lowCloudAvg = stats.lowCloudAvg ?? Math.min(100, stats.totalCloudAvg * 0.45);
  const lowCloudMax = stats.lowCloudMax ?? lowCloudAvg;
  const blockers: string[] = [];

  if (stats.totalCloudAvg >= 70 || stats.totalCloudMax >= 85) {
    blockers.push(
      stats.totalCloudAvg >= 85 || stats.totalCloudMax >= 90
        ? `总云量约 ${Math.round(stats.totalCloudAvg)}%，接近满天云，星空银河实际不可见`
        : `总云量约 ${Math.round(stats.totalCloudAvg)}%，星点和银河主体容易被遮挡`,
    );
  }
  if (lowCloudAvg >= 30 || lowCloudMax >= 50) {
    blockers.push(
      lowCloudAvg >= 50 || lowCloudMax >= 65
        ? `低云约 ${Math.round(lowCloudAvg)}%，星空银河实际可见性较差`
        : `低云约 ${Math.round(lowCloudAvg)}%，会遮挡地景和低角度银河`,
    );
  }
  if ((stats.midCloudAvg ?? 0) >= 70) {
    blockers.push(`中云约 ${Math.round(stats.midCloudAvg ?? 0)}%，银河对比度和星点密度会明显下降`);
  }
  if ((stats.highCloudAvg ?? 0) >= 85) {
    blockers.push(
      `高云约 ${Math.round(stats.highCloudAvg ?? 0)}%，银河反差不足，仅适合作为备选观察`,
    );
  }
  if (stats.precipitationAmountTotal > 0) {
    blockers.push(`窗口内预计降水 ${Math.round(stats.precipitationAmountTotal * 10) / 10}mm`);
  }
  if (
    typeof stats.transparencyScoreAvg === "number" &&
    Number.isFinite(stats.transparencyScoreAvg) &&
    stats.transparencyScoreAvg < 45
  ) {
    blockers.push("摄影通透度偏差，银河暗部和远山层次不可靠");
  }
  if (stats.visibilityAvg !== undefined && stats.visibilityAvg > 0 && stats.visibilityAvg < 12) {
    blockers.push(`能见度约 ${Math.round(stats.visibilityAvg)} 公里，夜空透明度不足`);
  }
  if (
    (stats.humidityAvg ?? 0) >= 90 &&
    stats.dewPointSpreadMin !== undefined &&
    stats.dewPointSpreadMin <= 2
  ) {
    blockers.push("湿度极高且露点差小，雾气和镜头结露风险高");
  }
  if (
    stats.precipitationRisk === "medium" ||
    stats.precipitationRisk === "high" ||
    stats.precipitationRisk === "severe"
  ) {
    blockers.push(
      `降水风险${stats.precipitationRisk === "medium" ? "中" : "高"}，夜间窗口可能被打断`,
    );
  }
  if (hasRainFogMistText(stats.weatherText) || hasThickCloudText(stats.weatherText)) {
    blockers.push("天气现象包含雨、雾或厚云信号");
  }

  return [...new Set(blockers)];
}

function cloudBlockerLevelForStats(stats: WeatherWindowStats): AstroRiskLevel {
  if (!stats.hasData) {
    return "medium";
  }

  const lowCloudAvg = stats.lowCloudAvg ?? Math.min(100, stats.totalCloudAvg * 0.45);
  const lowCloudMax = stats.lowCloudMax ?? lowCloudAvg;
  if (
    stats.totalCloudAvg >= 70 ||
    stats.totalCloudMax >= 85 ||
    lowCloudAvg >= 30 ||
    lowCloudMax >= 50
  ) {
    return "high";
  }
  if (
    stats.totalCloudAvg >= 45 ||
    lowCloudAvg >= 18 ||
    (stats.midCloudAvg ?? 0) >= 70 ||
    (stats.highCloudAvg ?? 0) >= 85
  ) {
    return "medium";
  }
  return "low";
}

function tripodWindRiskForStats(stats: WeatherWindowStats): AstroRiskLevel {
  const wind = stats.windSpeedAvg ?? 0;
  const gust = stats.windGustMax ?? wind;
  if (gust >= 14 || wind >= 9) {
    return "high";
  }
  if (gust >= 9 || wind >= 6) {
    return "medium";
  }
  return "low";
}

function riskLevelFromRiskScore(score: number): AstroRiskLevel {
  if (score >= 70) {
    return "high";
  }
  if (score >= 40) {
    return "medium";
  }
  return "low";
}

function shootabilityLabel(score: number): "高" | "中" | "低" {
  if (score >= 70) {
    return "高";
  }
  if (score >= 50) {
    return "中";
  }
  return "低";
}

function riskLabelZh(level: AstroRiskLevel): "低" | "中" | "高" {
  if (level === "high") {
    return "高";
  }
  if (level === "medium") {
    return "中";
  }
  return "低";
}

function buildGearAdviceZh(
  stats: WeatherWindowStats,
  dewRiskLevel: AstroRiskLevel,
  tripodWindRisk: AstroRiskLevel,
  moonImpactLevel: MoonImpactLevel,
): readonly string[] {
  const advice = new Set<string>(["三脚架、头灯、备用电池和离线导航保持常备。"]);
  if (dewRiskLevel === "high") {
    advice.add("露水风险高，建议准备镜头加热带、防结露布和备用镜头布。");
  } else if (dewRiskLevel === "medium") {
    advice.add("露水风险中等，建议带镜头布并留意前镜片结露。");
  }
  if (stats.precipitationAmountTotal > 0 || stats.precipitationRisk !== "none") {
    advice.add("存在降水信号，机身防水罩、镜头布和干燥袋需要随身携带。");
  }
  if (tripodWindRisk === "high") {
    advice.add("阵风偏强，三脚架需要加重并降低中轴，长曝光要缩短单张时间。");
  } else if (tripodWindRisk === "medium") {
    advice.add("夜间有风，建议检查三脚架锁紧并避开暴露垭口。");
  }
  if (moonImpactLevel === "high") {
    advice.add("月光偏强时，不把银河作为唯一目标，可准备月光地景或星轨备选构图。");
  }
  return [...advice];
}

function buildWarmthAdviceZh(stats: WeatherWindowStats): string {
  const temperature = stats.temperatureMin;
  if (temperature === undefined) {
    return "夜间温度数据不完整，按山地夜拍准备保暖层和防风外壳。";
  }
  if (temperature <= -5) {
    return `夜间最低约 ${Math.round(temperature)}°C，需按严寒夜拍准备羽绒层、手套和备用电池保温。`;
  }
  if (temperature <= 0) {
    return `夜间最低约 ${Math.round(temperature)}°C，长时间等待需要厚保暖层、手套和热饮。`;
  }
  if (temperature <= 6) {
    return `夜间最低约 ${Math.round(temperature)}°C，建议准备防风保暖层并给电池保温。`;
  }
  return `夜间最低约 ${Math.round(temperature)}°C，常规夜拍保暖即可，山顶仍需防风。`;
}

function hasRainFogMistText(text: string): boolean {
  return /雨|雪|雾|霾|冻雨|阵雨|雷雨|小雨|中雨|大雨|暴雨|mist|fog|rain|snow|shower/i.test(text);
}

function hasThickCloudText(text: string): boolean {
  return /阴|大部多云|浓云|厚云|overcast|heavy cloud/i.test(text);
}

function averageOptionalNumber(values: readonly (number | null | undefined)[]): number | undefined {
  const usableValues = values.filter(
    (value): value is number => typeof value === "number" && Number.isFinite(value),
  );
  if (usableValues.length === 0) {
    return undefined;
  }
  return usableValues.reduce((sum, value) => sum + value, 0) / usableValues.length;
}

function minOptionalNumber(values: readonly (number | null | undefined)[]): number | undefined {
  const usableValues = values.filter(
    (value): value is number => typeof value === "number" && Number.isFinite(value),
  );
  return usableValues.length > 0 ? Math.min(...usableValues) : undefined;
}

function maxOptionalNumber(values: readonly (number | null | undefined)[]): number | undefined {
  const usableValues = values.filter(
    (value): value is number => typeof value === "number" && Number.isFinite(value),
  );
  return usableValues.length > 0 ? Math.max(...usableValues) : undefined;
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
  assessment: AstroPhotographyAssessment,
  recommendedWindows: readonly AstroWindow[],
  weatherBlockers: readonly string[],
  lightPollution: LightPollutionInfo,
): readonly string[] {
  const lightPollutionRisks = lightPollution.available
    ? [lightPollutionDecisionText(lightPollution)]
    : [lightPollution.lightPollutionNoteZh || lightPollutionUnavailableNote];
  return [
    ...weatherBlockers.map((blocker) => `星空银河天气阻断：${blocker}。`),
    ...(weatherBlockers.length > 0
      ? ["有天文窗口，但云量/低云/降水条件不支持拍摄；星空银河仅作为备选，不建议为此熬夜。"]
      : []),
    ...(recommendedWindows.length === 0
      ? [
          assessment.astroWindowAvailable
            ? "银河有天文窗口，但云量/降水不支持拍摄，或低月光窗口与银心窗口交集不足。"
            : "当前没有同时满足天文黑夜、低月光影响和银心可见的推荐银河窗口。",
        ]
      : []),
    ...(assessment.moonlightImpactScore >= 65 ? ["月光影响偏强，银河对比度会明显下降。"] : []),
    ...(assessment.dewRiskLevel === "high" ? ["湿度高且露点差小，镜头结露和雾气风险高。"] : []),
    ...(input.weatherMissingFields.includes("visibility")
      ? ["缺少能见度数据，透明度判断需要保守参考。"]
      : []),
    ...(hasMissingCloudLayerFields(input.weatherMissingFields)
      ? ["缺少低云/中云/高云分层数据，云量判断置信度降低。"]
      : []),
    ...lightPollutionRisks,
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
  assessment: AstroPhotographyAssessment,
  recommendedWindows: readonly AstroWindow[],
  weatherBlockers: readonly string[] = [],
  lightPollution: LightPollutionInfo = defaultLightPollutionInfo,
): readonly string[] {
  const bestWindow = recommendedWindows[0];
  const lightPollutionAdvice = lightPollution.available
    ? lightPollutionDecisionText(lightPollution)
    : lightPollutionUnavailableNote;

  if (weatherBlockers.length > 0) {
    return [
      "是否值得去：不建议只为银河专程，当前天气阻挡优先级高于光污染条件。",
      bestWindow
        ? `最佳拍摄窗口：天气未通过，不把 ${formatFullTimeRange(
            bestWindow.start,
            bestWindow.end,
          )} 标为推荐窗口。`
        : "最佳拍摄窗口：暂无可执行银河窗口。",
      `主要阻碍：${weatherBlockers.slice(0, 2).join("；")}。`,
      `备选建议：星空银河仅作为备选，不建议为此熬夜；${lightPollutionAdvice}`,
      "到达建议：等待短临云图、雷达和降水改善后再决定，不按专程夜拍时间出发。",
    ];
  }

  return [
    bestWindow
      ? `是否值得去：可按银河计划准备，但出行前仍需复核云量、月光和现场安全。`
      : "是否值得去：不建议只为银河专程远途出发。",
    bestWindow
      ? `最佳拍摄窗口：推荐银河窗口：${formatFullTimeRange(bestWindow.start, bestWindow.end)}；方向 ${
          bestWindow.directionZh ?? "需现场复核"
        }。`
      : "最佳拍摄窗口：暂无推荐银河窗口。",
    `主要阻碍：云量风险${assessment.labels.cloudBlocker}，月光影响${assessment.labels.moonlightImpact}；${lightPollutionAdvice}`,
    scores.transparencyScore >= 65 && scores.milkyWayScore < 65
      ? "备选建议：透明度好但银河条件一般，可转拍星轨、月光地景或山脊夜景。"
      : "备选建议：月亮未落前可转拍月光风景或星轨堆栈，并准备近景夜景题材。",
    bestWindow
      ? `到达建议：建议至少提前 75-90 分钟到达，先完成构图、对焦和安全撤离规划；${assessment.warmthAdviceZh}`
      : `到达建议：当前仅适合作为备选观察，不按专程到达安排；${assessment.warmthAdviceZh}`,
    ...assessment.gearAdviceZh.slice(0, 2),
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

function buildMissingDataNotes(
  input: ForecastCalculationInput,
  lightPollution: LightPollutionInfo,
): readonly string[] {
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
    ...(lightPollution.available
      ? []
      : [lightPollution.lightPollutionNoteZh || lightPollutionUnavailableNote]),
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
  candidate: AstroWindow | undefined,
  assessment: AstroPhotographyAssessment,
  weatherBlockers: readonly string[] = [],
): string {
  if (assessment.astroWindowAvailable && !assessment.astroShootable && weatherBlockers.length > 0) {
    if (candidate) {
      return "银河有天文窗口，但云量/降水不支持拍摄。";
    }
    return "有天文窗口，但云量/低云/降水条件不支持拍摄。";
  }
  if (recommended) {
    return `推荐银河窗口：${formatFullTimeRange(recommended.start, recommended.end)}，方向 ${
      recommended.directionZh ?? "需现场复核"
    }。`;
  }
  if (moonless) {
    return `无月黑夜 ${formatFullTimeRange(moonless.start, moonless.end)}，可优先考虑星空、星轨和夜景。`;
  }
  if (astronomicalNight) {
    return `有天文黑夜 ${formatFullTimeRange(
      astronomicalNight.start,
      astronomicalNight.end,
    )}，但月光或银心窗口限制较明显。`;
  }
  return "所选范围内缺少完整夜间窗口，建议扩大预报范围或更换日期。";
}

function dailyRiskNote(
  weatherWindow: readonly NormalizedHourlyWeather[],
  assessment: AstroPhotographyAssessment,
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
  if (assessment.dewRiskLevel === "high") {
    return "露水风险高";
  }
  if (assessment.moonImpactLevel === "high") {
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

function formatFullTimeRange(start: string, end: string): string {
  if (!Number.isFinite(Date.parse(start)) || !Number.isFinite(Date.parse(end))) {
    return `${start} - ${end}`;
  }

  return formatChineseDateTimeRange(start, end, defaultTimezone);
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
