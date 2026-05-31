import { decisionCardSchema } from "@photo-weather/shared";
import { describe, expect, it } from "vitest";
import type { ForecastCalculationResult } from "@photo-weather/shared";
import {
  buildCloudSeaAiExplainPayload,
  buildDeepSeekForecastContext,
  buildDeepSeekForecastExplanationRequest,
  createRuleBasedForecastExplanation,
  DeepSeekProvider,
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
    expect(JSON.stringify(request.body)).toContain("Do not invent weather data.");
    expect(JSON.stringify(request.body)).toContain("cloudSeaAiExplainPayload");
    expect(JSON.stringify(request.body)).toContain(
      "Do not recompute or invent weather, cloud, cloud-sea, terrain, astronomy, score, risk, or window data.",
    );
    expect(JSON.stringify(request.body)).toContain("computedForecastFacts");
    expect(JSON.stringify(request.body)).toContain("最建议冲哪一天");
    expect(JSON.stringify(request.body)).toContain("日落后余晖");
    expect(JSON.stringify(request.body)).not.toContain("exampleJsonOutput");
    expect(request.body.messages[1]?.content.length).toBeLessThanOrEqual(18000);
    expect(JSON.stringify(request.body)).not.toContain("sk-");
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
    expect(text.length).toBeLessThanOrEqual(9000);
  });

  it("builds a Cloud Sea AI payload from deterministic facts without coordinates or provider names", () => {
    const payload = buildCloudSeaAiExplainPayload({
      ...forecastResultFixture,
      dataNotice:
        "天气数据：和风天气；云层辅助：Open-Meteo；专业增强：meteoblue；地理服务：高德地图。",
      weatherNoticeZh:
        "天气数据：和风天气；云层辅助：Open-Meteo；专业增强：meteoblue。",
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
      forecastResultFixture.cloudSeaAnalysis.shootableScore,
    );
    expect(payload.professionalHourlySummary).toHaveProperty("focusedRows");
    expect(payload.cloudLayerCompletenessSummary).toHaveProperty("layerCompletenessLevel");
    expect(payload.multiSourceAgreementSummary).toMatchObject({
      agreementLevel: "medium",
      shouldLowerConfidence: true,
    });
    expect(text).toContain("Do not recompute weather");
    expect(text).not.toMatch(/latitude|longitude|coordinates|WGS84|GCJ-02/i);
    expect(text).not.toContain("QWeather");
    expect(text).not.toContain("Open-Meteo");
    expect(text).not.toContain("meteoblue");
    expect(text).not.toContain("和风天气");
    expect(text).not.toContain("高德地图");
  });

  it("passes deterministic astro V2 facts to DeepSeek without provider names", () => {
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
    const context = buildDeepSeekForecastContext({
      ...forecastResultFixture,
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
            ...astroWindow,
            type: "astronomical_night",
            labelZh: "天文黑夜",
            start: "2026-05-21T20:26:00+08:00",
            end: "2026-05-22T03:48:00+08:00",
          },
        ],
        moonlessNightWindows: [],
        milkyWayCandidateWindows: [astroWindow],
        weatherBlockers: ["低云偏多，星空银河实际可见性较差。", "降水干扰"],
        gearAdviceZh: ["湿度较高，需准备防露带、镜头布和防水收纳。"],
        warmthAdviceZh: "夜间湿冷，需准备防风保暖层。",
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
    });
    const text = JSON.stringify(context);

    expect(context.topicScores).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "stars" }),
        expect.objectContaining({ key: "milkyWay" }),
      ]),
    );
    expect(text).toContain("All values are precomputed deterministic facts");
    expect(text).not.toContain("和风天气");
    expect(text).not.toContain("Open-Meteo");
    expect(text).not.toContain("meteoblue");
    expect(text).not.toContain("dataSourceLabelZh");
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
    expect(explanation.conclusion.oneSentenceDecisionZh).toContain("强推荐专程");
    expect(explanation.bestPlan.bestDateZh).toBe("2026年5月21日 星期四");
    expect(explanation.bestPlan.bestWindowZh).toContain("2026年5月21日 05:20");
    expect(explanation.bestPlan.primaryTargetZh).toContain("清晨云海");
    expect(explanation.bestPlan.backupPlanZh).toContain("备用题材");
    expect(explanation.weatherTrend.temperatureSummaryZh).toBeTruthy();
    expect(explanation.weatherTrend.rainSummaryZh).toBeTruthy();
    expect(explanation.weatherTrend.windSummaryZh).toBeTruthy();
    expect(explanation.weatherTrend.transparencySummaryZh).toBeTruthy();
    expect(explanation.riskAndGear.keyRisks[0]).toMatch(/（.+）：|暂无高等级风险/);
    expect(explanation.riskAndGear.clothingZh).toBeTruthy();
    expect(explanation.riskAndGear.gearZh).toBeTruthy();
    expect(explanation.finalAdvice.goNoGoZh).toContain("强推荐专程");
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
    expect(explanation.conclusion.oneSentenceDecisionZh).toBe(
      payload.conclusion.oneSentenceDecisionZh,
    );
  });

  it("classifies empty DeepSeek content separately from JSON parse errors", async () => {
    const fetcher = async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
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
    const provider = new DeepSeekProvider({
      enabled: true,
      realModeEnabled: true,
      apiKey: "sk-test",
      fetcher,
    });

    await expect(
      provider.generateForecastExplanation({
        forecastResult: forecastResultFixture,
      }),
    ).rejects.toMatchObject({
      errorCategory: "empty_response",
      messageZh: "DeepSeek 返回内容为空。",
    });
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
      buildDeepSeekForecastExplanationRequest({
        forecastResult: oversizedResult,
      });
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
    const fetcher = async (_input: string | URL, init?: RequestInit) => {
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
      errorCategory: "upstream_401",
      messageZh: "DeepSeek API Key 无效或权限不足。",
      statusCode: 401,
    });
    await expect(provider.testConnection()).rejects.not.toMatchObject({
      message: expect.stringContaining("sk-test-secret"),
    });
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
    formationScore: 86,
    shootableScore: 82,
    cloudSeaOpportunityScore: 86,
    whiteoutRiskScore: 38,
    lightAlignedScore: 94,
    confidence: 76,
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
      lightPollutionSource: "unavailable",
      lightPollutionNoteZh: "暂未接入光污染数据，实际观星仍需结合现场环境判断。",
    },
    cloudEvidence: [],
    visibilityEvidence: [],
    moonEvidence: [],
    terrainEvidence: [],
    lightPollutionEvidence: [
      {
        label: "光污染数据",
        value: "暂未接入",
        effect: "neutral",
        noteZh: "暂未接入光污染数据，实际观星仍需结合现场环境判断。",
      },
    ],
    weatherBlockers: [],
    riskReasons: ["暂未接入光污染数据，实际观星仍需结合现场环境判断。"],
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
