export type AerosolTransparencyImpact = "clear" | "slightly_suppressed" | "suppressed" | "poor";

export type AerosolTransparencyConfidence = "high" | "medium" | "low";

export type AerosolTransparencyInput = {
  readonly aerosolOpticalDepth550?: number | null;
  readonly pm25?: number | null;
  readonly pm10?: number | null;
  readonly dust?: number | null;
  readonly visibility?: number | null;
  readonly rawVisibilityKm?: number | null;
  readonly humidity?: number | null;
  readonly aerosolAvailability?: "available" | "partial" | "unavailable";
  readonly aerosolConfidence?: AerosolTransparencyConfidence;
};

export type AerosolTransparencyAssessment = {
  readonly available: boolean;
  readonly transparencyImpact: AerosolTransparencyImpact;
  readonly scorePenalty: number;
  readonly glowPenalty: number;
  readonly astroPenalty: number;
  readonly cloudSeaPenalty: number;
  readonly reasonsZh: readonly string[];
  readonly confidence: AerosolTransparencyConfidence;
  readonly aerosolSignalCount: number;
  readonly signalCount: number;
};

const impactByLevel = ["clear", "slightly_suppressed", "suppressed", "poor"] as const;

export function assessAerosolTransparency(
  input: AerosolTransparencyInput | undefined,
): AerosolTransparencyAssessment {
  const unavailable = emptyAerosolTransparencyAssessment();
  if (!input) {
    return unavailable;
  }

  const aod = finiteNumber(input.aerosolOpticalDepth550);
  const pm25 = finiteNumber(input.pm25);
  const pm10 = finiteNumber(input.pm10);
  const dust = finiteNumber(input.dust);
  const visibility = finiteNumber(input.rawVisibilityKm ?? input.visibility);
  const humidity = finiteNumber(input.humidity);
  const aerosolSignalCount = [aod, pm25, pm10, dust].filter((value) => value !== null).length;
  const hasVisibilitySignal = visibility !== null;
  const signalCount = aerosolSignalCount + (hasVisibilitySignal ? 1 : 0);

  if (signalCount === 0) {
    return unavailable;
  }

  let level = 0;
  const reasons: string[] = [];

  if (aod !== null) {
    if (aod > 0.6) {
      level = Math.max(level, 3);
      reasons.push("大气散射信号偏高，空气透明度受气溶胶影响。");
    } else if (aod > 0.3) {
      level = Math.max(level, 2);
      reasons.push("大气散射信号偏高，远山层次和星空透明度可能受抑制。");
    } else if (aod > 0.15) {
      level = Math.max(level, 1);
      reasons.push("大气散射信号略高，霞光色彩需要临近复核。");
    }
  }

  if ((pm25 ?? 0) > 75 || (pm10 ?? 0) > 150) {
    level = Math.max(level, 3);
    reasons.push("颗粒物偏高，霞光色彩可能被雾霾或气溶胶压制。");
  } else if ((pm25 ?? 0) > 35 || (pm10 ?? 0) > 75) {
    level = Math.max(level, 2);
    reasons.push("颗粒物偏高，空气透明度偏弱。");
  }

  if ((dust ?? 0) > 200) {
    level = Math.max(level, 3);
    reasons.push("沙尘信号偏高，空气透明度偏弱。");
  } else if ((dust ?? 0) > 100) {
    level = Math.max(level, 2);
    reasons.push("沙尘信号偏高，建议临近复核。");
  }

  if (visibility !== null) {
    if (visibility < 4) {
      level = Math.max(level, 3);
      reasons.push("能见度偏低，建议临近复核。");
    } else if (visibility < 8) {
      level = Math.max(level, 2);
      reasons.push("能见度偏低，通透度会受影响。");
    } else if (visibility < 10 && (humidity ?? 0) > 90) {
      level = Math.max(level, 2);
      reasons.push("高湿叠加低能见度，雾霾或雾气会压低通透度。");
    } else if (visibility < 12) {
      level = Math.max(level, 1);
      reasons.push("能见度略低，远山层次需要复核。");
    }
  }

  const impact = impactByLevel[level] ?? "clear";
  const confidence = aerosolTransparencyConfidence({
    aerosolConfidence: input.aerosolConfidence,
    aerosolSignalCount,
    signalCount,
  });
  const onlyOneSignal = signalCount === 1;
  const hasAerosolSignal = aerosolSignalCount > 0;
  const basePenalty = penaltyForImpact(impact);
  const scorePenalty = boundedPenalty(
    hasAerosolSignal ? basePenalty : Math.min(basePenalty, 4),
    onlyOneSignal ? 16 : 28,
  );

  return {
    available: true,
    transparencyImpact: impact,
    scorePenalty,
    glowPenalty: boundedPenalty(
      hasAerosolSignal ? targetPenaltyForImpact(impact, "glow") : Math.min(basePenalty, 4),
      onlyOneSignal ? 18 : 34,
    ),
    astroPenalty: boundedPenalty(
      hasAerosolSignal ? targetPenaltyForImpact(impact, "astro") : Math.min(basePenalty, 4),
      onlyOneSignal ? 20 : 38,
    ),
    cloudSeaPenalty: boundedPenalty(
      targetPenaltyForImpact(impact, "cloud_sea", {
        visibilityKm: visibility,
        humidity,
        hasAerosolSignal,
      }),
      onlyOneSignal ? 8 : 16,
    ),
    reasonsZh:
      reasons.length > 0
        ? uniqueStrings(reasons)
        : impact === "clear"
          ? ["空气透明度未见明显气溶胶压制。"]
          : ["空气透明度受气溶胶影响。"],
    confidence,
    aerosolSignalCount,
    signalCount,
  };
}

