import { describe, expect, it, vi } from "vitest";
import type {
  AstroSummary,
  DirectionalLightPollutionRisk,
  ForecastCalculationInput,
  LightPollutionInfo,
  NormalizedHourlyWeather,
} from "@photo-weather/shared";
import {
  buildMockForecastInput,
  calculateAstroAnalysis,
  calculateForecast,
  calculateMilkyWayScore,
  calculateStarsScore,
  resolveDirectionalLightPollutionRisk,
} from "../index.js";

const fixedNow = "2026-05-20T00:00:00+08:00";
const baseQuery = {
  name: "黄山光明顶",
  source: "local_photo_spot",
  latitudeGcj02: 30.13254,
  longitudeGcj02: 118.16876,
  latitudeWgs84: 30.13012,
  longitudeWgs84: 118.16389,
  horizon: "48h",
  target: "astro",
  locationId: "location-huangshan",
  photoSpotId: "spot-guangmingding",
} as const;

function withSingleAstro(
  input: ForecastCalculationInput,
  astro: AstroSummary,
): ForecastCalculationInput {
  return {
    ...input,
    astroSummaries: [astro],
    calendarBasis: {
      ...input.calendarBasis,
      targetDates: [astro.date],
      targetDateLabels: ["2026年5月20日 星期三"],
      calendarDays: [
        {
          date: astro.date,
          dateLabel: "2026年5月20日 星期三",
          lunarDateText: astro.lunarDateText,
        },
      ],
    },
  };
}

function withHourlyWeather(
  input: ForecastCalculationInput,
  mapper: (hour: NormalizedHourlyWeather) => NormalizedHourlyWeather,
): ForecastCalculationInput {
  return {
    ...input,
    hourlyWeather: input.hourlyWeather.map(mapper),
  };
}

function withLowMoon(input: ForecastCalculationInput): ForecastCalculationInput {
  return {
    ...input,
    astroSummaries: input.astroSummaries.map((summary) => ({
      ...summary,
      moonIllumination: 0.08,
      moonAltitudeByHour: Object.fromEntries(
        Array.from({ length: 24 }, (_, hour) => [String(hour).padStart(2, "0"), -14]),
      ),
      moonInfo: {
        ...summary.moonInfo,
        moonIllumination: 0.08,
        moonAltitudeByHour: Object.fromEntries(
          Array.from({ length: 24 }, (_, hour) => [String(hour).padStart(2, "0"), -14]),
        ),
      },
    })),
  };
}

const directionalRiskFixture: readonly DirectionalLightPollutionRisk[] = [
  directionRisk("north", "北", 0, 10),
  directionRisk("northeast", "东北", 45, 20),
  directionRisk("east", "东", 90, 60),
  directionRisk("southeast", "东南", 135, 50),
  directionRisk("south", "南", 180, 95),
  directionRisk("southwest", "西南", 225, 80),
  directionRisk("west", "西", 270, 70),
  directionRisk("northwest", "西北", 315, 90),
];

function directionRisk(
  direction: DirectionalLightPollutionRisk["direction"],
  label: string,
  azimuthDegrees: number,
  riskIndex: number | null,
): DirectionalLightPollutionRisk {
  return {
    direction,
    directionLabelZh: label,
    azimuthDegrees,
    riskIndex,
    riskLevel:
      riskIndex === null
        ? "insufficient"
        : riskIndex < 20
          ? "very_low"
          : riskIndex < 40
            ? "low"
            : riskIndex < 60
              ? "medium"
              : riskIndex < 80
                ? "high"
                : "very_high",
    riskLevelLabelZh:
      riskIndex === null
        ? "数据不足"
        : riskIndex < 20
          ? "极低"
          : riskIndex < 40
            ? "低"
            : riskIndex < 60
              ? "中"
              : riskIndex < 80
                ? "高"
                : "很高",
    sampleCount: 12,
    validSampleCount: riskIndex === null ? 0 : 12,
  };
}

