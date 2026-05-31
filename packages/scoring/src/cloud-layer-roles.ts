import type { ProfessionalHourlyCloudLayerBasis, TerrainMode } from "@photo-weather/shared";

export type CloudLayerRoleSignal = "none" | "weak" | "medium" | "strong";
export type WhiteoutLayerSignal = "none" | "low" | "medium" | "high";
export type CloudLayerPrimaryRole =
  | "cloud_sea"
  | "whiteout"
  | "glow_reference"
  | "texture"
  | "ordinary"
  | "needs_review";

export type CloudLayerRoleInput = {
  readonly cloudTotalPercent?: number | null;
  readonly cloudHighPercent?: number | null;
  readonly cloudMidPercent?: number | null;
  readonly cloudLowPercent?: number | null;
  readonly cloudLayerBasis?: ProfessionalHourlyCloudLayerBasis;
  readonly relativeHumidityPercent?: number | null;
  readonly dewPointSpreadC?: number | null;
  readonly visibilityMeters?: number | null;
  readonly visibilityKm?: number | null;
  readonly windSpeedMs?: number | null;
  readonly precipitationAmountMm?: number | null;
  readonly precipitationProbabilityPercent?: number | null;
  readonly terrainMode?: TerrainMode | null;
  readonly terrainScore?: number | null;
  readonly lightPhase?:
    | "dawn"
    | "sunrise"
    | "daytime"
    | "sunset"
    | "blue_hour"
    | "deep_night"
    | "astronomical_night"
    | null;
  readonly localHour?: number | null;
};

export type CloudLayerRoleContext = {
  readonly cloudSeaLayerSignal: CloudLayerRoleSignal;
  readonly whiteoutLayerSignal: WhiteoutLayerSignal;
  readonly glowLayerSignal: CloudLayerRoleSignal;
  readonly textureLayerSignal: CloudLayerRoleSignal;
  readonly primaryCloudRole: CloudLayerPrimaryRole;
  readonly noteZh: string;
};

export function classifyCloudLayerRoles(input: CloudLayerRoleInput): CloudLayerRoleContext {
  const lowCloud = finiteNumber(input.cloudLowPercent);
  const midCloud = finiteNumber(input.cloudMidPercent);
  const highCloud = finiteNumber(input.cloudHighPercent);
  const totalCloud = finiteNumber(input.cloudTotalPercent);
  const humidity = finiteNumber(input.relativeHumidityPercent);
  const dewPointSpread = finiteNumber(input.dewPointSpreadC);
  const visibilityKm =
    finiteNumber(input.visibilityKm) ??
    (finiteNumber(input.visibilityMeters) !== undefined
      ? finiteNumber(input.visibilityMeters)! / 1000
      : undefined);
  const windSpeed = finiteNumber(input.windSpeedMs);
  const precipitationAmount = finiteNumber(input.precipitationAmountMm);
  const precipitationProbability = finiteNumber(input.precipitationProbabilityPercent);
  const lowCloudMissing =
    lowCloud === undefined ||
    input.cloudLayerBasis === "total_only" ||
    input.cloudLayerBasis === "unknown";
  const lowCloudWeak = lowCloud === undefined || lowCloud < 35;
  const midHighCloud = maxDefined(midCloud, highCloud);
  const midHighStrong = (midHighCloud ?? 0) >= 65;
  const midHighModerate = (midHighCloud ?? 0) >= 50;
  const totalCloudHigh = (totalCloud ?? 0) >= 85;
  const activePrecipitation =
    (precipitationAmount ?? 0) >= 0.3 || (precipitationProbability ?? 0) >= 60;
  const lightWindow = isGlowLightWindow(input.lightPhase, input.localHour);

  const cloudSeaLayerSignal = lowCloudMissing
    ? "none"
    : roleSignalFromScore(
        cloudSeaLayerScore({
          lowCloud: lowCloud!,
          humidity,
          dewPointSpread,
          visibilityKm,
          windSpeed,
          terrainMode: input.terrainMode,
          terrainScore: finiteNumber(input.terrainScore),
          activePrecipitation,
        }),
      );
  const whiteoutLayerSignal = lowCloudMissing
    ? "none"
    : whiteoutSignalFromScore(
        whiteoutLayerScore({
          lowCloud: lowCloud!,
          humidity,
          dewPointSpread,
          visibilityKm,
          windSpeed,
        }),
      );
  const glowLayerSignal = roleSignalFromScore(
    glowLayerScore({
      midCloud,
      highCloud,
      lightWindow,
      lowCloudWeak,
    }),
  );
  const textureLayerSignal = roleSignalFromScore(
    textureLayerScore({
      totalCloud,
      midCloud,
      highCloud,
      lowCloudWeak,
    }),
  );
  const needsLayerReview =
    lowCloudMissing &&
    (totalCloudHigh ||
      midHighModerate ||
      (humidity !== undefined && humidity >= 88) ||
      (dewPointSpread !== undefined && dewPointSpread <= 4));

  const primaryCloudRole = primaryRole({
    needsLayerReview,
    cloudSeaLayerSignal,
    whiteoutLayerSignal,
    glowLayerSignal,
    textureLayerSignal,
    lowCloudWeak,
  });

  return {
    cloudSeaLayerSignal,
    whiteoutLayerSignal,
    glowLayerSignal,
    textureLayerSignal,
    primaryCloudRole,
    noteZh: roleNoteZh({
      primaryCloudRole,
      lowCloudMissing,
      lowCloudWeak,
      midHighStrong,
      totalCloudHigh,
      terrainMode: input.terrainMode,
    }),
  };
}

