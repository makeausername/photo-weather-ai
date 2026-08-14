import type {
  ForecastCalculationResult,
  ForecastTarget,
  ProfessionalHourlyDataPoint,
  TerrainHorizonAssessment,
} from "@photo-weather/shared";

export type ForecastClaimDomain =
  | "general"
  | "cloud_sea"
  | "glow"
  | "astro"
  | "terrain"
  | "weather"
  | "light_pollution"
  | "astronomy"
  | "risk"
  | "action"
  | "ai";

export type ClaimSupportLevel = "supported" | "partial" | "estimated" | "missing" | "blocked";

export type ForecastClaimEvidenceKey =
  | "real_weather"
  | "weather_field"
  | "cloud_layer"
  | "low_cloud"
  | "mid_high_cloud"
  | "precipitation"
  | "visibility"
  | "wind"
  | "humidity_dew_point"
  | "terrain_elevation"
  | "terrain_relief"
  | "terrain_horizon"
  | "terrain_horizon_clear"
  | "astronomy"
  | "moon"
  | "milky_way_window"
  | "light_pollution"
  | "directional_light_pollution"
  | "professional_hourly";

export type GuardedForecastClaim = {
  readonly publicText: string;
  readonly supportLevel: ClaimSupportLevel;
  readonly requiredEvidence: readonly string[];
  readonly availableEvidence: readonly string[];
  readonly missingEvidence: readonly string[];
  readonly blockedUnsupportedPhrases: readonly string[];
};

type ValidateForecastClaimInput = {
  readonly domain: ForecastClaimDomain;
  readonly publicText: string;
  readonly requiredEvidence?: readonly ForecastClaimEvidenceKey[];
  readonly fallbackText?: string;
};

type ForecastEvidenceGuard = {
  readonly result: ForecastCalculationResult;
  readonly availableEvidence: readonly ForecastClaimEvidenceKey[];
  readonly hasRealWeatherData: () => boolean;
  readonly isDemoOrFallbackWeather: () => boolean;
  readonly hasWeatherFieldSupport: (field?: string) => boolean;
  readonly hasCloudLayerSupport: () => boolean;
  readonly hasLowCloudSupport: () => boolean;
  readonly hasMidHighCloudSupport: () => boolean;
  readonly hasPrecipitationSupport: () => boolean;
  readonly hasVisibilitySupport: () => boolean;
  readonly hasWindSupport: () => boolean;
  readonly hasHumidityDewPointSupport: () => boolean;
  readonly hasTerrainElevationSupport: () => boolean;
  readonly hasTerrainReliefSupport: () => boolean;
  readonly hasTerrainHorizonSupport: () => boolean;
  readonly hasResolvedClearTerrainHorizonSupport: () => boolean;
  readonly hasAstronomySupport: () => boolean;
  readonly hasMoonSupport: () => boolean;
  readonly hasMilkyWayWindowSupport: () => boolean;
  readonly hasLightPollutionSupport: () => boolean;
  readonly hasDirectionalLightPollutionSupport: () => boolean;
  readonly hasProfessionalHourlySupport: () => boolean;
  readonly validateForecastClaim: (input: ValidateForecastClaimInput) => GuardedForecastClaim;
  readonly claimIfSupported: (input: ValidateForecastClaimInput) => string;
  readonly downgradeIfUnsupported: (input: ValidateForecastClaimInput) => string;
  readonly sanitizeUnsupportedForecastCopy: (
    publicText: string,
    domain?: ForecastClaimDomain,
  ) => string;
};

const publicCopyStructuralKeys = new Set([
  "key",
  "moduleKey",
  "target",
  "type",
  "phase",
  "tone",
  "semanticKey",
  "dataSource",
  "sourceAlignmentStatus",
  "basis",
  "calibrationMode",
  "contextVersion",
  "timezone",
  "date",
  "localDateKey",
  "localEveningDate",
  "startTime",
  "endTime",
  "windowStartAt",
  "windowEndAt",
  "generatedAt",
  "evaluatedAt",
  "anchorStart",
  "anchorEnd",
  "firstRowTime",
  "lastRowTime",
  "rowTime",
  "time",
]);

