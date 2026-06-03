import {
  classifyTerrainMode,
  type ElevationConfidence,
  type ForecastCalculationResult,
  type TerrainMode,
  type TerrainType,
} from "@photo-weather/shared";

export type CloudSeaTerrainClass =
  | "high_mountain"
  | "mountain"
  | "hill"
  | "low_elevation"
  | "unknown";

export type CloudSeaTerrainContextInput = {
  readonly elevationMeters?: number | null;
  readonly locationElevation?: number | null;
  readonly surroundingReliefMeters?: number | null;
  readonly nearbyValleyElevationMeters?: number | null;
  readonly localReliefMeters?: number | null;
  readonly elevationDiff5km?: number | null;
  readonly terrainType?: TerrainType | string | null;
  readonly locationType?: string | null;
  readonly terrainConfidence?: string | null;
  readonly elevationConfidence?: ElevationConfidence | null;
  readonly terrainMode?: TerrainMode | null;
};

export type CloudSeaWindowCategoryCopy = {
  readonly title: string;
  readonly noWindowIssue: string;
  readonly noWindowAction: string;
};

export type CloudSeaWindowCategoryLabels = {
  readonly sunrise: string;
  readonly sunset: string;
  readonly daylight: string;
  readonly noLight: string;
};

export type CloudSeaRecommendationCeiling = "classic_cloud_sea" | "recommend_observation";

export type CloudSeaTerrainVocabulary = {
  readonly heroTitleSuffix: string;
  readonly heroBadgeLabel: string;
  readonly scoreCardLabel: string;
  readonly subjectLabel: string;
  readonly formationCardLabel: string;
  readonly shootableCardLabel: string;
  readonly obstructionRiskLabel: string;
  readonly bestWindowMetricLabel: string;
  readonly formationShootableMetricLabel: string;
  readonly windowSectionTitle: string;
  readonly windowSectionDescription: string;
  readonly windowSectionBadge: string;
  readonly windowCategories: {
    readonly sunrise: CloudSeaWindowCategoryCopy;
    readonly sunset: CloudSeaWindowCategoryCopy;
    readonly lit: CloudSeaWindowCategoryCopy;
    readonly lowLight: CloudSeaWindowCategoryCopy;
  };
  readonly bestTimelineWindowLabel: string;
  readonly watchTimelineWindowLabel: string;
  readonly avoidTimelineWindowLabel: string;
  readonly genericWindowLabel: string;
  readonly dailyDescription: string;
  readonly dailyBestWindowLabel: string;
  readonly dailyObstructionStatLabel: string;
  readonly professionalDescription: string;
  readonly professionalSignalColumnLabel: string;
  readonly professionalCloudSeaFilterLabel: string;
  readonly professionalUsageText: string;
};

export type CloudSeaTerrainContext = {
  readonly terrainClass: CloudSeaTerrainClass;
  readonly isClassicCloudSeaEligible: boolean;
  readonly shouldDowngradeCloudSeaWording: boolean;
  readonly elevationMeters?: number;
  readonly surroundingReliefMeters?: number;
  readonly nearbyValleyElevationMeters?: number;
  readonly terrainType?: string;
  readonly terrainNoteZh: string;
  readonly windowSectionNoteZh?: string;
  readonly windowCategoryLabels: CloudSeaWindowCategoryLabels;
  readonly forbiddenStrongRecommendation: boolean;
  readonly recommendationCeiling: CloudSeaRecommendationCeiling;
  readonly preferredVocabulary: readonly string[];
  readonly vocabulary: CloudSeaTerrainVocabulary;
};

const mountainTerrainTypes = new Set(["high_mountain", "ridge", "summit", "mountain_platform"]);