function cloudSeaLayerScore(input: {
  readonly lowCloud: number;
  readonly humidity?: number;
  readonly dewPointSpread?: number;
  readonly visibilityKm?: number;
  readonly windSpeed?: number;
  readonly terrainMode?: TerrainMode | null;
  readonly terrainScore?: number;
  readonly activePrecipitation: boolean;
}): number {
  const lowCloudScore =
    input.lowCloud >= 45 && input.lowCloud <= 88
      ? 94
      : input.lowCloud >= 35 && input.lowCloud < 45
        ? 72
        : input.lowCloud > 88 && input.lowCloud <= 94
          ? 72
          : input.lowCloud > 94
            ? 42
            : input.lowCloud >= 25
              ? 44
              : 18;
  const humidityScore =
    input.humidity === undefined
      ? 52
      : input.humidity >= 92
        ? 94
        : input.humidity >= 84
          ? 76
          : input.humidity >= 75
            ? 58
            : 32;
  const dewPointScore =
    input.dewPointSpread === undefined
      ? 52
      : input.dewPointSpread <= 3
        ? 94
        : input.dewPointSpread <= 5
          ? 78
          : input.dewPointSpread <= 8
            ? 54
            : 28;
  const visibilityScore =
    input.visibilityKm === undefined
      ? 52
      : input.visibilityKm < 3
        ? 26
        : input.visibilityKm < 6
          ? 48
          : input.visibilityKm <= 22
            ? 86
            : 70;
  const windScore =
    input.windSpeed === undefined
      ? 55
      : input.windSpeed < 0.5
        ? 52
        : input.windSpeed <= 6
          ? 90
          : input.windSpeed <= 8
            ? 68
            : 30;
  const terrainScore =
    input.terrainScore ??
    (input.terrainMode === "mountain" || input.terrainMode === "high_mountain"
      ? 86
      : input.terrainMode === "hill"
        ? 68
        : input.terrainMode === "unknown"
          ? 42
          : 34);
  const precipitationScore = input.activePrecipitation ? 28 : 72;

  const score = weightedAverage([
    [lowCloudScore, 0.32],
    [humidityScore, 0.17],
    [dewPointScore, 0.16],
    [terrainScore, 0.15],
    [windScore, 0.1],
    [visibilityScore, 0.06],
    [precipitationScore, 0.04],
  ]);
  if (input.lowCloud < 25) {
    return Math.min(score, 34);
  }
  if (input.lowCloud < 35) {
    return Math.min(score, 48);
  }
  if (input.lowCloud > 94) {
    return Math.min(score, 74);
  }
  return score;
}