export function createEvidenceGuard(result: ForecastCalculationResult): ForecastEvidenceGuard {
  const evidenceChecks: Record<ForecastClaimEvidenceKey, () => boolean> = {
    real_weather: () => hasRealWeatherData(result),
    weather_field: () => hasWeatherFieldSupport(result),
    cloud_layer: () => hasCloudLayerSupport(result),
    low_cloud: () => hasLowCloudSupport(result),
    mid_high_cloud: () => hasMidHighCloudSupport(result),
    precipitation: () => hasPrecipitationSupport(result),
    visibility: () => hasVisibilitySupport(result),
    wind: () => hasWindSupport(result),
    humidity_dew_point: () => hasHumidityDewPointSupport(result),
    terrain_elevation: () => hasTerrainElevationSupport(result),
    terrain_relief: () => hasTerrainReliefSupport(result),
    terrain_horizon: () => hasTerrainHorizonSupport(result),
    terrain_horizon_clear: () => hasResolvedClearTerrainHorizonSupport(result),
    astronomy: () => hasAstronomySupport(result),
    moon: () => hasMoonSupport(result),
    milky_way_window: () => hasMilkyWayWindowSupport(result),
    light_pollution: () => hasLightPollutionSupport(result),
    directional_light_pollution: () => hasDirectionalLightPollutionSupport(result),
    professional_hourly: () => hasProfessionalHourlySupport(result),
  };
  const availableEvidence = (Object.keys(evidenceChecks) as ForecastClaimEvidenceKey[]).filter(
    (key) => evidenceChecks[key](),
  );

  function validateForecastClaim(input: ValidateForecastClaimInput): GuardedForecastClaim {
    const requiredEvidence = input.requiredEvidence ?? [];
    const available = requiredEvidence.filter((key) => evidenceChecks[key]());
    const missing = requiredEvidence.filter((key) => !evidenceChecks[key]());
    const blockedUnsupportedPhrases = blockedPhrasesForText(result, input.publicText);
    const hasBlockedPhrase = blockedUnsupportedPhrases.length > 0;
    const supportLevel: ClaimSupportLevel =
      hasBlockedPhrase || missing.length === requiredEvidence.length
        ? "blocked"
        : missing.length > 0
          ? "partial"
          : requiredEvidence.length === 0
            ? "estimated"
            : "supported";
    const publicText =
      supportLevel === "blocked"
        ? input.fallbackText ??
          sanitizeUnsupportedForecastCopy(result, input.publicText, input.domain)
        : sanitizeUnsupportedForecastCopy(result, input.publicText, input.domain);

    return {
      publicText,
      supportLevel,
      requiredEvidence,
      availableEvidence: available,
      missingEvidence: missing,
      blockedUnsupportedPhrases,
    };
  }

  return {
    result,
    availableEvidence,
    hasRealWeatherData: () => hasRealWeatherData(result),
    isDemoOrFallbackWeather: () => isDemoOrFallbackWeather(result),
    hasWeatherFieldSupport: (field?: string) => hasWeatherFieldSupport(result, field),
    hasCloudLayerSupport: () => hasCloudLayerSupport(result),
    hasLowCloudSupport: () => hasLowCloudSupport(result),
    hasMidHighCloudSupport: () => hasMidHighCloudSupport(result),
    hasPrecipitationSupport: () => hasPrecipitationSupport(result),
    hasVisibilitySupport: () => hasVisibilitySupport(result),
    hasWindSupport: () => hasWindSupport(result),
    hasHumidityDewPointSupport: () => hasHumidityDewPointSupport(result),
    hasTerrainElevationSupport: () => hasTerrainElevationSupport(result),
    hasTerrainReliefSupport: () => hasTerrainReliefSupport(result),
    hasTerrainHorizonSupport: () => hasTerrainHorizonSupport(result),
    hasResolvedClearTerrainHorizonSupport: () => hasResolvedClearTerrainHorizonSupport(result),
    hasAstronomySupport: () => hasAstronomySupport(result),
    hasMoonSupport: () => hasMoonSupport(result),
    hasMilkyWayWindowSupport: () => hasMilkyWayWindowSupport(result),
    hasLightPollutionSupport: () => hasLightPollutionSupport(result),
    hasDirectionalLightPollutionSupport: () => hasDirectionalLightPollutionSupport(result),
    hasProfessionalHourlySupport: () => hasProfessionalHourlySupport(result),
    validateForecastClaim,
    claimIfSupported: (input) => validateForecastClaim(input).publicText,
    downgradeIfUnsupported: (input) => validateForecastClaim(input).publicText,
    sanitizeUnsupportedForecastCopy: (publicText, domain = "general") =>
      sanitizeUnsupportedForecastCopy(result, publicText, domain),
  };
}

