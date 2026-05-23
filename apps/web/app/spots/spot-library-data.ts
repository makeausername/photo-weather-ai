import type { ForecastHorizon, ForecastTarget } from "@photo-weather/shared";

export type SpotDifficultyLevel = "easy" | "medium" | "hard" | "unknown";
export type SpotDataStatus = "demo" | "verified" | "needs_review";

export type SpotLibraryItem = {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly scenicAreaName?: string;
  readonly province: string;
  readonly city?: string;
  readonly latitudeGcj02?: number;
  readonly longitudeGcj02?: number;
  readonly latitudeWgs84: number;
  readonly longitudeWgs84: number;
  readonly elevationMeters?: number;
  readonly suitableTargets: readonly ForecastTarget[];
  readonly tagsZh: readonly string[];
  readonly bestDirectionsZh: readonly string[];
  readonly difficultyLevel: SpotDifficultyLevel;
  readonly dataStatus: SpotDataStatus;
  readonly dataCompletenessScore: number;
  readonly shortDescriptionZh: string;
  readonly safetyNoteZh?: string;
  readonly accessNoteZh?: string;
  readonly suitableForZh: string;
  readonly cloudSeaValueZh: string;
  readonly glowValueZh: string;
  readonly astroValueZh: string;
  readonly dataNoteZh: string;
};

export type SpotLibraryFilters = {
  readonly keyword?: string;
  readonly target?: ForecastTarget | "all";
  readonly region?: string;
  readonly elevation?: "all" | "high" | "medium" | "low";
  readonly dataStatus?: SpotDataStatus | "all";
};

export const spotTargetLabels: Record<ForecastTarget, string> = {
  general: "综合",
  cloud_sea: "云海",
  glow: "朝霞晚霞",
  astro: "星空银河",
};

export const spotTargetActionLabels: Record<ForecastTarget, string> = {
  general: "综合判断",
  cloud_sea: "云海",
  glow: "朝霞晚霞",
  astro: "星空银河",
};

export const spotTargetDetailActionLabels: Record<ForecastTarget, string> = {
  general: "综合判断",
  cloud_sea: "云海判断",
  glow: "朝霞晚霞判断",
  astro: "星空银河判断",
};

export const spotDataStatusLabels: Record<SpotDataStatus, string> = {
  demo: "演示数据",
  verified: "已校准",
  needs_review: "待完善",
};

export const spotDifficultyLabels: Record<SpotDifficultyLevel, string> = {
  easy: "轻松",
  medium: "中等",
  hard: "较难",
  unknown: "待确认",
};

const defaultMissingFieldNote = "该字段暂未校准，后续会随机位资料完善更新。";

