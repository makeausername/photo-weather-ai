import { describe, expect, it } from "vitest";
import {
  forecastTargetLabels,
  type ForecastCalculationResult,
  type ForecastScore,
} from "@photo-weather/shared";
import { buildForecastResultViewModel } from "./forecast-result-view-model";

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
    terrainNoteZh: "本地模拟地形显示山顶与周边谷地高差明显。",
    sunriseHorizonAngle: 4.8,
    sunsetHorizonAngle: 5.5,
    milkyWayHorizonAngle: 7.2,
    blockedDirectionsZh: ["西北", "东北"],
    obstructionNoteZh: "本地模拟地形显示主要方向地平遮挡较低。",
    dataSource: "mock_terrain",
    dataSourceLabelZh: "本地模拟地形数据",
    isMock: true,
    honestyNoteZh: "地形数据：本地模拟地形数据，真实 DEM / 海拔数据将在后续接入。",
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
      terrainNoteZh: "本地模拟地形显示山顶与周边谷地高差明显。",
    },
    horizonProfile: {
      sunriseHorizonAngle: 4.8,
      sunsetHorizonAngle: 5.5,
      milkyWayHorizonAngle: 7.2,
      blockedDirectionsZh: ["西北", "东北"],
      obstructionNoteZh: "本地模拟地形显示主要方向地平遮挡较低。",
    },
    dataSource: "mock_terrain",
    dataSourceLabelZh: "本地模拟地形数据",
    isMock: true,
    honestyNoteZh: "地形数据：本地模拟地形数据，真实 DEM / 海拔数据将在后续接入。",
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
      moonrise: "2026-05-20T08:40:00+08:00",
      moonset: "2026-05-20T22:35:00+08:00",
      milkyWayWindowStart: "2026-05-21T01:10:00+08:00",
      milkyWayWindowEnd: "2026-05-21T03:30:00+08:00",
      milkyWayDirection: "东南至南方",
      milkyWayVisibilityLevel: "fair",
      milkyWayNoteZh: "银河窗口为本地天文算法初步估算。",
    },
  ],
  bestWindows: [
    {
      label: "云海 05:00 - 07:00",
      startTime: "2026-05-20T05:00:00+08:00",
      endTime: "2026-05-20T07:00:00+08:00",
      score: 82,
      target: "cloud_sea",
    },
    {
      label: "晚霞 17:56 - 19:41",
      startTime: "2026-05-20T17:56:00+08:00",
      endTime: "2026-05-20T19:41:00+08:00",
      score: 74,
      target: "glow",
    },
    {
      label: "朝霞 04:30 - 06:15",
      startTime: "2026-05-20T04:30:00+08:00",
      endTime: "2026-05-20T06:15:00+08:00",
      score: 70,
      target: "glow",
    },
    {
      label: "银河 01:10 - 03:30",
      startTime: "2026-05-21T01:10:00+08:00",
      endTime: "2026-05-21T03:30:00+08:00",
      score: 68,
      target: "astro",
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
    "当前天气数据和地形数据为本地模拟数据，天文数据由本地算法按 WGS84 坐标计算；整体结果仍不代表真实预报。",
  isMock: true,
  dataSourceLabel: "模拟天气数据",
  generatedAt: "2026-05-20T00:00:00+08:00",
};

function resultForTarget(target: ForecastCalculationResult["target"]): ForecastCalculationResult {
  return {
    ...baseResult,
    target,
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
      "云海概率",
      "白墙风险",
      "最佳云海窗口",
      "是否值得前往",
    ]);
    expect(viewModel.primaryCards.map((card) => card.moduleKey)).not.toContain("stars");
    expect(viewModel.primaryCards.map((card) => card.moduleKey)).not.toContain("milkyWay");
    expect(viewModel.scoreCards.map((card) => card.key)).toEqual([
      "cloudSea",
      "whiteoutRisk",
      "transparency",
    ]);
    expect(viewModel.bestWindows.map((window) => window.target)).toEqual(["cloud_sea"]);
    expect(viewModel.detailSections.map((section) => section.title)).toEqual(
      expect.arrayContaining([
        "地形与海拔参考",
        "山谷高差",
        "云海地形潜力",
        "白墙风险辅助判断",
      ]),
    );
    expect(viewModel.hiddenModuleKeys).toEqual(
      expect.arrayContaining(["stars", "milkyWay", "astronomy"]),
    );
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
        "月相与月亮照明",
        "天文黑夜",
        "银河方向 / 银河窗口",
        "银河方向遮挡",
        "地平线遮挡提示",
        "山体遮挡风险",
      ]),
    );
    expect(viewModel.scoreCards.map((card) => card.key)).toEqual([
      "stars",
      "milkyWay",
      "transparency",
    ]);
    expect(viewModel.bestWindows[0]?.moduleKey).toBe("astronomicalNight");
    expect(viewModel.bestWindows.map((window) => window.moduleKey)).toContain("milkyWay");
    expect(viewModel.bestWindows.map((window) => window.moduleKey)).not.toContain("cloudSea");
  });

  it("keeps data-source honesty in the shaped notice", () => {
    const viewModel = buildForecastResultViewModel(resultForTarget("astro"), "astro");

    expect(viewModel.dataNotice).toContain("天气数据：本地模拟数据");
    expect(viewModel.dataNotice).toContain("地形数据：本地模拟地形数据");
    expect(viewModel.dataNotice).toContain("真实 DEM / 海拔数据将在后续接入");
    expect(viewModel.dataNotice).toContain("天文数据：本地算法计算");
    expect(viewModel.dataNotice).toContain("不代表真实预报");
  });
});