export function validateForecastClaim(
  result: ForecastCalculationResult,
  input: ValidateForecastClaimInput,
): GuardedForecastClaim {
  return createEvidenceGuard(result).validateForecastClaim(input);
}

export function claimIfSupported(
  result: ForecastCalculationResult,
  input: ValidateForecastClaimInput,
): string {
  return createEvidenceGuard(result).claimIfSupported(input);
}

export function downgradeIfUnsupported(
  result: ForecastCalculationResult,
  input: ValidateForecastClaimInput,
): string {
  return createEvidenceGuard(result).downgradeIfUnsupported(input);
}

export function sanitizeUnsupportedForecastCopy(
  result: ForecastCalculationResult,
  publicText: string,
  domain: ForecastClaimDomain = "general",
): string {
  let text = publicText;
  const lacksCloudLayers = !hasCloudLayerSupport(result);
  const lacksLowCloud = !hasLowCloudSupport(result);
  const lacksMidHighCloud = !hasMidHighCloudSupport(result);
  const lacksPrecipitation = !hasPrecipitationSupport(result);
  const lacksRelief = !hasTerrainReliefSupport(result);
  const lacksResolvedClearHorizon = !hasResolvedClearTerrainHorizonSupport(result);
  const lacksLightPollution = !hasLightPollutionSupport(result);
  const lacksDirectionalLightPollution = !hasDirectionalLightPollutionSupport(result);
  const lacksMilkyWayWindow = !hasMilkyWayWindowSupport(result);

  if (isDemoOrFallbackWeather(result)) {
    text = text
      .replace(/推荐前往/g, "列为备选")
      .replace(/适合出发/g, "仅作流程体验")
      .replace(/值得出发/g, "可生成决策参考")
      .replace(/(^|[^不])建议出发/g, "$1建议先复核真实天气")
      .replace(/(^|[^不])推荐出发/g, "$1建议先复核真实天气")
      .replace(/(^|[^不])建议专程/g, "$1建议先复核真实天气后再决定")
      .replace(/(^|[^不])推荐专程/g, "$1建议先复核真实天气后再决定")
      .replace(/可进入出行候选/g, "可作为流程体验结果");
  }

  if (lacksLowCloud) {
    text = text.replace(/低云适中/g, "低云分层待复核");
  }

  if (lacksCloudLayers) {
    text = text
      .replace(/云层结构理想/g, "云层结构需复核")
      .replace(/云层结构较理想/g, "云层结构需复核")
      .replace(/云层结构好/g, "云层结构需复核");
  }

  if (lacksMidHighCloud) {
    text = text
      .replace(/色彩载体好/g, "色彩载体需复核")
      .replace(/中高云色彩载体好/g, "中高云色彩载体需复核");
  }

  if (lacksPrecipitation) {
    text = text
      .replace(/雨后开口机会高/g, "开口需复核")
      .replace(/雨后开口信号明确/g, "开口信号需复核");
  }

  if (lacksRelief) {
    text = text
      .replace(/高差明显/g, "高差待复核")
      .replace(/高差证据强/g, "高差证据待复核")
      .replace(/具备云海地形基础/g, "云海地形基础需复核");
  }

  if (lacksResolvedClearHorizon) {
    text = text
      .replace(/不按([^。；，,]*?)无遮挡处理/g, "$1地形遮挡需复核")
      .replace(/未把([^。；，,]*?)当作无遮挡处理/g, "将$1遮挡标记为需复核")
      .replace(/不标记为无遮挡/g, "标记为遮挡需复核")
      .replace(/无遮挡公开展示/g, "遮挡需复核公开展示")
      .replace(/地形无遮挡/g, "地形遮挡需复核")
      .replace(/无明显遮挡/g, "遮挡需复核")
      .replace(/无遮挡/g, "地形遮挡需复核");
  }

  if (lacksLightPollution) {
    text = text
      .replace(/环境光污染(?:极低|低|较低)/g, "环境光污染待复核")
      .replace(/光害(?:极低|低|较低)/g, "光害待复核")
      .replace(/低光害/g, "光害待复核");
  } else if (lacksDirectionalLightPollution) {
    text = text.replace(/银河方向光害(?:极低|低|较低)/g, "银河方向光害待复核");
  }

  if (domain === "astro" && lacksMilkyWayWindow) {
    text = text.replace(/银河可拍/g, "银河条件需复核");
  }

  return text.replace(/\s+/g, " ").trim();
}

