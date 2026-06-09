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

export type GlowWindowLifecycleState = "upcoming" | "active" | "ended" | "unavailable";

export type GlowWindowLifecycle = {
  readonly state: GlowWindowLifecycleState;
  readonly startAt?: string;
  readonly endAt?: string;
  readonly evaluatedAt: string;
  readonly timezone: string;
  readonly isRecommendationEligible: boolean;
};

export type GlowWindowLifecycleInput = {
  readonly startAt?: string | null;
  readonly endAt?: string | null;
  readonly evaluatedAt: string | number | Date;
  readonly timezone?: string | null;
};

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

export function classifyGlowWindowLifecycle(input: GlowWindowLifecycleInput): GlowWindowLifecycle {
  const timezone = input.timezone || "UTC";
  const evaluatedAtMs = timestampMs(input.evaluatedAt);
  const startAtMs = timestampMs(input.startAt);
  const endAtMs = timestampMs(input.endAt);
  const invalidWindow =
    !Number.isFinite(evaluatedAtMs) ||
    !Number.isFinite(startAtMs) ||
    !Number.isFinite(endAtMs) ||
    endAtMs <= startAtMs;

  if (invalidWindow) {
    return {
      state: "unavailable",
      startAt: input.startAt ?? undefined,
      endAt: input.endAt ?? undefined,
      evaluatedAt: normalizedTimestamp(input.evaluatedAt),
      timezone,
      isRecommendationEligible: false,
    };
  }

  const state: GlowWindowLifecycleState =
    evaluatedAtMs < startAtMs ? "upcoming" : evaluatedAtMs <= endAtMs ? "active" : "ended";

  return {
    state,
    startAt: input.startAt ?? undefined,
    endAt: input.endAt ?? undefined,
    evaluatedAt: normalizedTimestamp(input.evaluatedAt),
    timezone,
    isRecommendationEligible: isGlowWindowRecommendationEligible(state),
  };
}

export function isGlowWindowRecommendationEligible(state: GlowWindowLifecycleState): boolean {
  return state === "upcoming" || state === "active";
}

export function glowLocalDateKey(
  value: string | number | Date | null | undefined,
  timezone: string,
): string | null {
  const timestamp = timestampMs(value);
  if (!Number.isFinite(timestamp)) {
    return null;
  }

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone || "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(timestamp));
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  return year && month && day ? `${year}-${month}-${day}` : null;
}

function timestampMs(value: string | number | Date | null | undefined): number {
  if (value instanceof Date) {
    return value.getTime();
  }
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    return Date.parse(value);
  }
  return Number.NaN;
}

function normalizedTimestamp(value: string | number | Date): string {
  if (typeof value === "string") {
    return value;
  }
  const timestamp = timestampMs(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : "";
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