export const spotLibraryItems = [
  {
    id: "spot-guangmingding",
    slug: "huangshan-guangmingding",
    name: "黄山光明顶",
    scenicAreaName: "黄山风景区",
    province: "安徽",
    city: "黄山",
    latitudeGcj02: 30.1351,
    longitudeGcj02: 118.1767,
    latitudeWgs84: 30.1328,
    longitudeWgs84: 118.171,
    elevationMeters: 1860,
    suitableTargets: ["general", "cloud_sea", "glow", "astro"],
    tagsZh: ["高山云海", "日出日落", "冬季雪景", "开阔山脊"],
    bestDirectionsZh: ["东方", "西方", "山脊四周"],
    difficultyLevel: "medium",
    dataStatus: "demo",
    dataCompletenessScore: 78,
    shortDescriptionZh:
      "高海拔观景平台，周边谷地落差明显，适合把云海、日出日落和山脊层次一起纳入判断。",
    safetyNoteZh: "山顶风大，低温、结冰和雷雨天气需要单独复核景区公告与现场条件。",
    accessNoteZh: "需按景区开放时间、索道运行和步道通行安排拍摄计划。",
    suitableForZh:
      "适合拍摄高山云海、日出霞光、日落余晖和黄山峰林层次。夜间星空可作为参考题材，但仍需结合月光、云量与景区夜间通行。",
    cloudSeaValueZh:
      "海拔高且周边谷地落差大，低云、湿度、风速和清晨逆温条件对云海判断价值较高。",
    glowValueZh:
      "东西向视野较完整，适合用日出日落时间、云层高度和地平线遮挡共同判断霞光机会。",
    astroValueZh:
      "WGS84 坐标可用于天文黑夜、月相和银河窗口计算；城市光影响与夜间通行仍需另行确认。",
    dataNoteZh:
      "资料来自项目种子机位，坐标、海拔、方向和风险备注会随人工校准继续完善。",
  },
  {
    id: "spot-laojunshan-jinding",
    slug: "laojunshan-jinding",
    name: "老君山金顶",
    scenicAreaName: "老君山景区",
    province: "河南",
    city: "洛阳",
    latitudeGcj02: 33.7867,
    longitudeGcj02: 111.6462,
    latitudeWgs84: 33.7852,
    longitudeWgs84: 111.6402,
    elevationMeters: 2190,
    suitableTargets: ["general", "cloud_sea", "glow", "astro"],
    tagsZh: ["高海拔", "金顶建筑", "云海", "日出日落"],
    bestDirectionsZh: ["东方", "西方", "西南山谷"],
    difficultyLevel: "medium",
    dataStatus: "demo",
    dataCompletenessScore: 74,
    shortDescriptionZh:
      "金顶海拔高、主体辨识度强，适合把云海、霞光和建筑轮廓作为同一组拍摄目标评估。",
    safetyNoteZh: "冬季积雪、结冰、强风和低温风险明显，需要复核索道与景区夜间政策。",
    accessNoteZh: "建议提前确认索道、摆渡车、步行线路和清晨开放安排。",
    suitableForZh:
      "适合拍摄高山金顶建筑、云海包围、日出日落剪影和冬季雪后场景。",
    cloudSeaValueZh:
      "高海拔与低处山谷落差明显，云海判断应重点看低云厚度、湿度、风速和风向。",
    glowValueZh:
      "建筑主体适合与朝霞晚霞结合，判断时需要同时关注云层缝隙、透明度和地平线遮挡。",
    astroValueZh:
      "可进行星空时间窗和月光影响判断；银河成片仍需现场光污染、主体朝向和夜间通行条件确认。",
    dataNoteZh:
      "资料来自项目种子机位，适合用于快速进入拍摄天气判断，生产级开放和风险信息需继续校准。",
  },
  {
    id: "spot-sanqingshan-nvshenfeng",
    slug: "sanqingshan-nvshenfeng",
    name: "三清山女神峰",
    scenicAreaName: "三清山风景名胜区",
    province: "江西",
    city: "上饶",
    latitudeGcj02: 28.9169,
    longitudeGcj02: 118.0751,
    latitudeWgs84: 28.9139,
    longitudeWgs84: 118.0699,
    elevationMeters: 1600,
    suitableTargets: ["general", "cloud_sea", "glow", "astro"],
    tagsZh: ["峰林主体", "东方视野", "云雾", "花岗岩峰柱"],
    bestDirectionsZh: ["东方", "东北", "峰林间隙"],
    difficultyLevel: "medium",
    dataStatus: "needs_review",
    dataCompletenessScore: 68,
    shortDescriptionZh:
      "以女神峰和峰林主体为核心，适合评估清晨云雾、日出侧光和山体遮挡带来的拍摄窗口。",
    safetyNoteZh: "雨雾、湿滑栈道和雷电风险需要复核，低能见度时应减少临边停留。",
    accessNoteZh: "需结合景区栈道开放、索道运行和步行时间安排。",
    suitableForZh:
      "适合拍摄女神峰主体、峰林云雾、清晨侧光和雨后山体层次。",
    cloudSeaValueZh:
      "局部谷地和峰林遮挡并存，云海判断需要结合低云高度、湿度、风向和具体观景点朝向。",
    glowValueZh:
      "东方视野更有价值，朝霞判断应重点看日出方位、低云遮挡和中高云透光条件。",
    astroValueZh:
      "WGS84 坐标可用于天文窗口计算，但峰林遮挡和夜间通行限制对实际星空拍摄影响较大。",
    dataNoteZh:
      "当前方向、通行和安全信息仍需进一步校准，页面保留明确的数据完整度提示。",
  },
  {
    id: "spot-wugongshan-jinding",
    slug: "wugongshan-jinding",
    name: "武功山金顶",
    scenicAreaName: "武功山景区",
    province: "江西",
    city: "萍乡",
    latitudeGcj02: 27.4748,
    longitudeGcj02: 114.1859,
    latitudeWgs84: 27.4716,
    longitudeWgs84: 114.1808,
    elevationMeters: 1918,
    suitableTargets: ["general", "cloud_sea", "glow", "astro"],
    tagsZh: ["高山草甸", "云海", "银河", "日出日落"],
    bestDirectionsZh: ["东方", "西方", "南向草甸", "开阔地平线"],
    difficultyLevel: "hard",
    dataStatus: "demo",
    dataCompletenessScore: 80,
    shortDescriptionZh:
      "高山草甸视野开阔，兼顾云海、日出日落和夏季银河，是适合从机位直接进入多题材判断的典型点位。",
    safetyNoteZh: "高山草甸风大，雷雨、失温、夜爬和露营风险需要提前复核。",
    accessNoteZh: "需确认缆车、徒步路线、露营政策、夜间通行和返程时间。",
    suitableForZh:
      "适合拍摄高山草甸、云海、日出日落、星空和夏季银河。",
    cloudSeaValueZh:
      "周边谷地与开阔山脊提供较好的云海判断条件，需重点关注低云高度、湿度和风速。",
    glowValueZh:
      "开阔地平线有利于捕捉朝霞晚霞，判断时应结合云层结构、透明度和降水风险。",
    astroValueZh:
      "适合做 7 天星空银河窗口判断，仍需结合月光、光污染、云量和露营通行条件。",
    dataNoteZh:
      "资料来自项目种子机位，WGS84 坐标会用于天文计算，GCJ-02 坐标保留给后续地图展示。",
  },
] as const satisfies readonly SpotLibraryItem[];