function whiteoutLayerScore(input: {
  readonly lowCloud: number;
  readonly humidity?: number;
  readonly dewPointSpread?: number;
  readonly visibilityKm?: number;
  readonly windSpeed?: number;
}): number {
  const lowCloudRisk =
    input.lowCloud >= 90
      ? 96
      : input.lowCloud >= 78
        ? 84
        : input.lowCloud >= 62
          ? 62
          : input.lowCloud >= 45
            ? 38
            : 18;
  const humidityRisk =
    input.humidity === undefined
      ? 42
      : input.humidity >= 95
        ? 92
        : input.humidity >= 90
          ? 76
          : input.humidity >= 84
            ? 52
            : 24;
  const dewPointRisk =
    input.dewPointSpread === undefined
      ? 42
      : input.dewPointSpread <= 2
        ? 88
        : input.dewPointSpread <= 4
          ? 66
          : 26;
  const visibilityRisk =
    input.visibilityKm === undefined
      ? 42
      : input.visibilityKm <= 3
        ? 96
        : input.visibilityKm <= 8
          ? 66
          : 22;
  const windRisk =
    input.windSpeed === undefined
      ? 42
      : input.windSpeed < 0.8
        ? 70
        : input.windSpeed < 2
          ? 58
          : 26;

  return weightedAverage([
    [lowCloudRisk, 0.34],
    [humidityRisk, 0.2],
    [visibilityRisk, 0.22],
    [dewPointRisk, 0.16],
    [windRisk, 0.08],
  ]);
}

function glowLayerScore(input: {
  readonly midCloud?: number;
  readonly highCloud?: number;
  readonly lightWindow: boolean;
  readonly lowCloudWeak: boolean;
}): number {
  const midHighCloud = maxDefined(input.midCloud, input.highCloud);
  if (midHighCloud === undefined || !input.lowCloudWeak) {
    return 0;
  }
  const carrierScore =
    midHighCloud >= 75 ? 90 : midHighCloud >= 60 ? 74 : midHighCloud >= 45 ? 54 : 24;
  return input.lightWindow ? carrierScore : Math.max(20, carrierScore - 24);
}

function textureLayerScore(input: {
  readonly totalCloud?: number;
  readonly midCloud?: number;
  readonly highCloud?: number;
  readonly lowCloudWeak: boolean;
}): number {
  const midHighCloud = maxDefined(input.midCloud, input.highCloud);
  const midHighScore =
    midHighCloud === undefined
      ? 0
      : midHighCloud >= 75
        ? 88
        : midHighCloud >= 60
          ? 72
          : midHighCloud >= 45
            ? 52
            : 20;
  const totalPatternScore =
    input.totalCloud === undefined
      ? 0
      : input.totalCloud >= 90
        ? 66
        : input.totalCloud >= 75
          ? 52
          : 18;
  return input.lowCloudWeak ? Math.max(midHighScore, totalPatternScore) : Math.max(0, midHighScore - 28);
}

function primaryRole(input: {
  readonly needsLayerReview: boolean;
  readonly cloudSeaLayerSignal: CloudLayerRoleSignal;
  readonly whiteoutLayerSignal: WhiteoutLayerSignal;
  readonly glowLayerSignal: CloudLayerRoleSignal;
  readonly textureLayerSignal: CloudLayerRoleSignal;
  readonly lowCloudWeak: boolean;
}): CloudLayerPrimaryRole {
  if (input.needsLayerReview) {
    return "needs_review";
  }
  if (input.whiteoutLayerSignal === "high") {
    return "whiteout";
  }
  if (
    input.cloudSeaLayerSignal === "strong" ||
    (input.cloudSeaLayerSignal === "medium" && input.whiteoutLayerSignal !== "medium")
  ) {
    return "cloud_sea";
  }
  if (input.whiteoutLayerSignal === "medium") {
    return "whiteout";
  }
  if (
    input.lowCloudWeak &&
    (input.glowLayerSignal === "strong" || input.glowLayerSignal === "medium")
  ) {
    return "glow_reference";
  }
  if (
    input.lowCloudWeak &&
    (input.textureLayerSignal === "strong" || input.textureLayerSignal === "medium")
  ) {
    return "texture";
  }
  return "ordinary";
}