const classicCloudSeaVocabulary: CloudSeaTerrainVocabulary = {
  heroTitleSuffix: "云海判断",
  heroBadgeLabel: "云海判断",
  scoreCardLabel: "云海可拍指数",
  subjectLabel: "云海",
  formationCardLabel: "云海形成机会",
  shootableCardLabel: "云海可拍机会",
  obstructionRiskLabel: "白墙风险",
  bestWindowMetricLabel: "最佳云海窗口",
  formationShootableMetricLabel: "云海形成 / 可拍机会",
  windowSectionTitle: "云海窗口与备选",
  windowSectionDescription: "按光线和时段归纳主窗口与备选窗口，快速判断哪一类云海更值得守拍。",
  windowSectionBadge: "云海窗口",
  windowCategories: {
    sunrise: {
      title: "日出云海",
      noWindowIssue: "当前窗口数据未给出日出前后可用云海窗口。",
      noWindowAction: "不建议只为日出云海专程等待，可顺带观察低云上沿和能见度。",
    },
    sunset: {
      title: "日落云海",
      noWindowIssue: "当前窗口数据未给出日落或余晖附近可用云海窗口。",
      noWindowAction: "保留日落前后机动观察，不建议押单一云海窗口。",
    },
    lit: {
      title: "有光云海",
      noWindowIssue: "当前窗口数据缺少与自然光重叠的明确云海窗口。",
      noWindowAction: "等待临近预报更新，优先复核低云高度、开口和通透度。",
    },
    lowLight: {
      title: "无光云海",
      noWindowIssue: "当前窗口数据未给出夜间或低光云海形成窗口。",
      noWindowAction: "不建议专程夜守；若已在山上，可作为氛围、剪影或层次观察。",
    },
  },
  bestTimelineWindowLabel: "最佳云海窗口",
  watchTimelineWindowLabel: "可观察窗口",
  avoidTimelineWindowLabel: "不建议窗口",
  genericWindowLabel: "云海观察窗口",
  dailyDescription: "每天只保留云海形成、可拍、白墙、主窗口和雨后开口。",
  dailyBestWindowLabel: "最佳窗口",
  dailyObstructionStatLabel: "白墙",
  professionalDescription:
    "低云、湿度、露点、降水、能见度和风速用于复核云海形成与白墙；中高云主要作为霞光和云层纹理参考。",
  professionalSignalColumnLabel: "云海信号",
  professionalCloudSeaFilterLabel: "只看云海窗口",
  professionalUsageText: "用于核对主窗口、白墙和雨后开口。",
};

const downgradedCloudSeaVocabulary: CloudSeaTerrainVocabulary = {
  heroTitleSuffix: "低云/晨雾参考",
  heroBadgeLabel: "低云/晨雾参考",
  scoreCardLabel: "低云/晨雾参考指数",
  subjectLabel: "低云/晨雾",
  formationCardLabel: "低云/晨雾信号",
  shootableCardLabel: "云层可观察机会",
  obstructionRiskLabel: "低云遮挡风险",
  bestWindowMetricLabel: "最佳观察窗口",
  formationShootableMetricLabel: "低云/晨雾 / 可观察机会",
  windowSectionTitle: "低云观察与备选",
  windowSectionDescription: "按时段归纳低云、晨雾、云层变化和通透参考。",
  windowSectionBadge: "云层观察",
  windowCategories: {
    sunrise: {
      title: "日出低云 / 晨雾",
      noWindowIssue: "当前窗口数据未给出日出前后明确低云或晨雾观察窗口。",
      noWindowAction: "不建议只为低云或晨雾专程等待，可顺带观察通透度和远山层次。",
    },
    sunset: {
      title: "日落层云",
      noWindowIssue: "当前窗口数据未给出日落或余晖附近明确层云观察窗口。",
      noWindowAction: "保留日落前后机动观察，优先转向霞光、云层纹理和通透参考。",
    },
    lit: {
      title: "有光云层",
      noWindowIssue: "当前窗口数据缺少与自然光重叠的明确云层观察窗口。",
      noWindowAction: "等待临近预报更新，优先复核低云是否贴地、云层开口和通透度。",
    },
    lowLight: {
      title: "夜间低云 / 雾气",
      noWindowIssue: "当前窗口数据未给出夜间低云或雾气观察窗口。",
      noWindowAction: "不建议专程夜守；若已在附近，可作为雾气层次或城市夜景氛围参考。",
    },
  },
  bestTimelineWindowLabel: "推荐观察窗口",
  watchTimelineWindowLabel: "可顺带观察窗口",
  avoidTimelineWindowLabel: "不建议专程窗口",
  genericWindowLabel: "低云/晨雾观察窗口",
  dailyDescription: "每天只保留低云、晨雾、云层变化、遮挡风险、观察窗口和雨后开口。",
  dailyBestWindowLabel: "观察窗口",
  dailyObstructionStatLabel: "遮挡",
  professionalDescription:
    "低云、湿度、露点、降水、能见度和风速用于复核低云、晨雾与遮挡；中高云主要作为霞光和云层纹理参考。",
  professionalSignalColumnLabel: "低云信号",
  professionalCloudSeaFilterLabel: "只看低云窗口",
  professionalUsageText: "用于核对低云、晨雾、遮挡和雨后开口。",
};

const classicCloudSeaPreferredVocabulary = [
  "云海窗口",
  "云海形成",
  "云海可拍",
  "白墙风险",
  "主守窗口",
] as const;

const downgradedCloudSeaPreferredVocabulary = [
  "低云",
  "晨雾",
  "层云",
  "云层变化",
  "通透",
  "霞光参考",
  "远山层次",
] as const;