export function getSpotBySlug(slug: string): SpotLibraryItem | undefined {
  return spotLibraryItems.find((spot) => spot.slug === slug);
}

export function getSpotRegions(spots: readonly SpotLibraryItem[] = spotLibraryItems): string[] {
  return [...new Set(spots.map((spot) => spot.province))].sort((a, b) => a.localeCompare(b, "zh-CN"));
}

export function formatSpotCoordinate(value: number): string {
  return value.toFixed(5);
}

export function formatSpotElevation(spot: Pick<SpotLibraryItem, "elevationMeters">): string {
  return typeof spot.elevationMeters === "number" ? `${Math.round(spot.elevationMeters)} 米` : defaultMissingFieldNote;
}

export function getSpotForecastHorizon(target: ForecastTarget): ForecastHorizon {
  if (target === "astro") {
    return "7d";
  }

  if (target === "glow") {
    return "72h";
  }

  return "48h";
}

export function buildSpotForecastUrl(spot: SpotLibraryItem, target: ForecastTarget): string {
  const params = new URLSearchParams({
    name: spot.name,
    source: "local_photo_spot",
    lat: String(spot.latitudeGcj02 ?? spot.latitudeWgs84),
    lng: String(spot.longitudeGcj02 ?? spot.longitudeWgs84),
    latWgs84: String(spot.latitudeWgs84),
    lngWgs84: String(spot.longitudeWgs84),
    horizon: getSpotForecastHorizon(target),
    target,
    photoSpotId: spot.id,
  });

  if (typeof spot.elevationMeters === "number") {
    params.set("elevationMeters", String(spot.elevationMeters));
  }

  return `/forecast?${params.toString()}`;
}

export function getSpotSearchText(spot: SpotLibraryItem): string {
  return [
    spot.name,
    spot.slug,
    spot.scenicAreaName,
    spot.province,
    spot.city,
    spot.shortDescriptionZh,
    spot.safetyNoteZh,
    spot.accessNoteZh,
    ...spot.tagsZh,
    ...spot.bestDirectionsZh,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function getElevationBand(spot: SpotLibraryItem): "high" | "medium" | "low" | "unknown" {
  if (typeof spot.elevationMeters !== "number") {
    return "unknown";
  }

  if (spot.elevationMeters >= 1800) {
    return "high";
  }

  if (spot.elevationMeters >= 1000) {
    return "medium";
  }

  return "low";
}

export function filterSpotLibraryItems(
  spots: readonly SpotLibraryItem[],
  filters: SpotLibraryFilters,
): SpotLibraryItem[] {
  const keyword = filters.keyword?.trim().toLowerCase();
  const target = filters.target ?? "all";
  const region = filters.region ?? "all";
  const elevation = filters.elevation ?? "all";
  const dataStatus = filters.dataStatus ?? "all";

  return spots.filter((spot) => {
    if (keyword && !getSpotSearchText(spot).includes(keyword)) {
      return false;
    }

    if (target !== "all" && !spot.suitableTargets.includes(target)) {
      return false;
    }

    if (region !== "all" && spot.province !== region) {
      return false;
    }

    if (elevation !== "all" && getElevationBand(spot) !== elevation) {
      return false;
    }

    if (dataStatus !== "all" && spot.dataStatus !== dataStatus) {
      return false;
    }

    return true;
  });
}

export function getMissingSpotFieldNote(): string {
  return defaultMissingFieldNote;
}