function roleNoteZh(input: {
  readonly primaryCloudRole: CloudLayerPrimaryRole;
  readonly lowCloudMissing: boolean;
  readonly lowCloudWeak: boolean;
  readonly midHighStrong: boolean;
  readonly totalCloudHigh: boolean;
  readonly terrainMode?: TerrainMode | null;
}): string {
  const lowland = isLowlandMode(input.terrainMode);
  if (input.primaryCloudRole === "needs_review") {
    if (input.midHighStrong) {
      return "低云分层缺失，中高云只作霞光或云层纹理参考，不用来推断云海，需复核低云。";
    }
    if (input.totalCloudHigh) {
      return "仅总云量偏高，不能替代低云分层，云海和白墙判断需复核。";
    }
    return "低云分层缺失，云海形成和白墙风险不做高置信判断。";
  }
  if (input.primaryCloudRole === "whiteout") {
    return lowland
      ? "低云、湿度、露点差和能见度共同显示低云遮挡风险。"
      : "低云贴近机位且湿度高、能见度偏低，需警惕白墙风险。";
  }
  if (input.primaryCloudRole === "cloud_sea") {
    return lowland
      ? "低云、湿度、露点差、能见度、风和通透度共同支持低云/晨雾观察。"
      : "低云、湿度、露点差、能见度、风和地形共同支持云海形成。";
  }
  if (input.primaryCloudRole === "glow_reference") {
    return lowland
      ? "中高云更适合观察霞光或云层纹理，不按云海判断。"
      : "云海信号不足，中高云可作为霞光参考，不直接作为云海依据。";
  }
  if (input.primaryCloudRole === "texture") {
    return "中高云或总云量更多代表云层纹理，不直接作为云海形成依据。";
  }
  if (input.lowCloudMissing) {
    return "低云分层缺失，当前不从中高云或总云量推断云海。";
  }
  if (input.lowCloudWeak) {
    return "低云信号不足，中高云只作为天空层次参考。";
  }
  return "云层未形成明确云海、白墙、霞光或纹理信号。";
}

function roleSignalFromScore(score: number): CloudLayerRoleSignal {
  if (score >= 76) {
    return "strong";
  }
  if (score >= 58) {
    return "medium";
  }
  if (score >= 38) {
    return "weak";
  }
  return "none";
}

function whiteoutSignalFromScore(score: number): WhiteoutLayerSignal {
  if (score >= 76) {
    return "high";
  }
  if (score >= 58) {
    return "medium";
  }
  if (score >= 36) {
    return "low";
  }
  return "none";
}

function isGlowLightWindow(
  lightPhase: CloudLayerRoleInput["lightPhase"],
  localHour: number | null | undefined,
): boolean {
  if (lightPhase === "dawn" || lightPhase === "sunrise" || lightPhase === "sunset") {
    return true;
  }
  if (typeof localHour === "number" && Number.isFinite(localHour)) {
    return (localHour >= 4 && localHour <= 8.5) || (localHour >= 16 && localHour <= 20.5);
  }
  return false;
}

function weightedAverage(items: readonly (readonly [number, number])[]): number {
  const totalWeight = items.reduce((sum, item) => sum + item[1], 0);
  if (totalWeight <= 0) {
    return 0;
  }
  return items.reduce((sum, item) => sum + item[0] * item[1], 0) / totalWeight;
}

function finiteNumber(value: number | null | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function maxDefined(...values: readonly (number | undefined)[]): number | undefined {
  const defined = values.filter((value): value is number => value !== undefined);
  return defined.length > 0 ? Math.max(...defined) : undefined;
}

function isLowlandMode(mode: TerrainMode | null | undefined): boolean {
  return mode === "lowland" || mode === "urban_or_plain" || mode === "unknown";
}
