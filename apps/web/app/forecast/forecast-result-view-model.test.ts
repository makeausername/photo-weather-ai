import { describe, expect, it } from "vitest";
import {
  forecastTargetLabels,
  type ForecastCalculationResult,
  type ForecastScore,
} from "@photo-weather/shared";
import {
  buildCloudSeaForecastViewModel,
  buildForecastResultViewModel,
} from "./forecast-result-view-model";

function score(key: string, label: string, value: number): ForecastScore {
  return {
    key,
    label,
    score: value,
    level: value >= 80 ? "excellent" : value >= 65 ? "good" : value >= 45 ? "fair" : "poor",
    reasons: [`${label}判断依据`],
    risks: [`${label}风险提示`],
  };
}

const baseResult: ForecastCalculationResult = {
  place: {
    id: "mock-place-huangshan",
    name: "黄山光明顶",
    countryCode: "CN",
    adminArea: "安徽省",
    locality: "黄山市",
    coordinates: {
      latitude: 30.13012,
      longitude: 118.16389,
      system: "wgs84",
    },
  },
  horizon: "48h",
  target: "general",
  forecastStart: "2026-05-20T00:00:00+08:00",
  forecastEnd: "2026-05-22T00:00:00+08:00",
  targetDates: ["2026-05-20", "2026-05-21"],
  calendarBasis: {
    forecastStart: "2026-05-20T00:00:00+08:00",
    forecastEnd: "2026-05-22T00:00:00+08:00",
    forecastStartLabel: "2026年5月20日 00:00",
    forecastEndLabel: "2026年5月22日 00:00",
    forecastRangeLabel: "2026年5月20日 00:00 至 2026年5月22日 00:00",
    targetDates: ["2026-05-20", "2026-05-21"],
    targetDateLabels: ["2026年5月20日 星期三", "2026年5月21日 星期四"],
    horizonHours: 48,
    timezone: "Asia/Shanghai",
    timezoneLabel: "中国标准时间",
    calendarDays: [],
    wgs84Coordinates: {
      latitude: 30.13012,
      longitude: 118.16389,
    },
    coordinateSource: "用户选择地点 WGS84 坐标",
  },
  overallScore: 76,
  recommendationLevel: "worth_waiting",
  recommendationLabel: "值得等待",
  summary: "黄山光明顶模拟评分为 76 分。",
  scores: {
    sunriseGlow: score("sunriseGlow", "朝霞", 70),
    sunsetGlow: score("sunsetGlow", "晚霞", 74),
    cloudSea: score("cloudSea", "云海", 82),
    whiteoutRisk: score("whiteoutRisk", "白墙风险", 58),
    stars: score("stars", "星空", 66),
    milkyWay: score("milkyWay", "银河", 68),
    transparency: score("transparency", "通透度", 72),
  },
  terrainSummary: {
    locationElevation: 1860,
    minElevation1km: 980,
    minElevation3km: 520,
    minElevation5km: 380,
    maxElevation5km: 1864,
    avgElevation5km: 1125,
    elevationDiff5km: 1484,
    valleyDirectionZh: "东南",
    ridgeDirectionZh: "西北-东南",
    terrainCloudSeaPotential: "high",
    terrainNoteZh: "演示地形数据显示山顶与周边谷地高差明显。",
    sunriseHorizonAngle: 4.8,
    sunsetHorizonAngle: 5.5,
    milkyWayHorizonAngle: 7.2,
    blockedDirectionsZh: ["西北", "东北"],
    obstructionNoteZh: "演示地形数据显示主要方向地平遮挡较低。",
    dataSource: "mock_terrain",
    dataSourceLabelZh: "演示数据",
    isMock: true,
    honestyNoteZh:
      "地形信息当前使用演示地形数据，正式海拔与 DEM 数据接入后将用于提升云海和遮挡判断。",
  },
  terrainAnalysis: {
    terrainProfile: {
      locationElevation: 1860,
      minElevation1km: 980,
      minElevation3km: 520,
      minElevation5km: 380,
      maxElevation5km: 1864,
      avgElevation5km: 1125,
      elevationDiff5km: 1484,
      valleyDirectionZh: "东南",
      ridgeDirectionZh: "西北-东南",
      terrainCloudSeaPotential: "high",
      terrainNoteZh: "演示地形数据显示山顶与周边谷地高差明显。",
    },
    horizonProfile: {
      sunriseHorizonAngle: 4.8,
      sunsetHorizonAngle: 5.5,
      milkyWayHorizonAngle: 7.2,
      blockedDirectionsZh: ["西北", "东北"],
      obstructionNoteZh: "演示地形数据显示主要方向地平遮挡较低。",
    },
    dataSource: "mock_terrain",
    dataSourceLabelZh: "演示数据",
    isMock: true,
    honestyNoteZh:
      "地形信息当前使用演示地形数据，正式海拔与 DEM 数据接入后将用于提升云海和遮挡判断。",
  },
  astroSummaries: [
    {
      date: "2026-05-20",
      timezone: "Asia/Shanghai",
      sunrise: "2026-05-20T05:15:00+08:00",
      sunset: "2026-05-20T18:56:00+08:00",
      solarNoon: "2026-05-20T12:05:00+08:00",
      civilDawn: "2026-05-20T04:50:00+08:00",
      civilDusk: "2026-05-20T19:21:00+08:00",
      nauticalDawn: "2026-05-20T04:20:00+08:00",
      nauticalDusk: "2026-05-20T19:52:00+08:00",
      astronomicalDawn: "2026-05-20T03:48:00+08:00",
      astronomicalDusk: "2026-05-20T20:24:00+08:00",
      astronomicalNightStart: "2026-05-20T20:24:00+08:00",
      astronomicalNightEnd: "2026-05-21T03:48:00+08:00",
      moonPhase: 0.18,
      moonPhaseNameZh: "娥眉月",
      moonIllumination: 0.24,
      waxingOrWaning: "waxing",
      lunarDateText: "四月初四",
      moonrise: "2026-05-20T08:40:00+08:00",
      moonset: "2026-05-20T22:35:00+08:00",
      calculationNoteZh:
        "月相基于本地天文算法计算；农历日期基于本地历法库生成。实际观星仍需结合云量、光污染和地形遮挡。",
      moonInfo: {
        moonPhase: 0.18,
        moonPhaseNameZh: "娥眉月",
        moonIllumination: 0.24,
        waxingOrWaning: "waxing",
        lunarDateText: "四月初四",
        moonrise: "2026-05-20T08:40:00+08:00",
        moonset: "2026-05-20T22:35:00+08:00",
        calculationNoteZh:
          "月相基于本地天文算法计算；农历日期基于本地历法库生成。实际观星仍需结合云量、光污染和地形遮挡。",
      },
      milkyWayWindowStart: "2026-05-21T01:10:00+08:00",
      milkyWayWindowEnd: "2026-05-21T03:30:00+08:00",
      milkyWayDirection: "东南至南方",
      milkyWayVisibilityLevel: "fair",
      milkyWayNoteZh: "银河窗口为本地天文算法初步估算。",
    },
    {
      date: "2026-05-21",
      timezone: "Asia/Shanghai",
      sunrise: "2026-05-21T05:14:00+08:00",
      sunset: "2026-05-21T18:57:00+08:00",
      solarNoon: "2026-05-21T12:05:00+08:00",
      civilDawn: "2026-05-21T04:49:00+08:00",
      civilDusk: "2026-05-21T19:22:00+08:00",
      nauticalDawn: "2026-05-21T04:19:00+08:00",
      nauticalDusk: "2026-05-21T19:53:00+08:00",
      astronomicalDawn: "2026-05-21T03:47:00+08:00",
      astronomicalDusk: "2026-05-21T20:25:00+08:00",
      astronomicalNightStart: "2026-05-21T20:25:00+08:00",
      astronomicalNightEnd: "2026-05-22T03:47:00+08:00",
      moonPhase: 0.22,
      moonPhaseNameZh: "娥眉月",
      moonIllumination: 0.31,
      waxingOrWaning: "waxing",
      lunarDateText: "四月初五",
      moonrise: "2026-05-21T09:35:00+08:00",
      moonset: "2026-05-21T23:20:00+08:00",
      calculationNoteZh:
        "月相基于本地天文算法计算；农历日期基于本地历法库生成。实际观星仍需结合云量、光污染和地形遮挡。",
      moonInfo: {
        moonPhase: 0.22,
        moonPhaseNameZh: "娥眉月",
        moonIllumination: 0.31,
        waxingOrWaning: "waxing",
        lunarDateText: "四月初五",
        moonrise: "2026-05-21T09:35:00+08:00",
        moonset: "2026-05-21T23:20:00+08:00",
        calculationNoteZh:
          "月相基于本地天文算法计算；农历日期基于本地历法库生成。实际观星仍需结合云量、光污染和地形遮挡。",
      },
      milkyWayWindowStart: "2026-05-22T01:05:00+08:00",
      milkyWayWindowEnd: "2026-05-22T03:20:00+08:00",
      milkyWayDirection: "东南至南方",
      milkyWayVisibilityLevel: "good",
      milkyWayNoteZh: "银河窗口为本地天文算法初步估算。",
    },
  ],
  bestWindows: [
    {
      label: "清晨云海窗口 05:00 - 07:00",
      date: "2026-05-20",
      startTime: "2026-05-20T05:00:00+08:00",
      endTime: "2026-05-20T07:00:00+08:00",
      score: 82,
      target: "cloud_sea",
    },
    {
      label: "清晨云海窗口 05:10 - 07:10",
      date: "2026-05-21",
      startTime: "2026-05-21T05:10:00+08:00",
      endTime: "2026-05-21T07:10:00+08:00",
      score: 78,
      target: "cloud_sea",
    },
    {
      label: "晚霞窗口 17:56 - 19:41",
      date: "2026-05-20",
      startTime: "2026-05-20T17:56:00+08:00",
      endTime: "2026-05-20T19:41:00+08:00",
      score: 74,
      target: "glow",
    },
    {
      label: "朝霞窗口 04:30 - 06:15",
      date: "2026-05-20",
      startTime: "2026-05-20T04:30:00+08:00",
      endTime: "2026-05-20T06:15:00+08:00",
      score: 70,
      target: "glow",
    },
    {
      label: "天文黑夜 20:24 - 03:48",
      date: "2026-05-20",
      startTime: "2026-05-20T20:24:00+08:00",
      endTime: "2026-05-21T03:48:00+08:00",
      score: 69,
      target: "astro",
    },
    {
      label: "银河窗口 01:10 - 03:30",
      date: "2026-05-20",
      startTime: "2026-05-21T01:10:00+08:00",
      endTime: "2026-05-21T03:30:00+08:00",
      score: 68,
      target: "astro",
    },
    {
      label: "银河窗口 01:05 - 03:20",
      date: "2026-05-21",
      startTime: "2026-05-22T01:05:00+08:00",
      endTime: "2026-05-22T03:20:00+08:00",
      score: 72,
      target: "astro",
    },
  ],
  dailySummaries: [
    {
      date: "2026-05-20",
      dateLabelZh: "2026年5月20日 星期三",
      lunarDateText: "四月初四",
      score: 78,
      recommendationLabel: "值得等待",
      target: "general",
      keyWindows: [],
      riskFlags: [],
      shortAdvice: "当天有可优先关注的拍摄窗口。",
    },
    {
      date: "2026-05-21",
      dateLabelZh: "2026年5月21日 星期四",
      lunarDateText: "四月初五",
      score: 76,
      recommendationLabel: "值得等待",
      target: "general",
      keyWindows: [],
      riskFlags: [],
      shortAdvice: "当天有可优先关注的拍摄窗口。",
    },
  ],
  targetDailyBreakdown: [
    {
      date: "2026-05-20",
      cloudSea: {
        label: "清晨云海机会",
        score: 82,
        detail: "清晨湿度、低云、风速、露点差和地形落差共同影响云海形成。",
      },
      whiteoutRisk: {
        label: "白墙风险",
        score: 58,
        detail: "清晨低云约 52%，湿度约 86%，能见度约 14 公里。",
      },
      sunriseGlow: {
        label: "朝霞机会",
        score: 70,
        detail: "朝霞窗口可用。",
      },
      sunsetGlow: {
        label: "晚霞机会",
        score: 74,
        detail: "晚霞窗口可用。",
      },
      stars: {
        label: "每晚观星条件",
        score: 66,
        detail: "天文黑夜内云量和月光可控。",
      },
      milkyWay: {
        label: "银河窗口",
        score: 68,
        detail: "银河窗口为本地算法初步估算。",
      },
      transparency: {
        label: "通透度",
        score: 72,
        detail: "能见度较好。",
      },
      astroSummary: undefined,
      terrainSummary: "演示地形数据显示山顶与周边谷地高差明显。",
      weatherSummary: "多云间晴，山地局部有雾",
    },
    {
      date: "2026-05-21",
      cloudSea: {
        label: "清晨云海机会",
        score: 78,
        detail: "清晨云海窗口仍可关注。",
      },
      whiteoutRisk: {
        label: "白墙风险",
        score: 52,
        detail: "白墙风险中等。",
      },
      stars: {
        label: "每晚观星条件",
        score: 70,
        detail: "夜间窗口可关注。",
      },
      milkyWay: {
        label: "银河窗口",
        score: 72,
        detail: "第二晚银河窗口可用。",
      },
      transparency: {
        label: "通透度",
        score: 70,
        detail: "能见度较好。",
      },
      astroSummary: undefined,
      terrainSummary: "演示地形数据显示山顶与周边谷地高差明显。",
      weatherSummary: "多云间晴，山地局部有雾",
    },
  ],
  riskFlags: [
    {
      key: "whiteout",
      label: "白墙风险",
      level: "medium",
      description: "局部时段可能出现低云遮挡。",
    },
  ],
  keyReasons: ["清晨低云和湿度组合较好。", "夜间月光影响可控。"],
  photographyAdvice: ["提前到达机位并预留风雨备选。"],
  dataNotice:
    "天气数据：演示数据；地形数据：演示数据；天文数据：本地算法计算。当前结果基于演示天气数据生成，仅用于体验分析流程。正式天气数据源启用后，将显示对应的数据来源与预报时间。天文时间基于地点经纬度本地计算，实际拍摄仍需结合云量、光污染和地形遮挡。",
  isMock: true,
  dataSourceLabel: "演示数据",
  generatedAt: "2026-05-20T00:00:00+08:00",
  weatherProviderCode: "mock",
  weatherProviderLabelZh: "演示数据",
  weatherDataMode: "mock",
  weatherNoticeZh: "天气数据：演示数据",
  weatherMissingFields: [],
  weatherEstimatedFields: [],
};