const downgradedWindowSectionNoteZh =
  "当前地形更适合顺带观察，本区块按低云、晨雾、层云和通透参考处理。";

export function buildCloudSeaTerrainContextFromResult(
  result: ForecastCalculationResult,
): CloudSeaTerrainContext {
  const profile = result.terrainAnalysis.terrainProfile;
  const support = result.cloudSeaAnalysis.terrainSupport;

  return buildCloudSeaTerrainContext({
    elevationMeters:
      profile.locationElevation ?? profile.elevationMeters ?? support.selectedSpotElevationMeters,
    locationElevation: profile.locationElevation,
    surroundingReliefMeters:
      profile.localReliefMeters ?? profile.elevationDiff5km ?? support.localReliefMeters,
    nearbyValleyElevationMeters:
      profile.nearbyValleyElevationMeters ?? support.nearbyValleyElevationMeters,
    localReliefMeters: profile.localReliefMeters,
    elevationDiff5km: profile.elevationDiff5km,
    terrainType: profile.terrainType ?? support.terrainType,
    elevationConfidence: profile.elevationConfidence,
    terrainConfidence: support.confidence,
    terrainMode: support.terrainMode,
  });
}

export function buildCloudSeaTerrainContext(
  input: CloudSeaTerrainContextInput,
): CloudSeaTerrainContext {
  const elevation = finiteNumber(input.locationElevation) ?? finiteNumber(input.elevationMeters);
  const nearbyValleyElevation = finiteNumber(input.nearbyValleyElevationMeters);
  const surroundingRelief =
    finiteNumber(input.surroundingReliefMeters) ??
    finiteNumber(input.localReliefMeters) ??
    finiteNumber(input.elevationDiff5km) ??
    (elevation !== undefined && nearbyValleyElevation !== undefined
      ? elevation - nearbyValleyElevation
      : undefined);
  const terrainType = normalizeTerrainType(input.terrainType);
  const locationType = normalizeTerrainType(input.locationType);
  const terrainMode =
    input.terrainMode ??
    classifyTerrainMode({
      elevationMeters: elevation,
      nearbyValleyElevationMeters: nearbyValleyElevation,
      localReliefMeters: surroundingRelief,
      terrainType: isKnownTerrainType(terrainType) ? terrainType : "unknown",
      elevationConfidence: input.elevationConfidence ?? undefined,
    });
  const mountainTypeEligible =
    mountainTerrainTypes.has(terrainType) || mountainTerrainTypes.has(locationType);
  const isClassicCloudSeaEligible =
    (elevation !== undefined && elevation >= 800) ||
    (surroundingRelief !== undefined && surroundingRelief >= 500) ||
    mountainTypeEligible;
  const shouldDowngradeCloudSeaWording =
    !isClassicCloudSeaEligible &&
    ((elevation !== undefined &&
      elevation < 500 &&
      (surroundingRelief === undefined || surroundingRelief < 300) &&
      !mountainTypeEligible) ||
      terrainMode === "lowland" ||
      terrainMode === "urban_or_plain" ||
      terrainMode === "unknown");
  const vocabulary = shouldDowngradeCloudSeaWording
    ? downgradedCloudSeaVocabulary
    : classicCloudSeaVocabulary;

  return {
    terrainClass: terrainClassForContext({
      elevation,
      surroundingRelief,
      terrainMode,
      isClassicCloudSeaEligible,
      shouldDowngradeCloudSeaWording,
    }),
    isClassicCloudSeaEligible,
    shouldDowngradeCloudSeaWording,
    elevationMeters: elevation,
    surroundingReliefMeters: surroundingRelief,
    nearbyValleyElevationMeters: nearbyValleyElevation,
    terrainType: terrainType || undefined,
    terrainNoteZh: terrainNoteZh({
      elevation,
      surroundingRelief,
      isClassicCloudSeaEligible,
      shouldDowngradeCloudSeaWording,
    }),
    windowSectionNoteZh: shouldDowngradeCloudSeaWording
      ? downgradedWindowSectionNoteZh
      : undefined,
    windowCategoryLabels: windowCategoryLabelsFromVocabulary(vocabulary),
    forbiddenStrongRecommendation: shouldDowngradeCloudSeaWording,
    recommendationCeiling: shouldDowngradeCloudSeaWording
      ? "recommend_observation"
      : "classic_cloud_sea",
    preferredVocabulary: shouldDowngradeCloudSeaWording
      ? downgradedCloudSeaPreferredVocabulary
      : classicCloudSeaPreferredVocabulary,
    vocabulary,
  };
}