export function sanitizeForecastPublicCopyTree<T>(
  result: ForecastCalculationResult,
  target: ForecastTarget,
  value: T,
): T {
  return sanitizePublicCopyNode(result, forecastTargetToClaimDomain(target), value) as T;
}

export function hasRealWeatherData(result: ForecastCalculationResult): boolean {
  if (
    result.weatherDataMode !== "real" ||
    result.weatherDataFreshness === "stale" ||
    result.weatherEvidenceStatus === "stale" ||
    result.weatherEvidenceStatus === "insufficient"
  ) {
    return false;
  }
  return result.weatherSourceSummaries.some(
    (summary) => summary.dataMode === "real" && (summary.success === true || summary.status === "available"),
  );
}

export function isDemoOrFallbackWeather(result: ForecastCalculationResult): boolean {
  return result.weatherDataMode !== "real" || result.isMock === true;
}

export function hasWeatherFieldSupport(
  result: ForecastCalculationResult,
  field?: string,
): boolean {
  if (!hasRealWeatherData(result)) {
    return false;
  }
  if (field && result.weatherMissingFields.includes(field)) {
    return false;
  }
  return Boolean(result.currentWeather || result.dailySummaries.some((summary) => summary.weather));
}

export function hasCloudLayerSupport(result: ForecastCalculationResult): boolean {
  return (
    hasLowCloudSupport(result) &&
    hasWeatherFieldSupport(result, "cloudMid") &&
    hasWeatherFieldSupport(result, "cloudHigh") &&
    professionalRowsHaveAny(result, ["cloudMidPercent", "cloudHighPercent"])
  );
}

export function hasLowCloudSupport(result: ForecastCalculationResult): boolean {
  return (
    hasWeatherFieldSupport(result, "cloudLow") &&
    (isFiniteNumber(result.currentWeather?.cloudLow) ||
      professionalRowsHaveAny(result, ["cloudLowPercent"]))
  );
}

export function hasMidHighCloudSupport(result: ForecastCalculationResult): boolean {
  return (
    hasWeatherFieldSupport(result, "cloudMid") &&
    hasWeatherFieldSupport(result, "cloudHigh") &&
    professionalRowsHaveAny(result, ["cloudMidPercent", "cloudHighPercent"])
  );
}

export function hasPrecipitationSupport(result: ForecastCalculationResult): boolean {
  return (
    hasWeatherFieldSupport(result, "precipitation") &&
    (isFiniteNumber(result.currentWeather?.precipitation) ||
      isFiniteNumber(result.currentWeather?.precipitationAmountMm) ||
      isFiniteNumber(result.currentWeather?.precipitationProbability) ||
      result.dailySummaries.some((summary) =>
        Boolean(
          isFiniteNumber(summary.weather?.precipitation) ||
            isFiniteNumber(summary.weather?.precipitationAmountMm) ||
            isFiniteNumber(summary.weather?.precipitationProbability),
        ),
      ) ||
      professionalRowsHaveAny(result, ["precipitationAmountMm", "precipitationProbabilityPercent"]))
  );
}

export function hasVisibilitySupport(result: ForecastCalculationResult): boolean {
  return (
    hasWeatherFieldSupport(result, "visibility") &&
    (isFiniteNumber(result.currentWeather?.visibility) ||
      result.dailySummaries.some((summary) => isFiniteNumber(summary.weather?.visibility)) ||
      professionalRowsHaveAny(result, ["visibilityMeters"]))
  );
}

export function hasWindSupport(result: ForecastCalculationResult): boolean {
  return (
    hasWeatherFieldSupport(result, "wind") &&
    (isFiniteNumber(result.currentWeather?.windSpeed) ||
      result.dailySummaries.some((summary) => isFiniteNumber(summary.weather?.windSpeed)) ||
      professionalRowsHaveAny(result, ["windSpeedMs"]))
  );
}

export function hasHumidityDewPointSupport(result: ForecastCalculationResult): boolean {
  return (
    !result.weatherMissingFields.includes("humidity") &&
    (isFiniteNumber(result.currentWeather?.humidity) ||
      result.dailySummaries.some((summary) => isFiniteNumber(summary.weather?.humidity)) ||
      professionalRowsHaveAny(result, ["relativeHumidityPercent", "dewPointC", "dewPointSpreadC"]))
  );
}

