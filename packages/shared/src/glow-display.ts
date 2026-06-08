export type GlowDisplayRecommendation =
  | "推荐前往"
  | "可以关注"
  | "仅作备选"
  | "不建议专程前往";

export const glowDisplayRecommendationVocabulary = [
  "推荐前往",
  "可以关注",
  "仅作备选",
  "不建议专程前往",
] as const satisfies readonly GlowDisplayRecommendation[];

const glowScoreProbabilityAnchors = [
  { score: 0, probability: 0 },
  { score: 42, probability: 32 },
  { score: 50, probability: 42 },
  { score: 65, probability: 62 },
  { score: 80, probability: 78 },
  { score: 100, probability: 94 },
] as const;

function normalizedScore(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(100, Math.max(0, value));
}

// Glow scores are deterministic opportunity scores, not measured hit rates.
// This conservative monotonic display mapping aligns the public probability
// with the same recommendation bands while avoiding a direct score -> percent
// relabel.
export function glowScoreToDisplayProbabilityPercent(score: number): number {
  const value = normalizedScore(score);

  for (let index = 1; index < glowScoreProbabilityAnchors.length; index += 1) {
    const lower = glowScoreProbabilityAnchors[index - 1];
    const upper = glowScoreProbabilityAnchors[index];
    if (!lower || !upper || value > upper.score) {
      continue;
    }

    const progress = (value - lower.score) / (upper.score - lower.score);
    return Math.round(lower.probability + progress * (upper.probability - lower.probability));
  }

  return glowScoreProbabilityAnchors.at(-1)?.probability ?? 0;
}

export function glowDisplayRecommendationForScore(score: number): GlowDisplayRecommendation {
  const value = normalizedScore(score);
  if (value >= 80) {
    return "推荐前往";
  }
  if (value >= 65) {
    return "可以关注";
  }
  if (value >= 50) {
    return "仅作备选";
  }
  return "不建议专程前往";
}
