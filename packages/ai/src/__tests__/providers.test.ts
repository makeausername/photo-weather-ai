import { decisionCardSchema } from "@photo-weather/shared";
import { describe, expect, it } from "vitest";
import type { ForecastCalculationResult } from "@photo-weather/shared";
import {
  buildDeepSeekForecastExplanationRequest,
  DeepSeekProvider,
  forecastAiExplanationSchema,
  MockAIProvider,
  RuleOnlyProvider,
} from "../index";

const place = {
  id: "mock-place-huangshan",
  name: "Huangshan Scenic Area",
  countryCode: "CN",
  coordinates: {
    latitude: 30.129,
    longitude: 118.169,
    system: "wgs84" as const,
  },
};

describe("AI providers", () => {
  it("uses deterministic mock output", async () => {
    const provider = new MockAIProvider();
    const card = await provider.generateDecisionCard({
      place,
      forecastSummary: "Sample forecast",
      score: 82,
    });

    expect(card.grade).toBe("good");
    expect(card.summary).toContain("Sample forecast");
  });

  it("keeps rule-only fallback independent from network providers", async () => {
    const provider = new RuleOnlyProvider();
    const card = await provider.generateDecisionCard({
      place,
      forecastSummary: "Rules only",
      score: 64,
    });

    expect(card.grade).toBe("fair");
  });

  it("blocks DeepSeek real calls in local tests", async () => {
    const provider = new DeepSeekProvider();

    await expect(
      provider.generateDecisionCard({
        place,
        forecastSummary: "Should not call network",
      }),
    ).rejects.toThrow("DeepSeek 真实调用未启用");
  });

  it("validates JSON output through a supplied schema", () => {
    const provider = new MockAIProvider();
    const parsed = provider.validateJsonOutput(
      decisionCardSchema,
      JSON.stringify({
        grade: "good",
        score: 80,
        title: "Valid",
        summary: "Valid JSON",
        reasons: ["Schema matches"],
      }),
    );

    expect(parsed.score).toBe(80);
  });

  it("builds a DeepSeek JSON-mode forecast explanation request without secrets", () => {
    const request = buildDeepSeekForecastExplanationRequest(
      {
        forecastResult: forecastResultFixture,
      },
      {
        baseUrl: "https://example.deepseek.test/",
        defaultModel: "deepseek-chat",
      },
    );

    expect(request.url).toBe("https://example.deepseek.test/chat/completions");
    expect(request.body).toMatchObject({
      model: "deepseek-v4-flash",
      response_format: {
        type: "json_object",
      },
      stream: false,
    });
    expect(JSON.stringify(request.body)).toContain("Do not invent weather data.");
    expect(JSON.stringify(request.body)).toContain("exampleJsonOutput");
    expect(JSON.stringify(request.body)).not.toContain("sk-");
  });

  it("calls DeepSeek with a mocked fetcher and parses forecast explanation JSON", async () => {
    const fetcher = async (_input: string | URL, init?: RequestInit) => {
      expect(init?.headers).toMatchObject({
        Authorization: "Bearer sk-test",
      });
      expect(String(init?.body)).not.toContain("sk-test");

      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  summary: "演示数据下窗口条件较好，但需要实地复核。",
                  recommendation: "可以作为计划参考，不建议直接作为出行依据。",
                  mainReasons: ["综合指数较高", "最佳窗口明确"],
                  mainRisks: ["天气与地形仍为演示数据"],
                  photographerAdvice: ["提前准备防风和防雨方案"],
                  backupPlan: ["若云量偏厚，改拍近景或延后到下一窗口"],
                  confidenceNote: "当前为演示数据解读，仅用于体验分析流程。",
                }),
              },
            },
          ],
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        },
      );
    };
    const provider = new DeepSeekProvider({
      enabled: true,
      realModeEnabled: true,
      apiKey: "sk-test",
      fetcher,
    });

    const explanation = await provider.generateForecastExplanation({
      forecastResult: forecastResultFixture,
    });

    expect(explanation.summary).toContain("演示数据");
    expect(explanation.mainReasons).toHaveLength(2);
  });

  it("throws a clear DeepSeek key error only after real mode is explicitly enabled", async () => {
    const provider = new DeepSeekProvider({
      enabled: true,
      realModeEnabled: true,
    });

    await expect(
      provider.generateForecastExplanation({
        forecastResult: forecastResultFixture,
      }),
    ).rejects.toThrow("请先填写 DeepSeek API Key。");
  });

  it("validates DeepSeek forecast explanation output shape", () => {
    const provider = new DeepSeekProvider({ mode: "mock" });
    const parsed = provider.validateJsonOutput(
      forecastAiExplanationSchema,
      JSON.stringify({
        summary: "综合解读",
        recommendation: "推荐谨慎参考",
        mainReasons: ["云量窗口可用"],
        mainRisks: ["演示数据"],
        photographerAdvice: ["提前到位"],
        backupPlan: ["改拍近景"],
        confidenceNote: "仅用于体验分析流程。",
      }),
    );

    expect(parsed.backupPlan[0]).toBe("改拍近景");
  });
});

