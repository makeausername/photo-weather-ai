import { localDateKey, type ForecastCalculationResult } from "@photo-weather/shared";

export type SubjectDetailFocus = {
  readonly date?: string;
  readonly subject?: string;
  readonly windowStart?: string;
  readonly windowEnd?: string;
};

/** Select existing daily assessments; never recompute or invent a window in the browser. */
export function focusSubjectDetailResult(
  result: ForecastCalculationResult,
  target: "cloud_sea" | "glow" | "astro",
  focus?: SubjectDetailFocus,
): ForecastCalculationResult | undefined {
  if (!focus?.date || target === "astro") return result;
  const date = focus.date;
  const timezone = result.calendarBasis.timezone;
  const onDate = (window: { readonly date?: string; readonly startTime: string }) =>
    (window.date ?? localDateKey(window.startTime, timezone)) === date;
  const matchesRequestedWindow = (start: string, end: string) =>
    (!focus.windowStart || Date.parse(start) === Date.parse(focus.windowStart)) &&
    (!focus.windowEnd || Date.parse(end) === Date.parse(focus.windowEnd));
  const common = {
    ...result,
    dailySummaries: result.dailySummaries.filter((day) => day.date === date),
    bestWindows: result.bestWindows.filter(onDate),
  };

  if (target === "cloud_sea") {
    const analysis = result.cloudSeaAnalysis;
    const day = analysis.dailyCloudSea.find((item) => item.date === date);
    if (!day) return undefined;
    const candidates = [
      day.bestWindow,
      day.watchableWindow,
      day.notRecommendedWindow,
      ...analysis.bestCloudSeaWindows,
      ...analysis.watchableCloudSeaWindows,
      ...analysis.notRecommendedCloudSeaWindows,
    ].filter((window) => window !== undefined && onDate(window));
    const selected =
      candidates.find(
        (window) => window && matchesRequestedWindow(window.startTime, window.endTime),
      ) ?? candidates[0];
    if (selected && !matchesRequestedWindow(selected.startTime, selected.endTime)) return undefined;
    const calibration = selected?.scoreCalibration ?? day.scoreCalibration;
    return {
      ...common,
      cloudSeaAnalysis: {
        ...analysis,
        formationScore: selected?.formationScore ?? day.formationScore ?? day.opportunityScore,
        shootableScore: selected?.shootableScore ?? day.shootableScore ?? day.travelScore,
        whiteoutRiskScore: selected?.whiteoutRiskScore ?? day.whiteoutRiskScore,
        lightAlignedScore: selected?.lightAlignedScore ?? day.lightAlignedScore ?? 0,
        confidence: day.confidence ?? analysis.confidence,
        labels: day.labels ?? analysis.labels,
        overallScore: day.opportunityScore,
        cloudSeaOpportunityScore: day.opportunityScore,
        travelScore: day.travelScore,
        recommendationLabel: day.recommendationLabel,
        rainOpening: selected?.rainOpening ?? day.rainOpening ?? analysis.rainOpening,
        scoreCalibration: calibration ?? analysis.scoreCalibration,
        windowRiskContext: selected?.windowRiskContext ?? day.windowRiskContext,
        bestCloudSeaWindow: selected,
        bestCloudSeaWindows: analysis.bestCloudSeaWindows.filter(onDate),
        watchableCloudSeaWindows: analysis.watchableCloudSeaWindows.filter(onDate),
        notRecommendedCloudSeaWindows: analysis.notRecommendedCloudSeaWindows.filter(onDate),
        dailyCloudSea: [day],
        opportunityReasons: [day.keyReason],
        whiteoutReasons: [day.riskNote],
      },
    };
  }

  const analysis = result.glowAnalysis;
  const day = analysis.dailyGlow.find((item) => item.date === date);
  if (!day) return undefined;
  const matches = (window: (typeof analysis.bestGlowWindows)[number]) =>
    onDate({ date: window.date, startTime: window.start }) &&
    (focus.subject === "sunrise_glow"
      ? window.phase === "sunrise" ||
        ["sunrise_glow", "pre_dawn_glow", "sunrise_core", "morning_warm_light", "sunrise"].includes(
          window.type,
        )
      : focus.subject === "sunset_glow" || focus.subject === "afterglow"
        ? !(
            window.phase === "sunrise" ||
            [
              "sunrise_glow",
              "pre_dawn_glow",
              "sunrise_core",
              "morning_warm_light",
              "sunrise",
            ].includes(window.type)
          )
        : true);
  const focusedWindows = [
    analysis.bestGlowWindow,
    ...analysis.bestGlowWindows,
    ...analysis.watchableGlowWindows,
    ...analysis.notRecommendedGlowWindows,
    day.bestWindow,
    day.watchableWindow,
    day.notRecommendedWindow,
  ]
    .filter((window): window is (typeof analysis.bestGlowWindows)[number] => Boolean(window))
    .filter(matches);
  if (
    (focus.windowStart || focus.windowEnd) &&
    !focusedWindows.some((window) => matchesRequestedWindow(window.start, window.end))
  )
    return undefined;
  return {
    ...common,
    glowAnalysis: {
      ...analysis,
      sunriseGlowScore: day.sunriseScore,
      sunsetGlowScore: day.sunsetScore,
      lowCloudFogWallRisk: day.lowCloudFogWallRisk ?? analysis.lowCloudFogWallRisk,
      glowLightPathObstructionRisk:
        day.glowLightPathObstructionRisk ?? analysis.glowLightPathObstructionRisk,
      cloudSuppressionRisk: day.cloudSuppressionRisk ?? analysis.cloudSuppressionRisk,
      bestGlowWindow:
        analysis.bestGlowWindow && matches(analysis.bestGlowWindow)
          ? analysis.bestGlowWindow
          : undefined,
      bestGlowWindows: analysis.bestGlowWindows.filter(matches),
      watchableGlowWindows: analysis.watchableGlowWindows.filter(matches),
      notRecommendedGlowWindows: analysis.notRecommendedGlowWindows.filter(matches),
      terrainObstructionAssessments: analysis.terrainObstructionAssessments.filter(
        (item) => item.date === date,
      ),
      dailyGlow: [day],
      opportunityReasons: [day.keyReason],
      riskReasons: [day.riskNote],
    },
  };
}
