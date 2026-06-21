import { describe, expect, it } from "vitest";
import type { ForecastCalculationResult, TerrainHorizonAssessment } from "@photo-weather/shared";
import {
  createEvidenceGuard,
  hasTerrainElevationSupport,
  hasTerrainReliefSupport,
  sanitizeUnsupportedForecastCopy,
} from "./forecast-claim-guard";

const resolvedClearTerrainHorizon: TerrainHorizonAssessment = {
  location: { latitude: 30, longitude: 118, system: "wgs84" },
  observerElevationMeters: 1200,
  target: "milky_way",
  targetAzimuthDegrees: 180,
  targetAltitudeDegrees: 28,
  horizonAltitudeDegrees: 8,
  obstructionClearanceDegrees: 20,
  obstructionLevel: "clear",
  confidence: "high",
  dataSource: "dem_raster",
  dataSourceLabelZh: "本地 DEM 地形剖面",
  professionalDiagnostics: {
    calculationRuleZh: "clearance = target altitude - terrain horizon altitude",
    sampleCount: 80,
    validSampleCount: 78,
    usedDirectionalProfile: true,
    nearestAzimuthDeltaDegrees: 0,
    notesZh: ["测试地形剖面已解析。"],
  },
};

function guardResult(
  overrides: {
    readonly weatherDataMode?: ForecastCalculationResult["weatherDataMode"];
    readonly weatherMissingFields?: readonly string[];
    readonly isMock?: boolean;
    readonly includeProfessionalHourly?: boolean;
    readonly includeRelief?: boolean;
    readonly includeTerrainHorizon?: boolean;
    readonly lightPollutionAvailable?: boolean;
    readonly directionalLightPollutionAvailable?: boolean;
    readonly astroWindowAvailable?: boolean;
    readonly includeMilkyWayWindow?: boolean;
  } = {},
): ForecastCalculationResult {
  const includeProfessionalHourly = overrides.includeProfessionalHourly ?? true;
  const includeRelief = overrides.includeRelief ?? true;
  const includeTerrainHorizon = overrides.includeTerrainHorizon ?? true;
  const lightPollutionAvailable = overrides.lightPollutionAvailable ?? true;
  const directionalLightPollutionAvailable = overrides.directionalLightPollutionAvailable ?? true;
  const astroWindowAvailable = overrides.astroWindowAvailable ?? true;
  const includeMilkyWayWindow = overrides.includeMilkyWayWindow ?? true;
  const weatherDataMode = overrides.weatherDataMode ?? "real";
  const weatherMissingFields = overrides.weatherMissingFields ?? [];
  const professionalHourlyData = includeProfessionalHourly
    ? [
        {
          time: "2026-05-20T20:00:00+08:00",
          dateLabel: "2026年5月20日",
          timeLabel: "20:00",
          weatherCode: "0",
          weatherText: "晴",
          cloudSeaSignal: "普通",
          cloudTotalPercent: 38,
          cloudHighPercent: 46,
          cloudMidPercent: 40,
          cloudLowPercent: 22,
          cloudLayerBasis: "layered_clouds",
          rawTemperatureC: 12,
          terrainAdjustedTemperatureC: 10,
          displayedTemperatureC: 10,
          temperatureBasis: "terrain_adjusted",
          temperatureAdjustmentC: -2,
          temperatureBasisNoteZh: "山地温度修正。",
          dewPointC: 7,
          dewPointSpreadC: 3,
          relativeHumidityPercent: 78,
          precipitationAmountMm: 0,
          precipitationProbabilityPercent: 10,
          visibilityMeters: 18000,
          windSpeedMs: 3,
          windDirectionDeg: 120,
        },
      ]
    : [];
  const terrainRelief = includeRelief ? 680 : undefined;
  const terrainHorizon = includeTerrainHorizon ? resolvedClearTerrainHorizon : undefined;
  const milkyWayWindow = {
    type: "milky_way" as const,
    labelZh: "银河窗口",
    start: "2026-05-20T22:00:00+08:00",
    end: "2026-05-21T01:00:00+08:00",
    score: 78,
    riskTags: [],
    noteZh: "天文窗口、云量和月光支持银河候选。",
    directionZh: "南",
    terrainHorizonAssessment: terrainHorizon,
  };

  return {
    weatherDataMode,
    isMock: overrides.isMock ?? weatherDataMode !== "real",
    weatherMissingFields,
    weatherSourceSummaries: [
      {
        providerCode: weatherDataMode === "real" ? "qweather" : "mock",
        providerLabelZh: weatherDataMode === "real" ? "正式天气" : "演示天气",
        dataMode: weatherDataMode,
        enabled: true,
        realCallEnabled: weatherDataMode === "real",
        attempted: true,
        success: weatherDataMode === "real",
        status: weatherDataMode === "real" ? "available" : "fallback",
        availableFields: [],
        missingFields: [],
        generatedAt: "2026-05-20T08:00:00+08:00",
      },
    ],
    currentWeather: {
      cloudLow: weatherMissingFields.includes("cloudLow") ? undefined : 22,
      cloudMid: weatherMissingFields.includes("cloudMid") ? undefined : 40,
      cloudHigh: weatherMissingFields.includes("cloudHigh") ? undefined : 46,
      precipitation: weatherMissingFields.includes("precipitation") ? undefined : 0,
      precipitationProbability: weatherMissingFields.includes("precipitation") ? undefined : 10,
      visibility: 18000,
      windSpeed: 3,
      humidity: 78,
    },
    dailySummaries: [
      {
        weather: {
          precipitation: weatherMissingFields.includes("precipitation") ? undefined : 0,
          precipitationProbability: weatherMissingFields.includes("precipitation") ? undefined : 10,
          visibility: 18000,
          windSpeed: 3,
          humidity: 78,
        },
      },
    ],
    professionalHourlyData,
    terrainAnalysis: {
      terrainProfile: {
        locationElevation: 1280,
        elevationMeters: 1280,
        localReliefMeters: terrainRelief,
        elevationDiff5km: terrainRelief,
      },
      horizonProfile: {
        milkyWayAssessment: terrainHorizon,
      },
      dataSource: "dem",
      dataSourceLabelZh: "本地 DEM",
      isMock: false,
      honestyNoteZh: "地形数据已接入。",
    },
    terrainSummary: {
      locationElevation: 1280,
      elevationMeters: 1280,
      localReliefMeters: terrainRelief,
      elevationDiff5km: terrainRelief,
      milkyWayAssessment: terrainHorizon,
    },
    cloudSeaAnalysis: {
      terrainSupport: {
        selectedSpotElevationMeters: 1280,
        localReliefMeters: terrainRelief,
      },
    },
    astroSummaries: [
      {
        date: "2026-05-20",
        moonInfo: {
          moonPhase: 0.12,
          moonPhaseNameZh: "娥眉月",
          moonIllumination: 0.18,
          waxingOrWaning: "waxing",
          lunarDateText: "四月初四",
          calculationNoteZh: "月相由确定性天文算法计算。",
        },
        moonIllumination: 0.18,
      },
    ],
    astroAnalysis: {
      astroWindowAvailable,
      moonInfo: {
        moonPhase: 0.12,
        moonPhaseNameZh: "娥眉月",
        moonIllumination: 0.18,
        waxingOrWaning: "waxing",
        lunarDateText: "四月初四",
        calculationNoteZh: "月相由确定性天文算法计算。",
      },
      dailyAstro: [
        {
          date: "2026-05-20",
          moonImpactLevel: "low",
          terrainHorizonAssessment: terrainHorizon,
          recommendedMilkyWayWindow:
            includeMilkyWayWindow && astroWindowAvailable ? milkyWayWindow : undefined,
        },
      ],
      recommendedMilkyWayWindow:
        includeMilkyWayWindow && astroWindowAvailable ? milkyWayWindow : undefined,
      recommendedMilkyWayWindows:
        includeMilkyWayWindow && astroWindowAvailable ? [milkyWayWindow] : [],
      milkyWayCandidateWindows:
        includeMilkyWayWindow && astroWindowAvailable ? [milkyWayWindow] : [],
      moonlessNightWindows: [],
      lightPollution: {
        available: lightPollutionAvailable,
        dataAvailable: lightPollutionAvailable,
        ambientRiskLevel: lightPollutionAvailable ? "low" : "insufficient",
        ambientRiskLevelLabelZh: lightPollutionAvailable ? "低" : "数据不足",
        targetDirectionLevel: directionalLightPollutionAvailable ? "low" : undefined,
        targetDirectionLevelLabelZh: directionalLightPollutionAvailable ? "低" : undefined,
        targetDirectionRisk: directionalLightPollutionAvailable ? 18 : undefined,
        directionalRisk: directionalLightPollutionAvailable
          ? [
              {
                direction: "south",
                directionLabelZh: "南",
                azimuthDegrees: 180,
                riskLevel: "low",
                riskLevelLabelZh: "低",
                sampleCount: 12,
                validSampleCount: 12,
              },
            ]
          : [],
      },
    },
  } as unknown as ForecastCalculationResult;
}

