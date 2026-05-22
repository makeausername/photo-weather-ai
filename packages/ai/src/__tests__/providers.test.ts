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
                  summary: "模拟数据下窗口条件较好，但需要实地复核。",
                  recommendation: "可以作为计划参考，不建议直接作为出行依据。",
                  mainReasons: ["综合指数较高", "最佳窗口明确"],
                  mainRisks: ["天气与地形仍为模拟数据"],
                  photographerAdvice: ["提前准备防风和防雨方案"],
                  backupPlan: ["若云量偏厚，改拍近景或延后到下一窗口"],
                  confidenceNote: "当前为模拟数据解读，不代表真实预报准确率。",
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

    expect(explanation.summary).toContain("模拟数据");
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
        mainRisks: ["模拟数据"],
        photographerAdvice: ["提前到位"],
        backupPlan: ["改拍近景"],
        confidenceNote: "仅作模拟流程验证。",
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
      terrainSummary: "本地模拟地形显示山顶与周边谷地高差明显。",
      weatherSummary: "多云间晴，山地局部有雾",
    },
  ],
  riskFlags: [
    {
      key: "mock_data",
      label: "模拟数据",
      level: "medium",
      description: "天气与地形仍为本地模拟数据。",
    },
  ],
  keyReasons: ["清晨低云和湿度组合较好。"],
  photographyAdvice: ["提前到达机位并预留风雨备选。"],
  dataNotice: "当前天气数据和地形数据为本地模拟数据。",
  isMock: true,
  dataSourceLabel: "本地模拟数据",
  generatedAt: "2026-05-19T08:00:00+08:00",
  weatherProviderCode: "mock",
  weatherProviderLabelZh: "本地模拟数据",
  weatherDataMode: "mock",
  weatherNoticeZh: "天气数据：本地模拟数据",
  weatherMissingFields: [],
  weatherEstimatedFields: [],
};