function lightPollutionFixture(overrides: Partial<LightPollutionInfo> = {}): LightPollutionInfo {
  return {
    available: true,
    dataAvailable: true,
    sourceCode: "eog_viirs",
    sourceLabel: "EOG VIIRS",
    datasetYear: 2026,
    datasetVersion: "test",
    localRadiance: 0.12,
    surroundingHaloRadiance: 0.3,
    ambientRiskIndex: 20,
    ambientRiskLevel: "low",
    ambientRiskLevelLabelZh: "低",
    directionalRisk: directionalRiskFixture,
    targetAzimuthDegrees: null,
    targetDirectionRisk: null,
    targetDirectionLevel: null,
    targetDirectionLevelLabelZh: null,
    confidence: "high",
    sampleCount: 96,
    validSampleCount: 96,
    calculationBasis: {
      samplingConfigVersion: "satellite-night-light-v1",
      coordinateSystem: "WGS84",
      distancesKm: [5, 15, 30, 60],
      distanceWeights: { local: 0.45, "5km": 0.22, "15km": 0.16, "30km": 0.11, "60km": 0.06 },
      localNeighborhoodKm: [0, 0.5, 1.5],
      directionSectorsDegrees: 45,
      quantileBasis: "adaptive_positive_log_radiance_quantiles",
      scoringMode: "heuristic",
      nonSqmBortleNoticeZh: "该结果为卫星夜光参考，不是现场SQM实测，也不代表测量Bortle等级。",
    },
    lightPollutionNoteZh: "卫星夜光参考：环境光污染低。",
    starPenalty: 4,
    milkyWayPenalty: 7,
    scoringMode: "heuristic",
    ...overrides,
  };
}

