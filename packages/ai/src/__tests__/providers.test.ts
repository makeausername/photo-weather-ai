import { decisionCardSchema } from "@photo-weather/shared";
import { describe, expect, it } from "vitest";
import type {
  CloudSeaScoreCalibrationContext,
  ForecastCalculationResult,
} from "@photo-weather/shared";
import {
  buildCloudSeaAiExplainPayload,
  buildDeepSeekForecastContext,
  buildDeepSeekForecastExplanationRequest,
  buildGlowAiExplainPayload,
  createRuleBasedForecastExplanation,
  DeepSeekProvider,
  forecastAiTargetConfigs,
  forecastAiExplanationSchema,
  isDeepSeekProviderError,
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

type ForecastExplanationRequestUserPayload = {
  readonly task: string;
  readonly targetCode: string;
  readonly targetSubjectZh?: string | null;
  readonly preferredVisibleSectionsZh?: readonly string[] | null;
  readonly promptPrioritiesZh?: readonly string[] | null;
  readonly constraints: readonly string[];
  readonly computedForecastFacts: {
    readonly targetCode: string;
    readonly cloudSea?: Record<string, unknown>;
    readonly glow?: ReturnType<typeof buildGlowAiExplainPayload>;
    readonly astro?: Record<string, unknown>;
  };
};

function readForecastExplanationUserPayload(
  request: ReturnType<typeof buildDeepSeekForecastExplanationRequest>,
): ForecastExplanationRequestUserPayload {
  const userMessage = request.body.messages.find((message) => message.role === "user");
  expect(userMessage).toBeTruthy();
  return JSON.parse(userMessage?.content ?? "{}") as ForecastExplanationRequestUserPayload;
}

function astroSummaryForGlowTest(): ForecastCalculationResult["astroSummaries"][number] {
  const moonInfo = {
    moonPhase: 0.22,
    moonPhaseNameZh: "娥眉月",
    moonIllumination: 0.31,
    waxingOrWaning: "waxing" as const,
    lunarDateText: "四月初五",
    calculationNoteZh: "月相基于本地天文算法计算。",
  };
  return {
    date: "2026-05-21",
    timezone: "Asia/Shanghai",
    sunrise: "2026-05-21T05:14:00+08:00",
    sunset: "2026-05-21T18:57:00+08:00",
    solarNoon: "2026-05-21T12:05:00+08:00",
    sunriseAzimuth: 72,
    sunsetAzimuth: 286,
    civilDawn: "2026-05-21T04:49:00+08:00",
    civilDusk: "2026-05-21T19:22:00+08:00",
    moonPhase: moonInfo.moonPhase,
    moonPhaseNameZh: moonInfo.moonPhaseNameZh,
    moonIllumination: moonInfo.moonIllumination,
    waxingOrWaning: moonInfo.waxingOrWaning,
    lunarDateText: moonInfo.lunarDateText,
    calculationNoteZh: moonInfo.calculationNoteZh,
    moonInfo,
  };
}

function cloudSeaScoreCalibrationForTest(
  overrides: Partial<CloudSeaScoreCalibrationContext> = {},
): CloudSeaScoreCalibrationContext {
  const rawFormationScore = overrides.rawFormationScore ?? overrides.calibratedFormationScore ?? 86;
  const rawShootabilityScore =
    overrides.rawShootabilityScore ?? overrides.calibratedShootabilityScore ?? 82;
  const calibratedFormationScore = overrides.calibratedFormationScore ?? rawFormationScore;
  const calibratedShootabilityScore =
    overrides.calibratedShootabilityScore ?? overrides.finalCloudSeaScore ?? rawShootabilityScore;
  const finalCloudSeaScore = overrides.finalCloudSeaScore ?? calibratedShootabilityScore;

  return {
    rawFormationScore,
    rawShootabilityScore,
    calibratedFormationScore,
    calibratedShootabilityScore,
    finalCloudSeaScore,
    scoreBand: overrides.scoreBand ?? "good",
    confidenceLevel: overrides.confidenceLevel ?? "high",
    capApplied: overrides.capApplied ?? false,
    capReasons: overrides.capReasons ?? [],
    positiveFactorsZh: overrides.positiveFactorsZh ?? ["低云、水汽和地形信号支持云海形成。"],
    negativeFactorsZh: overrides.negativeFactorsZh ?? [],
    scoreExplanationZh:
      overrides.scoreExplanationZh ??
      `形成 ${rawFormationScore} -> ${calibratedFormationScore} 分，可拍 ${rawShootabilityScore} -> ${calibratedShootabilityScore} 分，最终 ${finalCloudSeaScore} 分。`,
    recommendationExplanationZh:
      overrides.recommendationExplanationZh ??
      "形成、开口、能见度和风险信号支持当前推荐，但出发前仍需复核临近天气。",
    finalRecommendationLabel: overrides.finalRecommendationLabel ?? "推荐安排",
    shouldBlockStrongRecommendation: overrides.shouldBlockStrongRecommendation ?? false,
    shouldDowngradeToCautious: overrides.shouldDowngradeToCautious ?? false,
    shouldDowngradeToBackup: overrides.shouldDowngradeToBackup ?? false,
  };
}

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
      model: "deepseek-v4-pro",
      response_format: {
        type: "json_object",
      },
      stream: false,
    });
    expect(JSON.stringify(request.body)).toContain("short_practical_json");
    expect(JSON.stringify(request.body)).toContain(
      "Use only computedForecastFacts; do not calculate, invent, or override weather, terrain, astronomy, coordinates, scores, risks, or windows.",
    );
    expect(JSON.stringify(request.body)).toContain(
      "Do not infer low/mid/high cloud layers from total cloud.",
    );
    expect(JSON.stringify(request.body)).toContain("computedForecastFacts");
    expect(JSON.stringify(request.body)).toContain("forecast-interpretation-lean-v1");
    expect(JSON.stringify(request.body)).not.toContain("exampleJsonOutput");
    expect(JSON.stringify(request.body)).not.toContain("professionalHourlyData");
    expect(JSON.stringify(request.body)).not.toContain("weatherTimeline");
    expect(request.promptSizeChars).toBeLessThanOrEqual(6000);
    expect(JSON.stringify(request.body)).not.toContain("sk-");
  });

  it("passes cloud-sea through the shared target configuration and request payload", () => {
    const request = buildDeepSeekForecastExplanationRequest({
      forecastResult: forecastResultFixture,
    });
    const payload = readForecastExplanationUserPayload(request);

    expect(forecastAiTargetConfigs.cloud_sea.targetCode).toBe("cloud_sea");
    expect(payload.targetCode).toBe("cloud_sea");
    expect(payload.targetSubjectZh).toBe("云海");
    expect(payload.computedForecastFacts.targetCode).toBe("cloud_sea");
    expect(payload.computedForecastFacts.cloudSea?.recommendationZh).toBeTypeOf("string");
    expect(payload.computedForecastFacts.glow).toBeUndefined();
    expect(request.body.model).toBe("deepseek-v4-pro");
  });

  it("passes general through a data-grounded decision prompt", () => {
    const request = buildDeepSeekForecastExplanationRequest({
      forecastResult: {
        ...forecastResultFixture,
        target: "general",
      },
    });
    const payload = readForecastExplanationUserPayload(request);
    const constraints = payload.constraints.join("\n");

    expect(forecastAiTargetConfigs.general.targetCode).toBe("general");
    expect(payload.targetCode).toBe("general");
    expect(payload.targetSubjectZh).toBe("综合判断");
    expect(payload.task).toContain("综合判断");
    expect(payload.task).not.toContain("Cloud Sea photo-weather");
    expect(payload.task).not.toContain("sunrise and sunset glow");
    expect(payload.preferredVisibleSectionsZh).toEqual([
      "是否值得去",
      "优先题材与窗口",
      "主要天气风险",
      "备选策略",
      "复核重点",
    ]);
    expect(payload.promptPrioritiesZh?.join("")).toContain("综合判断是否值得去");
    expect(payload.promptPrioritiesZh?.join("")).toContain("优先哪个题材/窗口");
    expect(constraints).toContain("use deterministic facts only");
    expect(constraints).toContain("Do not invent exact arrival time");
    expect(constraints).toContain("Do not invent cloud layer values");
    expect(constraints).toContain("Do not infer terrain obstruction");
    expect(constraints).toContain(
      "Do not turn precipitation probability into certain rainfall when precipitation amount is 0 or missing",
    );
    expect(constraints).toContain("Do not invent safety, road, access");
    expect(constraints).toContain("Do not invent moonlight, Milky Way, glow, or cloud-sea details");
    expect(constraints).toContain("If data is missing or weak");
    expect(constraints).toContain("Do not use cloud-sea or glow wording as the primary task");
    expect(request.body.messages.find((message) => message.role === "system")?.content).toContain(
      "Separate opportunity, risk, and action",
    );
    expect(request.body.messages.find((message) => message.role === "system")?.content).toContain(
      "photography planning assistant",
    );
    expect(request.body.messages.find((message) => message.role === "system")?.content).toContain(
      "Never invent moon phase, terrain, travel",
    );
    expect(payload.computedForecastFacts.targetCode).toBe("general");
    expect(payload.computedForecastFacts.cloudSea).toBeUndefined();
    expect(payload.computedForecastFacts.glow).toBeUndefined();
  });

  it("passes astro through a deterministic photography planning prompt", () => {
    const request = buildDeepSeekForecastExplanationRequest({
      forecastResult: {
        ...forecastResultFixture,
        target: "astro",
      },
    });
    const payload = readForecastExplanationUserPayload(request);
    const constraints = payload.constraints.join("\n");

    expect(forecastAiTargetConfigs.astro.targetCode).toBe("astro");
    expect(payload.targetCode).toBe("astro");
    expect(payload.targetSubjectZh).toBe("星空银河");
    expect(payload.preferredVisibleSectionsZh).toEqual([
      "是否值得去",
      "最佳夜间窗口",
      "月光与光污染",
      "主要风险",
      "行动建议",
    ]);
    expect(payload.promptPrioritiesZh?.join("")).toContain("天文黑夜");
    expect(payload.promptPrioritiesZh?.join("")).toContain("环境光污染和银河方向光害");
    expect(payload.computedForecastFacts.targetCode).toBe("astro");
    expect(payload.computedForecastFacts.cloudSea).toBeUndefined();
    expect(payload.computedForecastFacts.glow).toBeUndefined();
    expect(payload.computedForecastFacts.astro).toMatchObject({
      contextVersion: "astro-night-decision-v1",
      deterministicOnly: true,
    });
    expect(constraints).toContain("Do not invent moon phase, moon altitude");
    expect(constraints).toContain("Separate opportunity, risk, and action");
    expect(constraints).toContain("do not overpromise Milky Way");
    expect(request.body.messages.find((message) => message.role === "system")?.content).toContain(
      "photography planning assistant",
    );
    expect(request.body.messages.find((message) => message.role === "system")?.content).toContain(
      "Never invent moon phase, terrain, travel",
    );
    expect(JSON.stringify(request.body)).not.toMatch(/api[_-]?key|secret|sk-/i);
  });

  it("builds a glow-specific DeepSeek prompt from concise deterministic facts", () => {
    const baseSunriseWindow = forecastResultFixture.glowAnalysis.bestGlowWindows[0];
    if (!baseSunriseWindow) {
      throw new Error("forecast fixture must include a sunrise glow window");
    }
    const sunriseWindow = {
      ...baseSunriseWindow,
      occurrenceProbabilityPercent: 75,
      vividnessIndex: 79,
      vividnessLevel: "strong" as const,
      practicalSuitabilityScore: 72,
      confidence: 72,
      calibrationMode: "heuristic" as const,
      providerAgreement: forecastResultFixture.glowAnalysis.providerAgreement,
    };
    const sunsetWindow = {
      ...sunriseWindow,
      type: "sunset" as const,
      labelZh: "晚霞峰值窗口",
      start: "2026-05-21T17:55:00+08:00",
      end: "2026-05-21T19:18:00+08:00",
      score: 62,
      occurrenceProbabilityPercent: 62,
      vividnessIndex: 66,
      practicalSuitabilityScore: 58,
      noteZh: "晚霞窗口可作为备选，重点看西向中高云是否保留色彩载体。",
    };
    const request = buildDeepSeekForecastExplanationRequest({
      forecastResult: {
        ...forecastResultFixture,
        target: "glow",
        astroSummaries: [astroSummaryForGlowTest()],
        glowAnalysis: {
          ...forecastResultFixture.glowAnalysis,
          bestGlowWindows: [sunriseWindow, sunsetWindow],
          cloudLayerEvidence: [
            {
              label: "总云量",
              value: "58%",
              effect: "positive",
              noteZh: "总云量 20%-75% 通常更容易形成可用霞光层次。",
            },
            {
              label: "低云",
              value: "32%",
              effect: "neutral",
              noteZh: "低云可能遮挡太阳方向，需要现场复核地平线是否留有缝隙。",
            },
            {
              label: "中云",
              value: "45%",
              effect: "positive",
              noteZh: "适量中云可承载霞光色彩。",
            },
            {
              label: "高云",
              value: "52%",
              effect: "positive",
              noteZh: "高云是霞光色彩的重要载体。",
            },
          ],
        },
      },
    });
    const payload = readForecastExplanationUserPayload(request);
    const glow = payload.computedForecastFacts.glow;
    const text = JSON.stringify(request.body);

    expect(forecastAiTargetConfigs.glow.targetCode).toBe("glow");
    expect(request.body.model).toBe("deepseek-v4-pro");
    expect(payload.targetCode).toBe("glow");
    expect(payload.targetSubjectZh).toBe("朝霞晚霞");
    expect(payload.preferredVisibleSectionsZh).toEqual([
      "是否值得去",
      "最佳时间",
      "为什么",
      "怎么拍",
      "备选方案",
    ]);
    expect(payload.promptPrioritiesZh?.join("")).toContain("是否值得去");
    expect(payload.constraints.join("")).toContain("Do not change sunrise/sunset glow probability");
    expect(glow?.primaryDecision).toMatchObject({
      preferredTargetZh: "朝霞",
      preferredProbabilityPercent: 75,
      recommendationZh: expect.any(String),
      recommendedArrivalZh: expect.stringContaining("建议"),
    });
    expect(glow?.sunriseGlow).toMatchObject({
      probabilityPercent: 75,
      vividnessIndex: 79,
      practicalSuitabilityScore: 72,
      recommendationZh: "可以关注",
    });
    expect(glow?.sunsetGlow).toMatchObject({
      probabilityPercent: 62,
      vividnessIndex: 66,
      practicalSuitabilityScore: 58,
      recommendationZh: "仅作备选",
    });
    expect(glow?.sunriseGlow.sunEvent).toMatchObject({
      eventTime: "2026-05-21T05:14:00+08:00",
      solarAzimuthDegrees: 72,
    });
    expect(glow?.sunsetGlow.sunEvent).toMatchObject({
      eventTime: "2026-05-21T18:57:00+08:00",
      solarAzimuthDegrees: 286,
    });
    expect(glow?.sunriseGlow.bestWindow?.date).toBe("2026-05-21");
    expect(glow?.sunriseGlow.bestWindow?.windowZh).toBe("04:45–05:35");
    expect(glow?.sunsetGlow.bestWindow?.date).toBe("2026-05-21");
    expect(glow?.sunsetGlow.bestWindow?.windowZh).toBe("17:55–19:18");
    expect(glow?.whyThisJudgment.map((item) => item.labelZh)).toEqual(
      expect.arrayContaining(["中高云条件", "低云遮挡", "降水风险", "通透度"]),
    );
    expect(glow?.professionalHourlySummary).toMatchObject({
      rowCount: expect.any(Number),
      focusedRowCount: expect.any(Number),
    });
    expect(JSON.stringify(glow?.professionalHourlySummary)).not.toContain("focusedRows");
    expect(glow?.actionPlan.travelAdviceZh.join("")).toContain("日出前 40-60 分钟");
    expect(glow?.contextVersion).toBe("glow-ai-explain-v3");
    expect(glow?.deterministicAuthority).toMatchObject({
      occurrenceProbabilityPercent: 75,
      vividnessIndex: 79,
      practicalSuitabilityScore: 72,
      calibrationMode: "heuristic",
    });
    expect(text).toContain("occurrenceProbabilityPercent");
    expect(text).toContain("vividnessIndex");
    expect(text).toContain("practicalSuitabilityScore");
    expect(text).not.toContain("professionalHourlyData");
    expect(text).not.toContain("focusedRows");
    expect(text).not.toContain("weatherTimeline");
    expect(text).not.toMatch(/api[_-]?key|secret|sk-/i);
    expect(request.promptSizeChars).toBeLessThanOrEqual(6000);
  });

  it("marks ended glow windows in the DeepSeek prompt without zeroing their probability", () => {
    const endedSunriseWindow = {
      type: "sunrise" as const,
      labelZh: "朝霞峰值窗口",
      date: "2026-05-21",
      start: "2026-05-21T05:17:00+08:00",
      end: "2026-05-21T06:32:00+08:00",
      score: 69,
      riskTags: ["风险可控"],
      noteZh: "朝霞窗口已经结束，但 deterministic 概率原值仍需保留。",
    };
    const upcomingSunsetWindow = {
      ...endedSunriseWindow,
      type: "sunset" as const,
      labelZh: "晚霞峰值窗口",
      start: "2026-05-21T17:55:00+08:00",
      end: "2026-05-21T19:18:00+08:00",
      score: 62,
      noteZh: "晚霞窗口仍未开始，可作为当前行动候选。",
    };
    const request = buildDeepSeekForecastExplanationRequest({
      forecastResult: {
        ...forecastResultFixture,
        target: "glow",
        generatedAt: "2026-05-21T10:00:00+08:00",
        astroSummaries: [astroSummaryForGlowTest()],
        glowAnalysis: {
          ...forecastResultFixture.glowAnalysis,
          sunriseGlowScore: 69,
          sunsetGlowScore: 62,
          bestGlowWindow: endedSunriseWindow,
          bestGlowWindows: [endedSunriseWindow, upcomingSunsetWindow],
          dailyGlow: [
            {
              date: "2026-05-21",
              dateLabelZh: "2026年5月21日 星期四",
              sunriseScore: 69,
              sunsetScore: 62,
              bestWindow: endedSunriseWindow,
              bestTarget: "sunrise",
              recommendationLabel: "值得等待",
              keyReason: "朝霞分数较高但窗口已结束。",
              riskNote: "风险可控",
            },
          ],
        },
      },
    });
    const payload = readForecastExplanationUserPayload(request);
    const glow = payload.computedForecastFacts.glow;

    expect(glow?.sunriseGlow.lifecycle).toBe("ended");
    expect(glow?.sunriseGlow.actionable).toBe(false);
    expect(glow?.sunriseGlow.probabilityPercent).toBeGreaterThan(0);
    expect(glow?.sunriseGlow.probabilityDisplay).toBe("已结束");
    expect(glow?.sunriseGlow.bestWindow).toMatchObject({
      lifecycle: "ended",
      actionable: false,
      windowZh: "05:17–06:32",
    });
    expect(glow?.primaryDecision).toMatchObject({
      preferredTargetZh: "晚霞",
      lifecycle: "upcoming",
      actionable: true,
    });
    expect(glow?.primaryDecision.recommendedArrivalZh).not.toContain("04:");
    expect(JSON.stringify(request.body)).toContain("Do not recommend ended windows as actionable");
  });

  it("omits glow aerosol and terrain numeric details when those deterministic facts are unavailable", () => {
    const payload = buildGlowAiExplainPayload(
      {
        ...forecastResultFixture,
        target: "glow",
        glowAnalysis: {
          ...forecastResultFixture.glowAnalysis,
          aerosolAssessment: {
            availability: "unavailable",
            confidence: "low",
            state: "unavailable",
            stateLabelZh: "暂无可靠数据",
            implicationZh: "气溶胶证据不足，不能判断颗粒物对霞光散射的影响。",
            noteZh: "当前无 AOD、PM 或沙尘参考。",
            scoreImpact: 0,
          },
          aerosolEvidence: [],
          terrainObstructionAssessments: [],
          terrainObstructionEvidence: [],
        },
      },
      "minimal",
    );
    const text = JSON.stringify(payload);

    expect(payload.primaryDecision).toMatchObject({
      preferredTargetZh: expect.any(String),
      preferredProbabilityPercent: expect.any(Number),
      recommendationZh: expect.any(String),
    });
    expect(payload.whyThisJudgment.map((item) => item.labelZh)).toEqual(
      expect.arrayContaining(["中高云条件", "低云遮挡"]),
    );
    expect(text).not.toContain("aerosolOpticalDepth550");
    expect(text).not.toContain("pm25");
    expect(text).not.toContain("dust");
    expect(text).not.toContain("solarClearanceDegrees");
    expect(text).not.toContain("solarAzimuthDegrees");
  });

  it("builds a compact computed-facts-only DeepSeek context", () => {
    const context = buildDeepSeekForecastContext(forecastResultFixture);
    const text = JSON.stringify(context);

    expect(context.dataStatus).toMatchObject({
      dataMode: "mock",
    });
    expect(JSON.stringify(context.location)).not.toContain("coordinates");
    expect(text).toContain("All values are precomputed deterministic facts");
    expect(text).not.toContain("weatherTimeline");
    expect(text).not.toContain("providerCode");
    expect(text.length).toBeLessThanOrEqual(9500);
  });

  it("builds a Cloud Sea AI payload from deterministic facts without coordinates or provider names", () => {
    const payload = buildCloudSeaAiExplainPayload({
      ...forecastResultFixture,
      dataNotice:
        "天气数据：和风天气；云层辅助：Open-Meteo；专业增强：meteoblue；地理服务：高德地图。",
      weatherNoticeZh: "天气数据：和风天气；云层辅助：Open-Meteo；专业增强：meteoblue。",
      weatherMissingDataNotes: ["Open-Meteo 云层辅助字段部分缺失"],
      weatherFusionSummary: {
        primarySource: "QWeather",
        auxiliarySources: ["Open-Meteo", "meteoblue"],
        professionalSourceStatus: "meteoblue 通过",
        confidenceLevel: "medium",
        conflictStatusZh: "QWeather 与 meteoblue 有低云分歧",
        dataStatusZh: "QWeather / Open-Meteo / meteoblue",
        multiSourceAgreementContext: {
          agreementLevel: "medium",
          disagreementLevel: "medium",
          fieldDisagreements: [
            {
              field: "cloudLow",
              level: "medium",
              range: null,
              sourcesAvailable: 2,
              messageZh: "QWeather 与 meteoblue 低云判断存在分歧。",
            },
          ],
          keyWarningsZh: ["meteoblue 低云分歧需要复核"],
          userSummaryZh: "Open-Meteo 与 meteoblue 存在云层分歧。",
          professionalSummaryZh: "QWeather / Open-Meteo / meteoblue 多源对照。",
          shouldLowerConfidence: true,
          shouldShowReviewWarning: true,
        },
      },
    });
    const text = JSON.stringify(payload);

    expect(payload.target).toBe("cloud_sea");
    expect(payload.deterministicOnly).toBe(true);
    expect(payload.scoreAndRecommendation.cloudSeaScore).toBe(
      forecastResultFixture.cloudSeaAnalysis.scoreCalibration.finalCloudSeaScore,
    );
    expect(payload.scoreCalibration).toMatchObject({
      rawFormationScore: forecastResultFixture.cloudSeaAnalysis.scoreCalibration.rawFormationScore,
      calibratedShootabilityScore:
        forecastResultFixture.cloudSeaAnalysis.scoreCalibration.calibratedShootabilityScore,
      finalCloudSeaScore:
        forecastResultFixture.cloudSeaAnalysis.scoreCalibration.finalCloudSeaScore,
      capApplied: forecastResultFixture.cloudSeaAnalysis.scoreCalibration.capApplied,
      capReasons: forecastResultFixture.cloudSeaAnalysis.scoreCalibration.capReasons,
    });
    expect(payload.professionalHourlySummary).toHaveProperty("focusedRows");
    expect(payload.professionalHourlySummary).toHaveProperty("temperatureBasis");
    expect(payload.professionalHourlySummary.temperatureBasis).toHaveProperty("temperatureBasis");
    expect(payload.professionalHourlySummary.temperatureBasis).toHaveProperty(
      "displayTemperatureC",
    );
    expect(payload.displayDataAlignment).toMatchObject({
      sourceAlignmentStatus: "normalized",
      normalizedHourlyRowCount: expect.any(Number),
      nearTermRowCount: expect.any(Number),
    });
    expect(payload.bestWindow?.date).toBe("2026-05-21");
    expect(payload.bestWindow?.windowZh).toBe("05:00–07:00");
    expect(payload.cloudSeaWindowCards.best[0]?.date).toBe("2026-05-21");
    expect(payload.cloudSeaWindowCards.best[0]?.windowZh).toBe("05:00–07:00");
    expect(payload.precipitationSignalSummary.mainTimeRangeZh).toBe(
      "2026年5月21日 星期四 · 05:00–07:00",
    );
    expect(payload.precipitationSignalContext.mainTimeRangeZh).toBe(
      "2026年5月21日 星期四 · 05:00–07:00",
    );
    expect(text).not.toMatch(/主窗口：05:00-07:00/);
    expect(text).not.toContain("2026年5月21日 周四");
    expect(payload.displayTemperatureContext).toHaveProperty("displayTemperatureC");
    expect(payload.precipitationSignalContext).toMatchObject({
      precipitationSignalType: expect.any(String),
      userSummaryZh: expect.any(String),
    });
    expect(payload.precipitationSignalContext).toHaveProperty("maxAmountMm");
    expect(payload.precipitationSignalContext).toHaveProperty("nearTermAmountMm");
    expect(payload.windowRiskContext).toMatchObject({
      windowRainImpact: expect.any(Object),
      preWindowRainImpact: expect.any(Object),
      duringWindowRainImpact: expect.any(Object),
      postWindowRainImpact: expect.any(Object),
      windowOpeningConfidence: expect.any(String),
      whiteoutReviewLevel: expect.any(String),
      scoreCapReasons: expect.any(Array),
      actionAdviceZh: expect.any(String),
    });
    expect(payload.windowRiskContext.duringWindowRainImpact).toHaveProperty("timing");
    expect(payload.windowRiskContext).toHaveProperty("displayTemperatureBasis");
    expect(payload.cloudLayerCoverageContext).toMatchObject({
      layerCompletenessLevel: expect.any(String),
    });
    expect(payload.cloudLayerCoverageContext).toHaveProperty("nearTermCloudLowPercent");
    expect(payload.actionPlan).toMatchObject({
      finalRecommendationZh: expect.any(String),
      explanationActionSummaryZh: expect.any(String),
    });
    expect(payload.riskReview).toHaveProperty("precipitationRiskZh");
    expect(payload.riskReview).toHaveProperty("cloudBasisRiskZh");
    expect(payload.cloudLayerCompletenessSummary).toHaveProperty("layerCompletenessLevel");
    expect(payload.cloudBasisConsistencySummary).toMatchObject({
      cloudBasisLevel: expect.any(String),
      professionalSummaryZh: expect.any(String),
      shouldLowerCloudSeaConfidence: expect.any(Boolean),
    });
    expect(payload.precipitationSignalSummary).toMatchObject({
      precipitationSignalLevel: expect.any(String),
      precipitationSignalType: expect.any(String),
      probabilityClass: expect.any(String),
      amountClass: expect.any(String),
      affectsMainWindow: expect.any(Boolean),
      userSummaryZh: expect.any(String),
      actionAdviceZh: expect.any(String),
    });
    const recommendationExplanation = payload.recommendationExplanation;
    expect(recommendationExplanation).toBeDefined();
    if (!recommendationExplanation) {
      throw new Error("Expected cloud sea recommendation explanation payload.");
    }
    expect(recommendationExplanation).toMatchObject({
      oneLineConclusionZh: expect.any(String),
      whyNotStrongerZh: expect.any(String),
      confidenceExplanationZh: expect.any(String),
      reviewPointsZh: expect.any(Array),
      actionSummaryZh: expect.any(String),
    });
    expect(recommendationExplanation.oneLineConclusionZh).toContain("云");
    const actionSummaryZh = recommendationExplanation.actionSummaryZh;
    expect(actionSummaryZh).toEqual(expect.any(String));
    if (typeof actionSummaryZh !== "string") {
      throw new Error("Expected cloud sea action summary text.");
    }
    expect(actionSummaryZh.length).toBeGreaterThan(0);
    expect(payload.weatherVariableConsistencySummary).toHaveProperty("precipitationSignalStatus");
    expect(payload.multiSourceAgreementSummary).toMatchObject({
      agreementLevel: "medium",
      shouldLowerConfidence: true,
    });
    expect(text).toContain("Do not recompute facts");
    expect(text).toContain("invent temperature correction");
    expect(text).toContain("invent rain amount");
    expect(text).toContain("window-centered risk reasons");
    expect(text).toContain("trace amount");
    expect(text).toContain("infer low/mid/high cloud from total cloud");
    expect(text).not.toMatch(/latitude|longitude|coordinates|WGS84|GCJ-02/i);
    expect(text).not.toContain("QWeather");
    expect(text).not.toContain("Open-Meteo");
    expect(text).not.toContain("meteoblue");
    expect(text).not.toContain("和风天气");
    expect(text).not.toContain("高德地图");
  });

  it("does not include professional hourly rows before the forecast anchor in Cloud Sea AI payload", () => {
    const payload = buildCloudSeaAiExplainPayload({
      ...forecastResultFixture,
      horizon: "24h",
      forecastStart: "2026-06-02T09:00:00+08:00",
      forecastEnd: "2026-06-03T09:00:00+08:00",
      generatedAt: "2026-06-02T08:28:00+08:00",
      professionalHourlyData: [
        professionalHourlyRow("2026-06-02T00:00:00+08:00"),
        professionalHourlyRow("2026-06-02T08:00:00+08:00"),
        professionalHourlyRow("2026-06-02T09:00:00+08:00"),
        professionalHourlyRow("2026-06-02T10:00:00+08:00"),
      ],
      professionalHourlyDataTimeBasis: {
        startTime: "2026-06-02T09:00:00+08:00",
        endTime: "2026-06-03T08:00:00+08:00",
        stepMinutes: 60,
        timezone: "Asia/Shanghai",
        generatedAtLocal: "2026-06-02T08:28:00+08:00",
        anchorStartLocal: "2026-06-02T09:00:00+08:00",
        anchorEndLocal: "2026-06-03T08:00:00+08:00",
        requestedHours: 24,
        displayLabel: "未来24小时",
        isFutureOnly: true,
        anchorRule: "future_hour_ceil_to_next_hour",
        temperatureBasis: "raw_grid",
        temperatureBasisNoteZh: "raw",
        cloudLayerBasis: "explicit_layers",
        cloudLayerBasisNoteZh: "layers",
        partialData: false,
      },
    });
    const text = JSON.stringify(payload.professionalHourlySummary.focusedRows);

    expect(payload.professionalHourlySummary.rowCount).toBe(2);
    expect(text).toContain("09:00");
    expect(text).toContain("10:00");
    expect(text).not.toContain("00:00");
    expect(text).not.toContain("08:00");
  });

  it("passes deterministic astro V2 facts to DeepSeek without provider names", () => {
    const preStartAstroWindow = {
      type: "milky_way_candidate" as const,
      labelZh: "前一晚银河候选窗口",
      date: "2026-05-19",
      start: "2026-05-20T01:10:00+08:00",
      end: "2026-05-20T03:20:00+08:00",
      durationMinutes: 130,
      score: 91,
      riskTags: [],
      noteZh: "不应进入公开 AI 上下文。",
      directionZh: "东南至南方",
      galacticCenterAltitude: 25,
    };
    const astroWindow = {
      type: "milky_way_candidate" as const,
      labelZh: "银河候选窗口",
      date: "2026-05-21",
      start: "2026-05-22T01:10:00+08:00",
      end: "2026-05-22T03:20:00+08:00",
      durationMinutes: 130,
      score: 62,
      riskTags: ["低云偏多"],
      noteZh: "银心方向可用，但天气未通过。",
      directionZh: "东南至南方",
      galacticCenterAltitude: 24,
    };
    const preStartPromptWindow = {
      label: "前一晚误差窗口",
      date: "2026-05-19",
      startTime: "2026-05-20T01:10:00+08:00",
      endTime: "2026-05-20T03:20:00+08:00",
      score: 91,
      target: "astro" as const,
    };
    const publicPromptWindow = {
      label: "公开银河窗口",
      date: "2026-05-21",
      startTime: astroWindow.start,
      endTime: astroWindow.end,
      score: astroWindow.score,
      target: "astro" as const,
    };
    const baseDaily = forecastResultFixture.dailySummaries[0]!;
    const astroResult: ForecastCalculationResult = {
      ...forecastResultFixture,
      target: "astro",
      bestWindows: [preStartPromptWindow, publicPromptWindow],
      dailySummaries: [
        {
          ...baseDaily,
          date: "2026-05-19",
          dateLabelZh: "2026年5月19日 星期二",
          score: 91,
          recommendationLabel: "前一晚误差判断",
          shortAdvice: "前一晚不应进入公开 AI 上下文。",
          keyWindows: [preStartPromptWindow],
          bestShootableWindow: preStartPromptWindow,
        },
        {
          ...baseDaily,
          date: "2026-05-21",
          dateLabelZh: "2026年5月21日 星期四",
          score: 62,
          recommendationLabel: "仅作备选窗口",
          shortAdvice: "公开日期窗口可用于 AI 解读。",
          keyWindows: [publicPromptWindow],
          bestShootableWindow: publicPromptWindow,
        },
      ],
      astroDataSourceLabelZh: "本地天文服务计算",
      weatherNoticeZh: "天气数据：和风天气；云层辅助：Open-Meteo；专业增强：meteoblue。",
      astroAnalysis: {
        ...forecastResultFixture.astroAnalysis,
        astronomicalWindowScore: 78,
        skyConditionScore: 24,
        milkyWayGeometryScore: 62,
        moonlightImpactScore: 18,
        transparencyScore: 36,
        dewRiskScore: 82,
        practicalAstroScore: 24,
        moonInfo: astroSummaryForGlowTest().moonInfo,
        astroWindowAvailable: true,
        astroShootable: false,
        labels: {
          astronomicalWindow: "有",
          starShootability: "低",
          milkyWayShootability: "低",
          moonlightImpact: "低",
          cloudBlocker: "高",
          dewRisk: "高",
          windowRecommendation: "仅作备选窗口",
        },
        cloudBlockerLevel: "high",
        dewRiskLevel: "high",
        recommendedMilkyWayWindow: undefined,
        recommendedMilkyWayWindows: [],
        astronomicalNightWindows: [
          {
            ...preStartAstroWindow,
            type: "astronomical_night",
            labelZh: "前一晚天文黑夜",
          },
          {
            ...astroWindow,
            type: "astronomical_night",
            labelZh: "天文黑夜",
            start: "2026-05-21T20:26:00+08:00",
            end: "2026-05-22T03:48:00+08:00",
          },
        ],
        moonlessNightWindows: [],
        milkyWayCandidateWindows: [preStartAstroWindow, astroWindow],
        weatherBlockers: ["低云偏多，星空银河实际可见性较差。", "降水干扰"],
        gearAdviceZh: ["湿度较高，需准备防露带、镜头布和防水收纳。"],
        warmthAdviceZh: "夜间湿冷，需准备防风保暖层。",
        lightPollution: {
          available: true,
          dataAvailable: true,
          sourceCode: "eog_viirs",
          sourceLabel: "卫星夜光参考",
          datasetYear: 2026,
          datasetVersion: "test",
          localRadiance: 0.18,
          surroundingHaloRadiance: 1.2,
          ambientRiskIndex: 82,
          ambientRiskLevel: "very_high",
          ambientRiskLevelLabelZh: "很高",
          directionalRisk: [],
          targetAzimuthDegrees: 135,
          targetDirectionRisk: 76,
          targetDirectionLevel: "high",
          targetDirectionLevelLabelZh: "高",
          confidence: "high",
          sampleCount: 96,
          validSampleCount: 90,
          estimatedBortleRange: {
            available: true,
            minClass: 6,
            maxClass: 7,
            rangeLabelZh: "6–7级",
            skyQualityLabelZh: "明显光害",
            confidence: "low",
            methodVersion: "viirs-ambient-risk-range-v1",
            basisZh:
              "使用环境光污染指数 82/100 按 V1 区间映射；来源 卫星夜光参考 / 2026 / test。未使用银河方向光害改变位置级估算。",
            disclaimerZh:
              "基于卫星夜间灯光与环境光污染指数估算，非现场 SQM 实测，不代表正式波特尔观测认证。",
          },
          lightPollutionNoteZh: "卫星夜光参考：环境光污染很高，银河方向光害高。",
          starPenalty: 16,
          milkyWayPenalty: 28,
          scoringMode: "heuristic",
        },
        assessment: {
          ...forecastResultFixture.astroAnalysis.assessment,
          astroWindowAvailable: true,
          astroShootable: false,
          skyConditionScore: 24,
          milkyWayGeometryScore: 62,
          transparencyScore: 36,
          dewRiskScore: 82,
          practicalAstroScore: 24,
          cloudBlockerLevel: "high",
          dewRiskLevel: "high",
          astroWeatherBlockers: ["低云偏多，星空银河实际可见性较差。", "降水干扰"],
          labels: {
            astronomicalWindow: "有",
            starShootability: "低",
            milkyWayShootability: "低",
            moonlightImpact: "低",
            cloudBlocker: "高",
            dewRisk: "高",
            windowRecommendation: "仅作备选窗口",
          },
          gearAdviceZh: ["湿度较高，需准备防露带、镜头布和防水收纳。"],
          warmthAdviceZh: "夜间湿冷，需准备防风保暖层。",
        },
      },
    };
    const context = buildDeepSeekForecastContext(astroResult);
    const request = buildDeepSeekForecastExplanationRequest({
      forecastResult: astroResult,
    });
    const payload = readForecastExplanationUserPayload(request);
    const text = JSON.stringify(context);
    const requestText = JSON.stringify(payload.computedForecastFacts);

    expect(context.topicScores).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "stars" }),
        expect.objectContaining({ key: "milkyWay" }),
      ]),
    );
    expect(text).toContain("All values are precomputed deterministic facts");
    expect(payload.computedForecastFacts.targetCode).toBe("astro");
    expect(payload.computedForecastFacts.astro).toMatchObject({
      contextVersion: "astro-night-decision-v1",
      deterministicOnly: true,
      overall: expect.objectContaining({
        astroShootable: false,
        weatherBlockers: expect.arrayContaining(["低云偏多，星空银河实际可见性较差。"]),
      }),
      moon: expect.objectContaining({
        phaseNameZh: "娥眉月",
        illuminationPercent: 31,
      }),
      windows: expect.objectContaining({
        candidateMilkyWay: expect.arrayContaining([
          expect.objectContaining({
            labelZh: "银河候选窗口",
            galacticCenterAltitude: 24,
          }),
        ]),
      }),
      lightPollution: expect.objectContaining({
        deterministicOnly: true,
        dataAvailable: true,
        ambientRiskIndex: 82,
        ambientLevelZh: "很高",
        targetDirectionRisk: 76,
        targetDirectionLevelZh: "高",
        estimatedBortle: expect.objectContaining({
          available: true,
          minClass: 7,
          maxClass: 9,
          rangeLabelZh: "7–9级（保守参考）",
          skyQualityLabelZh: "偏强，需现场确认",
          confidence: "low",
          primaryBaseline: "viirs_national_fallback",
          rangeWidthPolicy: "wide_uncertain",
        }),
        starIndexPenalty: 16,
        milkyWayIndexPenalty: 28,
      }),
    });
    expect(requestText).toContain("astro-night-decision-v1");
    expect(requestText).toContain("天文黑夜");
    expect(requestText).toContain("银河候选窗口");
    expect(requestText).toContain("2026-05-21");
    expect(requestText).not.toContain("前一晚");
    expect(requestText).not.toContain('"date":"2026-05-19"');
    expect(text).toContain("公开银河");
    expect(text).not.toContain("前一晚");
    expect(text).not.toContain('"date":"2026-05-19"');
    expect(requestText).toContain("只解释这些确定性光污染事实");
    expect(requestText).toContain("波特尔只能表述为估算范围");
    expect(requestText).toContain("低云偏多，星空银河实际可见性较差。");
    expect(requestText).not.toContain("localRadiance");
    expect(requestText).not.toContain("surroundingHaloRadiance");
    expect(text).not.toContain("和风天气");
    expect(text).not.toContain("Open-Meteo");
    expect(text).not.toContain("meteoblue");
    expect(text).not.toContain("dataSourceLabelZh");
    expect(requestText).not.toContain("和风天气");
    expect(requestText).not.toContain("Open-Meteo");
    expect(requestText).not.toContain("meteoblue");
    expect(requestText).not.toContain("dataSourceLabelZh");

    const fallbackExplanation = createRuleBasedForecastExplanation(astroResult);
    const fallbackText = JSON.stringify(fallbackExplanation);
    expect(fallbackExplanation.bestPlan.bestDateZh).toContain("2026年5月21日");
    expect(fallbackExplanation.bestPlan.bestWindowZh).toContain("01:10");
    expect(fallbackText).toContain("公开银河");
    expect(fallbackText).not.toContain("前一晚");
    expect(fallbackText).not.toContain('"date":"2026-05-19"');
  });

  it("passes deterministic glow facts to DeepSeek without asking it to score glow", () => {
    const context = buildDeepSeekForecastContext({
      ...forecastResultFixture,
      target: "glow",
    });

    expect(context.topicScores).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "sunriseGlow", score: 75 }),
        expect.objectContaining({ key: "sunsetGlow", score: 62 }),
      ]),
    );
    expect(context.bestWindows[0]).toMatchObject({
      labelZh: expect.any(String),
      score: expect.any(Number),
    });
    expect(context.dailySummaries[0]?.topicScores).toMatchObject({
      sunriseGlowZh: expect.any(String),
      sunsetGlowZh: expect.any(String),
    });
    expect(JSON.stringify(context)).toContain("All values are precomputed deterministic facts");
  });

  it("keeps DeepSeek context provider-neutral and omits raw temperature ranges", () => {
    const context = buildDeepSeekForecastContext({
      ...forecastResultFixture,
      dataNotice:
        "天气数据：和风天气；云层辅助：Open-Meteo；专业增强：meteoblue；地理服务：高德地图。",
      weatherNoticeZh: "天气数据：和风天气；云层辅助：Open-Meteo；专业增强：meteoblue。",
      weatherFusionSummary: {
        primarySource: "和风天气",
        auxiliarySources: ["Open-Meteo", "meteoblue"],
        professionalSourceStatus: "专业增强：meteoblue 通过",
        confidenceLevel: "high",
        conflictStatusZh: "QWeather 与 meteoblue 无明显冲突",
        dataStatusZh: "天气数据：和风天气；云层辅助：Open-Meteo；数据置信度：高",
        missingDataNotes: ["meteoblue 部分辅助字段缺失"],
      },
      weatherMissingDataNotes: ["Open-Meteo 云层辅助字段部分缺失"],
    });
    const text = JSON.stringify(context);

    expect(text).not.toContain("和风天气");
    expect(text).not.toContain("QWeather");
    expect(text).not.toContain("Open-Meteo");
    expect(text).not.toContain("meteoblue");
    expect(text).not.toContain("高德地图");
    expect(text).not.toContain("rawTemperatureRangeZh");
    expect(text).toContain("基础天气");
    expect(text).toContain("云层辅助");
    expect(text).toContain("专业增强");
  });

  it("anchors deterministic fallback interpretation to the selected best day", () => {
    const baseDay = forecastResultFixture.dailySummaries[0];
    const baseBreakdown = forecastResultFixture.targetDailyBreakdown[0];
    if (!baseDay || !baseBreakdown) {
      throw new Error("forecast fixture must include at least one daily summary");
    }
    const laterWindow = {
      label: "清晨云海窗口",
      date: "2026-05-21",
      startTime: "2026-05-21T05:20:00+08:00",
      endTime: "2026-05-21T07:10:00+08:00",
      score: 91,
      target: "cloud_sea" as const,
    };
    const result: ForecastCalculationResult = {
      ...forecastResultFixture,
      bestWindows: [laterWindow],
      dailySummaries: [
        {
          ...baseDay,
          score: 44,
          dedicatedTripRecommendation: "不建议专程前往",
          shortAdvice: "当天降水干扰明显，仅作备选。",
        },
        {
          ...baseDay,
          date: "2026-05-21",
          dateLabelZh: "2026年5月21日 星期四",
          score: 91,
          dedicatedTripRecommendation: "强推荐专程",
          nearbyObservationRecommendation: "已在附近可观察",
          keyWindows: [laterWindow],
          bestShootableWindow: laterWindow,
          shortAdvice: "清晨云海窗口值得专程等待。",
        },
      ],
      targetDailyBreakdown: [
        ...forecastResultFixture.targetDailyBreakdown,
        {
          ...baseBreakdown,
          date: "2026-05-21",
          cloudSea: {
            label: "清晨云海机会",
            score: 91,
            detail: "湿度、低云和地形组合更强。",
          },
        },
      ],
    };

    const explanation = createRuleBasedForecastExplanation(result);

    expect(explanation.conclusion.recommendedDayZh).toContain("2026年5月21日 星期四");
    expect(explanation.conclusion.oneSentenceDecisionZh).toContain("谨慎参考");
    expect(explanation.bestPlan.bestDateZh).toBe("2026年5月21日 星期四");
    expect(explanation.bestPlan.bestWindowZh).toContain("05:20–");
    expect(explanation.bestPlan.primaryTargetZh).toContain("清晨云海");
    expect(explanation.bestPlan.backupPlanZh).toContain("备用题材");
    expect(explanation.weatherTrend.temperatureSummaryZh).toBeTruthy();
    expect(explanation.weatherTrend.rainSummaryZh).toBeTruthy();
    expect(explanation.weatherTrend.windSummaryZh).toBeTruthy();
    expect(explanation.weatherTrend.transparencySummaryZh).toBeTruthy();
    expect(explanation.riskAndGear.keyRisks[0]).toMatch(/（.+）：|暂无高等级风险/);
    expect(explanation.riskAndGear.clothingZh).toBeTruthy();
    expect(explanation.riskAndGear.gearZh).toBeTruthy();
    expect(explanation.finalAdvice.goNoGoZh).toContain("谨慎参考");
    expect(explanation.bestPlan.bestDateZh).not.toBe("2026-05-21");
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
                  conclusion: {
                    titleZh: "黄山光明顶摄影天气决策",
                    summaryZh: "演示数据下清晨窗口较好，但需要实地复核。",
                    recommendedDayZh: "最建议关注 2026年5月20日清晨云海窗口。",
                    recommendationLevelZh: "值得等待",
                    whetherWorthDedicatedTripZh: "谨慎参考",
                    oneSentenceDecisionZh: "可作为计划参考，不建议直接作为唯一出行依据。",
                  },
                  bestPlan: {
                    primaryTargetZh: "清晨云海",
                    bestDateZh: "2026年5月20日",
                    bestWindowZh: "2026年5月20日 05:00–07:00",
                    recommendedArrivalZh: "建议到达：2026年5月20日 04:20 前",
                    whyThisWindowZh: "清晨低云和湿度组合较好。",
                    backupPlanZh: "若云量偏厚，改拍近景或延后到下一窗口。",
                  },
                  weatherTrend: {
                    trendSummaryZh: "未来48小时云量偏多，清晨有短暂开口机会。",
                    temperatureSummaryZh: "山顶估算温度约 19-24°C。",
                    rainSummaryZh: "降水风险低，主要看短临变化。",
                    windSummaryZh: "山顶风力需要防风。",
                    transparencySummaryZh: "通透度一般，远山层次需复核。",
                  },
                  dayByDay: [
                    {
                      dateZh: "2026年5月20日 星期三",
                      recommendationZh: "清晨可观察。",
                      scoreZh: "综合 86 分",
                      temperatureZh: "19-24°C",
                      rainZh: "降水风险低",
                      cloudSeaZh: "云海 86 分",
                      glowZh: "朝霞可关注",
                      sunsetGlowZh: "晚霞仅作备选",
                      astroZh: "有天文窗口但需看云量",
                      transparencyZh: "通透度 71 分",
                      bestWindowZh: "2026年5月20日 05:00–07:00",
                      actionZh: "提前到达机位，复核低云上沿。",
                    },
                  ],
                  subjectAdvice: {
                    cloudSeaZh: "云海机会较高，但白墙风险需现场复核。",
                    sunriseGlowZh: "日出和朝霞可关注。",
                    sunsetGlowZh: "日落后余晖仅作备选。",
                    astroMilkyWayZh: "有天文窗口不代表能拍银河，需看云量。",
                    transparencyZh: "通透度一般。",
                  },
                  riskAndGear: {
                    keyRisks: ["天气与地形仍为演示数据"],
                    clothingZh: "清晨体感偏凉，带防风外套。",
                    gearZh: "三脚架、防潮袋、备用电池。",
                    safetyZh: "保留撤离时间。",
                  },
                  finalAdvice: {
                    goNoGoZh: "谨慎参考。",
                    ifAlreadyNearbyZh: "已在附近可观察。",
                    ifDedicatedTripZh: "不建议只为单一窗口专程。",
                    nextCheckZh: "复核低云、降水和阵风。",
                  },
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

    expect(explanation.conclusion.summaryZh).toContain("演示数据");
    expect(explanation.bestPlan.bestWindowZh).toContain("2026年5月20日 05:00");
    expect(explanation.metadata?.source).toBe("deepseek");
    expect(explanation.metadata?.parseStrategy).toBe("strict_json");
  });

  it("extracts a JSON object from fenced DeepSeek output once before failing over", async () => {
    const payload = {
      ...createRuleBasedForecastExplanation(forecastResultFixture),
      metadata: {
        source: "deepseek" as const,
      },
    };
    const fetcher = async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: `\`\`\`json\n${JSON.stringify(payload)}\n\`\`\``,
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
    const provider = new DeepSeekProvider({
      enabled: true,
      realModeEnabled: true,
      apiKey: "sk-test",
      fetcher,
    });

    const explanation = await provider.generateForecastExplanation({
      forecastResult: forecastResultFixture,
    });

    expect(explanation.metadata?.source).toBe("deepseek");
    expect(explanation.metadata?.parseStrategy).toBe("fenced_json");
    expect(explanation.conclusion.oneSentenceDecisionZh).toBe(
      payload.conclusion.oneSentenceDecisionZh,
    );
  });

  it("extracts JSON from DeepSeek output with surrounding prose", async () => {
    const payload = {
      ...createRuleBasedForecastExplanation(forecastResultFixture),
      metadata: {
        source: "deepseek" as const,
      },
    };
    const fetcher = async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: `Here is the concise report:\n${JSON.stringify(payload)}\nEnd.`,
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
    const provider = new DeepSeekProvider({
      enabled: true,
      realModeEnabled: true,
      apiKey: "sk-test",
      fetcher,
    });

    const explanation = await provider.generateForecastExplanation({
      forecastResult: forecastResultFixture,
    });

    expect(explanation.metadata?.parseStrategy).toBe("extracted_json");
    expect(explanation.conclusion.oneSentenceDecisionZh).toBe(
      payload.conclusion.oneSentenceDecisionZh,
    );
  });

  it("normalizes useful JSON with Chinese field names", async () => {
    const fetcher = async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  "\u7ed3\u8bba":
                    "\u6e05\u6668\u7a97\u53e3\u53ef\u4f5c\u4e3a\u4e3b\u8ba1\u5212\uff0c\u4e13\u7a0b\u51fa\u53d1\u524d\u4ecd\u9700\u590d\u6838\u4f4e\u4e91\u548c\u9635\u98ce\u3002",
                  "\u7406\u7531": [
                    "\u4f4e\u4e91\u3001\u6e7f\u5ea6\u548c\u5730\u5f62\u4fe1\u53f7\u66f4\u96c6\u4e2d\uff0c\u4f46\u4e0d\u8986\u76d6\u786e\u5b9a\u6027\u8bc4\u5206\u3002",
                  ],
                  "\u5efa\u8bae": [
                    "\u6309\u4e3b\u7a97\u53e3\u63d0\u524d\u5230\u4f4d\uff0c\u82e5\u4f4e\u4e91\u4e0d\u6210\u7acb\u5219\u6539\u62cd\u8fd1\u666f\u3002",
                  ],
                  "\u98ce\u9669": [
                    "\u77ed\u4e34\u964d\u6c34\u3001\u767d\u5899\u548c\u9635\u98ce\u4ecd\u9700\u73b0\u573a\u590d\u6838\u3002",
                  ],
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
    const provider = new DeepSeekProvider({
      enabled: true,
      realModeEnabled: true,
      apiKey: "sk-test",
      fetcher,
    });

    const explanation = await provider.generateForecastExplanation({
      forecastResult: forecastResultFixture,
    });

    expect(explanation.metadata?.source).toBe("deepseek");
    expect(explanation.metadata?.parseStrategy).toBe("strict_json");
    expect(explanation.conclusion.summaryZh).toContain("\u6e05\u6668\u7a97\u53e3");
    expect(explanation.riskAndGear.keyRisks[0]).toContain("\u77ed\u4e34\u964d\u6c34");
  });

  it("uses useful plain Chinese text as a successful fallback explanation", async () => {
    const scoresBefore = JSON.stringify(forecastResultFixture.scores);
    const fetcher = async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content:
                  "\u7ed3\u8bba\uff1a\u6e05\u6668\u7a97\u53e3\u53ef\u4f5c\u4e3a\u4e3b\u8ba1\u5212\uff0c\u4f46\u4e0d\u8981\u53ea\u4e3a\u5355\u4e00\u4fe1\u53f7\u4e13\u7a0b\u3002\n\u7406\u7531\uff1a\u4f4e\u4e91\u3001\u6e7f\u5ea6\u548c\u5730\u5f62\u4fe1\u53f7\u66f4\u96c6\u4e2d\uff0c\u4ecd\u9700\u77ed\u4e34\u590d\u6838\u3002\n\u5efa\u8bae\uff1a\u6309\u4e3b\u7a97\u53e3\u63d0\u524d\u5230\u4f4d\uff0c\u5931\u8d25\u65f6\u6539\u62cd\u8fd1\u666f\u3002\n\u98ce\u9669\uff1a\u77ed\u4e34\u964d\u6c34\u3001\u767d\u5899\u548c\u9635\u98ce\u4ecd\u9700\u73b0\u573a\u590d\u6838\u3002",
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
    const provider = new DeepSeekProvider({
      enabled: true,
      realModeEnabled: true,
      apiKey: "sk-test",
      fetcher,
    });

    const explanation = await provider.generateForecastExplanation({
      forecastResult: forecastResultFixture,
    });

    expect(explanation.metadata).toMatchObject({
      source: "deepseek",
      parseStrategy: "plain_text_fallback",
      fallbackUsed: true,
    });
    expect(explanation.conclusion.summaryZh).toContain("\u6e05\u6668\u7a97\u53e3");
    expect(JSON.stringify(forecastResultFixture.scores)).toBe(scoresBefore);
  });

  it("extracts DeepSeek content array text parts", async () => {
    const payload = createRuleBasedForecastExplanation(forecastResultFixture);
    const fetcher = async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              index: 0,
              finish_reason: "stop",
              message: {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify(payload),
                  },
                ],
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    const provider = new DeepSeekProvider({
      enabled: true,
      realModeEnabled: true,
      apiKey: "sk-array",
      fetcher,
    });

    const result = await provider.generateForecastExplanationWithDiagnostics({
      forecastResult: forecastResultFixture,
    });

    expect(result.explanation.metadata?.parseStrategy).toBe("strict_json");
    expect(result.requestDiagnostics).toMatchObject({
      attempts: 1,
      finishReason: "stop",
      finalFinishReason: "stop",
      contentType: "array",
      finalContentType: "array",
      messageKeys: ["content"],
    });
    expect(result.requestDiagnostics.contentLength).toBeGreaterThan(0);
    expect(JSON.stringify(result)).not.toContain("sk-array");
  });

  it("extracts DeepSeek choices[0].text content", async () => {
    const payload = createRuleBasedForecastExplanation(forecastResultFixture);
    const fetcher = async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              index: 0,
              finish_reason: "stop",
              text: JSON.stringify(payload),
              message: {},
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    const provider = new DeepSeekProvider({
      enabled: true,
      realModeEnabled: true,
      apiKey: "sk-choice-text",
      fetcher,
    });

    const result = await provider.generateForecastExplanationWithDiagnostics({
      forecastResult: forecastResultFixture,
    });

    expect(result.explanation.metadata?.parseStrategy).toBe("strict_json");
    expect(result.requestDiagnostics).toMatchObject({
      attempts: 1,
      finishReason: "stop",
      contentType: "choice_text",
      finalContentType: "choice_text",
    });
    expect(JSON.stringify(result)).not.toContain("sk-choice-text");
  });

  it("retries DeepSeek 400 unsupported response_format without response_format", async () => {
    const payload = createRuleBasedForecastExplanation(forecastResultFixture);
    const requestBodies: unknown[] = [];
    const fetcher = async (_input: string | URL, init?: RequestInit) => {
      const requestBody = JSON.parse(String(init?.body));
      requestBodies.push(requestBody);
      if (requestBodies.length === 1) {
        return new Response(
          JSON.stringify({
            error: {
              type: "invalid_request_error",
              code: "unsupported_parameter",
              message: "Unsupported parameter: response_format",
            },
          }),
          {
            status: 400,
            headers: { "Content-Type": "application/json", "x-request-id": "ds-req-1" },
          },
        );
      }

      return new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify(payload) } }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };
    const provider = new DeepSeekProvider({
      enabled: true,
      realModeEnabled: true,
      apiKey: "sk-response-format",
      fetcher,
    });

    const result = await provider.generateForecastExplanationWithDiagnostics({
      forecastResult: forecastResultFixture,
    });

    expect(requestBodies).toHaveLength(2);
    expect(requestBodies[0]).toMatchObject({
      model: "deepseek-v4-pro",
      response_format: { type: "json_object" },
    });
    expect(requestBodies[1]).not.toHaveProperty("response_format");
    expect(result.requestDiagnostics).toMatchObject({
      attempts: 2,
      compatibilityFallbackUsed: true,
      disabledResponseFormat: true,
      firstFailureUpstreamCode: "unsupported_parameter",
    });
    expect(JSON.stringify(result)).not.toContain("sk-response-format");
    expect(result.explanation.metadata?.parseStrategy).toBe("strict_json");
  });

  it("retries DeepSeek 400 unsupported reasoning_effort without reasoning_effort", async () => {
    const payload = createRuleBasedForecastExplanation(forecastResultFixture);
    const requestBodies: unknown[] = [];
    const fetcher = async (_input: string | URL, init?: RequestInit) => {
      const requestBody = JSON.parse(String(init?.body));
      requestBodies.push(requestBody);
      if (requestBodies.length === 1) {
        return new Response(
          JSON.stringify({
            error: {
              type: "invalid_request_error",
              code: "unsupported_parameter",
              message: "Unsupported parameter: reasoning_effort",
            },
          }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }

      return new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify(payload) } }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };
    const provider = new DeepSeekProvider({
      enabled: true,
      realModeEnabled: true,
      apiKey: "sk-reasoning",
      jsonOutputEnabled: false,
      thinkingEnabled: true,
      reasoningEffort: "medium",
      fetcher,
    });

    const result = await provider.generateForecastExplanationWithDiagnostics({
      forecastResult: forecastResultFixture,
    });

    expect(requestBodies).toHaveLength(2);
    expect(requestBodies[0]).toMatchObject({ reasoning_effort: "medium" });
    expect(requestBodies[1]).not.toHaveProperty("reasoning_effort");
    expect(result.requestDiagnostics).toMatchObject({
      attempts: 2,
      compatibilityFallbackUsed: true,
      disabledReasoningEffort: true,
      firstFailureUpstreamCode: "unsupported_parameter",
    });
  });

  it("does not compatibility-retry DeepSeek 400 invalid model diagnostics", async () => {
    const fetcher = async () =>
      new Response(
        JSON.stringify({
          error: {
            type: "invalid_request_error",
            code: "model_not_found",
            message: "Model deepseek-v4-pro not found",
          },
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    const provider = new DeepSeekProvider({
      enabled: true,
      realModeEnabled: true,
      apiKey: "sk-invalid-model",
      fetcher,
    });

    await expect(
      provider.generateForecastExplanation({
        forecastResult: forecastResultFixture,
      }),
    ).rejects.toMatchObject({
      errorCategory: "provider_http_error",
      statusCode: 400,
      attempts: 1,
      upstreamErrorCode: "model_not_found",
      upstreamMessageSanitized: "Model deepseek-v4-pro not found",
    });
  });

  it("returns safe DeepSeek 429 upstream diagnostics", async () => {
    const fetcher = async () =>
      new Response(
        JSON.stringify({
          error: {
            type: "rate_limit_error",
            code: "rate_limit_exceeded",
            message: "Too many requests",
          },
        }),
        { status: 429, headers: { "Content-Type": "application/json" } },
      );
    const provider = new DeepSeekProvider({
      enabled: true,
      realModeEnabled: true,
      apiKey: "sk-rate-limit",
      fetcher,
    });

    await provider
      .generateForecastExplanation({
        forecastResult: forecastResultFixture,
      })
      .catch((error) => {
        expect(isDeepSeekProviderError(error)).toBe(true);
        expect(error).toMatchObject({
          errorCategory: "provider_http_error",
          statusCode: 429,
          attempts: 1,
          upstreamErrorCode: "rate_limit_exceeded",
          upstreamErrorType: "rate_limit_error",
          upstreamMessageSanitized: "Too many requests",
        });
        expect(JSON.stringify(error)).not.toContain("sk-rate-limit");
      });
  });

  it("classifies empty DeepSeek content separately from JSON parse errors", async () => {
    let calls = 0;
    const fetcher = async () => {
      calls += 1;
      return new Response(
        JSON.stringify({
          choices: [
            {
              index: 0,
              finish_reason: "stop",
              message: {
                content: "",
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
      apiKey: "sk-empty",
      fetcher,
    });

    await expect(
      provider.generateForecastExplanation({
        forecastResult: forecastResultFixture,
      }),
    ).rejects.toMatchObject({
      errorCategory: "provider_parse_error",
      parseStrategy: "failed",
      messageZh: "DeepSeek 返回内容为空。",
      attempts: 3,
      compatibilityFallbackUsed: true,
      disabledResponseFormat: true,
      emptyContentFallbackUsed: true,
      finishReason: "stop",
      contentType: "string",
      contentLength: 0,
      messageKeys: ["content"],
      rawResponseSizeChars: expect.any(Number),
    });
    expect(calls).toBe(3);
  });

  it("retries empty DeepSeek content without response_format and succeeds", async () => {
    const payload = createRuleBasedForecastExplanation(forecastResultFixture);
    const requestBodies: unknown[] = [];
    const fetcher = async (_input: string | URL, init?: RequestInit) => {
      const requestBody = JSON.parse(String(init?.body));
      requestBodies.push(requestBody);
      if (requestBodies.length === 1) {
        return new Response(
          JSON.stringify({
            choices: [
              {
                index: 0,
                finish_reason: "stop",
                message: { content: "" },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      return new Response(
        JSON.stringify({
          choices: [
            {
              index: 0,
              finish_reason: "stop",
              message: {
                content: JSON.stringify(payload),
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };
    const provider = new DeepSeekProvider({
      enabled: true,
      realModeEnabled: true,
      apiKey: "sk-empty-retry",
      fetcher,
    });

    const result = await provider.generateForecastExplanationWithDiagnostics({
      forecastResult: forecastResultFixture,
    });

    expect(requestBodies).toHaveLength(2);
    expect(requestBodies[0]).toMatchObject({ response_format: { type: "json_object" } });
    expect(requestBodies[1]).not.toHaveProperty("response_format");
    expect(result.requestDiagnostics).toMatchObject({
      attempts: 2,
      compatibilityFallbackUsed: true,
      disabledResponseFormat: true,
      emptyContentFallbackUsed: true,
      finishReason: "stop",
      contentType: "string",
      finalFinishReason: "stop",
      finalContentType: "string",
      messageKeys: ["content"],
    });
    expect(result.explanation.metadata?.parseStrategy).toBe("strict_json");
    expect(JSON.stringify(result)).not.toContain("sk-empty-retry");
  });

  it("uses a minimal text-compatible request after repeated empty content", async () => {
    const requestBodies: Record<string, unknown>[] = [];
    const fetcher = async (_input: string | URL, init?: RequestInit) => {
      const requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      requestBodies.push(requestBody);
      if (requestBodies.length < 3) {
        return new Response(
          JSON.stringify({
            choices: [
              {
                index: 0,
                finish_reason: "stop",
                message: { content: "" },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      return new Response(
        JSON.stringify({
          choices: [
            {
              index: 0,
              finish_reason: "stop",
              message: {
                content:
                  "是否值得去：清晨窗口可作为主计划，但不要只为单一信号专程。\n主要窗口：按确定性主窗口提前到位，现场复核低云和降水。\n主要风险：短临降水、白墙和阵风仍需复核。\n备选策略：失败时改拍近景或远山层次。\n复核重点：出发前复核云层、降水和风。",
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };
    const provider = new DeepSeekProvider({
      enabled: true,
      realModeEnabled: true,
      apiKey: "sk-text-fallback",
      fetcher,
    });

    const result = await provider.generateForecastExplanationWithDiagnostics({
      forecastResult: forecastResultFixture,
    });

    expect(requestBodies).toHaveLength(3);
    expect(requestBodies[2]).toMatchObject({
      model: "deepseek-v4-pro",
      temperature: expect.any(Number),
      max_tokens: expect.any(Number),
      stream: false,
    });
    expect(requestBodies[2]).not.toHaveProperty("response_format");
    expect(requestBodies[2]).not.toHaveProperty("reasoning_effort");
    expect(JSON.stringify(requestBodies[2])).toContain("是否值得去");
    expect(result.requestDiagnostics).toMatchObject({
      attempts: 3,
      compatibilityFallbackUsed: true,
      disabledResponseFormat: true,
      emptyContentFallbackUsed: true,
      finishReason: "stop",
      contentType: "string",
    });
    expect(result.explanation.metadata).toMatchObject({
      parseStrategy: "plain_text_fallback",
      fallbackUsed: true,
    });
    expect(result.explanation.conclusion.summaryZh).toContain("清晨窗口");
    expect(JSON.stringify(result)).not.toContain("sk-text-fallback");
  });

  it("keeps DeepSeek empty-content compatibility fallbacks bounded when reasoning is enabled", async () => {
    const requestBodies: Record<string, unknown>[] = [];
    const fetcher = async (_input: string | URL, init?: RequestInit) => {
      const requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      requestBodies.push(requestBody);
      if (requestBodies.length < 4) {
        return new Response(
          JSON.stringify({
            choices: [
              {
                index: 0,
                finish_reason: "stop",
                message: { content: "" },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      return new Response(
        JSON.stringify({
          choices: [
            {
              index: 0,
              finish_reason: "stop",
              message: {
                content:
                  "是否值得去：可以按确定性窗口轻量执行，但不建议只为单一信号远程专程。\n主要窗口：优先执行已计算出的主窗口。\n主要风险：降水、云层和风仍需临近复核。\n备选策略：若窗口失败，转为近景或城市夜景。\n复核重点：出发前复核云量、降水和风。",
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };
    const provider = new DeepSeekProvider({
      enabled: true,
      realModeEnabled: true,
      apiKey: "sk-thinking-empty",
      thinkingEnabled: true,
      reasoningEffort: "medium",
      fetcher,
    });

    const result = await provider.generateForecastExplanationWithDiagnostics({
      forecastResult: forecastResultFixture,
    });

    expect(requestBodies).toHaveLength(4);
    expect(requestBodies[0]).toMatchObject({
      response_format: { type: "json_object" },
      reasoning_effort: "medium",
    });
    expect(requestBodies[1]).not.toHaveProperty("response_format");
    expect(requestBodies[1]).toHaveProperty("reasoning_effort", "medium");
    expect(requestBodies[2]).toMatchObject({ response_format: { type: "json_object" } });
    expect(requestBodies[2]).not.toHaveProperty("reasoning_effort");
    expect(requestBodies[3]).not.toHaveProperty("response_format");
    expect(requestBodies[3]).not.toHaveProperty("reasoning_effort");
    expect(JSON.stringify(requestBodies[3])).toContain("是否值得去");
    expect(result.requestDiagnostics).toMatchObject({
      attempts: 4,
      compatibilityFallbackUsed: true,
      disabledResponseFormat: true,
      disabledReasoningEffort: true,
      emptyContentFallbackUsed: true,
    });
    expect(result.explanation.metadata?.parseStrategy).toBe("plain_text_fallback");
    expect(JSON.stringify(result)).not.toContain("sk-thinking-empty");
  });

  it("rejects oversized prompts with a structured prompt_too_large error", () => {
    const oversizedResult: ForecastCalculationResult = {
      ...forecastResultFixture,
      place: {
        ...forecastResultFixture.place,
        name: "超长地点".repeat(5000),
      },
    };

    try {
      buildDeepSeekForecastExplanationRequest(
        {
          forecastResult: oversizedResult,
        },
        {
          promptMaxChars: 3000,
        },
      );
      throw new Error("expected prompt size guard to reject the request");
    } catch (error) {
      expect(isDeepSeekProviderError(error)).toBe(true);
      expect(error).toMatchObject({
        errorCategory: "prompt_too_large",
        promptSizeChars: expect.any(Number),
      });
    }
  });

  it("classifies DeepSeek timeout without exposing secrets", async () => {
    const fetcher = async () => {
      throw new DOMException("The operation was aborted.", "AbortError");
    };
    const provider = new DeepSeekProvider({
      enabled: true,
      realModeEnabled: true,
      apiKey: "sk-timeout-secret",
      fetcher,
    });

    await expect(
      provider.generateForecastExplanation({
        forecastResult: forecastResultFixture,
      }),
    ).rejects.toMatchObject({
      errorCategory: "timeout",
      messageZh: "DeepSeek 服务请求超时。",
    });
    await provider
      .generateForecastExplanation({
        forecastResult: forecastResultFixture,
      })
      .catch((error) => {
        expect(isDeepSeekProviderError(error)).toBe(true);
        expect(JSON.stringify(error)).not.toContain("sk-timeout-secret");
      });
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

  it("classifies upstream DeepSeek unauthorized responses without exposing the key", async () => {
    let calls = 0;
    const fetcher = async (_input: string | URL, init?: RequestInit) => {
      calls += 1;
      expect(init?.headers).toMatchObject({
        Authorization: "Bearer sk-test-secret",
      });
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: {
          "Content-Type": "application/json",
        },
      });
    };
    const provider = new DeepSeekProvider({
      enabled: true,
      realModeEnabled: true,
      apiKey: "sk-test-secret",
      fetcher,
    });

    await expect(provider.testConnection()).rejects.toMatchObject({
      errorCategory: "provider_http_error",
      messageZh: "DeepSeek API Key 无效或权限不足。",
      statusCode: 401,
    });
    await expect(provider.testConnection()).rejects.not.toMatchObject({
      message: expect.stringContaining("sk-test-secret"),
    });
    expect(calls).toBe(2);
  });

  it("validates DeepSeek forecast explanation output shape", () => {
    const provider = new DeepSeekProvider({ mode: "mock" });
    const parsed = provider.validateJsonOutput(
      forecastAiExplanationSchema,
      JSON.stringify({
        conclusion: {
          titleZh: "综合解读",
          summaryZh: "清晨窗口可参考。",
          recommendedDayZh: "最建议关注 2026年5月20日。",
          recommendationLevelZh: "谨慎参考",
          whetherWorthDedicatedTripZh: "谨慎参考",
          oneSentenceDecisionZh: "可观察但不宜作为唯一目标。",
        },
        bestPlan: {
          primaryTargetZh: "清晨云海",
          bestDateZh: "2026年5月20日",
          bestWindowZh: "2026年5月20日 05:00–07:00",
          recommendedArrivalZh: "建议到达：2026年5月20日 04:20 前",
          whyThisWindowZh: "云量窗口可用。",
          backupPlanZh: "改拍近景。",
        },
        weatherTrend: {
          trendSummaryZh: "云量偏多。",
          temperatureSummaryZh: "19-24°C。",
          rainSummaryZh: "降水风险低。",
          windSummaryZh: "风力可控。",
          transparencySummaryZh: "通透度一般。",
        },
        dayByDay: [
          {
            dateZh: "2026年5月20日",
            recommendationZh: "谨慎参考",
            scoreZh: "综合 70 分",
            temperatureZh: "19-24°C",
            rainZh: "降水风险低",
            cloudSeaZh: "云海 70 分",
            glowZh: "朝霞 60 分",
            sunsetGlowZh: "晚霞 50 分",
            astroZh: "天气待复核",
            transparencyZh: "通透度 60 分",
            bestWindowZh: "2026年5月20日 05:00–07:00",
            actionZh: "提前到位。",
          },
        ],
        subjectAdvice: {
          cloudSeaZh: "云海可观察。",
          sunriseGlowZh: "朝霞可参考。",
          sunsetGlowZh: "晚霞仅作备选。",
          astroMilkyWayZh: "银河需复核云量。",
          transparencyZh: "通透度一般。",
        },
        riskAndGear: {
          keyRisks: ["演示数据"],
          clothingZh: "带外套。",
          gearZh: "带三脚架。",
          safetyZh: "注意安全。",
        },
        finalAdvice: {
          goNoGoZh: "谨慎参考。",
          ifAlreadyNearbyZh: "可观察。",
          ifDedicatedTripZh: "不建议只为单一窗口专程。",
          nextCheckZh: "复核短临天气。",
        },
      }),
    );

    expect(parsed.bestPlan.backupPlanZh).toBe("改拍近景。");
  });
});

function professionalHourlyRow(
  time: string,
): NonNullable<ForecastCalculationResult["professionalHourlyData"]>[number] {
  return {
    time,
    dateLabel: time.slice(0, 10),
    timeLabel: time.slice(11, 16),
    weatherCode: "cloudy",
    weatherText: "cloudy",
    cloudSeaSignal: "形成信号",
    cloudSeaSignalLevel: "watch",
    cloudTotalPercent: 72,
    cloudHighPercent: 24,
    cloudMidPercent: 36,
    cloudLowPercent: 48,
    cloudLayerBasis: "explicit_layers",
    rawTemperatureC: 16,
    terrainAdjustedTemperatureC: null,
    displayedTemperatureC: 16,
    temperatureBasis: "raw_grid",
    temperatureAdjustmentC: null,
    temperatureBasisNoteZh: "raw",
    dewPointC: 14,
    dewPointSpreadC: 2,
    relativeHumidityPercent: 88,
    precipitationAmountMm: 0,
    precipitationProbabilityPercent: 10,
    visibilityMeters: 18000,
    windSpeedMs: 1.8,
    windDirectionDeg: 120,
  };
}

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
    forecastRangeLabel: "2026年5月20日 08:00–5月22日 08:00",
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
    formationScore: 86,
    shootableScore: 82,
    cloudSeaOpportunityScore: 86,
    whiteoutRiskScore: 38,
    lightAlignedScore: 94,
    confidence: 76,
    scoreCalibration: cloudSeaScoreCalibrationForTest(),
    labels: {
      formationOpportunity: "高",
      shootableOpportunity: "高",
      whiteoutRisk: "低",
      bestWindowLabel: "清晨云海窗口 05:00 - 07:00",
    },
    terrainSupport: {
      score: 90,
      level: "高",
      terrainMode: "high_mountain",
      selectedSpotElevationMeters: 1860,
      nearbyValleyElevationMeters: 980,
      localReliefMeters: 1484,
      terrainType: "summit",
      exposureType: "exposed",
      confidence: "medium",
      messageZh: "机位高于周边谷地，高差和开阔度支持俯拍云海。",
    },
    rainOpening: {
      rainSupportSignal: false,
      activeRainDuringWindow: false,
      postRainOpeningChance: "low",
      messageZh: "降水对云海形成的支持不明显，仍以低云、湿度和能见度为主。",
    },
    travelScore: 82,
    recommendationLabel: "推荐重点关注",
    confidenceLevel: "medium",
    bestCloudSeaWindow: {
      label: "清晨云海窗口 05:00 - 07:00",
      date: "2026-05-21",
      startTime: "2026-05-21T05:00:00+08:00",
      endTime: "2026-05-21T07:00:00+08:00",
      score: 82,
      formationScore: 86,
      shootableScore: 82,
      whiteoutRiskScore: 38,
      lightAlignedScore: 94,
      target: "cloud_sea",
      phase: "observation",
      noteZh: "清晨云海窗口值得等待，现场重点复核云雾上沿和能见度。",
      riskTag: "白墙风险低",
    },
    bestCloudSeaWindows: [
      {
        label: "清晨云海窗口 05:00 - 07:00",
        date: "2026-05-21",
        startTime: "2026-05-21T05:00:00+08:00",
        endTime: "2026-05-21T07:00:00+08:00",
        score: 82,
        formationScore: 86,
        shootableScore: 82,
        whiteoutRiskScore: 38,
        lightAlignedScore: 94,
        target: "cloud_sea",
        phase: "observation",
        noteZh: "清晨云海信号可等待，现场重点复核云雾上沿和能见度。",
        riskTag: "白墙风险低",
      },
    ],
    watchableCloudSeaWindows: [],
    notRecommendedCloudSeaWindows: [],
    dailyCloudSea: [
      {
        date: "2026-05-21",
        dateLabelZh: "2026年5月21日 星期四",
        formationScore: 86,
        opportunityScore: 86,
        shootableScore: 82,
        whiteoutRiskScore: 38,
        lightAlignedScore: 94,
        confidence: 76,
        labels: {
          formationOpportunity: "高",
          shootableOpportunity: "高",
          whiteoutRisk: "低",
          bestWindowLabel: "清晨云海窗口 05:00 - 07:00",
        },
        travelScore: 82,
        bestWindow: {
          label: "清晨云海窗口 05:00 - 07:00",
          date: "2026-05-21",
          startTime: "2026-05-21T05:00:00+08:00",
          endTime: "2026-05-21T07:00:00+08:00",
          score: 82,
          formationScore: 86,
          shootableScore: 82,
          whiteoutRiskScore: 38,
          lightAlignedScore: 94,
          target: "cloud_sea",
          phase: "observation",
          noteZh: "清晨云海信号可等待，现场重点复核云雾上沿和能见度。",
          riskTag: "白墙风险低",
        },
        rainOpening: {
          rainSupportSignal: false,
          activeRainDuringWindow: false,
          postRainOpeningChance: "low",
          messageZh: "降水对云海形成的支持不明显，仍以低云、湿度和能见度为主。",
        },
        onSiteCheckpoints: ["复核云雾上沿是否低于机位", "复核远山层次和能见度是否可用"],
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
    colorCarrierScore: 78,
    precipitationDisruptionRisk: 16,
    visibilityColorQualityScore: 82,
    practicalGlowScore: 72,
    occurrenceProbabilityPercent: 75,
    vividnessIndex: 79,
    vividnessLevel: "strong",
    practicalSuitabilityScore: 72,
    calibrationMode: "heuristic",
    providerAgreement: {
      status: "unavailable",
      providerCount: 1,
      modelCount: 1,
      modelSpread: null,
      confidenceAdjustment: 6,
      summaryZh: "单一来源，暂不判断模型一致性",
      sources: [
        {
          providerCode: "mock",
          providerLabelZh: "模拟数据",
          sourceId: "mock",
          coverageHours: 2,
        },
      ],
    },
    scoreBreakdown: {
      colorCarrierScore: 78,
      lowCloudObstructionRisk: 38,
      visibilityColorQualityScore: 82,
      precipitationDisruptionRisk: 16,
      terrainScore: 72,
      windHumidityScore: 76,
      occurrenceProbabilityPercent: 75,
      vividnessIndex: 79,
      practicalSuitabilityScore: 72,
      confidence: 72,
      providerCount: 1,
      modelCount: 1,
      modelSpread: null,
      calibrationMode: "heuristic",
      missingDataReasons: ["provider_model_agreement_unavailable"],
      modelResults: [],
    },
    confidence: 72,
    labels: {
      sunriseGlowOpportunity: "高",
      sunsetGlowOpportunity: "中",
      lowCloudObstruction: "低",
      colorCarrier: "好",
      bestWindowLabel: "最佳霞光窗口：2026-05-21 朝霞峰值窗口 04:45-05:35",
      watchableWindowLabel: "可观察窗口：暂无",
      notRecommendedWindowLabel: "不建议窗口：暂无",
    },
    glowTravelScore: 72,
    rainOverlapsSunriseWindow: false,
    rainOverlapsSunsetWindow: false,
    postRainOpeningChance: "low",
    glowWindowRainRisk: "low",
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
    watchableGlowWindows: [],
    notRecommendedGlowWindows: [],
    canonicalWindows: [],
    diagnostics: [],
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
    aerosolAssessment: {
      availability: "available",
      confidence: "high",
      state: "favorable_scatter",
      stateLabelZh: "散射条件较有利",
      implicationZh: "低角度光线有一定散射载体，若中高云配合，霞光颜色更容易铺开。",
      noteZh: "气溶胶按区域参考处理，只解释透明度和散射倾向，不代表机位实测。",
      scoreImpact: 4,
      aerosolScore: 82,
      aerosolOpticalDepth550: 0.12,
      pm25: 18,
      pm10: 32,
      dust: 8,
      visibilityKm: 18,
      validTime: "2026-05-21T04:00:00+08:00",
      sourceResolution: "1h",
    },
    aerosolEvidence: [
      {
        label: "AOD 550nm",
        value: "0.120",
        effect: "positive",
        noteZh: "中等气溶胶可能增强低角度散射；过高时会压低通透度和色彩纯度。",
      },
      {
        label: "大气结论",
        value: "散射条件较有利",
        effect: "positive",
        noteZh: "低角度光线有一定散射载体，若中高云配合，霞光颜色更容易铺开。",
      },
    ],
    terrainObstructionAssessments: [
      {
        phase: "sunrise",
        date: "2026-05-21",
        solarAzimuthDegrees: 72,
        solarElevationDegrees: 6,
        terrainHorizonAngleDegrees: 4.8,
        solarClearanceDegrees: 1.2,
        obstructionStatus: "clear",
        confidence: "high",
        dataAvailable: true,
        labelZh: "日出方向地形遮挡",
        noteZh: "日出方向低角度光线有较好地形余量，遮挡不是主要风险。",
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
    travelRecommendations: ["朝霞：建议日出前 40-60 分钟到达机位，先完成构图、测光和安全检查。"],
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
  astroAnalysis: {
    starsScore: 58,
    milkyWayScore: 44,
    astroConditionScore: 52,
    astroPracticalScore: 44,
    astronomicalWindowScore: 52,
    skyConditionScore: 44,
    milkyWayGeometryScore: 38,
    moonlightImpactScore: 45,
    moonImpactScore: 45,
    transparencyScore: 71,
    dewRiskScore: 28,
    practicalAstroScore: 44,
    astroTravelScore: 52,
    recommendationLabel: "谨慎参考",
    confidenceLevel: "medium",
    astroWindowAvailable: false,
    astroShootable: false,
    labels: {
      astronomicalWindow: "无",
      starShootability: "低",
      milkyWayShootability: "低",
      moonlightImpact: "中",
      cloudBlocker: "低",
      dewRisk: "低",
      windowRecommendation: "不建议窗口",
    },
    cloudBlockerLevel: "low",
    dewRiskLevel: "low",
    tripodWindRisk: "low",
    assessment: {
      astronomicalWindowScore: 52,
      skyConditionScore: 44,
      milkyWayGeometryScore: 38,
      moonlightImpactScore: 45,
      transparencyScore: 71,
      dewRiskScore: 28,
      practicalAstroScore: 44,
      astroWindowAvailable: false,
      astroShootable: false,
      labels: {
        astronomicalWindow: "无",
        starShootability: "低",
        milkyWayShootability: "低",
        moonlightImpact: "中",
        cloudBlocker: "低",
        dewRisk: "低",
        windowRecommendation: "不建议窗口",
      },
      moonImpactLevel: "medium",
      cloudBlockerLevel: "low",
      dewRiskLevel: "low",
      tripodWindRisk: "low",
      astroWeatherBlockers: [],
      moonImpactReasonsZh: [],
      gearAdviceZh: ["三脚架、头灯、备用电池和离线导航保持常备。"],
      warmthAdviceZh: "夜间建议准备防风保暖层。",
    },
    gearAdviceZh: ["三脚架、头灯、备用电池和离线导航保持常备。"],
    warmthAdviceZh: "夜间建议准备防风保暖层。",
    bestAstroWindows: [],
    dailyAstro: [],
    moonlessNightWindows: [],
    astronomicalNightWindows: [],
    milkyWayCandidateWindows: [],
    recommendedMilkyWayWindows: [],
    lightPollution: {
      available: false,
      dataAvailable: false,
      unavailableReason: "dataset_missing",
      ambientRiskLevel: "insufficient",
      ambientRiskLevelLabelZh: "数据不足",
      directionalRisk: [],
      confidence: "low",
      sampleCount: 0,
      validSampleCount: 0,
      lightPollutionNoteZh: "光污染数据暂缺；未按无光污染处理，需现场确认城市光穹与地平线环境。",
      starPenalty: 0,
      milkyWayPenalty: 0,
      scoringMode: "heuristic",
    },
    cloudEvidence: [],
    visibilityEvidence: [],
    moonEvidence: [],
    terrainEvidence: [],
    lightPollutionEvidence: [
      {
        label: "光污染影响",
        value: "数据暂缺",
        effect: "neutral",
        noteZh: "光污染数据暂缺；未按无光污染处理，需现场确认城市光穹与地平线环境。",
      },
    ],
    weatherBlockers: [],
    riskReasons: ["光污染数据暂缺；未按无光污染处理，需现场确认城市光穹与地平线环境。"],
    opportunityReasons: [],
    travelRecommendations: [],
    backupPlans: [],
    missingDataNotes: ["天气数据当前为演示数据，正式出行前需要复核真实预报。"],
    dataMode: "mock",
  },
  terrainSummary: {
    latitudeWgs84: 30.1328,
    longitudeWgs84: 118.171,
    latitudeGcj02: 30.1351,
    longitudeGcj02: 118.1767,
    elevationMeters: 1860,
    elevationSource: "manual",
    elevationConfidence: "high",
    terrainType: "summit",
    exposureType: "exposed",
    viewingDirection: "panoramic",
    nearbyValleyElevationMeters: 380,
    localReliefMeters: 1484,
    terrainNotesZh: "山顶平台与周边谷地高差明显。",
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
      latitudeWgs84: 30.1328,
      longitudeWgs84: 118.171,
      latitudeGcj02: 30.1351,
      longitudeGcj02: 118.1767,
      elevationMeters: 1860,
      elevationSource: "manual",
      elevationConfidence: "high",
      terrainType: "summit",
      exposureType: "exposed",
      viewingDirection: "panoramic",
      nearbyValleyElevationMeters: 380,
      localReliefMeters: 1484,
      terrainNotesZh: "山顶平台与周边谷地高差明显。",
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
  currentWeather: {
    providerCode: "mock",
    providerLabelZh: "演示数据",
    dataMode: "mock",
    observedAt: "2026-05-20T08:00:00+08:00",
    temperature: 12,
    feelsLike: 9,
    humidity: 92,
    windSpeed: 4.2,
    windDirection: 120,
    visibility: 18,
    cloudTotal: 72,
    cloudLow: 58,
    cloudMid: 46,
    cloudHigh: 35,
    precipitationProbability: 18,
    weatherTextZh: "多云间晴，山地局部有雾",
    missingFields: [],
    estimatedFields: [],
  },
  clothingGuide: {
    titleZh: "山地清晨保暖",
    summaryZh: "清晨山顶体感偏凉，建议中层保暖并准备防风外套。",
    layers: ["速干内层", "抓绒中层", "防风外套"],
    accessories: ["防滑鞋", "镜头布"],
    riskNotes: ["高湿环境注意防潮和脚下湿滑。"],
    comfortLevel: "cool",
  },
  weatherProviderCode: "mock",
  weatherProviderLabelZh: "演示数据",
  weatherDataMode: "mock",
  weatherNoticeZh: "天气数据：演示数据",
  weatherMissingFields: [],
  weatherEstimatedFields: [],
  weatherSourceSummaries: [
    {
      providerCode: "mock",
      providerLabelZh: "演示数据",
      dataMode: "mock",
      enabled: true,
      realCallEnabled: false,
      attempted: true,
      success: true,
      status: "fallback",
      availableFields: ["temperature", "humidity", "wind", "cloudTotal"],
      missingFields: [],
      generatedAt: "2026-05-19T08:00:00+08:00",
      messageZh: "演示天气数据可用。",
    },
  ],
  weatherMissingDataNotes: ["天气数据当前为演示数据，正式出行前需要复核真实预报。"],
  astroDataSourceLabelZh: "本地算法计算",
};