const forecastResultFixture: ForecastCalculationResult = {
  place: {
    id: "spot-guangmingding",
    name: "黄山光明顶",
    countryCode: "CN",
    coordinates: {
      latitude: 30.1328,
      longitude: 118.171,
      system: "wgs84",
    },
  },
  horizon: "48h",
  target: "cloud_sea",
  forecastStart: "2026-05-20T08:00:00+08:00",
  forecastEnd: "2026-05-22T08:00:00+08:00",
  targetDates: ["2026-05-20", "2026-05-21", "2026-05-22"],
  calendarBasis: {
    forecastStart: "2026-05-20T08:00:00+08:00",
    forecastEnd: "2026-05-22T08:00:00+08:00",
    forecastStartLabel: "2026年5月20日 08:00",
    forecastEndLabel: "2026年5月22日 08:00",
    forecastRangeLabel: "2026年5月20日 08:00 至 5月22日 08:00",
    targetDates: ["2026-05-20", "2026-05-21", "2026-05-22"],
    targetDateLabels: ["2026年5月20日 星期三", "2026年5月21日 星期四", "2026年5月22日 星期五"],
    horizonHours: 48,
    timezone: "Asia/Shanghai",
    timezoneLabel: "Asia/Shanghai（中国标准时间）",
    calendarDays: [
      {
        date: "2026-05-20",
        dateLabel: "2026年5月20日 星期三",
        lunarDateText: "四月初四",
        ganzhiYear: "丙午",
        zodiac: "马",
      },
    ],
    wgs84Coordinates: {
      latitude: 30.13012,
      longitude: 118.16389,
    },
    coordinateSource: "本地机位 WGS84 坐标",
  },
  overallScore: 82,
  recommendationLevel: "recommended",
  recommendationLabel: "推荐前往",
  summary: "模拟条件下清晨云海机会较好。",
  scores: {
    sunriseGlow: {
      key: "sunriseGlow",
      label: "朝霞",
      score: 75,
      level: "good",
      reasons: ["高云比例适中。"],
      risks: [],
    },
    sunsetGlow: {
      key: "sunsetGlow",
      label: "晚霞",
      score: 62,
      level: "fair",
      reasons: ["傍晚云层偏厚。"],
      risks: [],
    },
    cloudSea: {
      key: "cloudSea",
      label: "云海",
      score: 86,
      level: "excellent",
      reasons: ["低云和湿度组合较好。"],
      risks: [],
    },
    whiteoutRisk: {
      key: "whiteoutRisk",
      label: "白墙风险",
      score: 38,
      level: "fair",
      reasons: ["低云可能贴近山顶。"],
      risks: ["局部能见度下降。"],
    },
    stars: {
      key: "stars",
      label: "星空",
      score: 58,
      level: "fair",
      reasons: ["夜间云量一般。"],
      risks: [],
    },
    milkyWay: {
      key: "milkyWay",
      label: "银河",
      score: 44,
      level: "poor",
      reasons: ["银河条件有限。"],
      risks: [],
    },
    transparency: {
      key: "transparency",
      label: "通透度",
      score: 71,
      level: "good",
      reasons: ["能见度较好。"],
      risks: [],
    },
  },
  cloudSeaAnalysis: {
    overallScore: 82,
    cloudSeaOpportunityScore: 86,
    whiteoutRiskScore: 38,
    travelScore: 82,
    recommendationLabel: "推荐重点关注",
    confidenceLevel: "medium",
    bestCloudSeaWindows: [
      {
        label: "清晨云海窗口 05:00 - 07:00",
        date: "2026-05-21",
        startTime: "2026-05-21T05:00:00+08:00",
        endTime: "2026-05-21T07:00:00+08:00",
        score: 82,
        target: "cloud_sea",
        phase: "observation",
        noteZh: "清晨云海信号可等待，现场重点复核云雾上沿和能见度。",
        riskTag: "白墙风险低",
      },
    ],
    dailyCloudSea: [
      {
        date: "2026-05-21",
        dateLabelZh: "2026年5月21日 星期四",
        opportunityScore: 86,
        whiteoutRiskScore: 38,
        travelScore: 82,
        bestWindow: {
          label: "清晨云海窗口 05:00 - 07:00",
          date: "2026-05-21",
          startTime: "2026-05-21T05:00:00+08:00",
          endTime: "2026-05-21T07:00:00+08:00",
          score: 82,
          target: "cloud_sea",
          phase: "observation",
          noteZh: "清晨云海信号可等待，现场重点复核云雾上沿和能见度。",
          riskTag: "白墙风险低",
        },
        recommendationLabel: "推荐重点关注",
        keyReason: "低云、湿度和地形组合支持云海。",
        riskNote: "白墙风险较低，仍需现场复核能见度。",
      },
    ],
    weatherEvidence: [
      {
        label: "湿度",
        value: "92%",
        effect: "positive",
        noteZh: "高湿度有利于山谷低云和雾形成。",
      },
    ],
    terrainEvidence: [
      {
        label: "5km 高差",
        value: "1484 m",
        effect: "positive",
        noteZh: "高差明显，具备云海地形基础。",
      },
    ],
    whiteoutReasons: ["白墙风险较低，仍需现场复核能见度。"],
    opportunityReasons: ["低云、湿度和地形组合支持云海。"],
    travelRecommendations: [
      {
        situation: "已在山上",
        action: "建议早起等待",
        detail: "优先守高点，日出前复核云雾上沿、能见度和风速变化。",
      },
    ],
    backupPlans: [
      {
        condition: "白墙时",
        action: "转拍雾中树影、山路氛围、延时",
        detail: "降低远景预期，利用近景层次、人物比例和雾气流动完成素材。",
      },
    ],
    missingDataNotes: [],
    dataMode: "mock",
  },
  glowAnalysis: {
    sunriseGlowScore: 75,
    sunsetGlowScore: 62,
    lowCloudObstructionRisk: 38,
    glowTravelScore: 72,
    recommendationLabel: "值得等待",
    confidenceLevel: "medium",
    bestGlowWindows: [
      {
        type: "sunrise",
        labelZh: "朝霞峰值窗口",
        date: "2026-05-21",
        start: "2026-05-21T04:45:00+08:00",
        end: "2026-05-21T05:35:00+08:00",
        score: 75,
        riskTags: ["风险可控"],
        noteZh: "朝霞窗口中高云和通透度较可用，适合提前到位观察色彩发展。",
      },
    ],
    dailyGlow: [
      {
        date: "2026-05-21",
        dateLabelZh: "2026年5月21日 星期四",
        sunriseScore: 75,
        sunsetScore: 62,
        bestWindow: {
          type: "sunrise",
          labelZh: "朝霞峰值窗口",
          date: "2026-05-21",
          start: "2026-05-21T04:45:00+08:00",
          end: "2026-05-21T05:35:00+08:00",
          score: 75,
          riskTags: ["风险可控"],
          noteZh: "朝霞窗口中高云和通透度较可用，适合提前到位观察色彩发展。",
        },
        bestTarget: "sunrise",
        recommendationLabel: "值得等待",
        keyReason: "朝霞 75 分高于晚霞，优先关注日出前后中高云和东方低云遮挡。",
        riskNote: "风险可控",
      },
    ],
    cloudLayerEvidence: [
      {
        label: "高云",
        value: "45%",
        effect: "positive",
        noteZh: "高云比例适中，有利于承载朝霞色彩。",
      },
    ],
    visibilityEvidence: [
      {
        label: "能见度",
        value: "18 km",
        effect: "positive",
        noteZh: "能见度较好，有利于远山层次和霞光色彩稳定。",
      },
    ],
    terrainObstructionEvidence: [
      {
        label: "日出地平遮挡",
        value: "4.8°",
        effect: "positive",
        noteZh: "日出方向遮挡角用于判断第一束低角度光线是否容易被山体或建筑挡住。",
      },
    ],
    riskReasons: ["低云遮挡风险较低，仍需现场复核太阳方向。"],
    opportunityReasons: ["朝霞最佳参考为朝霞峰值窗口，评分 75 分。"],
    travelRecommendations: [
      "朝霞：建议日出前 40-60 分钟到达机位，先完成构图、测光和安全检查。",
    ],
    backupPlans: [
      {
        condition: "无霞但通透",
        action: "转拍远山层次、长焦山脊",
        detail: "利用清晰空气和低角度侧光保留空间层次。",
      },
    ],
    missingDataNotes: ["当前天气数据为演示数据，结果仅用于体验分析流程。"],
    dataMode: "mock",
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
  astroSummaries: [],
  bestWindows: [
    {
      label: "清晨云海窗口",
      date: "2026-05-20",
      startTime: "2026-05-20T05:00:00+08:00",
      endTime: "2026-05-20T07:00:00+08:00",
      score: 86,
      target: "cloud_sea",
    },
  ],
  dailySummaries: [
    {
      date: "2026-05-20",
      dateLabelZh: "2026年5月20日 星期三",
      lunarDateText: "四月初四",
      score: 86,
      recommendationLabel: "推荐前往",
      target: "cloud_sea",
      keyWindows: [
        {
          label: "清晨云海窗口",
          date: "2026-05-20",
          startTime: "2026-05-20T05:00:00+08:00",
          endTime: "2026-05-20T07:00:00+08:00",
          score: 86,
          target: "cloud_sea",
        },
      ],
      riskFlags: [],
      shortAdvice: "清晨云海窗口值得等待。",
    },
  ],
  targetDailyBreakdown: [
    {
      date: "2026-05-20",
      cloudSea: {
        label: "清晨云海机会",
        score: 86,
        detail: "清晨云海窗口值得关注。",
      },
      whiteoutRisk: {
        label: "白墙风险",
        score: 38,
        detail: "白墙风险较低。",
      },
      transparency: {
        label: "通透度",
        score: 71,
        detail: "能见度较好。",
      },
      terrainSummary: "演示地形数据显示山顶与周边谷地高差明显。",
      weatherSummary: "多云间晴，山地局部有雾",
    },
  ],
  riskFlags: [
    {
      key: "mock_data",
      label: "演示数据",
      level: "medium",
      description: "天气与地形仍为演示数据。",
    },
  ],
  keyReasons: ["清晨低云和湿度组合较好。"],
  photographyAdvice: ["提前到达机位并预留风雨备选。"],
  dataNotice:
    "天气数据：演示数据；地形数据：演示数据；天文数据：本地算法计算。当前结果基于演示天气数据生成，仅用于体验分析流程。",
  isMock: true,
  dataSourceLabel: "演示数据",
  generatedAt: "2026-05-19T08:00:00+08:00",
  weatherProviderCode: "mock",
  weatherProviderLabelZh: "演示数据",
  weatherDataMode: "mock",
  weatherNoticeZh: "天气数据：演示数据",
  weatherMissingFields: [],
  weatherEstimatedFields: [],
};