export function hasTerrainElevationSupport(result: ForecastCalculationResult): boolean {
  const profile = result.terrainAnalysis.terrainProfile;
  const support = result.cloudSeaAnalysis.terrainSupport;
  return firstFiniteNumber([
    profile.locationElevation,
    profile.elevationMeters,
    support.selectedSpotElevationMeters,
    result.terrainSummary.locationElevation,
    result.terrainSummary.elevationMeters,
  ]) !== undefined;
}

export function hasTerrainReliefSupport(result: ForecastCalculationResult): boolean {
  const profile = result.terrainAnalysis.terrainProfile;
  const support = result.cloudSeaAnalysis.terrainSupport;
  return firstFiniteNumber([
    profile.localReliefMeters,
    profile.elevationDiff5km,
    support.localReliefMeters,
    result.terrainSummary.localReliefMeters,
    result.terrainSummary.elevationDiff5km,
  ]) !== undefined;
}

export function hasTerrainHorizonSupport(result: ForecastCalculationResult): boolean {
  return terrainHorizonCandidates(result).some(terrainHorizonAssessmentIsResolved);
}

export function hasResolvedClearTerrainHorizonSupport(result: ForecastCalculationResult): boolean {
  return terrainHorizonCandidates(result).some(
    (assessment) =>
      terrainHorizonAssessmentIsResolved(assessment) && assessment.obstructionLevel === "clear",
  );
}

export function hasAstronomySupport(result: ForecastCalculationResult): boolean {
  return result.astroSummaries.length > 0 || result.astroAnalysis.dailyAstro.length > 0;
}

export function hasMoonSupport(result: ForecastCalculationResult): boolean {
  return Boolean(
    result.astroAnalysis.moonInfo ||
      result.astroSummaries.some((summary) => summary.moonInfo || isFiniteNumber(summary.moonIllumination)) ||
      result.astroAnalysis.dailyAstro.some((day) => day.moonImpactLevel),
  );
}

export function hasMilkyWayWindowSupport(result: ForecastCalculationResult): boolean {
  const analysis = result.astroAnalysis;
  return Boolean(
    analysis.astroWindowAvailable &&
      (analysis.recommendedMilkyWayWindows.length > 0 ||
        analysis.milkyWayCandidateWindows.length > 0 ||
        analysis.moonlessNightWindows.length > 0 ||
        analysis.dailyAstro.some((day) => day.recommendedMilkyWayWindow)),
  );
}

export function hasLightPollutionSupport(result: ForecastCalculationResult): boolean {
  const lightPollution = result.astroAnalysis.lightPollution;
  return lightPollution.available === true || lightPollution.dataAvailable === true;
}

export function hasDirectionalLightPollutionSupport(result: ForecastCalculationResult): boolean {
  const lightPollution = result.astroAnalysis.lightPollution;
  return (
    hasLightPollutionSupport(result) &&
    (lightPollution.targetDirectionLevel !== undefined ||
      lightPollution.targetDirectionLevelLabelZh !== undefined ||
      isFiniteNumber(lightPollution.targetDirectionRisk) ||
      (lightPollution.directionalRisk?.length ?? 0) > 0)
  );
}

export function hasProfessionalHourlySupport(result: ForecastCalculationResult): boolean {
  return (result.professionalHourlyData?.length ?? 0) > 0;
}

function blockedPhrasesForText(
  result: ForecastCalculationResult,
  publicText: string,
): readonly string[] {
  const blocked: string[] = [];
  if (isDemoOrFallbackWeather(result)) {
    collectBlockedMatches(publicText, blocked, [
      /推荐前往/g,
      /适合出发/g,
      /值得出发/g,
      /(^|[^不])建议出发/g,
      /(^|[^不])推荐出发/g,
      /(^|[^不])建议专程/g,
      /(^|[^不])推荐专程/g,
    ]);
  }
  if (!hasLowCloudSupport(result)) {
    collectBlockedMatches(publicText, blocked, [/低云适中/g]);
  }
  if (!hasCloudLayerSupport(result)) {
    collectBlockedMatches(publicText, blocked, [/云层结构理想/g, /云层结构较理想/g]);
  }
  if (!hasMidHighCloudSupport(result)) {
    collectBlockedMatches(publicText, blocked, [/色彩载体好/g]);
  }
  if (!hasTerrainReliefSupport(result)) {
    collectBlockedMatches(publicText, blocked, [/高差明显/g]);
  }
  if (!hasResolvedClearTerrainHorizonSupport(result)) {
    collectBlockedMatches(publicText, blocked, [/无遮挡/g, /无明显遮挡/g]);
  }
  if (!hasLightPollutionSupport(result)) {
    collectBlockedMatches(publicText, blocked, [/光害(?:极低|低|较低)/g, /环境光污染(?:极低|低|较低)/g]);
  } else if (!hasDirectionalLightPollutionSupport(result)) {
    collectBlockedMatches(publicText, blocked, [/银河方向光害(?:极低|低|较低)/g]);
  }
  if (!hasPrecipitationSupport(result)) {
    collectBlockedMatches(publicText, blocked, [/雨后开口机会高/g, /雨后开口信号明确/g]);
  }
  return [...new Set(blocked)];
}