export function cloudSeaTerrainAwareText(text: string, context: CloudSeaTerrainContext): string {
  if (!context.shouldDowngradeCloudSeaWording) {
    return text;
  }

  return text
    .replace(/强推荐专程云海|推荐专程云海|专程云海/g, "已在附近可观察")
    .replace(/高山云海|山顶云海|山谷云海/g, "低云/晨雾")
    .replace(/云海主守|主守云海/g, "云层变化观察")
    .replace(/清晨云海/g, "清晨低云/晨雾")
    .replace(/云海窗口/g, "低云/晨雾观察窗口")
    .replace(/云海信号/g, "低云/晨雾信号")
    .replace(/云海形成/g, "低云/晨雾形成")
    .replace(/云海可拍/g, "云层可观察")
    .replace(/云海/g, "低云/晨雾")
    .replace(/白墙风险/g, "低云遮挡风险")
    .replace(/白墙/g, "低云遮挡")
    .replace(/云顶/g, "云层上沿")
    .replace(/山顶/g, "机位")
    .replace(/山脊/g, "远山")
    .replace(/山谷/g, "周边低处")
    .replace(/俯拍/g, "观察");
}

export function cloudSeaTerrainRecommendationLabel(
  label: string,
  context: CloudSeaTerrainContext,
  options: {
    readonly score?: number;
    readonly hasWindow?: boolean;
  } = {},
): string {
  if (!context.shouldDowngradeCloudSeaWording) {
    return label;
  }

  if (label.includes("不建议")) {
    return "不建议专程";
  }
  if (options.hasWindow === false || (options.score !== undefined && options.score < 45)) {
    return "仅作备选";
  }
  if (label.includes("谨慎") || (options.score !== undefined && options.score < 58)) {
    return "谨慎参考";
  }
  if (options.score !== undefined && options.score < 70) {
    return "已在附近可观察";
  }
  return "已在附近可观察";
}

function windowCategoryLabelsFromVocabulary(
  vocabulary: CloudSeaTerrainVocabulary,
): CloudSeaWindowCategoryLabels {
  return {
    sunrise: vocabulary.windowCategories.sunrise.title,
    sunset: vocabulary.windowCategories.sunset.title,
    daylight: vocabulary.windowCategories.lit.title,
    noLight: vocabulary.windowCategories.lowLight.title,
  };
}

function terrainClassForContext(input: {
  readonly elevation?: number;
  readonly surroundingRelief?: number;
  readonly terrainMode: TerrainMode;
  readonly isClassicCloudSeaEligible: boolean;
  readonly shouldDowngradeCloudSeaWording: boolean;
}): CloudSeaTerrainClass {
  if (input.shouldDowngradeCloudSeaWording) {
    return "low_elevation";
  }
  if (
    input.terrainMode === "high_mountain" ||
    (input.elevation !== undefined && input.elevation >= 1200)
  ) {
    return "high_mountain";
  }
  if (input.isClassicCloudSeaEligible || input.terrainMode === "mountain") {
    return "mountain";
  }
  if (input.terrainMode === "hill") {
    return "hill";
  }
  return "unknown";
}

function terrainNoteZh(input: {
  readonly elevation?: number;
  readonly surroundingRelief?: number;
  readonly isClassicCloudSeaEligible: boolean;
  readonly shouldDowngradeCloudSeaWording: boolean;
}): string {
  if (input.elevation === undefined) {
    return input.shouldDowngradeCloudSeaWording
      ? "地形参考：地形数据不足，先按低云、晨雾和通透参考处理。"
      : "地形参考：地形数据不足，云顶高度和周边高差需现场复核。";
  }

  if (input.shouldDowngradeCloudSeaWording) {
    const elevationText = `机位海拔约 ${Math.round(input.elevation)} 米`;
    if (input.surroundingRelief === undefined) {
      return `地形参考：${elevationText}，周边高差暂未计算，当前按低海拔低云/晨雾参考处理。`;
    }
    return `地形参考：${elevationText}，周边高差不足，当前按低云/晨雾和通透参考处理。`;
  }

  const elevationText = `机位海拔约 ${Math.round(input.elevation)} 米`;
  if (input.surroundingRelief !== undefined) {
    return `地形参考：${elevationText}，周边高差约 ${Math.round(
      input.surroundingRelief,
    )} 米，支持云海观察。`;
  }
  return `地形参考：${elevationText}，周边高差暂未计算，需结合现场云雾高度复核。`;
}

function normalizeTerrainType(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

function isKnownTerrainType(value: string): value is TerrainType {
  return [
    "summit",
    "ridge",
    "slope",
    "valley",
    "lake",
    "city",
    "mountain_platform",
    "unknown",
  ].includes(value);
}

function finiteNumber(value: number | null | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