export function aerosolImpactRank(impact: AerosolTransparencyImpact): number {
  return impactByLevel.indexOf(impact);
}

function emptyAerosolTransparencyAssessment(): AerosolTransparencyAssessment {
  return {
    available: false,
    transparencyImpact: "clear",
    scorePenalty: 0,
    glowPenalty: 0,
    astroPenalty: 0,
    cloudSeaPenalty: 0,
    reasonsZh: [],
    confidence: "low",
    aerosolSignalCount: 0,
    signalCount: 0,
  };
}

function aerosolTransparencyConfidence(input: {
  readonly aerosolConfidence?: AerosolTransparencyConfidence;
  readonly aerosolSignalCount: number;
  readonly signalCount: number;
}): AerosolTransparencyConfidence {
  const computed =
    input.aerosolSignalCount >= 3 ? "high" : input.signalCount >= 2 ? "medium" : "low";
  if (!input.aerosolConfidence || input.aerosolConfidence === "high") {
    return computed;
  }
  if (input.aerosolConfidence === "medium") {
    return computed === "high" ? "medium" : computed;
  }
  return "low";
}

function penaltyForImpact(impact: AerosolTransparencyImpact): number {
  switch (impact) {
    case "poor":
      return 24;
    case "suppressed":
      return 14;
    case "slightly_suppressed":
      return 5;
    default:
      return 0;
  }
}

function targetPenaltyForImpact(
  impact: AerosolTransparencyImpact,
  target: "glow" | "astro" | "cloud_sea",
  options: {
    readonly visibilityKm?: number | null;
    readonly humidity?: number | null;
    readonly hasAerosolSignal?: boolean;
  } = {},
): number {
  if (target === "glow") {
    return impact === "poor"
      ? 30
      : impact === "suppressed"
        ? 18
        : impact === "slightly_suppressed"
          ? 6
          : 0;
  }
  if (target === "astro") {
    return impact === "poor"
      ? 34
      : impact === "suppressed"
        ? 22
        : impact === "slightly_suppressed"
          ? 8
          : 0;
  }

  const poorVisibility =
    (options.visibilityKm ?? 99) < 8 ||
    ((options.humidity ?? 0) > 90 && (options.visibilityKm ?? 99) < 10);
  if (!options.hasAerosolSignal && !poorVisibility) {
    return 0;
  }
  if (impact === "poor") {
    return poorVisibility ? 14 : 8;
  }
  if (impact === "suppressed") {
    return poorVisibility ? 10 : 5;
  }
  if (impact === "slightly_suppressed") {
    return poorVisibility ? 4 : 2;
  }
  return 0;
}

function boundedPenalty(value: number, max: number): number {
  return Math.min(max, Math.max(0, Math.round(value)));
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function uniqueStrings(values: readonly string[]): readonly string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}