function resultForTarget(target: ForecastCalculationResult["target"]): ForecastCalculationResult {
  return {
    ...baseResult,
    target,
    dailySummaries: baseResult.dailySummaries.map((summary) => ({ ...summary, target })),
  };
}

describe("forecast result target-aware view model", () => {
  it("uses Simplified Chinese target labels", () => {
    expect(forecastTargetLabels).toMatchObject({
      general: "综合判断",
      cloud_sea: "云海",
      glow: "朝霞晚霞",
      astro: "星空银河",
    });
  });

  it("keeps the general view as a complete dashboard", () => {
    const viewModel = buildForecastResultViewModel(resultForTarget("general"), "general");

    expect(viewModel.primaryCards.map((card) => card.label)).toEqual([
      "综合出片指数",
      "推荐等级",
      "最佳拍摄窗口",
      "主要风险",
    ]);
    expect(viewModel.scoreCards.map((card) => card.key)).toEqual([
      "sunriseGlow",
      "sunsetGlow",
      "cloudSea",
      "whiteoutRisk",
      "stars",
      "milkyWay",
      "transparency",
    ]);
    expect(viewModel.detailSections.map((section) => section.title)).toContain("天文数据");
    expect(viewModel.detailSections.map((section) => section.title)).toContain("地形摘要");
    expect(viewModel.detailSections.map((section) => section.title)).toContain("关键依据");
    expect(viewModel.riskSections.map((section) => section.title)).toContain("风险提示");
    expect(viewModel.adviceSections.map((section) => section.title)).toContain("拍摄建议");
    expect(viewModel.hiddenModuleKeys).toHaveLength(0);
  });

  it("prioritizes cloud sea and whiteout risk without making astro primary", () => {
    const viewModel = buildForecastResultViewModel(resultForTarget("cloud_sea"), "cloud_sea");

    expect(viewModel.primaryCards.map((card) => card.label)).toEqual([
      "云海机会",
      "白墙风险",
      "最佳云海窗口",
      "推荐动作",
    ]);
    expect(viewModel.primaryCards.map((card) => card.moduleKey)).not.toContain("stars");
    expect(viewModel.primaryCards.map((card) => card.moduleKey)).not.toContain("milkyWay");
    expect(viewModel.scoreCards.map((card) => card.key)).toEqual([
      "cloudSea",
      "whiteoutRisk",
      "transparency",
    ]);
    expect(viewModel.bestWindows.length).toBeGreaterThan(1);
    expect(viewModel.bestWindows.every((window) => window.target === "cloud_sea")).toBe(true);
    expect(viewModel.windowGroups.length).toBeGreaterThan(1);
    expect(viewModel.detailSections.map((section) => section.title)).toEqual(
      expect.arrayContaining(["地形与海拔参考", "山谷高差", "云海地形潜力", "白墙风险辅助判断"]),
    );
    expect(viewModel.hiddenModuleKeys).toEqual(
      expect.arrayContaining(["stars", "milkyWay", "astronomy"]),
    );
    expect(viewModel.cloudSea).toBeDefined();
  });

  it("builds a specialized cloud sea view model with separated whiteout, terrain, weather, and travel modules", () => {
    const viewModel = buildCloudSeaForecastViewModel(resultForTarget("cloud_sea"));

    expect(viewModel.coreCards.map((card) => card.label)).toEqual([
      "云海机会",
      "白墙风险",
      "最佳云海窗口",
      "推荐动作",
    ]);
    expect(viewModel.coreCards.find((card) => card.label === "白墙风险")?.value).toBe("中");
    expect(viewModel.cloudSeaVsWhiteout.cloudSeaDefinition).toContain("机位高于云雾层");
    expect(viewModel.cloudSeaVsWhiteout.whiteoutDefinition).toContain("能见度下降");
    expect(viewModel.terrainEvidence.items.map((item) => item.label)).toEqual(
      expect.arrayContaining(["机位海拔", "周边 1km 最低海拔", "5km 高差", "云海地形潜力"]),
    );
    expect(viewModel.weatherEvidence.map((item) => item.label)).toEqual(
      expect.arrayContaining(["湿度", "露点差", "风速", "风向", "能见度", "降水", "低云"]),
    );
    expect(viewModel.travelRecommendations.map((item) => item.situation)).toEqual([
      "已在山上",
      "周边短途",
      "远途专程",
    ]);
    expect(viewModel.backupPlans.map((plan) => plan.condition)).toEqual(
      expect.arrayContaining(["白墙时", "无云海但通透", "低云过厚", "风大"]),
    );
  });

  it("does not prioritize astro or Milky Way modules in the specialized cloud sea model", () => {
    const viewModel = buildCloudSeaForecastViewModel(resultForTarget("cloud_sea"));
    const primaryModuleKeys = viewModel.coreCards.map((card) => card.moduleKey);
    const windowLabels = viewModel.cloudSeaWindows.map((window) => window.label).join(" ");

    expect(primaryModuleKeys).not.toContain("stars");
    expect(primaryModuleKeys).not.toContain("milkyWay");
    expect(windowLabels).not.toContain("银河");
    expect(viewModel.weatherEvidence.map((item) => item.label)).not.toContain("月相");
  });

  it("shows multiple daily cloud sea entries for a 7d cloud sea result", () => {
    const sevenDayResult: ForecastCalculationResult = {
      ...resultForTarget("cloud_sea"),
      horizon: "7d",
      forecastEnd: "2026-05-27T00:00:00+08:00",
      targetDates: ["2026-05-20", "2026-05-21", "2026-05-22"],
      calendarBasis: {
        ...baseResult.calendarBasis,
        forecastEnd: "2026-05-27T00:00:00+08:00",
        forecastEndLabel: "2026年5月27日 00:00",
        forecastRangeLabel: "2026年5月20日 00:00 至 2026年5月27日 00:00",
        targetDates: ["2026-05-20", "2026-05-21", "2026-05-22"],
        targetDateLabels: ["2026年5月20日 星期三", "2026年5月21日 星期四", "2026年5月22日 星期五"],
        horizonHours: 168,
      },
      dailySummaries: [
        ...baseResult.dailySummaries.map((summary) => ({
          ...summary,
          target: "cloud_sea" as const,
        })),
        {
          date: "2026-05-22",
          dateLabelZh: "2026年5月22日 星期五",
          lunarDateText: "四月初六",
          score: 74,
          recommendationLabel: "值得等待",
          target: "cloud_sea",
          keyWindows: [],
          riskFlags: [],
          shortAdvice: "清晨云海仍可等待。",
        },
      ],
      targetDailyBreakdown: [
        ...baseResult.targetDailyBreakdown,
        {
          date: "2026-05-22",
          cloudSea: {
            label: "清晨云海机会",
            score: 74,
            detail: "第三天清晨湿度和地形仍支持等待。",
          },
          whiteoutRisk: {
            label: "白墙风险",
            score: 50,
            detail: "白墙风险中等。",
          },
          transparency: {
            label: "通透度",
            score: 68,
            detail: "能见度可用。",
          },
          terrainSummary: "演示地形数据显示山顶与周边谷地高差明显。",
          weatherSummary: "清晨低云可关注",
        },
      ],
    };

    const viewModel = buildCloudSeaForecastViewModel(sevenDayResult);

    expect(viewModel.dailyTrend).toHaveLength(3);
    expect(viewModel.dailyTrend.map((item) => item.date)).toContain("2026-05-22");
  });

  it("shows a cloud sea confidence warning when low cloud data is missing", () => {
    const viewModel = buildCloudSeaForecastViewModel({
      ...resultForTarget("cloud_sea"),
      weatherDataMode: "fixture",
      weatherProviderCode: "qweather",
      weatherProviderLabelZh: "和风天气样例数据",
      dataSourceLabel: "和风天气样例数据",
      weatherNoticeZh: "天气数据：和风天气样例数据",
      weatherMissingFields: ["cloudLow"],
    });

    expect(viewModel.dataNotice).toContain("当前天气源缺少低云分层数据，云海判断置信度会降低。");
    expect(
      viewModel.weatherEvidence.some(
        (item) =>
          item.label === "低云" &&
          item.confidenceNote === "当前天气源缺少低云分层数据，云海判断置信度会降低。",
      ),
    ).toBe(true);
  });

  it("does not call external APIs while shaping the cloud sea view model", () => {
    const fetchBackup = globalThis.fetch;
    let fetchCalled = false;
    globalThis.fetch = (async () => {
      fetchCalled = true;
      throw new Error("external call blocked");
    }) as typeof fetch;

    try {
      const viewModel = buildCloudSeaForecastViewModel(resultForTarget("cloud_sea"));
      expect(viewModel.coreCards.length).toBe(4);
      expect(fetchCalled).toBe(false);
    } finally {
      globalThis.fetch = fetchBackup;
    }
  });

  it("prioritizes sunrise, sunset, and twilight on the glow view", () => {
    const viewModel = buildForecastResultViewModel(resultForTarget("glow"), "glow");

    expect(viewModel.primaryCards.map((card) => card.label)).toEqual([
      "朝霞机会",
      "晚霞机会",
      "日出时间",
      "日落时间",
      "最佳霞光窗口",
    ]);
    expect(viewModel.detailSections.map((section) => section.title)).toEqual(
      expect.arrayContaining([
        "朝霞判断依据",
        "晚霞判断依据",
        "日出方向遮挡",
        "日落方向遮挡",
        "地形遮挡提示",
        "晨昏时间",
      ]),
    );
    expect(viewModel.bestWindows.every((window) => window.target === "glow")).toBe(true);
    expect(viewModel.scoreCards.map((card) => card.key)).toEqual([
      "sunriseGlow",
      "sunsetGlow",
      "transparency",
    ]);
  });

  it("prioritizes moon, astronomical night, Milky Way, and star modules on the astro view", () => {
    const viewModel = buildForecastResultViewModel(resultForTarget("astro"), "astro");

    expect(viewModel.primaryCards.map((card) => card.label)).toEqual([
      "星空指数",
      "银河指数",
      "月光影响",
      "天文黑夜窗口",
      "银河窗口",
    ]);
    expect(viewModel.detailSections.map((section) => section.title)).toEqual(
      expect.arrayContaining([
        "每晚观星条件",
        "月相 / 月亮照明",
        "天文黑夜",
        "银河窗口",
        "银河方向遮挡",
        "地平线遮挡提示",
        "山体遮挡风险",
      ]),
    );
    const moonSection = viewModel.detailSections.find((section) => section.key === "moon-phase");
    expect(moonSection?.items).toHaveLength(2);
    expect(JSON.stringify(moonSection)).toContain("农历日期");
    expect(JSON.stringify(moonSection)).toContain("四月初五");
    expect(JSON.stringify(moonSection)).toContain(
      "月相基于本地天文算法计算；农历日期基于本地历法库生成",
    );
    expect(viewModel.scoreCards.map((card) => card.key)).toEqual([
      "stars",
      "milkyWay",
      "transparency",
    ]);
    expect(viewModel.bestWindows[0]?.moduleKey).toBe("astronomicalNight");
    expect(viewModel.bestWindows.map((window) => window.moduleKey)).toContain("milkyWay");
    expect(viewModel.bestWindows.map((window) => window.moduleKey)).not.toContain("cloudSea");
    expect(viewModel.windowGroups.length).toBeGreaterThan(1);
  });

  it("keeps data-source honesty in the shaped notice", () => {
    const viewModel = buildForecastResultViewModel(resultForTarget("astro"), "astro");

    expect(viewModel.dataNotice).toContain("天气数据：演示数据");
    expect(viewModel.dataNotice).toContain("地形信息当前使用演示地形数据");
    expect(viewModel.dataNotice).toContain("正式海拔与 DEM 数据接入后");
    expect(viewModel.dataNotice).toContain("天文数据：本地算法计算");
    expect(viewModel.dataNotice).toContain("当前结果基于演示天气数据生成");
  });

  it("shows a compact note when cloud layer fields are missing", () => {
    const viewModel = buildForecastResultViewModel(
      {
        ...resultForTarget("glow"),
        weatherDataMode: "fixture",
        weatherProviderCode: "qweather",
        weatherProviderLabelZh: "和风天气样例数据",
        dataSourceLabel: "和风天气样例数据",
        weatherNoticeZh: "天气数据：和风天气样例数据",
        weatherMissingFields: ["cloudLow", "cloudMid", "cloudHigh"],
      },
      "glow",
    );

    expect(viewModel.dataNotice).toContain("天气数据：和风天气样例数据");
    expect(viewModel.dataNotice).toContain(
      "当前天气源缺少低云/中云/高云分层数据，相关判断将降低置信度。",
    );
    expect(
      viewModel.detailSections.some((section) =>
        section.items.some((item) => item.detail.includes("低云/中云/高云分层数据")),
      ),
    ).toBe(true);
  });
});