describe("astro analysis", () => {
  it("resolves directional light-pollution risk at an exact sector center", () => {
    expect(resolveDirectionalLightPollutionRisk(90, directionalRiskFixture)).toMatchObject({
      azimuthDegrees: 90,
      riskIndex: 60,
      riskLevelLabelZh: "高",
      interpolationBasis: "exact",
    });
  });

  it("interpolates directional light-pollution risk between two sectors", () => {
    expect(resolveDirectionalLightPollutionRisk(67.5, directionalRiskFixture)).toMatchObject({
      azimuthDegrees: 67.5,
      riskIndex: 40,
      riskLevelLabelZh: "中",
      interpolationBasis: "interpolated",
    });
  });

  it("interpolates directional light-pollution risk near 359 degrees", () => {
    expect(resolveDirectionalLightPollutionRisk(359, directionalRiskFixture)).toMatchObject({
      azimuthDegrees: 359,
      riskIndex: 12,
      riskLevelLabelZh: "极低",
    });
  });

  it("interpolates directional light-pollution risk near 1 degree", () => {
    expect(resolveDirectionalLightPollutionRisk(1, directionalRiskFixture)).toMatchObject({
      azimuthDegrees: 1,
      riskIndex: 10,
      riskLevelLabelZh: "极低",
    });
  });

  it("does not resolve directional light-pollution risk when azimuth is missing", () => {
    expect(resolveDirectionalLightPollutionRisk(undefined, directionalRiskFixture)).toBeUndefined();
  });

  it("does not resolve directional light-pollution risk when samples are missing", () => {
    expect(resolveDirectionalLightPollutionRisk(90, [])).toBeUndefined();
  });

  it("skips one invalid adjacent sector while resolving directional light-pollution risk", () => {
    const withInvalidAdjacent = directionalRiskFixture.map((sector) =>
      sector.direction === "northeast"
        ? {
            ...sector,
            riskIndex: null,
            riskLevel: "insufficient" as const,
            riskLevelLabelZh: "数据不足",
          }
        : sector,
    );

    expect(resolveDirectionalLightPollutionRisk(45, withInvalidAdjacent)).toMatchObject({
      azimuthDegrees: 45,
      riskIndex: 35,
      riskLevelLabelZh: "低",
    });
  });

  it("does not resolve directional light-pollution risk when all sectors are unavailable", () => {
    const unavailable = directionalRiskFixture.map((sector) => ({
      ...sector,
      riskIndex: null,
      riskLevel: "insufficient" as const,
      riskLevelLabelZh: "数据不足",
      validSampleCount: 0,
    }));

    expect(resolveDirectionalLightPollutionRisk(90, unavailable)).toBeUndefined();
  });

  it("keeps recommended Milky Way windows inside astronomical night", () => {
    const result = calculateForecast(
      buildMockForecastInput({ ...baseQuery, horizon: "7d" }, { now: fixedNow }),
    );

    for (const window of result.astroAnalysis.recommendedMilkyWayWindows) {
      const night = result.astroAnalysis.astronomicalNightWindows.find(
        (item) => item.date === window.date,
      );

      expect(night).toBeDefined();
      expect(Date.parse(window.start)).toBeGreaterThanOrEqual(Date.parse(night!.start));
      expect(Date.parse(window.end)).toBeLessThanOrEqual(Date.parse(night!.end));
    }
  });

  it("starts moonless and recommended Milky Way windows after moonset when moon impact is high", () => {
    const baseInput = buildMockForecastInput(baseQuery, { now: fixedNow });
    const brightMoonAstro: AstroSummary = {
      ...baseInput.astroSummaries[0]!,
      astronomicalNightStart: "2026-05-20T20:00:00+08:00",
      astronomicalNightEnd: "2026-05-21T04:00:00+08:00",
      moonIllumination: 0.86,
      moonPhaseNameZh: "盈凸月",
      moonrise: "2026-05-20T14:00:00+08:00",
      moonset: "2026-05-20T22:30:00+08:00",
      moonAltitudeByHour: {
        "20": 34,
        "21": 24,
        "22": 6,
        "23": -4,
        "00": -12,
        "01": -18,
        "02": -22,
        "03": -18,
      },
      moonInfo: {
        ...baseInput.astroSummaries[0]!.moonInfo,
        moonIllumination: 0.86,
        moonPhaseNameZh: "盈凸月",
        moonrise: "2026-05-20T14:00:00+08:00",
        moonset: "2026-05-20T22:30:00+08:00",
        moonAltitudeByHour: {
          "20": 34,
          "21": 24,
          "22": 6,
          "23": -4,
          "00": -12,
          "01": -18,
          "02": -22,
          "03": -18,
        },
      },
      milkyWayWindowStart: "2026-05-20T21:00:00+08:00",
      milkyWayWindowEnd: "2026-05-21T03:00:00+08:00",
      milkyWayGalacticCenterAltitude: 25,
      milkyWayDirection: "东南方",
      milkyWayCalculationPrecision: "v1_approximate",
    };
    const input = withHourlyWeather(withSingleAstro(baseInput, brightMoonAstro), (hour) => ({
      ...hour,
      cloudTotal: 12,
      cloudLow: 4,
      cloudMid: 8,
      cloudHigh: 10,
      humidity: 50,
      visibility: 32,
      precipitationProbability: 0,
      precipitation: 0,
      precipitationAmountMm: 0,
      weatherTextZh: "晴",
    }));
    const analysis = calculateAstroAnalysis(input, {
      starsScore: calculateStarsScore(input).score,
      milkyWayScore: calculateMilkyWayScore(input).score,
      transparencyScore: 70,
    });
    const moonset = Date.parse("2026-05-20T22:30:00+08:00");

    expect(analysis.moonlessNightWindows[0]).toBeDefined();
    expect(Date.parse(analysis.moonlessNightWindows[0]!.start)).toBeGreaterThanOrEqual(moonset);
    expect(analysis.recommendedMilkyWayWindows[0]).toBeDefined();
    expect(Date.parse(analysis.recommendedMilkyWayWindows[0]!.start)).toBeGreaterThanOrEqual(
      moonset,
    );
  });

  it("reduces star and Milky Way scores with high cloud, poor visibility, and strong moon impact", () => {
    const baseInput = buildMockForecastInput(baseQuery, { now: fixedNow });
    const clearDark = {
      ...baseInput,
      hourlyWeather: baseInput.hourlyWeather.map((hour) => ({
        ...hour,
        cloudTotal: 8,
        cloudLow: 4,
        cloudMid: 6,
        cloudHigh: 8,
        humidity: 42,
        visibility: 32,
      })),
      astroSummaries: baseInput.astroSummaries.map((summary) => ({
        ...summary,
        moonIllumination: 0.08,
        moonAltitudeByHour: Object.fromEntries(
          Array.from({ length: 24 }, (_, hour) => [String(hour).padStart(2, "0"), -12]),
        ),
      })),
    };
    const cloudyMoonlit = {
      ...baseInput,
      hourlyWeather: baseInput.hourlyWeather.map((hour) => ({
        ...hour,
        cloudTotal: 88,
        cloudLow: 70,
        cloudMid: 76,
        cloudHigh: 82,
        humidity: 92,
        visibility: 5,
      })),
      astroSummaries: baseInput.astroSummaries.map((summary) => ({
        ...summary,
        moonIllumination: 0.92,
        moonAltitudeByHour: Object.fromEntries(
          Array.from({ length: 24 }, (_, hour) => [String(hour).padStart(2, "0"), 36]),
        ),
      })),
    };

    expect(calculateStarsScore(clearDark).score).toBeGreaterThan(
      calculateStarsScore(cloudyMoonlit).score,
    );
    expect(calculateMilkyWayScore(clearDark).score).toBeGreaterThan(
      calculateMilkyWayScore(cloudyMoonlit).score,
    );
  });

  it("keeps astronomical availability separate from cloudy photographic usability", () => {
    const baseInput = withLowMoon(buildMockForecastInput(baseQuery, { now: fixedNow }));
    const blocked = withHourlyWeather(baseInput, (hour) => ({
      ...hour,
      cloudTotal: 95,
      cloudLow: 82,
      cloudMid: 76,
      cloudHigh: 70,
      humidity: 94,
      visibility: 4,
      precipitationProbability: 0,
      precipitation: 0,
      precipitationAmountMm: 0,
      weatherTextZh: "阴有雾",
    }));
    const result = calculateForecast(blocked);

    expect(result.astroAnalysis.astroWindowAvailable).toBe(true);
    expect(result.astroAnalysis.astroShootable).toBe(false);
    expect(result.astroAnalysis.astroConditionScore).toBeGreaterThan(
      result.astroAnalysis.astroPracticalScore,
    );
    expect(result.astroAnalysis.astronomicalWindowScore).toBeGreaterThan(
      result.astroAnalysis.practicalAstroScore,
    );
    expect(result.astroAnalysis.astroPracticalScore).toBeLessThanOrEqual(34);
    expect(result.astroAnalysis.weatherBlockers.join("")).toContain("总云量");
    expect(result.astroAnalysis.travelRecommendations.join("")).toContain("不建议为此熬夜");
    expect(result.astroAnalysis.recommendedMilkyWayWindows).toHaveLength(0);
  });

  it("blocks Milky Way recommendations when astronomical night overlaps rain", () => {
    const baseInput = withLowMoon(buildMockForecastInput(baseQuery, { now: fixedNow }));
    const rainy = withHourlyWeather(baseInput, (hour) => ({
      ...hour,
      cloudTotal: 18,
      cloudLow: 8,
      humidity: 70,
      visibility: 24,
      precipitationProbability: 82,
      precipitation: 0.6,
      precipitationAmountMm: 0.6,
      rainAmountMm: 0.6,
      weatherTextZh: "小雨",
    }));
    const result = calculateForecast(rainy);

    expect(result.astroAnalysis.astroPracticalScore).toBeLessThanOrEqual(34);
    expect(result.astroAnalysis.astroShootable).toBe(false);
    expect(result.astroAnalysis.weatherBlockers.join("")).toContain("降水");
    expect(result.astroAnalysis.recommendedMilkyWayWindows).toHaveLength(0);
    expect(
      result.bestWindows.some(
        (window) => window.target === "astro" && window.executableForDedicatedTrip === true,
      ),
    ).toBe(false);
  });

  it("blocks favorable moon windows when low cloud is high", () => {
    const baseInput = withLowMoon(buildMockForecastInput(baseQuery, { now: fixedNow }));
    const lowCloud = withHourlyWeather(baseInput, (hour) => ({
      ...hour,
      cloudTotal: 62,
      cloudLow: 74,
      cloudMid: 16,
      cloudHigh: 10,
      humidity: 88,
      visibility: 16,
      precipitationProbability: 0,
      precipitation: 0,
      precipitationAmountMm: 0,
    }));
    const result = calculateForecast(lowCloud);

    expect(result.astroAnalysis.astroConditionScore).toBeGreaterThan(50);
    expect(result.astroAnalysis.astroPracticalScore).toBeLessThanOrEqual(34);
    expect(result.astroAnalysis.astroShootable).toBe(false);
    expect(result.astroAnalysis.weatherBlockers.join("")).toContain("低云");
    expect(result.astroAnalysis.weatherBlockers.join("")).toContain("星空银河实际可见性较差");
    expect(result.astroAnalysis.recommendedMilkyWayWindows).toHaveLength(0);
  });

  it("allows astro to score high when sky, moon, rain, and transparency are favorable", () => {
    const baseInput = withLowMoon(buildMockForecastInput(baseQuery, { now: fixedNow }));
    const clear = withHourlyWeather(baseInput, (hour) => ({
      ...hour,
      cloudTotal: 8,
      cloudLow: 2,
      cloudMid: 4,
      cloudHigh: 6,
      humidity: 48,
      visibility: 36,
      precipitationProbability: 0,
      precipitation: 0,
      precipitationAmountMm: 0,
      weatherTextZh: "晴",
    }));
    const result = calculateForecast(clear);

    expect(result.astroAnalysis.astroPracticalScore).toBeGreaterThanOrEqual(60);
    expect(result.astroAnalysis.astroShootable).toBe(true);
    expect(result.astroAnalysis.labels.windowRecommendation).toBe("推荐银河窗口");
    expect(result.astroAnalysis.weatherBlockers).toHaveLength(0);
    expect(result.bestWindows.some((window) => window.target === "astro")).toBe(true);
    expect(result.astroAnalysis.travelRecommendations.join("")).toMatch(
      /推荐银河窗口：2026年\d+月\d+日/,
    );
  });

  it("resolves each day's Milky Way light-pollution direction without duplicating penalties", () => {
    const baseInput = withLowMoon(
      buildMockForecastInput({ ...baseQuery, horizon: "48h" }, { now: fixedNow }),
    );
    const dates = baseInput.calendarBasis.targetDates.slice(0, 2);
    const clearInput = withHourlyWeather(
      {
        ...baseInput,
        lightPollution: lightPollutionFixture(),
        astroWindowBundle: {
          astronomicalNightWindows: dates.map((date, index) => ({
            type: "astronomical_night" as const,
            labelZh: "天文黑夜",
            date,
            start: `2026-05-${20 + index}T20:30:00+08:00`,
            end: `2026-05-${21 + index}T03:30:00+08:00`,
            durationMinutes: 420,
            score: 82,
            riskTags: [],
            noteZh: "测试天文黑夜。",
          })),
          moonlessNightWindows: dates.map((date, index) => ({
            type: "moonless_night" as const,
            labelZh: "无月黑夜",
            date,
            start: `2026-05-${20 + index}T21:30:00+08:00`,
            end: `2026-05-${21 + index}T03:00:00+08:00`,
            durationMinutes: 330,
            score: 84,
            riskTags: ["月光较低"],
            noteZh: "测试无月窗口。",
          })),
          milkyWayCandidateWindows: dates.map((date, index) => ({
            type: "milky_way_candidate" as const,
            labelZh: "银河候选窗口",
            date,
            start: `2026-05-${20 + index}T22:00:00+08:00`,
            end: `2026-05-${21 + index}T02:30:00+08:00`,
            durationMinutes: 270,
            score: 80,
            riskTags: [],
            noteZh: "测试银河候选窗口。",
            directionZh: index === 0 ? "北方" : "南方",
            galacticCenterAltitude: 28,
            galacticCenterAzimuth: index === 0 ? 0 : 180,
          })),
          recommendedMilkyWayWindows: dates.map((date, index) => ({
            type: "recommended_milky_way" as const,
            labelZh: "推荐银河窗口",
            date,
            start: `2026-05-${20 + index}T22:30:00+08:00`,
            end: `2026-05-${21 + index}T02:00:00+08:00`,
            durationMinutes: 210,
            score: 80,
            riskTags: [],
            noteZh: "测试推荐银河窗口。",
            directionZh: index === 0 ? "北方" : "南方",
            galacticCenterAltitude: 28,
            galacticCenterAzimuth: index === 0 ? 0 : 180,
          })),
        },
      },
      (hour) => ({
        ...hour,
        cloudTotal: 6,
        cloudLow: 2,
        cloudMid: 4,
        cloudHigh: 6,
        humidity: 45,
        visibility: 34,
        precipitationProbability: 0,
        precipitation: 0,
        precipitationAmountMm: 0,
        weatherTextZh: "晴",
      }),
    );
    const analysis = calculateAstroAnalysis(clearInput, {
      starsScore: calculateStarsScore(clearInput).score,
      milkyWayScore: calculateMilkyWayScore(clearInput).score,
      transparencyScore: 80,
    });
    const firstDay = analysis.dailyAstro.find((day) => day.date === dates[0]);
    const secondDay = analysis.dailyAstro.find((day) => day.date === dates[1]);

    expect(firstDay?.lightPollution.targetDirectionRisk).toBe(10);
    expect(secondDay?.lightPollution.targetDirectionRisk).toBe(95);
    expect(analysis.lightPollution.estimatedBortleRange).toMatchObject({
      available: true,
      rangeLabelZh: "2–3级",
      skyQualityLabelZh: "优良暗空",
    });
    expect(firstDay?.lightPollution.estimatedBortleRange?.rangeLabelZh).toBe(
      analysis.lightPollution.estimatedBortleRange?.rangeLabelZh,
    );
    expect(secondDay?.lightPollution.estimatedBortleRange?.rangeLabelZh).toBe(
      analysis.lightPollution.estimatedBortleRange?.rangeLabelZh,
    );
    expect(firstDay?.lightPollution.milkyWayPenalty).toBeLessThan(
      secondDay?.lightPollution.milkyWayPenalty ?? 0,
    );
    expect(firstDay?.milkyWayScore).toBe(80 - (firstDay?.lightPollution.milkyWayPenalty ?? 0));
    expect(secondDay?.milkyWayScore).toBe(80 - (secondDay?.lightPollution.milkyWayPenalty ?? 0));
  });

  it("reduces Milky Way recommendation when the moon is high and bright", () => {
    const clearMoonless = withHourlyWeather(
      withLowMoon(buildMockForecastInput(baseQuery, { now: fixedNow })),
      (hour) => ({
        ...hour,
        cloudTotal: 8,
        cloudLow: 2,
        cloudMid: 4,
        cloudHigh: 6,
        humidity: 48,
        visibility: 36,
        precipitationProbability: 0,
        precipitation: 0,
        precipitationAmountMm: 0,
        weatherTextZh: "晴",
      }),
    );
    const brightMoon = {
      ...clearMoonless,
      astroSummaries: clearMoonless.astroSummaries.map((summary) => ({
        ...summary,
        moonIllumination: 0.88,
        moonAltitudeByHour: Object.fromEntries(
          Array.from({ length: 24 }, (_, hour) => [String(hour).padStart(2, "0"), 42]),
        ),
        moonInfo: {
          ...summary.moonInfo,
          moonIllumination: 0.88,
          moonAltitudeByHour: Object.fromEntries(
            Array.from({ length: 24 }, (_, hour) => [String(hour).padStart(2, "0"), 42]),
          ),
        },
      })),
    };
    const clearResult = calculateForecast(clearMoonless);
    const brightMoonResult = calculateForecast(brightMoon);

    expect(brightMoonResult.astroAnalysis.moonlightImpactScore).toBeGreaterThanOrEqual(65);
    expect(brightMoonResult.astroAnalysis.milkyWayScore).toBeLessThan(
      clearResult.astroAnalysis.milkyWayScore,
    );
    expect(brightMoonResult.astroAnalysis.labels.milkyWayShootability).not.toBe("高");
  });

  it("marks dew risk high for humid, low-spread, low-wind astro windows", () => {
    const baseInput = withLowMoon(buildMockForecastInput(baseQuery, { now: fixedNow }));
    const humid = withHourlyWeather(baseInput, (hour) => ({
      ...hour,
      cloudTotal: 12,
      cloudLow: 4,
      cloudMid: 8,
      cloudHigh: 10,
      humidity: 94,
      dewPointSpread: 1.2,
      windSpeed: 0.8,
      windGust: 1.4,
      visibility: 26,
      precipitationProbability: 0,
      precipitation: 0,
      precipitationAmountMm: 0,
      weatherTextZh: "晴",
    }));
    const result = calculateForecast(humid);

    expect(result.astroAnalysis.dewRiskLevel).toBe("high");
    expect(result.astroAnalysis.dewRiskScore).toBeGreaterThanOrEqual(80);
    expect(result.astroAnalysis.gearAdviceZh.join("")).toContain("镜头加热带");
  });

  it("does not let general recommendations choose astro when astro is not shootable", () => {
    const baseInput = withLowMoon(
      buildMockForecastInput({ ...baseQuery, target: "general" }, { now: fixedNow }),
    );
    const cloudy = withHourlyWeather(baseInput, (hour) => ({
      ...hour,
      cloudTotal: 90,
      cloudLow: 60,
      cloudMid: 72,
      cloudHigh: 80,
      humidity: 88,
      visibility: 18,
      precipitationProbability: 0,
      precipitation: 0,
      precipitationAmountMm: 0,
      weatherTextZh: "阴",
    }));
    const result = calculateForecast(cloudy);

    expect(result.astroAnalysis.astroWindowAvailable).toBe(true);
    expect(result.astroAnalysis.astroShootable).toBe(false);
    expect(
      result.bestWindows.some(
        (window) => window.target === "astro" && window.executableForDedicatedTrip === true,
      ),
    ).toBe(false);
  });

  it("keeps normal astro analysis provider-neutral", () => {
    const result = calculateForecast(
      withLowMoon(buildMockForecastInput(baseQuery, { now: fixedNow })),
    );
    const publicAstroText = JSON.stringify({
      labels: result.astroAnalysis.labels,
      riskReasons: result.astroAnalysis.riskReasons,
      opportunityReasons: result.astroAnalysis.opportunityReasons,
      travelRecommendations: result.astroAnalysis.travelRecommendations,
      dailyAstro: result.astroAnalysis.dailyAstro,
    });

    expect(publicAstroText).not.toMatch(/QWeather|Open-Meteo|meteoblue|Amap|和风|高德/i);
  });

  it("does not call real external APIs for astro analysis", () => {
    const fetchMock = vi.fn(() => {
      throw new Error("astro analysis should stay local");
    });
    vi.stubGlobal("fetch", fetchMock);

    calculateForecast(buildMockForecastInput(baseQuery, { now: fixedNow }));

    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