function collectBlockedMatches(
  publicText: string,
  blocked: string[],
  patterns: readonly RegExp[],
): void {
  for (const pattern of patterns) {
    const matches = publicText.match(pattern);
    if (matches) {
      blocked.push(...matches.map((match) => match.trim()).filter(Boolean));
    }
  }
}

function sanitizePublicCopyNode(
  result: ForecastCalculationResult,
  domain: ForecastClaimDomain,
  value: unknown,
  key?: string,
): unknown {
  if (typeof value === "string") {
    if (key && publicCopyStructuralKeys.has(key)) {
      return value;
    }
    if (looksLikeIsoDate(value) || looksLikeTimeRangeKey(value)) {
      return value;
    }
    return sanitizeUnsupportedForecastCopy(result, value, domain);
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizePublicCopyNode(result, domain, item));
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  const output: Record<string, unknown> = {};
  for (const [childKey, childValue] of Object.entries(value)) {
    output[childKey] = sanitizePublicCopyNode(result, domain, childValue, childKey);
  }
  return output;
}

function forecastTargetToClaimDomain(target: ForecastTarget): ForecastClaimDomain {
  if (target === "cloud_sea" || target === "glow" || target === "astro" || target === "general") {
    return target;
  }
  return "general";
}

function terrainHorizonCandidates(result: ForecastCalculationResult): readonly TerrainHorizonAssessment[] {
  const candidates: TerrainHorizonAssessment[] = [];
  addTerrainCandidate(candidates, result.terrainAnalysis.horizonProfile.milkyWayAssessment);
  addTerrainCandidate(candidates, result.terrainSummary.milkyWayAssessment);
  addTerrainCandidate(candidates, result.astroAnalysis.terrainHorizonAssessment);
  for (const day of result.astroAnalysis.dailyAstro) {
    addTerrainCandidate(candidates, day.terrainHorizonAssessment);
    addTerrainCandidate(candidates, day.recommendedMilkyWayWindow?.terrainHorizonAssessment);
  }
  for (const window of [
    result.astroAnalysis.recommendedMilkyWayWindow,
    ...result.astroAnalysis.recommendedMilkyWayWindows,
    ...result.astroAnalysis.milkyWayCandidateWindows,
  ]) {
    addTerrainCandidate(candidates, window?.terrainHorizonAssessment);
  }
  return candidates;
}

function addTerrainCandidate(
  candidates: TerrainHorizonAssessment[],
  assessment: TerrainHorizonAssessment | undefined,
): void {
  if (assessment) {
    candidates.push(assessment);
  }
}

function terrainHorizonAssessmentIsResolved(
  assessment: TerrainHorizonAssessment | undefined,
): assessment is TerrainHorizonAssessment {
  return Boolean(
    assessment &&
      assessment.professionalDiagnostics.usedDirectionalProfile &&
      (assessment.confidence === "medium" || assessment.confidence === "high") &&
      typeof assessment.horizonAltitudeDegrees === "number" &&
      typeof assessment.obstructionClearanceDegrees === "number" &&
      assessment.obstructionLevel !== "unknown",
  );
}

function professionalRowsHaveAny(
  result: ForecastCalculationResult,
  fields: readonly (keyof ProfessionalHourlyDataPoint)[],
): boolean {
  return (result.professionalHourlyData ?? []).some((row) =>
    fields.some((field) => isFiniteNumber(row[field])),
  );
}

function firstFiniteNumber(values: readonly (number | null | undefined)[]): number | undefined {
  return values.find(isFiniteNumber);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function looksLikeIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}(?:T|$)/.test(value);
}

function looksLikeTimeRangeKey(value: string): boolean {
  return /^\d{2}:\d{2}(?:[–-]\d{2}:\d{2})?$/.test(value);
}