describe("forecast claim guard", () => {
  it("tracks available evidence and returns internal claim diagnostics", () => {
    const guard = createEvidenceGuard(guardResult());
    const claim = guard.validateForecastClaim({
      domain: "astro",
      publicText: "银河方向光害低，地形无遮挡。",
      requiredEvidence: ["directional_light_pollution", "terrain_horizon_clear"],
    });

    expect(guard.hasRealWeatherData()).toBe(true);
    expect(guard.hasCloudLayerSupport()).toBe(true);
    expect(guard.hasResolvedClearTerrainHorizonSupport()).toBe(true);
    expect(claim.supportLevel).toBe("supported");
    expect(claim.publicText).toContain("银河方向光害低");
    expect(claim.publicText).toContain("地形无遮挡");
    expect(claim.missingEvidence).toEqual([]);
  });

  it("downgrades unsupported cloud, terrain, light-pollution, and rain-opening phrases", () => {
    const result = guardResult({
      weatherMissingFields: ["cloudLow", "cloudMid", "cloudHigh", "precipitation"],
      includeProfessionalHourly: false,
      includeRelief: false,
      includeTerrainHorizon: false,
      lightPollutionAvailable: false,
      directionalLightPollutionAvailable: false,
      includeMilkyWayWindow: false,
    });
    const text = sanitizeUnsupportedForecastCopy(
      result,
      "低云适中，云层结构理想，色彩载体好，高差明显，地形无遮挡，光害低，银河方向光害低，雨后开口机会高，银河可拍。",
      "astro",
    );

    expect(text).not.toContain("低云适中");
    expect(text).not.toContain("云层结构理想");
    expect(text).not.toContain("色彩载体好");
    expect(text).not.toContain("高差明显");
    expect(text).not.toContain("无遮挡");
    expect(text).not.toContain("光害低");
    expect(text).not.toContain("雨后开口机会高");
    expect(text).not.toContain("银河可拍");
    expect(text).toContain("低云分层待复核");
    expect(text).toContain("地形遮挡需复核");
    expect(text).toContain("光害待复核");
  });

  it("blocks real travel encouragement when weather data is demo or fallback", () => {
    const result = guardResult({ weatherDataMode: "fallback", isMock: true });
    const claim = createEvidenceGuard(result).validateForecastClaim({
      domain: "action",
      publicText: "推荐前往，建议出发，适合出发。",
      requiredEvidence: ["real_weather"],
    });

    expect(claim.supportLevel).toBe("blocked");
    expect(claim.blockedUnsupportedPhrases.join(" ")).toContain("推荐前往");
    expect(claim.publicText).not.toContain("推荐前往");
    expect(claim.publicText).not.toContain("建议出发");
    expect(claim.publicText).not.toContain("适合出发");
    expect(claim.publicText).toContain("复核真实天气");
  });

  it("keeps elevation wording separate from relief-strength claims", () => {
    const result = guardResult({ includeRelief: false });

    expect(hasTerrainElevationSupport(result)).toBe(true);
    expect(hasTerrainReliefSupport(result)).toBe(false);
    expect(sanitizeUnsupportedForecastCopy(result, "海拔带可参考，高差明显。", "terrain")).toBe(
      "海拔带可参考，高差待复核。",
    );
  });
});
