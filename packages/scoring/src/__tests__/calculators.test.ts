import { describe, expect, it } from "vitest";
import {
  classifyTerrainMode,
  type ForecastCalculationInput,
  type ForecastQueryInput,
  type ForecastScore,
  type NormalizedHourlyWeather,
  type TerrainAnalysisSummary,
} from "@photo-weather/shared";
import type { WeatherDataBundle } from "@photo-weather/weather";
import {
  buildForecastInputFromWeatherBundle,
  buildMockForecastInput,
  calculateCloudSeaScore,
  calculateForecast,
  calculateGlowAnalysis,
  calculateMilkyWayScore,
  calculateOverallScore,
  calculateStarsScore,
  calculateSunriseGlowScore,
  calculateSunsetGlowScore,
  calculateTransparencyScore,
  calculateWhiteoutRiskScore,
  classifyRecommendationLevel,
  classifyScoreLevel,
  applyMountainWeatherAdjustments,
  buildClothingGuide,
  buildPhotographyPrecipitationRisk,
  calculatePhotographyTransparencyScore,
  exposedRidgeWindRisk,
  transparencyGradeFromScore,
} from "../index.js";

const baseQuery: ForecastQueryInput = {
  name: "黄山光明顶",
  source: "local_photo_spot",
  latitudeGcj02: 30.13254,
  longitudeGcj02: 118.16876,
  latitudeWgs84: 30.13012,
  longitudeWgs84: 118.16389,
  horizon: "48h",
  target: "general",
  locationId: "location-huangshan",
  photoSpotId: "spot-guangmingding",
};
const fixedNow = "2026-05-20T00:00:00+08:00";

const lowTerrainAnalysis: TerrainAnalysisSummary = {
  terrainProfile: {
    latitudeWgs84: 30,
    longitudeWgs84: 118,
    elevationMeters: 420,
    elevationSource: "manual",
    elevationConfidence: "medium",
    terrainType: "slope",
    exposureType: "semi_exposed",
    viewingDirection: "panoramic",
    nearbyValleyElevationMeters: 310,
    localReliefMeters: 210,
    terrainNotesZh: "低山测试地形。",
    locationElevation: 420,
    minElevation1km: 360,
    minElevation3km: 330,
    minElevation5km: 310,
    maxElevation5km: 520,
    avgElevation5km: 410,
    elevationDiff5km: 210,
    terrainCloudSeaPotential: "low",
    terrainNoteZh: "演示地形数据显示周边高差较小，云海地形基础偏弱。",
  },
  horizonProfile: {
    sunriseHorizonAngle: 2,
    sunsetHorizonAngle: 2,
    milkyWayHorizonAngle: 2,
    blockedDirectionsZh: [],
    obstructionNoteZh: "演示地形数据显示地平遮挡较低。",
  },
  dataSource: "mock_terrain",
  dataSourceLabelZh: "演示数据",
  isMock: true,
  honestyNoteZh:
    "地形信息当前使用演示地形数据，正式海拔与 DEM 数据接入后将用于提升云海和遮挡判断。",
};

