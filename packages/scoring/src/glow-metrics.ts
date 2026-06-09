import {
  glowVividnessLevelForIndex,
  type GlowPostRainOpeningChance,
  type GlowProbabilityCalibrationMode,
  type GlowWindowType,
} from "@photo-weather/shared";
import { averageWeightedScore, clampScore } from "./helpers.js";

export const glowOccurrenceProbabilityCalibrationMode: GlowProbabilityCalibrationMode = "heuristic";

export type GlowOccurrenceProbabilityCalibrationInput = {
  readonly colorCarrierScore: number;
  readonly lowCloudObstructionRisk: number;
  readonly precipitationDisruptionRisk: number;
  readonly visibilityColorQualityScore: number;
  readonly providerAgreementScore: number;
  readonly dataCompletenessScore: number;
  readonly temporalProximityScore: number;
};

export type GlowVividnessIndexInput = {
  readonly colorCarrierScore: number;
  readonly visibilityColorQualityScore: number;
  readonly aerosolScore?: number;
  readonly humidityScore: number;
  readonly solarGeometryScore: number;
};

export type GlowPracticalSuitabilityInput = {
  readonly occurrenceProbabilityPercent: number;
  readonly vividnessIndex: number;
  readonly lowCloudObstructionRisk: number;
  readonly precipitationDisruptionRisk: number;
  readonly visibilityColorQualityScore: number;
  readonly aerosolScore?: number;
  readonly terrainScore: number;
  readonly windHumidityScore: number;
  readonly rainOverlapsWindow: boolean;
  readonly postRainOpeningChance: GlowPostRainOpeningChance;
  readonly type: GlowWindowType;
  readonly confidence: number;
};

// Occurrence is a deterministic calibrated likelihood for the canonical glow
// event. It intentionally excludes travel/terrain comfort and color vividness.
export function calibrateGlowOccurrenceProbability(
  input: GlowOccurrenceProbabilityCalibrationInput,
): number {
  const base = averageWeightedScore([
    { score: input.colorCarrierScore, weight: 0.36 },
    { score: 100 - input.lowCloudObstructionRisk, weight: 0.22 },
    { score: 100 - input.precipitationDisruptionRisk, weight: 0.14 },
    { score: input.visibilityColorQualityScore, weight: 0.1 },
    { score: input.providerAgreementScore, weight: 0.08 },
    { score: input.dataCompletenessScore, weight: 0.06 },
    { score: input.temporalProximityScore, weight: 0.04 },
  ]);
  const lowCloudHardBlockPenalty =
    input.lowCloudObstructionRisk >= 88 ? 18 : input.lowCloudObstructionRisk >= 76 ? 10 : 0;
  const rainHardBlockPenalty =
    input.precipitationDisruptionRisk >= 85
      ? 18
      : input.precipitationDisruptionRisk >= 68
        ? 9
        : 0;
  const carrierWeakPenalty =
    input.colorCarrierScore < 30 ? 14 : input.colorCarrierScore < 45 ? 7 : 0;

  return clampScore(base - lowCloudHardBlockPenalty - rainHardBlockPenalty - carrierWeakPenalty);
}

// Vividness estimates color strength if glow occurs. It does not use travel
// friction, terrain access, precipitation disruption, or recommendation labels.
export function calculateGlowVividnessIndex(input: GlowVividnessIndexInput): number {
  return averageWeightedScore([
    { score: input.colorCarrierScore, weight: 0.46 },
    { score: input.visibilityColorQualityScore, weight: 0.22 },
    { score: input.aerosolScore ?? 68, weight: 0.16 },
    { score: input.solarGeometryScore, weight: 0.1 },
    { score: input.humidityScore, weight: 0.06 },
  ]);
}

export function calculateGlowPracticalSuitabilityScore(
  input: GlowPracticalSuitabilityInput,
): number {
  const base = averageWeightedScore([
    { score: input.occurrenceProbabilityPercent, weight: 0.34 },
    { score: input.vividnessIndex, weight: 0.24 },
    { score: 100 - input.lowCloudObstructionRisk, weight: 0.1 },
    { score: 100 - input.precipitationDisruptionRisk, weight: 0.1 },
    { score: input.visibilityColorQualityScore, weight: 0.08 },
    { score: input.terrainScore, weight: 0.06 },
    { score: input.windHumidityScore, weight: 0.04 },
    { score: input.confidence, weight: 0.04 },
  ]);
  const lowCloudPenalty =
    input.lowCloudObstructionRisk >= 90
      ? 28
      : input.lowCloudObstructionRisk >= 78
        ? 20
        : input.lowCloudObstructionRisk >= 65
          ? 10
          : 0;
  const rainPenalty =
    input.precipitationDisruptionRisk >= 85
      ? 26
      : input.precipitationDisruptionRisk >= 70
        ? 20
        : input.precipitationDisruptionRisk >= 50
          ? 11
          : 0;
  const activeRainPenalty = input.rainOverlapsWindow ? 16 : 0;
  const visibilityPenalty =
    input.visibilityColorQualityScore < 35 ? 18 : input.visibilityColorQualityScore < 52 ? 9 : 0;
  const aerosolPenalty =
    input.aerosolScore === undefined
      ? 0
      : input.aerosolScore < 35
        ? 14
        : input.aerosolScore < 50
          ? 8
          : 0;
  const terrainPenalty = input.terrainScore < 45 ? 14 : input.terrainScore < 58 ? 7 : 0;
  const rainOpeningBonus =
    input.postRainOpeningChance === "high" ? 7 : input.postRainOpeningChance === "medium" ? 4 : 0;
  const aerosolBonus = input.aerosolScore !== undefined && input.aerosolScore >= 80 ? 3 : 0;
  const blueHourPenalty = input.type === "blue_hour_transition" ? 12 : 0;

  return clampScore(
    base +
      rainOpeningBonus +
      aerosolBonus -
      lowCloudPenalty -
      rainPenalty -
      visibilityPenalty -
      aerosolPenalty -
      terrainPenalty -
      blueHourPenalty -
      activeRainPenalty,
  );
}

export function glowVividnessLevelForScore(index: number) {
  return glowVividnessLevelForIndex(index);
}