function expectForecastScore(score: ForecastScore, label: string): void {
  expect(score.label).toBe(label);
  expect(score.score).toBeGreaterThanOrEqual(0);
  expect(score.score).toBeLessThanOrEqual(100);
  expect(["poor", "fair", "good", "excellent"]).toContain(score.level);
  expect(score.reasons.length).toBeGreaterThan(0);
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

function cloudSeaInputWithFullDayRows(
  generatedAt: string,
  horizon: ForecastQueryInput["horizon"],
  rowCount: number,
): ForecastCalculationInput {
  const input = buildMockForecastInput(
    { ...baseQuery, target: "cloud_sea", horizon },
    { now: generatedAt },
  );
  const date = generatedAt.slice(0, 10);
  const template = input.hourlyWeather[0]!;
  const hourlyWeather = Array.from({ length: rowCount }, (_, index) => ({
    ...template,
    time: offsetHour(`${date}T00:00:00+08:00`, index),
    humidity: 88,
    cloudTotal: 72,
    cloudLow: 48,
    cloudMid: 36,
    cloudHigh: 24,
    windSpeed: 1.8,
    visibility: 18,
    dewPoint: template.temperature - 1.8,
    missingFields: [],
    estimatedFields: [],
  }));

  return {
    ...input,
    hourlyWeather,
  };
}

function offsetHour(start: string, index: number): string {
  const offset = start.slice(-6);
  const offsetMinutes = offsetToMinutes(offset);
  const timestamp = Date.parse(start) + index * 60 * 60 * 1000;
  const local = new Date(timestamp + offsetMinutes * 60 * 1000);
  return `${local.getUTCFullYear()}-${pad2(local.getUTCMonth() + 1)}-${pad2(
    local.getUTCDate(),
  )}T${pad2(local.getUTCHours())}:00:00${offset}`;
}

function offsetToMinutes(offset: string): number {
  const sign = offset.startsWith("-") ? -1 : 1;
  const [hours, minutes] = offset.slice(1).split(":").map(Number);
  return sign * ((hours ?? 0) * 60 + (minutes ?? 0));
}

function pad2(value: number): string {
  return value.toString().padStart(2, "0");
}

describe("forecast score calculators", () => {
  it("calculates each major photography score with Chinese labels", () => {
    const input = buildMockForecastInput(baseQuery, { now: fixedNow });

    expectForecastScore(calculateSunriseGlowScore(input), "朝霞");
    expectForecastScore(calculateSunsetGlowScore(input), "晚霞");
    expectForecastScore(calculateCloudSeaScore(input), "云海");
    expectForecastScore(calculateWhiteoutRiskScore(input), "白墙风险");
    expectForecastScore(calculateStarsScore(input), "星空");
    expectForecastScore(calculateMilkyWayScore(input), "银河");
    expectForecastScore(calculateTransparencyScore(input), "通透度");
  });

  it("uses lowland terrain semantics for low-elevation ordinary locations", () => {
    const lowlandInput = buildMockForecastInput(
      {
        ...baseQuery,
        name: "黄山市区低海拔机位",
        locationId: "location-lowland-142m",
        photoSpotId: undefined,
        elevationMeters: 142,
        elevationSource: "manual",
        elevationConfidence: "medium",
      },
      { now: fixedNow },
    );
    const result = calculateForecast(lowlandInput);
    const windowText = result.bestWindows
      .map((window) => `${window.label} ${window.subjectPriorityLabel ?? ""}`)
      .join(" ");
    const riskText = result.riskFlags
      .map((risk) => `${risk.label} ${risk.description}`)
      .join(" ");
    const adviceText = result.photographyAdvice.join(" ");

    expect(classifyTerrainMode(lowlandInput.terrainAnalysis.terrainProfile)).toBe("lowland");
    expect(result.scores.cloudSea.label).toBe("晨雾/低云");
    expect(result.scores.whiteoutRisk.label).toBe("低云遮挡");
    expect(windowText).not.toContain("清晨云海");
    expect(windowText).toMatch(/晨雾|云层|云雾|低云/);
    expect(riskText).not.toContain("山脊风风险");
    expect(riskText).not.toContain("白墙风险");
    expect(adviceText).toContain("晨雾");
    expect(adviceText).not.toContain("高点");
    expect(adviceText).not.toContain("白墙风险");
    expect(result.dailySummaries.some((summary) => summary.weather?.temperatureCorrectionApplied)).toBe(
      false,
    );
  });

  it("keeps high mountain seed spots on mountain cloud-sea semantics", () => {
    const input = buildMockForecastInput(baseQuery, { now: fixedNow });
    const result = calculateForecast(input);
    const windowText = result.bestWindows
      .map((window) => `${window.label} ${window.subjectPriorityLabel ?? ""}`)
      .join(" ");

    expect(classifyTerrainMode(input.terrainAnalysis.terrainProfile)).toBe("high_mountain");
    expect(result.scores.cloudSea.label).toBe("云海");
    expect(result.scores.whiteoutRisk.label).toBe("白墙风险");
    expect(windowText).toContain("清晨云海");
  });

  it("keeps whiteout risk separate from cloud sea opportunity", () => {
    const humidInput = buildMockForecastInput(
      {
        ...baseQuery,
        name: "三清山女神峰",
        target: "cloud_sea",
      },
      { now: fixedNow },
    );
    const clearInput = buildMockForecastInput(
      {
        ...baseQuery,
        name: "武功山金顶",
        target: "astro",
      },
      { now: fixedNow },
    );

    expect(calculateWhiteoutRiskScore(humidInput).score).toBeGreaterThan(
      calculateWhiteoutRiskScore(clearInput).score,
    );
    expect(calculateCloudSeaScore(humidInput).score).toBeGreaterThan(40);
  });

  it("uses terrain potential and elevation difference for cloud sea scoring", () => {
    const highTerrainInput = buildMockForecastInput(
      {
        ...baseQuery,
        target: "cloud_sea",
      },
      { now: fixedNow },
    );
    const lowTerrainInput = buildMockForecastInput(
      {
        ...baseQuery,
        name: "平原测试点",
        target: "cloud_sea",
      },
      {
        now: fixedNow,
        terrainAnalysis: lowTerrainAnalysis,
      },
    );

    expect(calculateCloudSeaScore(highTerrainInput).score).toBeGreaterThan(
      calculateCloudSeaScore(lowTerrainInput).score,
    );
    expect(calculateCloudSeaScore(highTerrainInput).reasons.join("")).toContain("地形云海潜力");
  });

  it("classifies score and recommendation levels", () => {
    expect(classifyScoreLevel(82)).toBe("excellent");
    expect(classifyScoreLevel(66)).toBe("good");
    expect(classifyScoreLevel(52)).toBe("fair");
    expect(classifyScoreLevel(30)).toBe("poor");

    expect(classifyRecommendationLevel(82)).toBe("recommended");
    expect(classifyRecommendationLevel(68)).toBe("worth_waiting");
    expect(classifyRecommendationLevel(50)).toBe("cautious");
    expect(classifyRecommendationLevel(35)).toBe("not_recommended");
  });

  it("uses provider elevation awareness for mountain temperature correction", () => {
    const baseInput = buildMockForecastInput(baseQuery, { now: fixedNow });
    const selectedElevation = baseInput.terrainAnalysis.terrainProfile.locationElevation ?? 0;
    const lowElevationHour = {
      ...baseInput.hourlyWeather[0]!,
      temperature: 28,
      feelsLike: 29,
      rawTemperature: undefined,
      elevationAdjustedTemperature: undefined,
      temperatureAdjustment: undefined,
      estimatedFields: [],
      providerElevationMeters: 600,
    };
    const adjusted = applyMountainWeatherAdjustments({
      currentWeather: {
        providerCode: "open_meteo",
        providerLabelZh: "Open-Meteo",
        dataMode: "real",
        observedAt: lowElevationHour.time,
        temperature: 28,
        feelsLike: 29,
        humidity: 80,
        windSpeed: 4,
        missingFields: [],
        estimatedFields: [],
        providerElevationMeters: 600,
      },
      hourlyWeather: [lowElevationHour],
      dailyWeather: [],
      terrainAnalysis: baseInput.terrainAnalysis,
    });
    const closeElevation = applyMountainWeatherAdjustments({
      hourlyWeather: [
        {
          ...lowElevationHour,
          providerElevationMeters: selectedElevation - 30,
        },
      ],
      dailyWeather: [],
      terrainAnalysis: baseInput.terrainAnalysis,
    });

    expect(adjusted.hourlyWeather[0]?.temperature).toBeLessThan(28);
    expect(adjusted.hourlyWeather[0]?.temperatureAdjustment?.correctionApplied).toBe(true);
    expect(adjusted.hourlyWeather[0]?.temperatureAdjustment?.correctionReason).toBe(
      "provider_elevation_delta_beyond_threshold",
    );
    expect(adjusted.currentWeather?.temperature).toBeLessThan(28);
    expect(closeElevation.hourlyWeather[0]?.temperature).toBe(28);
    expect(closeElevation.hourlyWeather[0]?.temperatureAdjustment).toMatchObject({
      correctionApplied: false,
      providerElevationKnown: true,
      correctionReason: "provider_elevation_close_to_spot",
    });
  });

  it("does not correct meteoblue values when provider height matches the selected spot", () => {
    const baseInput = buildMockForecastInput(baseQuery, { now: fixedNow });
    const selectedElevation = baseInput.terrainAnalysis.terrainProfile.locationElevation ?? 0;
    const adjusted = applyMountainWeatherAdjustments({
      hourlyWeather: [
        {
          ...baseInput.hourlyWeather[0]!,
          providerCode: "meteoblue",
          providerElevationMeters: selectedElevation,
          temperature: 20,
        },
      ],
      dailyWeather: [],
      terrainAnalysis: baseInput.terrainAnalysis,
    });

    expect(adjusted.hourlyWeather[0]?.temperature).toBe(20);
    expect(adjusted.hourlyWeather[0]?.temperatureAdjustment).toMatchObject({
      correctionApplied: false,
      providerElevationKnown: true,
      correctionReason: "provider_elevation_close_to_spot",
    });
  });

  it("uses terrain-adjusted temperature and matching dew point spread in professional hourly data", () => {
    const baseInput = buildMockForecastInput({ ...baseQuery, target: "cloud_sea" }, { now: fixedNow });
    const rawHour: NormalizedHourlyWeather = {
      ...baseInput.hourlyWeather[0]!,
      providerCode: "qweather",
      providerElevationMeters: 600,
      temperature: 24,
      rawTemperature: undefined,
      elevationAdjustedTemperature: undefined,
      temperatureAdjustment: undefined,
      dewPoint: 12,
      dewPointSpread: 12,
      cloudLow: 42,
      cloudMid: 38,
      cloudHigh: 28,
      missingFields: [],
      estimatedFields: [],
    };
    const adjusted = applyMountainWeatherAdjustments({
      hourlyWeather: [rawHour],
      dailyWeather: [],
      terrainAnalysis: baseInput.terrainAnalysis,
    });
    const result = calculateForecast({
      ...baseInput,
      hourlyWeather: adjusted.hourlyWeather,
      dailyWeather: [],
    });
    const row = result.professionalHourlyData?.[0];

    expect(row).toMatchObject({
      rawTemperatureC: 24,
      temperatureBasis: "terrain_adjusted",
      cloudLayerBasis: "explicit_layers",
    });
    expect(row?.terrainAdjustedTemperatureC).toBeLessThan(24);
    expect(row?.displayedTemperatureC).toBe(row?.terrainAdjustedTemperatureC);
    expect(row?.dewPointSpreadC).toBeCloseTo((row?.displayedTemperatureC ?? 0) - 12, 5);
    expect(result.professionalHourlyDataTimeBasis?.temperatureBasis).toBe("terrain_adjusted");
  });

  it("keeps missing professional cloud layers empty instead of filling them from total cloud", () => {
    const baseInput = buildMockForecastInput({ ...baseQuery, target: "cloud_sea" }, { now: fixedNow });
    const result = calculateForecast(
      withHourlyWeather(baseInput, (hour) => ({
        ...hour,
        cloudTotal: 96,
        cloudLow: null,
        cloudMid: null,
        cloudHigh: null,
        humidity: 100,
        dewPoint: hour.temperature - 1,
        dewPointSpread: 1,
        visibility: 18,
        missingFields: ["cloudLow", "cloudMid", "cloudHigh"],
      })),
    );
    const row = result.professionalHourlyData?.[0];

    expect(row).toMatchObject({
      cloudTotalPercent: 96,
      cloudLowPercent: null,
      cloudMidPercent: null,
      cloudHighPercent: null,
      cloudLayerBasis: "total_only",
      cloudSeaSignal: "需复核",
    });
    expect(row?.cloudSeaSignal).not.toBe("白墙风险");
    expect(result.professionalHourlyDataTimeBasis?.cloudLayerBasis).toBe("total_only");
  });

  it("requires low-cloud evidence before professional hourly whiteout labels", () => {
    const baseInput = buildMockForecastInput({ ...baseQuery, target: "cloud_sea" }, { now: fixedNow });
    const humidityOnly = calculateForecast(
      withHourlyWeather(baseInput, (hour) => ({
        ...hour,
        cloudTotal: 45,
        cloudLow: 20,
        cloudMid: 20,
        cloudHigh: 20,
        humidity: 100,
        dewPoint: hour.temperature - 6,
        dewPointSpread: 6,
        visibility: 20,
        missingFields: [],
      })),
    );
    const totalCloudOnly = calculateForecast(
      withHourlyWeather(baseInput, (hour) => ({
        ...hour,
        cloudTotal: 98,
        cloudLow: 20,
        cloudMid: 20,
        cloudHigh: 20,
        humidity: 65,
        dewPoint: hour.temperature - 8,
        dewPointSpread: 8,
        visibility: 20,
        missingFields: [],
      })),
    );
    const strongWhiteout = calculateForecast(
      withHourlyWeather(baseInput, (hour) => ({
        ...hour,
        cloudTotal: 94,
        cloudLow: 82,
        cloudMid: 35,
        cloudHigh: 25,
        humidity: 94,
        dewPoint: hour.temperature - 2,
        dewPointSpread: 2,
        visibility: 4,
        missingFields: [],
      })),
    );

    expect(humidityOnly.professionalHourlyData?.[0]?.cloudSeaSignal).not.toBe("白墙风险");
    expect(totalCloudOnly.professionalHourlyData?.[0]?.cloudSeaSignal).not.toBe("白墙风险");
    expect(strongWhiteout.professionalHourlyData?.[0]?.cloudSeaSignal).toBe("白墙风险");
  });

  it("does not turn high cloud alone into cloud sea windows or professional cloud sea labels", () => {
    const baseInput = buildMockForecastInput({ ...baseQuery, target: "cloud_sea" }, { now: fixedNow });
    const result = calculateForecast(
      withHourlyWeather(baseInput, (hour) => ({
        ...hour,
        cloudTotal: 92,
        cloudLow: 12,
        cloudMid: 24,
        cloudHigh: 88,
        humidity: 62,
        dewPoint: hour.temperature - 8,
        dewPointSpread: 8,
        visibility: 22,
        windSpeed: 4,
        precipitation: 0,
        precipitationAmountMm: 0,
        precipitationProbability: 8,
        missingFields: [],
        estimatedFields: [],
      })),
    );
    const signals = new Set(result.professionalHourlyData?.map((row) => row.cloudSeaSignal));

    expect(result.cloudSeaAnalysis.bestCloudSeaWindows).toHaveLength(0);
    expect(result.cloudSeaAnalysis.watchableCloudSeaWindows).toHaveLength(0);
    expect(signals.has("云层纹理") || signals.has("霞光参考")).toBe(true);
    expect(signals).not.toContain("可拍窗口");
    expect(signals).not.toContain("形成信号");
    expect(signals).not.toContain("白墙风险");
  });

  it("does not turn mid cloud alone into cloud sea windows or professional cloud sea labels", () => {
    const baseInput = buildMockForecastInput({ ...baseQuery, target: "cloud_sea" }, { now: fixedNow });
    const result = calculateForecast(
      withHourlyWeather(baseInput, (hour) => ({
        ...hour,
        cloudTotal: 88,
        cloudLow: 15,
        cloudMid: 84,
        cloudHigh: 28,
        humidity: 64,
        dewPoint: hour.temperature - 7,
        dewPointSpread: 7,
        visibility: 20,
        windSpeed: 3,
        precipitation: 0,
        precipitationAmountMm: 0,
        precipitationProbability: 10,
        missingFields: [],
        estimatedFields: [],
      })),
    );
    const signals = new Set(result.professionalHourlyData?.map((row) => row.cloudSeaSignal));

    expect(result.cloudSeaAnalysis.bestCloudSeaWindows).toHaveLength(0);
    expect(result.cloudSeaAnalysis.watchableCloudSeaWindows).toHaveLength(0);
    expect(signals.has("云层纹理") || signals.has("霞光参考")).toBe(true);
    expect(signals).not.toContain("可拍窗口");
    expect(signals).not.toContain("形成信号");
    expect(signals).not.toContain("白墙风险");
  });

  it("caps unknown-provider high mountain correction instead of applying a full lapse rate", () => {
    const baseInput = buildMockForecastInput(baseQuery, { now: fixedNow });
    const veryHighTerrain: TerrainAnalysisSummary = {
      ...baseInput.terrainAnalysis,
      terrainProfile: {
        ...baseInput.terrainAnalysis.terrainProfile,
        locationElevation: 3200,
      },
    };
    const adjusted = applyMountainWeatherAdjustments({
      hourlyWeather: [
        {
          ...baseInput.hourlyWeather[0]!,
          providerCode: "qweather",
          providerElevationMeters: undefined,
          temperature: 22,
          feelsLike: 22,
        },
      ],
      dailyWeather: [],
      terrainAnalysis: veryHighTerrain,
    });
    const adjustment = adjusted.hourlyWeather[0]?.temperatureAdjustment;

    expect(adjustment?.correctionApplied).toBe(true);
    expect(adjustment?.correctionReason).toBe("unknown_provider_elevation_conservative");
    expect(adjustment?.correctionCelsius).toBeLessThanOrEqual(5);
    expect(adjusted.hourlyWeather[0]?.temperature).toBeGreaterThanOrEqual(17);
  });

  it("does not apply 8-10C cooling when provider elevation is unknown", () => {
    const baseInput = buildMockForecastInput(baseQuery, { now: fixedNow });
    const veryHighTerrain: TerrainAnalysisSummary = {
      ...baseInput.terrainAnalysis,
      terrainProfile: {
        ...baseInput.terrainAnalysis.terrainProfile,
        locationElevation: 3600,
        elevationMeters: 3600,
      },
    };
    const adjusted = applyMountainWeatherAdjustments({
      hourlyWeather: [
        {
          ...baseInput.hourlyWeather[0]!,
          providerCode: "qweather",
          providerElevationMeters: undefined,
          temperature: 20,
        },
      ],
      dailyWeather: [],
      terrainAnalysis: veryHighTerrain,
    });

    expect(adjusted.hourlyWeather[0]?.temperatureAdjustment?.correctionCelsius).toBeLessThanOrEqual(
      4,
    );
  });

  it("uses a lighter capped correction for unknown-provider night minimum temperature", () => {
    const baseInput = buildMockForecastInput(baseQuery, { now: fixedNow });
    const veryHighTerrain: TerrainAnalysisSummary = {
      ...baseInput.terrainAnalysis,
      terrainProfile: {
        ...baseInput.terrainAnalysis.terrainProfile,
        locationElevation: 2600,
      },
    };
    const day = baseInput.dailyWeather[0]!;
    const adjusted = applyMountainWeatherAdjustments({
      hourlyWeather: [],
      dailyWeather: [
        {
          ...day,
          providerCode: "qweather",
          providerElevationMeters: undefined,
          tempMin: 8,
          tempMax: 18,
          rawTempMin: undefined,
          rawTempMax: undefined,
          elevationAdjustedTempMin: undefined,
          elevationAdjustedTempMax: undefined,
          temperatureAdjustment: undefined,
        },
      ],
      terrainAnalysis: veryHighTerrain,
    });
    const adjustedDay = adjusted.dailyWeather[0]!;
    const minCooling = 8 - adjustedDay.tempMin;
    const maxCooling = 18 - adjustedDay.tempMax;

    expect(minCooling).toBeLessThanOrEqual(3);
    expect(maxCooling).toBeGreaterThan(minCooling);
    expect(adjustedDay.tempMin).toBeGreaterThanOrEqual(5);
  });

  it("leaves terrain-aware mock provider values close to the raw provider temperature", () => {
    const baseInput = buildMockForecastInput(baseQuery, { now: fixedNow });
    const adjusted = applyMountainWeatherAdjustments({
      hourlyWeather: [
        {
          ...baseInput.hourlyWeather[0]!,
          providerCode: "mock",
          providerElevationMeters: undefined,
          temperature: 21,
        },
      ],
      dailyWeather: [],
      terrainAnalysis: baseInput.terrainAnalysis,
    });

    expect(adjusted.hourlyWeather[0]?.temperature).toBe(21);
    expect(adjusted.hourlyWeather[0]?.temperatureAdjustment?.correctionReason).toBe(
      "provider_terrain_aware_no_extra_correction",
    );
  });

  it("feeds clothing guidance from the adjusted mountain temperature without over-cooling", () => {
    const baseInput = buildMockForecastInput(baseQuery, { now: fixedNow });
    const selectedElevation = baseInput.terrainAnalysis.terrainProfile.locationElevation ?? 0;
    const adjusted = applyMountainWeatherAdjustments({
      hourlyWeather: [
        {
          ...baseInput.hourlyWeather[0]!,
          providerCode: "qweather",
          providerElevationMeters: undefined,
          temperature: 18,
          feelsLike: 18,
          windSpeed: 2,
        },
      ],
      dailyWeather: [],
      terrainAnalysis: baseInput.terrainAnalysis,
    });
    const guide = buildClothingGuide({
      hourlyWeather: adjusted.hourlyWeather,
      elevationMeters: selectedElevation,
      target: "general",
      timezone: "Asia/Shanghai",
      forecastStart: fixedNow,
    });

    expect(adjusted.hourlyWeather[0]?.temperature).toBeGreaterThan(14);
    expect(guide.comfortLevel).not.toBe("very_cold");
    expect(guide.summaryZh).not.toContain("0°C");
  });

  it("adds terrain-aware mountain feels-like and tripod risk without changing wind speed", () => {
    const baseInput = buildMockForecastInput(baseQuery, { now: fixedNow });
    const selectedElevation = baseInput.terrainAnalysis.terrainProfile.locationElevation ?? 0;
    const rawWindSpeed = 4.8;
    const adjusted = applyMountainWeatherAdjustments({
      hourlyWeather: [
        {
          ...baseInput.hourlyWeather[0]!,
          windSpeed: rawWindSpeed,
          windGust: 10.5,
          humidity: 92,
          precipitation: 1.2,
          providerElevationMeters: selectedElevation,
        },
      ],
      dailyWeather: [],
      terrainAnalysis: {
        ...baseInput.terrainAnalysis,
        terrainProfile: {
          ...baseInput.terrainAnalysis.terrainProfile,
          terrainType: "ridge",
          exposureType: "exposed",
        },
      },
    });
    const hour = adjusted.hourlyWeather[0]!;

    expect(hour.windSpeed).toBe(rawWindSpeed);
    expect(hour.exposedRidgeWindRisk).toBe("high");
    expect(hour.tripodStabilityRisk).toBe("medium");
    expect(hour.mountainFeelsLikeC).toBeLessThan(hour.feelsLike ?? hour.temperature);
    expect(hour.clothingRiskNoteZh).toContain("防");
  });

  it("derives precipitation risk from amount when probability is unavailable", () => {
    const risk = buildPhotographyPrecipitationRisk({
      probability: null,
      amountMm: 12,
      affectedWindows: ["清晨窗口"],
      weatherTextZh: "小雨转小雨",
    });

    expect(risk.rainRiskLevel).toBe("high");
    expect(risk.precipitationProbabilityPercent).toBeNull();
    expect(risk.recommendationZh).toContain("降水概率暂无");
    expect(risk.recommendationZh).not.toContain("0%");
  });

  it("separates raw visibility from photography transparency under cloud and rain risk", () => {
    const clearScore = calculatePhotographyTransparencyScore({
      rawVisibilityKm: 90,
      cloudLow: 18,
      cloudTotal: 35,
      humidity: 58,
      dewPointSpread: 8,
      precipitationAmountMm: 0,
      precipitationProbability: null,
    });
    const obstructedScore = calculatePhotographyTransparencyScore({
      rawVisibilityKm: 90,
      cloudLow: 92,
      cloudTotal: 98,
      humidity: 96,
      dewPointSpread: 1,
      precipitationAmountMm: 12,
      precipitationProbability: null,
    });

    expect(clearScore).toBeGreaterThan(obstructedScore);
    expect(transparencyGradeFromScore(clearScore)).toMatch(/excellent|good/);
    expect(transparencyGradeFromScore(obstructedScore)).toMatch(/fair|poor/);
  });

  it("uses gust and mountain exposure as risk labels without changing sustained wind", () => {
    expect(
      exposedRidgeWindRisk({
        elevationMeters: 1800,
        windSpeed: 4.2,
        windGust: 9.2,
      }),
    ).toBe("medium");
    expect(
      exposedRidgeWindRisk({
        elevationMeters: 1800,
        windSpeed: 8.2,
        windGust: 12.5,
      }),
    ).toBe("high");
  });

  it("calculates target-aware overall scores and full results", () => {
    const cloudSeaInput = buildMockForecastInput(
      {
        ...baseQuery,
        target: "cloud_sea",
      },
      { now: fixedNow },
    );
    const astroInput = buildMockForecastInput(
      {
        ...baseQuery,
        name: "武功山金顶",
        target: "astro",
      },
      { now: fixedNow },
    );
    const cloudSeaResult = calculateForecast(cloudSeaInput);
    const astroResult = calculateForecast(astroInput);

    expect(cloudSeaResult.overallScore).toBe(cloudSeaResult.cloudSeaAnalysis.travelScore);
    expect(calculateOverallScore(cloudSeaResult.scores, "cloud_sea")).toBeGreaterThanOrEqual(0);
    expect(cloudSeaResult.summary).toContain("白墙风险");
    expect(astroResult.scores.milkyWay.score).toBeGreaterThan(
      astroResult.scores.whiteoutRisk.score,
    );
    expect(["不建议前往", "谨慎参考", "值得等待", "推荐前往", "推荐重点关注"]).toContain(
      astroResult.recommendationLabel,
    );
    expect(astroResult.summary).toContain("演示评分");
  });

  it("builds forecast input from a normalized weather bundle", () => {
    const baseInput = buildMockForecastInput(baseQuery, { now: fixedNow });
    const bundle: WeatherDataBundle = {
      hourly: baseInput.hourlyWeather,
      daily: baseInput.dailyWeather,
      alerts: [],
      providerCode: "open_meteo",
      providerLabelZh: "Open-Meteo 样例数据",
      dataMode: "fixture",
      generatedAt: fixedNow,
      noticeZh: "天气数据：Open-Meteo 样例数据",
    };
    const input = buildForecastInputFromWeatherBundle({ ...baseQuery, target: "glow" }, bundle, {
      now: fixedNow,
      terrainAnalysis: baseInput.terrainAnalysis,
    });

    const result = calculateForecast(input);

    expect(result.weatherDataMode).toBe("fixture");
    expect(result.weatherNoticeZh).toBe("天气数据：Open-Meteo 样例数据");
    expect(result.dataSourceLabel).toBe("Open-Meteo 样例数据");
    expect(result.summary).toContain("演示评分");
  });

  it("uses humidity, low cloud, wind, dew point, and visibility for cloud sea scoring", () => {
    const baseInput = buildMockForecastInput(
      { ...baseQuery, target: "cloud_sea" },
      { now: fixedNow },
    );
    const favorable = withHourlyWeather(baseInput, (hour) => ({
      ...hour,
      humidity: 88,
      cloudLow: 48,
      windSpeed: 1.8,
      visibility: 18,
      dewPoint: hour.temperature - 1.8,
    }));
    const unfavorable = withHourlyWeather(baseInput, (hour) => ({
      ...hour,
      humidity: 42,
      cloudLow: 8,
      windSpeed: 8.5,
      visibility: 5,
      dewPoint: hour.temperature - 11,
    }));

    expect(calculateCloudSeaScore(favorable).score).toBeGreaterThan(
      calculateCloudSeaScore(unfavorable).score,
    );
  });

  it("keeps professional hourly cloud-layer gaps null instead of filling from total cloud", () => {
    const baseInput = buildMockForecastInput(
      { ...baseQuery, target: "cloud_sea" },
      { now: fixedNow },
    );
    const input = withHourlyWeather(baseInput, (hour) => ({
      ...hour,
      cloudTotal: 62,
      cloudLow: null,
      cloudMid: 36,
      cloudHigh: null,
      missingFields: [...new Set([...(hour.missingFields ?? []), "cloudLow", "cloudHigh"])],
    }));

    const result = calculateForecast(input);
    const row = result.professionalHourlyData?.[0];

    expect(row).toMatchObject({
      cloudTotalPercent: 62,
      cloudLowPercent: null,
      cloudMidPercent: 36,
      cloudHighPercent: null,
      cloudLayerBasis: "partial_layers",
    });
    expect(row?.missingFields).toEqual(expect.arrayContaining(["cloudLow", "cloudHigh"]));
  });

  it("anchors Cloud Sea future24 professional rows to the next forecast hour", () => {
    const input = cloudSeaInputWithFullDayRows("2026-06-02T08:28:00+08:00", "24h", 36);
    const result = calculateForecast(input);
    const rows = result.professionalHourlyData ?? [];

    expect(rows).toHaveLength(24);
    expect(rows[0]?.time).toBe("2026-06-02T09:00:00+08:00");
    expect(rows.at(-1)?.time).toBe("2026-06-03T08:00:00+08:00");
    expect(rows.some((row) => row.time <= "2026-06-02T08:00:00+08:00")).toBe(false);
    expect(result.professionalHourlyDataTimeBasis).toMatchObject({
      startTime: "2026-06-02T09:00:00+08:00",
      endTime: "2026-06-03T08:00:00+08:00",
      anchorStartLocal: "2026-06-02T09:00:00+08:00",
      anchorEndLocal: "2026-06-03T08:00:00+08:00",
      requestedHours: 24,
      partialData: false,
      fieldCoverageSummary: expect.objectContaining({ totalHours: 24 }),
    });
  });

  it("anchors late-night Cloud Sea future24 rows to next-day midnight", () => {
    const input = cloudSeaInputWithFullDayRows("2026-06-02T23:20:00+08:00", "24h", 48);
    const result = calculateForecast(input);

    expect(result.professionalHourlyData?.[0]?.time).toBe("2026-06-03T00:00:00+08:00");
    expect(result.professionalHourlyData?.at(-1)?.time).toBe("2026-06-03T23:00:00+08:00");
  });

  it("clips Cloud Sea future48 and future72 rows to future-only horizon counts", () => {
    const future48 = calculateForecast(
      cloudSeaInputWithFullDayRows("2026-06-02T08:28:00+08:00", "48h", 84),
    );
    const future72 = calculateForecast(
      cloudSeaInputWithFullDayRows("2026-06-02T08:28:00+08:00", "72h", 108),
    );

    expect(future48.professionalHourlyData).toHaveLength(48);
    expect(future48.professionalHourlyData?.[0]?.time).toBe("2026-06-02T09:00:00+08:00");
    expect(future72.professionalHourlyData).toHaveLength(72);
    expect(future72.professionalHourlyData?.[0]?.time).toBe("2026-06-02T09:00:00+08:00");
  });

  it("does not build Cloud Sea best windows from rows before the resolved anchor", () => {
    const input = cloudSeaInputWithFullDayRows("2026-06-02T08:28:00+08:00", "24h", 36);
    const result = calculateForecast(input);
    const anchorStart = Date.parse(result.professionalHourlyDataTimeBasis?.anchorStartLocal ?? "");
    const windowStarts = [
      result.cloudSeaAnalysis.bestCloudSeaWindow,
      ...result.cloudSeaAnalysis.bestCloudSeaWindows,
      ...result.cloudSeaAnalysis.watchableCloudSeaWindows,
      ...result.bestWindows.filter((window) => window.target === "cloud_sea"),
    ]
      .map((window) => Date.parse(window?.startTime ?? ""))
      .filter(Number.isFinite);

    expect(windowStarts.length).toBeGreaterThan(0);
    expect(windowStarts.every((start) => start >= anchorStart)).toBe(true);
  });

  it("marks partial future coverage without backfilling past Cloud Sea rows", () => {
    const input = cloudSeaInputWithFullDayRows("2026-06-02T08:28:00+08:00", "24h", 18);
    const result = calculateForecast(input);

    expect(result.professionalHourlyData).toHaveLength(9);
    expect(result.professionalHourlyData?.[0]?.time).toBe("2026-06-02T09:00:00+08:00");
    expect(result.professionalHourlyDataTimeBasis).toMatchObject({
      requestedHours: 24,
      partialData: true,
      missingDataNoteZh: "当前数据源返回的未来小时数不足，已展示可用未来时段。",
    });
  });

  it("uses cloud layer fields when available for glow scoring", () => {
    const baseInput = buildMockForecastInput({ ...baseQuery, target: "glow" }, { now: fixedNow });
    const layered = withHourlyWeather(baseInput, (hour) => ({
      ...hour,
      cloudTotal: 58,
      cloudLow: 18,
      cloudMid: 45,
      cloudHigh: 52,
      precipitationProbability: 8,
      visibility: 28,
      missingFields: [],
    }));
    const missingLayers = withHourlyWeather(baseInput, (hour) => ({
      ...hour,
      cloudTotal: 58,
      cloudLow: null,
      cloudMid: null,
      cloudHigh: null,
      precipitationProbability: 8,
      visibility: 28,
      missingFields: ["cloudLow", "cloudMid", "cloudHigh"],
    }));

    expect(calculateSunriseGlowScore(layered).score).toBeGreaterThan(
      calculateSunriseGlowScore(missingLayers).score,
    );
  });

  it("improves glow scoring when mid and high clouds are favorable", () => {
    const baseInput = buildMockForecastInput({ ...baseQuery, target: "glow" }, { now: fixedNow });
    const favorable = withHourlyWeather(baseInput, (hour) => ({
      ...hour,
      cloudTotal: 58,
      cloudLow: 18,
      cloudMid: 42,
      cloudHigh: 48,
      precipitationProbability: 5,
      visibility: 24,
    }));
    const emptySky = withHourlyWeather(baseInput, (hour) => ({
      ...hour,
      cloudTotal: 5,
      cloudLow: 2,
      cloudMid: 0,
      cloudHigh: 0,
      precipitationProbability: 5,
      visibility: 24,
    }));

    expect(calculateGlowAnalysis(favorable).sunriseGlowScore).toBeGreaterThan(
      calculateGlowAnalysis(emptySky).sunriseGlowScore,
    );
    expect(calculateGlowAnalysis(favorable).opportunityReasons.join("")).toContain("中高云");
  });

  it("raises low cloud obstruction risk when low cloud is excessive", () => {
    const baseInput = buildMockForecastInput({ ...baseQuery, target: "glow" }, { now: fixedNow });
    const lowObstruction = withHourlyWeather(baseInput, (hour) => ({
      ...hour,
      cloudTotal: 52,
      cloudLow: 18,
      cloudMid: 38,
      cloudHigh: 46,
      visibility: 22,
    }));
    const highObstruction = withHourlyWeather(baseInput, (hour) => ({
      ...hour,
      cloudTotal: 96,
      cloudLow: 88,
      cloudMid: 38,
      cloudHigh: 46,
      visibility: 22,
    }));

    expect(calculateGlowAnalysis(highObstruction).lowCloudObstructionRisk).toBeGreaterThan(
      calculateGlowAnalysis(lowObstruction).lowCloudObstructionRisk,
    );
    expect(calculateGlowAnalysis(highObstruction).riskReasons.join("")).toContain("低云遮挡");
  });

  it("reduces glow scores when visibility is low", () => {
    const baseInput = buildMockForecastInput({ ...baseQuery, target: "glow" }, { now: fixedNow });
    const transparent = withHourlyWeather(baseInput, (hour) => ({
      ...hour,
      cloudTotal: 58,
      cloudLow: 18,
      cloudMid: 42,
      cloudHigh: 48,
      visibility: 24,
      humidity: 68,
    }));
    const hazy = withHourlyWeather(baseInput, (hour) => ({
      ...hour,
      cloudTotal: 58,
      cloudLow: 18,
      cloudMid: 42,
      cloudHigh: 48,
      visibility: 2.5,
      humidity: 96,
    }));

    expect(calculateGlowAnalysis(transparent).glowTravelScore).toBeGreaterThan(
      calculateGlowAnalysis(hazy).glowTravelScore,
    );
  });

  it("reduces sunrise and sunset glow scores when terrain obstruction is high", () => {
    const baseInput = buildMockForecastInput({ ...baseQuery, target: "glow" }, { now: fixedNow });
    const openHorizon = withHourlyWeather(baseInput, (hour) => ({
      ...hour,
      cloudTotal: 58,
      cloudLow: 18,
      cloudMid: 42,
      cloudHigh: 48,
      visibility: 24,
    }));
    const obstructed = {
      ...openHorizon,
      terrainAnalysis: {
        ...openHorizon.terrainAnalysis,
        horizonProfile: {
          ...openHorizon.terrainAnalysis.horizonProfile,
          sunriseHorizonAngle: 18,
          sunsetHorizonAngle: 19,
          blockedDirectionsZh: ["东南", "西南"],
          obstructionNoteZh: "演示地形数据显示日出和日落方向存在明显遮挡。",
        },
      },
    };

    expect(calculateGlowAnalysis(openHorizon).sunriseGlowScore).toBeGreaterThan(
      calculateGlowAnalysis(obstructed).sunriseGlowScore,
    );
    expect(calculateGlowAnalysis(openHorizon).sunsetGlowScore).toBeGreaterThan(
      calculateGlowAnalysis(obstructed).sunsetGlowScore,
    );
  });

  it("uses cloud, moon, humidity, and visibility for astro scoring", () => {
    const baseInput = buildMockForecastInput(
      { ...baseQuery, name: "武功山金顶", target: "astro" },
      { now: fixedNow },
    );
    const clearDark = {
      ...withHourlyWeather(baseInput, (hour) => ({
        ...hour,
        cloudTotal: 10,
        cloudLow: 4,
        cloudMid: 6,
        cloudHigh: 8,
        humidity: 42,
        visibility: 34,
      })),
      astroSummaries: baseInput.astroSummaries.map((summary) => ({
        ...summary,
        moonIllumination: 0.08,
      })),
    };
    const humidMoonlit = {
      ...withHourlyWeather(baseInput, (hour) => ({
        ...hour,
        cloudTotal: 82,
        cloudLow: 55,
        cloudMid: 70,
        cloudHigh: 76,
        humidity: 88,
        visibility: 6,
      })),
      astroSummaries: baseInput.astroSummaries.map((summary) => ({
        ...summary,
        moonIllumination: 0.86,
      })),
    };

    expect(calculateStarsScore(clearDark).score).toBeGreaterThan(
      calculateStarsScore(humidMoonlit).score,
    );
    expect(calculateMilkyWayScore(clearDark).score).toBeGreaterThan(
      calculateMilkyWayScore(humidMoonlit).score,
    );
  });
});
