import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { FastifyInstance } from "fastify";
import type { NormalizedDailyWeather, NormalizedHourlyWeather } from "@photo-weather/shared";
import type {
  AirQuality,
  CurrentWeather,
  WeatherAlert,
  WeatherDataBundle,
  WeatherProvider,
  WeatherRequestInput,
} from "@photo-weather/weather";
import { buildApiServer } from "../server.js";
import { createFakeDatabaseClient, testAuthConfig } from "./fake-db.js";
import {
  AstroServiceClientError,
  astroServiceInvalidResponseMessage,
  astroServiceTimeoutMessage,
  astroServiceUrlMissingMessage,
  astroServiceUnavailableMessage,
  type AstroServiceCalculationResponse,
  type AstroServiceClientLike,
  type AstroServiceCalculateInput,
  type AstroServiceTerrainDemProfileQueryResponse,
} from "../astro-service-client.js";

const forecastTestAuthConfig = { ...testAuthConfig, adminAuthBypass: true };

const validPayload = {
  name: "黄山光明顶",
  source: "local_photo_spot",
  latitudeGcj02: 30.13254,
  longitudeGcj02: 118.16876,
  latitudeWgs84: 30.13012,
  longitudeWgs84: 118.16389,
  horizon: "48h",
  target: "cloud_sea",
  locationId: "location-huangshan",
  photoSpotId: "spot-guangmingding",
} as const;

function buildOpenAiExplanationContent(label: string) {
  return {
    conclusion: {
      titleZh: "黄山光明顶拍摄天气解读",
      summaryZh: `${label}：综合窗口已按确定性结果解读。`,
      recommendedDayZh: "最建议关注 2026年5月20日清晨窗口。",
      recommendationLevelZh: "值得等待",
      whetherWorthDedicatedTripZh: "谨慎参考",
      oneSentenceDecisionZh: `${label}：清晨窗口优先，专程出发前仍需复核短临天气。`,
    },
    bestPlan: {
      primaryTargetZh: "清晨云海",
      bestDateZh: "2026年5月20日",
      bestWindowZh: "2026年5月20日 05:00-07:00",
      recommendedArrivalZh: "建议 04:20 前到位",
      whyThisWindowZh: "低云、湿度和地形组合更适合清晨观察。",
      backupPlanZh: "备用题材：晚霞；若云海不成立，转向远山层次和云缝光。",
    },
    weatherTrend: {
      trendSummaryZh: "云量偏多，等待短时开口。",
      temperatureSummaryZh: "山顶估算温度约 10-18°C。",
      rainSummaryZh: "降水风险偏低，仍需复核短临雷达。",
      windSummaryZh: "风力可控，阵风需现场确认。",
      transparencySummaryZh: "通透度中等，远山层次需现场复核。",
    },
    dayByDay: [
      {
        dateZh: "2026年5月20日",
        recommendationZh: "清晨可重点观察。",
        scoreZh: "综合 78 分",
        temperatureZh: "10-18°C",
        rainZh: "降水风险低",
        cloudSeaZh: "云海机会较好",
        glowZh: "朝霞可关注",
        sunsetGlowZh: "晚霞备用",
        astroZh: "星空不作为主目标",
        transparencyZh: "通透度中等",
        bestWindowZh: "05:00-07:00",
        actionZh: "提前到位并复核低云高度。",
      },
    ],
    subjectAdvice: {
      cloudSeaZh: "云海为优先题材，注意白墙风险。",
      sunriseGlowZh: "日出和朝霞可作为同窗口组合。",
      sunsetGlowZh: "晚霞只作备用。",
      astroMilkyWayZh: "不建议只为银河专程。",
      transparencyZh: "通透度决定远山层次。",
    },
    riskAndGear: {
      keyRisks: ["低云遮挡（清晨窗口）：可能压住主体视线。"],
      clothingZh: "清晨偏凉，带防风保暖层。",
      gearZh: "三脚架、防潮袋、头灯和备用电池。",
      safetyZh: "保留撤离时间，不在强风和低能见度下硬等。",
    },
    finalAdvice: {
      goNoGoZh: "谨慎参考，可近距离观察。",
      ifAlreadyNearbyZh: "已在附近可短时等待清晨开口。",
      ifDedicatedTripZh: "专程出发前等待短临复核。",
      nextCheckZh: "复核降水、低云、能见度和阵风。",
    },
    metadata: {
      source: "openai" as const,
    },
  };
}

function addOneDay(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const next = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, (day ?? 1) + 1));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(
    next.getUTCDate(),
  ).padStart(2, "0")}`;
}

function isoHourFrom(start: string, index: number): string {
  const offset = start.slice(-6);
  const offsetMinutes = offsetToMinutes(offset);
  const date = new Date(Date.parse(start) + index * 60 * 60 * 1000);
  const local = new Date(date.getTime() + offsetMinutes * 60 * 1000);
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

function dateForIndex(index: number, start = "2026-05-20T00:00:00+08:00"): string {
  return isoHourFrom(start, index * 24).slice(0, 10);
}

function buildQWeatherHourlyPayload(
  options: { readonly start?: string; readonly hours?: number } = {},
) {
  const start = options.start ?? "2026-05-20T00:00:00+08:00";
  const hours = options.hours ?? 48;
  return {
    code: "200",
    hourly: Array.from({ length: hours }, (_, index) => ({
      fxTime: isoHourFrom(start, index),
      temp: String(12 + (index % 6)),
      feelsLike: String(10 + (index % 5)),
      humidity: "82",
      dew: "10",
      pressure: "1008",
      windSpeed: "9",
      windGust: "16",
      wind360: "120",
      pop: "12",
      precip: "0",
      vis: "22",
      cloud: "52",
      icon: "101",
      text: "多云",
    })),
  };
}

function buildQWeatherDailyPayload(
  options: { readonly start?: string; readonly days?: number } = {},
) {
  const start = options.start ?? "2026-05-20T00:00:00+08:00";
  const days = options.days ?? 3;
  return {
    code: "200",
    daily: Array.from({ length: days }, (_, index) => ({
      fxDate: dateForIndex(index, start),
      tempMin: "8",
      tempMax: "18",
      pop: "20",
      textDay: "多云",
      textNight: "晴",
      sunrise: "05:10",
      sunset: "18:55",
    })),
  };
}

function buildOpenMeteoPayload(
  options: { readonly start?: string; readonly hours?: number; readonly days?: number } = {},
) {
  const start = options.start ?? "2026-05-20T00:00:00+08:00";
  const hours = options.hours ?? 48;
  const days = options.days ?? 3;
  const times = Array.from({ length: hours }, (_, index) => isoHourFrom(start, index).slice(0, 16));
  const dates = Array.from({ length: days }, (_, index) => dateForIndex(index, start));

  return {
    utc_offset_seconds: 28800,
    current: {
      temperature_2m: 13,
      relative_humidity_2m: 84,
      wind_speed_10m: 11,
      wind_direction_10m: 125,
      weather_code: 2,
    },
    hourly: {
      time: times,
      temperature_2m: times.map((_, index) => 12 + (index % 6)),
      relative_humidity_2m: times.map(() => 84),
      dew_point_2m: times.map(() => 10),
      cloud_cover: times.map(() => 55),
      cloud_cover_low: times.map(() => 24),
      cloud_cover_mid: times.map(() => 38),
      cloud_cover_high: times.map(() => 48),
      visibility: times.map(() => 22000),
      wind_speed_10m: times.map(() => 2.8),
      wind_gusts_10m: times.map(() => 5),
      wind_direction_10m: times.map(() => 125),
      pressure_msl: times.map(() => 1008),
      precipitation_probability: times.map(() => 12),
      precipitation: times.map(() => 0),
      weather_code: times.map(() => 2),
    },
    daily: {
      time: dates,
      weather_code: dates.map(() => 2),
      temperature_2m_min: dates.map(() => 8),
      temperature_2m_max: dates.map(() => 18),
      precipitation_probability_max: dates.map(() => 20),
      sunrise: dates.map((date) => `${date}T05:10`),
      sunset: dates.map((date) => `${date}T18:55`),
    },
  };
}

function buildMeteobluePayload(
  options: { readonly start?: string; readonly hours?: number; readonly days?: number } = {},
) {
  const start = options.start ?? "2026-05-20T00:00:00+08:00";
  const hours = options.hours ?? 48;
  const days = options.days ?? 3;
  const times = Array.from({ length: hours }, (_, index) => isoHourFrom(start, index));
  const dates = Array.from({ length: days }, (_, index) => dateForIndex(index, start));

  return {
    metadata: { name: "basic-1h_clouds-1h" },
    data_1h: {
      time: times,
      temperature: times.map((_, index) => 11 + (index % 6)),
      felttemperature: times.map((_, index) => 9 + (index % 5)),
      relativehumidity: times.map(() => 86),
      dewpointtemperature: times.map(() => 10),
      sealevelpressure: times.map(() => 1007),
      windspeed: times.map(() => 3.2),
      windgust: times.map(() => 5.1),
      winddirection: times.map(() => 130),
      precipitation_probability: times.map(() => 15),
      precipitation: times.map(() => 0),
      visibility: times.map(() => 24),
      cloudcover: times.map(() => 58),
      lowclouds: times.map(() => 26),
      midclouds: times.map(() => 40),
      highclouds: times.map(() => 52),
      pictocode: times.map(() => 2),
    },
    data_day: {
      time: dates,
      temperature_min: dates.map(() => 8),
      temperature_max: dates.map(() => 18),
      precipitation_probability: dates.map(() => 20),
    },
  };
}

function configureRealWeatherProviders(
  state: Awaited<ReturnType<typeof createFakeDatabaseClient>>["state"],
) {
  const qweather = state.providers.get("weather:qweather");
  state.providers.set("weather:qweather", {
    ...qweather,
    enabled: true,
    configJson: {
      ...(qweather.configJson ?? {}),
      realCallEnabled: true,
      apiHost: "qweather.example",
    },
    secretJson: { apiKey: "qweather-secret" },
  });

  const openMeteo = state.providers.get("weather:open_meteo");
  state.providers.set("weather:open_meteo", {
    ...openMeteo,
    enabled: true,
    configJson: {
      ...(openMeteo.configJson ?? {}),
      realCallEnabled: true,
      mode: "free",
    },
    secretJson: {},
  });

  const meteoblue = state.providers.get("weather:meteoblue");
  state.providers.set("weather:meteoblue", {
    ...meteoblue,
    enabled: true,
    configJson: {
      ...(meteoblue.configJson ?? {}),
      realCallEnabled: true,
      baseUrl: "https://my.meteoblue.com",
      packages: "basic-1h,clouds-1h",
    },
    secretJson: { apiKey: "meteoblue-secret" },
  });
}

function buildAstroServiceResponse(
  input: AstroServiceCalculateInput,
): AstroServiceCalculationResponse {
  const date = input.startDateTime.slice(0, 10);
  const nextDate = addOneDay(date);

  return {
    forecastStart: input.startDateTime,
    forecastEnd: `${nextDate}T00:00:00+08:00`,
    targetDates: [date],
    sun: {
      daily: [
        {
          date,
          sunrise: `${date}T05:08:00+08:00`,
          sunset: `${date}T18:58:00+08:00`,
          solarNoon: `${date}T12:03:00+08:00`,
          civilDawn: `${date}T04:42:00+08:00`,
          civilDusk: `${date}T19:24:00+08:00`,
          nauticalDawn: `${date}T04:10:00+08:00`,
          nauticalDusk: `${date}T19:57:00+08:00`,
          astronomicalDawn: `${date}T03:36:00+08:00`,
          astronomicalDusk: `${date}T20:31:00+08:00`,
          sunriseAzimuth: 67.2,
          sunsetAzimuth: 292.8,
        },
      ],
    },
    moon: {
      daily: [
        {
          date,
          moonPhaseValue: 0.26,
          moonPhaseNameZh: "盈凸月",
          moonIllumination: 0.36,
          waxingOrWaning: "waxing",
          moonrise: `${date}T10:42:00+08:00`,
          moonset: `${nextDate}T00:28:00+08:00`,
          moonAltitudeByHour: [
            { time: `${date}T20:00:00+08:00`, altitude: 32, azimuth: 250 },
            { time: `${nextDate}T01:00:00+08:00`, altitude: -7, azimuth: 296 },
          ],
          moonImpactLevel: "medium",
          moonImpactScore: 44,
          moonImpactReasonsZh: ["月亮照明处于 20%-50% 区间，月亮高度会决定干扰强度。"],
        },
      ],
      altitudeByHour: [
        { time: `${date}T20:00:00+08:00`, altitude: 32, azimuth: 250 },
        { time: `${nextDate}T01:00:00+08:00`, altitude: -7, azimuth: 296 },
      ],
    },
    night: {
      astronomicalNightWindows: [
        {
          date,
          start: `${date}T20:31:00+08:00`,
          end: `${nextDate}T03:35:00+08:00`,
          durationMinutes: 424,
          noteZh: "太阳高度低于 -18°。",
        },
      ],
      moonlessNightWindows: [
        {
          date,
          start: `${nextDate}T00:28:00+08:00`,
          end: `${nextDate}T03:35:00+08:00`,
          durationMinutes: 187,
          reasonZh: "月落后进入低月光影响窗口。",
        },
      ],
    },
    milkyWay: {
      candidateWindows: [
        {
          date,
          start: `${date}T22:20:00+08:00`,
          end: `${nextDate}T03:35:00+08:00`,
          bestTime: `${nextDate}T02:10:00+08:00`,
          minAltitude: 8,
          maxAltitude: 31,
          directionZh: "东南方",
          confidenceLevel: "high",
          noteZh: "银心高度超过 5° 的可见候选窗口。",
        },
      ],
      recommendedWindows: [
        {
          date,
          start: `${nextDate}T00:28:00+08:00`,
          end: `${nextDate}T03:35:00+08:00`,
          bestTime: `${nextDate}T02:10:00+08:00`,
          durationMinutes: 187,
          directionZh: "东南方",
          moonImpactLevel: "low",
          galacticCenterMaxAltitude: 31,
          reasonZh: "该窗口同时位于天文黑夜、低月光影响窗口和银心有效高度候选窗口内。",
          limitationsZh: ["天气数据仍为演示数据。"],
        },
      ],
      directionSummaryZh: "优先面向东南方观察银心位置。",
      calculationNoteZh: "银心位置由本地天文服务计算。",
    },
    calculationBasis: {
      ephemerisFileName: "de421.bsp",
      coordinateSystem: "WGS84",
      timezone: input.timezone,
      elevationMeters: input.elevationMeters,
      generatedAt: `${date}T00:00:01+08:00`,
      computeElapsedMs: 1200,
      samplingResolutionMinutes: {
        sunCrossing: 10,
        solarNoon: 10,
        moonAltitude: 60,
        moonlessWindow: 5,
        moonImpact: 15,
        galacticCenter: 10,
      },
    },
  };
}

function buildTerrainDemProfileResponse(
  overrides: Partial<AstroServiceTerrainDemProfileQueryResponse> = {},
): AstroServiceTerrainDemProfileQueryResponse {
  return {
    available: true,
    dataAvailable: true,
    sourceName: "Synthetic DEM",
    datasetName: "Synthetic terrain DEM",
    datasetYear: 2026,
    datasetVersion: "test-dem-v1",
    checksumShort: "abc123def456",
    observerElevationMeters: 1860,
    observerElevationSource: "input",
    target: "milky_way",
    targetAzimuthDegrees: 146,
    targetAltitudeDegrees: 31,
    horizonAltitudeDegrees: 34,
    obstructionClearanceDegrees: -3,
    obstructionLevel: "obstructed",
    confidence: "high",
    sampleCount: 120,
    validSampleCount: 118,
    maxSampleDistanceMeters: 30000,
    maxObstructionSample: {
      distanceMeters: 4200,
      latitudeWgs84: 30.104,
      longitudeWgs84: 118.198,
      terrainElevationMeters: 2420,
      apparentTerrainAngleDegrees: 34,
    },
    profileSamples: [
      {
        distanceMeters: 4200,
        latitudeWgs84: 30.104,
        longitudeWgs84: 118.198,
        terrainElevationMeters: 2420,
        apparentTerrainAngleDegrees: 34,
      },
    ],
    calculationBasis: {
      samplingConfigVersion: "terrain-dem-profile-v1",
      coordinateSystem: "WGS84",
      verticalUnit: "meter",
      maxDistanceMeters: 30000,
      sampleIntervalMeters: 250,
      requestedSampleCount: 120,
      demResolutionMeters: 30,
      obstructionRule: "clearance = target altitude - terrain horizon altitude",
    },
    demCoverage: {
      requiredTileId: "Copernicus_DSM_COG_30_N30_00_E118_00_DEM",
      status: "available",
      coveredByActiveDataset: true,
      tileFileExists: true,
      tileMetadataExists: true,
      sourceName: "Copernicus DEM GLO-90 COG",
      datasetName: "Copernicus DEM GLO-90",
      datasetVersion: "2021",
      datasetYear: 2021,
      resolutionMeters: 90,
      localPath:
        "/app/data/terrain-dem/incoming/Copernicus_DSM_COG_30_N30_00_E118_00_DEM/Copernicus_DSM_COG_30_N30_00_E118_00_DEM.tif",
      noteZh: "当前坐标已落在激活 DEM 数据集覆盖范围内。",
    },
    terrainHorizonNoteZh: "已使用本地 DEM 沿目标方位采样地形剖面。",
    queryElapsedMs: 9.8,
    cacheHit: false,
    ...overrides,
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function dedupeHour(overrides: Partial<NormalizedHourlyWeather> = {}): NormalizedHourlyWeather {
  return {
    time: "2026-05-20T00:00:00+08:00",
    temperature: 15,
    feelsLike: 14,
    humidity: 82,
    dewPointSpread: 2.8,
    pressure: 1006,
    windSpeed: 2.6,
    windGust: 4.2,
    windDirection: 135,
    precipitationProbability: 12,
    precipitation: 0,
    visibility: 22,
    dewPoint: 12.2,
    cloudTotal: 48,
    cloudLow: 20,
    cloudMid: 35,
    cloudHigh: 42,
    weatherCode: "3",
    weatherTextZh: "Partly cloudy",
    providerCode: "qweather",
    providerLabelZh: "QWeather",
    dataMode: "real",
    sourceConfidence: 0.86,
    missingFields: [],
    ...overrides,
  };
}

function buildDedupeWeatherProvider(calls: { current: number }): WeatherProvider {
  const firstHour = dedupeHour({
    time: "2026-05-20T00:00:00+08:00",
    providerCode: "qweather",
    providerLabelZh: "QWeather",
    dataMode: "real",
  });
  const hourly = Array.from({ length: 54 }, (_, index) => ({
    ...firstHour,
    time: isoHourFrom("2026-05-20T00:00:00+08:00", index),
    temperature: 12 + (index % 6),
  }));
  const daily: readonly NormalizedDailyWeather[] = [0, 1, 2].map((index) => ({
    date: dateForIndex(index),
    tempMin: 8,
    tempMax: 18,
    precipitationProbability: 20,
    precipitation: 0,
    windSpeed: 2.6,
    windGust: 4.2,
    windDirection: 135,
    humidity: 82,
    visibility: 22,
    cloudTotal: 48,
    cloudLow: 20,
    cloudMid: 35,
    cloudHigh: 42,
    weatherSummary: "Partly cloudy",
    sunrise: `${dateForIndex(index)}T05:10:00+08:00`,
    sunset: `${dateForIndex(index)}T18:55:00+08:00`,
    providerCode: "qweather",
    providerLabelZh: "QWeather",
    dataMode: "real",
    missingFields: [],
  }));

  return {
    source: {
      providerCode: "qweather",
      displayName: "QWeather",
      providerLabelZh: "QWeather",
      isMock: false,
      mode: "real",
    },
    async getCurrentWeather(input: WeatherRequestInput): Promise<CurrentWeather> {
      calls.current += 1;
      await delay(25);
      return {
        provider: "qweather",
        observedAt: firstHour.time,
        coordinates: input.coordinates,
        condition: "partly_cloudy",
        summary: "Partly cloudy",
        temperatureCelsius: 12,
        feelsLikeCelsius: 11,
        humidityPercent: 82,
        cloudCoverPercent: 48,
        windSpeedMetersPerSecond: 2.6,
        visibilityKilometers: 22,
      };
    },
    async getHourlyForecast(
      _input: WeatherRequestInput,
    ): Promise<readonly NormalizedHourlyWeather[]> {
      return hourly;
    },
    async getDailyForecast(
      _input: WeatherRequestInput,
    ): Promise<readonly NormalizedDailyWeather[]> {
      return daily;
    },
    async getWeatherAlerts(_input: WeatherRequestInput): Promise<readonly WeatherAlert[]> {
      return [];
    },
    async getAirQuality(_input: WeatherRequestInput): Promise<AirQuality> {
      return {
        provider: "qweather",
        observedAt: firstHour.time,
        aqi: 35,
        category: "good",
        pm25: 14,
        pm10: 22,
      };
    },
    normalizeHourlyWeather(_input: unknown): readonly NormalizedHourlyWeather[] {
      return hourly;
    },
    normalizeDailyWeather(_input: unknown): readonly NormalizedDailyWeather[] {
      return daily;
    },
    normalizeWeatherData(_input: unknown): WeatherDataBundle {
      return {
        hourly,
        daily,
        alerts: [],
        providerCode: "qweather",
        providerLabelZh: "QWeather",
        dataMode: "real",
        generatedAt: firstHour.time,
        noticeZh: "Weather data: QWeather",
      };
    },
  };
}

describe("forecast query validation route", () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    if (app) {
      await app.close();
      app = undefined;
    }
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("normalizes a public forecast query without calling providers", async () => {
    app = buildApiServer({ authConfig: forecastTestAuthConfig, logger: false });

    const response = await app.inject({
      method: "POST",
      url: "/forecast/validate-query",
      payload: validPayload,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      query: validPayload,
      labels: {
        horizon: "未来48小时",
        target: "云海",
      },
    });
  });

  it("rejects invalid coordinate ranges", async () => {
    app = buildApiServer({ authConfig: forecastTestAuthConfig, logger: false });

    const response = await app.inject({
      method: "POST",
      url: "/forecast/validate-query",
      payload: {
        ...validPayload,
        longitudeWgs84: 181,
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: "invalid_wgs84_coordinates",
      message: "当前地点缺少有效 WGS84 坐标，无法计算星空银河窗口。",
    });
  });

  it("allows guest 24h general forecast but rejects full modules before provider work", async () => {
    app = buildApiServer({ authConfig: testAuthConfig, logger: false });

    const allowed = await app.inject({
      method: "POST",
      url: "/forecast/calculate",
      payload: {
        ...validPayload,
        target: "general",
        horizon: "24h",
      },
    });

    expect(allowed.statusCode).toBe(200);

    await app.close();
    const getCurrentWeather = vi.fn();
    const getForecast = vi.fn();
    const weatherProvider = {
      getCurrentWeather,
      getForecast,
    } as unknown as WeatherProvider;
    app = buildApiServer({ authConfig: testAuthConfig, weatherProvider, logger: false });

    const rejected = await app.inject({
      method: "POST",
      url: "/forecast/calculate",
      payload: validPayload,
    });

    expect(rejected.statusCode).toBe(402);
    expect(rejected.json()).toMatchObject({
      error: "upgrade_required",
      required: {
        feature: "full_forecast_access",
        maxForecastHours: 168,
      },
    });
    expect(getCurrentWeather).not.toHaveBeenCalled();
    expect(getForecast).not.toHaveBeenCalled();
  });

  it("rejects guest 24h requests shifted into the future before provider work", async () => {
    const getCurrentWeather = vi.fn();
    const getForecast = vi.fn();
    const weatherProvider = {
      getCurrentWeather,
      getForecast,
    } as unknown as WeatherProvider;
    app = buildApiServer({ authConfig: testAuthConfig, weatherProvider, logger: false });

    const response = await app.inject({
      method: "POST",
      url: "/forecast/calculate",
      payload: {
        ...validPayload,
        target: "general",
        horizon: "24h",
        startDateTime: "2099-01-01T00:00:00+08:00",
      },
    });

    expect(response.statusCode).toBe(402);
    expect(response.json()).toMatchObject({ error: "upgrade_required" });
    expect(getCurrentWeather).not.toHaveBeenCalled();
    expect(getForecast).not.toHaveBeenCalled();
  });

  it("rejects guest AI explanation before calculating forecast or calling GPT / OpenAI", async () => {
    const getCurrentWeather = vi.fn();
    const getForecast = vi.fn();
    const weatherProvider = {
      getCurrentWeather,
      getForecast,
    } as unknown as WeatherProvider;
    app = buildApiServer({ authConfig: testAuthConfig, weatherProvider, logger: false });

    const response = await app.inject({
      method: "POST",
      url: "/forecast/ai-explain",
      payload: validPayload,
    });

    expect(response.statusCode).toBe(402);
    expect(response.json()).toMatchObject({ error: "upgrade_required" });
    expect(getCurrentWeather).not.toHaveBeenCalled();
    expect(getForecast).not.toHaveBeenCalled();
  });

  it("calculates a deterministic mock forecast result without real network calls", async () => {
    const fetchMock = vi.fn(() => {
      throw new Error("real network calls are disabled in forecast tests");
    });
    vi.stubGlobal("fetch", fetchMock);
    app = buildApiServer({ authConfig: forecastTestAuthConfig, logger: false });

    const response = await app.inject({
      method: "POST",
      url: "/forecast/calculate",
      payload: validPayload,
    });
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(body).toMatchObject({
      place: {
        name: "黄山光明顶",
        countryCode: "CN",
      },
      horizon: "48h",
      target: "cloud_sea",
      recommendationLabel: expect.stringMatching(
        /不建议前往|推荐重点关注|不建议专程|谨慎参考|值得等待|推荐前往/,
      ),
      isMock: true,
      dataNotice:
        "天气数据：演示数据；地形数据：演示数据；天文数据：本地算法计算。当前结果基于演示天气数据生成，仅用于体验分析流程。正式天气数据源启用后，将显示对应的数据来源与预报时间。天文时间基于地点经纬度本地计算，实际拍摄仍需结合云量、光污染和地形遮挡。",
      dataSourceLabel: "演示数据",
      weatherDataMode: "mock",
      weatherNoticeZh: "天气数据：演示数据",
    });
    expect(body.terrainAnalysis).toMatchObject({
      dataSource: "mock_terrain",
      dataSourceLabelZh: "基础地形资料",
      terrainProfile: {
        locationElevation: 1860,
        terrainCloudSeaPotential: "high",
      },
      horizonProfile: {
        blockedDirectionsZh: expect.any(Array),
      },
    });
    expect(body.overallScore).toEqual(expect.any(Number));
    expect(body.aiExplanation).toMatchObject({
      metadata: expect.objectContaining({
        source: "deterministic_fallback",
      }),
      conclusion: expect.objectContaining({
        recommendedDayZh: expect.any(String),
        whetherWorthDedicatedTripZh: expect.any(String),
      }),
      weatherTrend: expect.objectContaining({
        temperatureSummaryZh: expect.any(String),
        rainSummaryZh: expect.any(String),
        windSummaryZh: expect.any(String),
        transparencySummaryZh: expect.any(String),
      }),
      riskAndGear: expect.objectContaining({
        clothingZh: expect.any(String),
        gearZh: expect.any(String),
      }),
    });
    expect(body.cloudSeaAnalysis).toMatchObject({
      cloudSeaOpportunityScore: expect.any(Number),
      whiteoutRiskScore: expect.any(Number),
      travelScore: expect.any(Number),
      recommendationLabel: expect.stringMatching(/推荐重点关注|不建议专程|谨慎参考|值得等待/),
    });
    expect(body.forecastStart).toBe(body.calendarBasis.forecastStart);
    expect(body.forecastEnd).toBe(body.calendarBasis.forecastEnd);
    expect(body.targetDates).toEqual(body.calendarBasis.targetDates);
    expect(body.professionalHourlyDataTimeBasis).toMatchObject({
      timezone: "Asia/Shanghai",
      stepMinutes: 60,
      temperatureBasis: expect.stringMatching(
        /terrain_adjusted|terrain_adjusted_lapse_estimate|raw_grid|provider_point|mixed|unknown/,
      ),
      cloudLayerBasis: expect.stringMatching(/explicit_layers|partial_layers|total_only|unknown/),
      partialData: false,
    });
    expect(body.professionalHourlyData).toHaveLength(48);
    expect(body.professionalHourlyData[0]).toMatchObject({
      time: expect.any(String),
      dateLabel: expect.any(String),
      timeLabel: expect.any(String),
      weatherText: expect.any(String),
      cloudSeaSignal: expect.stringMatching(
        /可拍窗口|白墙风险|形成信号|雨后开口|霞光参考|云层纹理|普通|需复核/,
      ),
      cloudTotalPercent: expect.any(Number),
      cloudHighPercent: expect.any(Number),
      cloudMidPercent: expect.any(Number),
      cloudLowPercent: expect.any(Number),
      rawTemperatureC: expect.any(Number),
      displayedTemperatureC: expect.any(Number),
      temperatureBasis: expect.stringMatching(
        /terrain_adjusted|terrain_adjusted_lapse_estimate|raw_grid|provider_point|mixed|unknown/,
      ),
      temperatureBasisNoteZh: expect.any(String),
      cloudLayerBasis: expect.stringMatching(/explicit_layers|partial_layers|total_only|unknown/),
      dewPointC: expect.any(Number),
      dewPointSpreadC: expect.any(Number),
      relativeHumidityPercent: expect.any(Number),
      precipitationAmountMm: expect.any(Number),
      precipitationProbabilityPercent: expect.any(Number),
      visibilityMeters: expect.any(Number),
      windSpeedMs: expect.any(Number),
      windDirectionDeg: expect.any(Number),
    });
    expect(Object.keys(body.professionalHourlyData[0])).not.toEqual(
      expect.arrayContaining([
        "providerCode",
        "providerLabelZh",
        "fieldMetadata",
        "sourceNotes",
        "estimatedFields",
        "temperatureC",
      ]),
    );
    expect(JSON.stringify(body.professionalHourlyData)).not.toMatch(
      /qweather|open[-_ ]?meteo|meteoblue|api[_-]?key|secret|token/i,
    );
    expect(body.scores).toMatchObject({
      sunriseGlow: {
        label: "朝霞",
        score: expect.any(Number),
      },
      sunsetGlow: {
        label: "晚霞",
        score: expect.any(Number),
      },
      cloudSea: {
        label: "云海",
        score: expect.any(Number),
      },
      whiteoutRisk: {
        label: "白墙风险",
        score: expect.any(Number),
      },
      stars: {
        label: "星空",
        score: expect.any(Number),
      },
      milkyWay: {
        label: "银河",
        score: expect.any(Number),
      },
      transparency: {
        label: "通透度",
        score: expect.any(Number),
      },
    });
    expect(body.astroSummaries[0]).toMatchObject({
      timezone: "Asia/Shanghai",
      sunrise: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+08:00$/),
      sunset: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+08:00$/),
      moonPhaseNameZh: expect.stringMatching(/新月|娥眉月|上弦月|盈凸月|满月|亏凸月|下弦月|残月/),
      waxingOrWaning: expect.stringMatching(/waxing|waning|unknown/),
      lunarDateText: expect.any(String),
      calculationNoteZh:
        "月相基于本地天文算法计算；农历日期基于本地历法库生成。天文时间基于地点经纬度本地计算，实际拍摄仍需结合云量、光污染和地形遮挡。",
      moonInfo: {
        lunarDateText: expect.any(String),
      },
      milkyWayNoteZh: "银河窗口为简化本地估算，实际拍摄仍需结合云量、月光、光污染和地形遮挡。",
    });
    expect(Date.parse(body.astroSummaries[0].sunrise)).toBeLessThan(
      Date.parse(body.astroSummaries[0].sunset),
    );
    expect(body.astroSummaries[0].moonIllumination).toBeGreaterThanOrEqual(0);
    expect(body.astroSummaries[0].moonIllumination).toBeLessThanOrEqual(1);
    expect(Object.keys(body.astroSummaries[0].moonAltitudeByHour)).toHaveLength(24);
    expect(body.bestWindows.length).toBeGreaterThan(0);
    expect(body.dailySummaries.length).toBeGreaterThanOrEqual(2);
    expect(body.targetDailyBreakdown.length).toBeGreaterThanOrEqual(2);
    expect(body.calendarBasis).toMatchObject({
      timezone: "Asia/Shanghai",
      timezoneLabel: "Asia/Shanghai（中国标准时间）",
      horizonHours: 48,
      coordinateSource: "本地机位 WGS84 坐标",
      wgs84Coordinates: {
        latitude: 30.13012,
        longitude: 118.16389,
      },
    });
    expect(body.calendarBasis.targetDates.length).toBeGreaterThanOrEqual(2);
    expect(body.calendarBasis.calendarDays[0]).toMatchObject({
      lunarDateText: expect.any(String),
    });
    expect(body.keyReasons.length).toBeGreaterThan(0);
    expect(body.photographyAdvice.length).toBeGreaterThan(0);
  });

  it("dedupes identical concurrent forecast calculate requests", async () => {
    const providerCalls = { current: 0 };
    app = buildApiServer({
      authConfig: forecastTestAuthConfig,
      logger: false,
      weatherProvider: buildDedupeWeatherProvider(providerCalls),
      env: {
        ...process.env,
        ENABLE_ASTRO_SERVICE: "false",
        FORECAST_CALCULATE_CACHE_TTL_MS: "300000",
      },
    });
    const payload = {
      ...validPayload,
      timezone: "Asia/Shanghai",
      startDateTime: "2026-05-20T00:00:00+08:00",
    };

    const [firstResponse, secondResponse] = await Promise.all([
      app.inject({
        method: "POST",
        url: "/forecast/calculate",
        payload,
      }),
      app.inject({
        method: "POST",
        url: "/forecast/calculate",
        payload,
      }),
    ]);

    expect(firstResponse.statusCode).toBe(200);
    expect(secondResponse.statusCode).toBe(200);
    expect(providerCalls.current).toBe(1);
    expect(secondResponse.json()).toEqual(firstResponse.json());
  });

  it("enriches a non-seeded selected location with mocked elevation during calculation", async () => {
    const elevationProvider = {
      getElevationForLocation: vi.fn(async () => ({
        elevationMeters: 1326,
        elevationSource: "open_meteo_elevation" as const,
        elevationConfidence: "medium" as const,
      })),
    };
    app = buildApiServer({
      authConfig: forecastTestAuthConfig,
      elevationProvider,
      logger: false,
    });

    const response = await app.inject({
      method: "POST",
      url: "/forecast/calculate",
      payload: {
        ...validPayload,
        name: "非种子坐标测试点",
        source: "amap",
        latitudeGcj02: 30.2495,
        longitudeGcj02: 120.1124,
        latitudeWgs84: 30.2528,
        longitudeWgs84: 120.1078,
        elevationMeters: undefined,
        elevationSource: undefined,
        elevationConfidence: undefined,
        locationId: undefined,
        photoSpotId: undefined,
      },
    });
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(elevationProvider.getElevationForLocation).toHaveBeenCalledTimes(1);
    expect(elevationProvider.getElevationForLocation).toHaveBeenCalledWith(
      expect.objectContaining({
        locationName: "非种子坐标测试点",
        coordinate: expect.objectContaining({
          latitude: 30.2528,
          longitude: 120.1078,
          system: "wgs84",
        }),
      }),
    );
    expect(body.terrainAnalysis).toMatchObject({
      dataSource: "open_meteo_elevation",
      dataSourceLabelZh: "海拔已估算",
      isMock: false,
      terrainProfile: {
        elevationMeters: 1326,
        locationElevation: 1326,
        elevationSource: "open_meteo_elevation",
        elevationConfidence: "medium",
        elevationDiff5km: null,
      },
    });
    expect(body.keyReasons.join(" ")).toContain("机位海拔约 1326 米");
    expect(body.keyReasons.join(" ")).toContain("周边高差暂未计算");
  });

  it("calculates cloud sea from browser geolocation without requiring a spot id", async () => {
    const elevationProvider = {
      getElevationForLocation: vi.fn(async () => ({
        elevationMeters: 58,
        elevationSource: "open_meteo_elevation" as const,
        elevationConfidence: "medium" as const,
      })),
    };
    app = buildApiServer({
      authConfig: forecastTestAuthConfig,
      elevationProvider,
      logger: false,
    });

    const response = await app.inject({
      method: "POST",
      url: "/forecast/calculate",
      payload: {
        name: "当前位置",
        source: "browser_geolocation",
        coordinateSource: "browser_geolocation",
        latitudeGcj02: 31.2304,
        longitudeGcj02: 121.4737,
        latitudeWgs84: 31.2304,
        longitudeWgs84: 121.4737,
        horizon: "48h",
        target: "cloud_sea",
        timezone: "Asia/Shanghai",
      },
    });
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(elevationProvider.getElevationForLocation).toHaveBeenCalledWith(
      expect.objectContaining({
        locationName: "当前位置",
        coordinate: expect.objectContaining({
          latitude: 31.2304,
          longitude: 121.4737,
          system: "wgs84",
        }),
        elevationMeters: null,
        elevationSource: undefined,
        elevationConfidence: undefined,
      }),
    );
    expect(body.target).toBe("cloud_sea");
    expect(body.calendarBasis).toMatchObject({
      timezone: "Asia/Shanghai",
      coordinateSource: "浏览器定位 WGS84 坐标",
      wgs84Coordinates: {
        latitude: 31.2304,
        longitude: 121.4737,
      },
    });
    expect(body.terrainAnalysis.terrainProfile).toMatchObject({
      elevationMeters: 58,
      elevationSource: "open_meteo_elevation",
      elevationConfidence: "medium",
    });
  });

  it("uses configured real weather providers through the server pipeline with mocked fetch", async () => {
    const { client, state } = await createFakeDatabaseClient();
    configureRealWeatherProviders(state);
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("qweather.example/v7/weather/now")) {
        return new Response(
          JSON.stringify({
            code: "200",
            now: {
              obsTime: "2026-05-20T00:00:00+08:00",
              temp: "13",
              feelsLike: "11",
              icon: "101",
              text: "多云",
              wind360: "120",
              windSpeed: "9",
              humidity: "82",
              pressure: "1008",
              vis: "22",
              cloud: "52",
              dew: "10",
            },
          }),
        );
      }
      if (url.includes("qweather.example/v7/weather/")) {
        return new Response(
          JSON.stringify(
            url.includes("7d") ? buildQWeatherDailyPayload() : buildQWeatherHourlyPayload(),
          ),
        );
      }
      if (url.includes("api.open-meteo.com/v1/forecast")) {
        return new Response(JSON.stringify(buildOpenMeteoPayload()));
      }
      if (url.includes("my.meteoblue.com/packages/basic-1h_clouds-1h")) {
        return new Response(JSON.stringify(buildMeteobluePayload()));
      }

      throw new Error(`unexpected test URL: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    app = buildApiServer({
      dbClient: client,
      authConfig: forecastTestAuthConfig,
      env: {
        ...process.env,
        NODE_ENV: "development",
        ENABLE_ASTRO_SERVICE: "false",
      },
      logger: false,
    });

    const response = await app.inject({
      method: "POST",
      url: "/forecast/calculate",
      payload: {
        ...validPayload,
        target: "general",
        horizon: "48h",
      },
    });
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(body.weatherDataMode).toBe("real");
    expect(body.currentWeather).toMatchObject({
      providerCode: "qweather",
      rawTemperature: 13,
      temperature: 11,
      elevationAdjustedTemperature: 11,
      feelsLike: 9,
      temperatureAdjustment: expect.objectContaining({
        correctionApplied: true,
        correctionCelsius: 2,
        providerElevationKnown: false,
        correctionReason: "unknown_provider_elevation_conservative",
      }),
    });
    expect(body.weatherSourceSummaries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          providerCode: "qweather",
          attempted: true,
          success: true,
          status: "available",
        }),
        expect.objectContaining({
          providerCode: "open_meteo",
          attempted: true,
          success: true,
          status: "available",
        }),
        expect.objectContaining({
          providerCode: "meteoblue",
          attempted: true,
          success: true,
          status: "available",
        }),
      ]),
    );
    expect(body.weatherFusionSummary).toMatchObject({
      professionalSourceStatus: "专业增强：meteoblue 通过",
      confidenceLevel: "high",
      confidenceByTarget: expect.objectContaining({
        general: expect.any(Number),
        cloud_sea: expect.any(Number),
      }),
    });
    expect(body.weatherProviderRuntimeSnapshot).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          providerCode: "meteoblue",
          enabled: true,
          realCallEnabled: true,
          apiKeyPresent: true,
          baseUrl: "https://my.meteoblue.com",
          packages: ["basic-1h", "clouds-1h"],
          parserVersion: expect.stringContaining("meteoblue-data1h"),
        }),
      ]),
    );
    expect(
      body.weatherSourceSummaries.find(
        (summary: { providerCode: string }) => summary.providerCode === "meteoblue",
      ),
    ).toMatchObject({
      providerCode: "meteoblue",
      attempted: true,
      success: true,
      status: "available",
      statusCode: 200,
      topLevelKeys: expect.arrayContaining(["metadata", "data_1h", "data_day"]),
      packages: ["basic-1h", "clouds-1h"],
      extractedFields: expect.arrayContaining(["temperature", "humidity", "cloudTotal"]),
      cacheHit: false,
      latencyMs: expect.any(Number),
    });
    expect(body.currentWeather).toMatchObject({
      cloudLow: expect.any(Number),
      cloudMid: expect.any(Number),
      cloudHigh: expect.any(Number),
      visibility: expect.any(Number),
    });
    expect(body.clothingGuide.titleZh).toEqual(expect.any(String));
    expect(JSON.stringify(body)).not.toContain("qweather-secret");
    expect(JSON.stringify(body)).not.toContain("meteoblue-secret");
  });

  it("requests buffered provider coverage before clipping future48 Cloud Sea display rows", async () => {
    const { client, state } = await createFakeDatabaseClient();
    configureRealWeatherProviders(state);
    const rollingStart = "2026-06-04T00:00:00+08:00";
    const requestedUrls: string[] = [];
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      requestedUrls.push(url);
      if (url.includes("qweather.example/v7/weather/now")) {
        return new Response(
          JSON.stringify({
            code: "200",
            now: {
              obsTime: "2026-06-04T08:22:00+08:00",
              temp: "13",
              feelsLike: "11",
              icon: "101",
              text: "多云",
              wind360: "120",
              windSpeed: "9",
              humidity: "82",
              pressure: "1008",
              vis: "22",
              cloud: "52",
              dew: "10",
            },
          }),
        );
      }
      if (url.includes("qweather.example/v7/weather/")) {
        return new Response(
          JSON.stringify(
            url.includes("/7d") || url.includes("/15d")
              ? buildQWeatherDailyPayload({ start: rollingStart, days: 3 })
              : buildQWeatherHourlyPayload({ start: rollingStart, hours: 72 }),
          ),
        );
      }
      if (url.includes("api.open-meteo.com/v1/forecast")) {
        return new Response(
          JSON.stringify(buildOpenMeteoPayload({ start: rollingStart, hours: 72, days: 3 })),
        );
      }
      if (url.includes("my.meteoblue.com/packages/basic-1h_clouds-1h")) {
        return new Response(
          JSON.stringify(buildMeteobluePayload({ start: rollingStart, hours: 72, days: 3 })),
        );
      }

      throw new Error(`unexpected test URL: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    app = buildApiServer({
      dbClient: client,
      authConfig: forecastTestAuthConfig,
      env: {
        ...process.env,
        NODE_ENV: "development",
        ENABLE_ASTRO_SERVICE: "false",
      },
      logger: false,
    });

    const response = await app.inject({
      method: "POST",
      url: "/forecast/calculate",
      payload: {
        ...validPayload,
        target: "cloud_sea",
        horizon: "48h",
        timezone: "Asia/Shanghai",
        startDateTime: "2026-06-04T08:22:00+08:00",
      },
    });
    const body = response.json();
    const openMeteoUrl = requestedUrls.find((url) => {
      if (!url.includes("api.open-meteo.com/v1/forecast")) {
        return false;
      }
      const params = new URL(url).searchParams;
      return params.get("forecast_hours") === "54" && params.get("forecast_days") === "3";
    });

    expect(response.statusCode).toBe(200);
    expect(openMeteoUrl).toBeDefined();
    const openMeteoParams = new URL(openMeteoUrl!).searchParams;
    expect(openMeteoParams.get("forecast_hours")).toBe("54");
    expect(openMeteoParams.get("forecast_days")).toBe("3");
    expect(requestedUrls).toEqual(
      expect.arrayContaining([
        expect.stringContaining("qweather.example/v7/weather/72h"),
        expect.stringContaining("qweather.example/v7/weather/7d"),
      ]),
    );
    expect(body.professionalHourlyData).toHaveLength(48);
    expect(body.professionalHourlyData[0]).toMatchObject({
      time: "2026-06-04T09:00:00+08:00",
    });
    expect(body.professionalHourlyData.at(-1)).toMatchObject({
      time: "2026-06-06T08:00:00+08:00",
    });
    expect(body.professionalHourlyDataTimeBasis).toMatchObject({
      anchorStartLocal: "2026-06-04T09:00:00+08:00",
      anchorEndLocal: "2026-06-06T08:00:00+08:00",
      expectedRowCount: 48,
      requestedHours: 48,
      minRequestHours: 48,
      recommendedRequestHours: 54,
      requiredForecastDays: 3,
      requestStartLocal: "2026-06-04T00:00:00+08:00",
      requestEndLocal: "2026-06-06T23:00:00+08:00",
      providerCoverageVersion: "rolling-provider-coverage-v2",
      coverageRule: "forecast_hours_with_buffer",
      partialData: false,
    });
    expect(JSON.stringify(body)).not.toContain("qweather-secret");
    expect(JSON.stringify(body)).not.toContain("meteoblue-secret");
  });

  it("keeps QWeather and Open-Meteo confidence when meteoblue returns unexpected valid JSON", async () => {
    const { client, state } = await createFakeDatabaseClient();
    configureRealWeatherProviders(state);
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("qweather.example/v7/weather/now")) {
        return new Response(
          JSON.stringify({
            code: "200",
            now: {
              obsTime: "2026-05-20T00:00:00+08:00",
              temp: "13",
              feelsLike: "11",
              icon: "101",
              text: "多云",
              wind360: "120",
              windSpeed: "9",
              humidity: "82",
              pressure: "1008",
              vis: "22",
              cloud: "52",
              dew: "10",
            },
          }),
        );
      }
      if (url.includes("qweather.example/v7/weather/")) {
        return new Response(
          JSON.stringify(
            url.includes("7d") ? buildQWeatherDailyPayload() : buildQWeatherHourlyPayload(),
          ),
        );
      }
      if (url.includes("api.open-meteo.com/v1/forecast")) {
        return new Response(JSON.stringify(buildOpenMeteoPayload()));
      }
      if (url.includes("my.meteoblue.com/packages/basic-1h_clouds-1h")) {
        return new Response(JSON.stringify({ metadata: { name: "basic-1h_clouds-1h" } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      throw new Error(`unexpected test URL: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    app = buildApiServer({
      dbClient: client,
      authConfig: forecastTestAuthConfig,
      env: {
        ...process.env,
        NODE_ENV: "development",
        ENABLE_ASTRO_SERVICE: "false",
      },
      logger: false,
    });

    const response = await app.inject({
      method: "POST",
      url: "/forecast/calculate",
      payload: {
        ...validPayload,
        target: "general",
        horizon: "48h",
      },
    });
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(body.weatherDataMode).toBe("real");
    expect(body.weatherFusionSummary.confidenceLevel).not.toBe("low");
    expect(body.weatherFusionSummary.confidenceByTarget.general).toBeGreaterThanOrEqual(0.55);
    expect(
      body.weatherSourceSummaries.find(
        (summary: { providerCode: string }) => summary.providerCode === "meteoblue",
      ),
    ).toMatchObject({
      attempted: true,
      success: false,
      errorCategory: "parse_error",
      messageZh: "meteoblue 返回中未找到 data_1h。",
      topLevelKeys: ["metadata"],
      packages: ["basic-1h", "clouds-1h"],
      extractedFields: [],
    });
    expect(JSON.stringify(body)).not.toContain("meteoblue-secret");
  });

  it("does not keep a stale meteoblue source after provider runtime config changes", async () => {
    const { client, state } = await createFakeDatabaseClient();
    configureRealWeatherProviders(state);
    const meteoblueProvider = state.providers.get("weather:meteoblue");
    state.providers.set("weather:meteoblue", {
      ...meteoblueProvider,
      enabled: true,
      updatedAt: new Date("2026-05-20T00:00:00.000Z"),
      configJson: {
        ...(meteoblueProvider.configJson ?? {}),
        realCallEnabled: true,
        baseUrl: "https://my.meteoblue.com",
        packages: "basic-1h,clouds-1h",
      },
      secretJson: { apiKey: "old-meteoblue-secret" },
    });
    let meteoblueCalls = 0;
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("qweather.example/v7/weather/now")) {
        return new Response(
          JSON.stringify({
            code: "200",
            now: {
              obsTime: "2026-05-20T00:00:00+08:00",
              temp: "13",
              feelsLike: "11",
              icon: "101",
              text: "多云",
              wind360: "120",
              windSpeed: "9",
              humidity: "82",
              pressure: "1008",
              vis: "22",
              cloud: "52",
              dew: "10",
            },
          }),
        );
      }
      if (url.includes("qweather.example/v7/weather/")) {
        return new Response(
          JSON.stringify(
            url.includes("7d") ? buildQWeatherDailyPayload() : buildQWeatherHourlyPayload(),
          ),
        );
      }
      if (url.includes("api.open-meteo.com/v1/forecast")) {
        return new Response(JSON.stringify(buildOpenMeteoPayload()));
      }
      if (url.includes("my.meteoblue.com/packages/basic-1h_clouds-1h")) {
        meteoblueCalls += 1;
        if (url.includes("apikey=old-meteoblue-secret")) {
          return new Response(JSON.stringify({ error: "Invalid API key" }), {
            status: 401,
            headers: {
              "Content-Type": "application/json",
            },
          });
        }
        return new Response(JSON.stringify(buildMeteobluePayload()));
      }

      throw new Error(`unexpected test URL: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    app = buildApiServer({
      dbClient: client,
      authConfig: forecastTestAuthConfig,
      env: {
        ...process.env,
        NODE_ENV: "development",
        ENABLE_ASTRO_SERVICE: "false",
      },
      logger: false,
    });

    const firstResponse = await app.inject({
      method: "POST",
      url: "/forecast/calculate",
      payload: {
        ...validPayload,
        target: "general",
        horizon: "48h",
      },
    });
    const firstBody = firstResponse.json();
    expect(firstResponse.statusCode).toBe(200);
    expect(
      firstBody.weatherSourceSummaries.find(
        (summary: { providerCode: string }) => summary.providerCode === "meteoblue",
      ),
    ).toMatchObject({
      attempted: true,
      success: false,
      errorCategory: "invalid_key",
    });

    state.providers.set("weather:meteoblue", {
      ...meteoblueProvider,
      enabled: true,
      updatedAt: new Date("2026-05-25T00:00:00.000Z"),
      configJson: {
        ...(meteoblueProvider.configJson ?? {}),
        realCallEnabled: true,
        baseUrl: "https://my.meteoblue.com",
        packages: "basic-1h,clouds-1h",
      },
      secretJson: { apiKey: "new-meteoblue-secret" },
    });

    const secondResponse = await app.inject({
      method: "POST",
      url: "/forecast/calculate",
      payload: {
        ...validPayload,
        target: "general",
        horizon: "48h",
      },
    });
    const secondBody = secondResponse.json();

    expect(secondResponse.statusCode).toBe(200);
    expect(meteoblueCalls).toBeGreaterThanOrEqual(2);
    expect(
      fetchMock.mock.calls.some((call) => String(call[0]).includes("apikey=new-meteoblue-secret")),
    ).toBe(true);
    expect(
      secondBody.weatherSourceSummaries.find(
        (summary: { providerCode: string }) => summary.providerCode === "meteoblue",
      ),
    ).toMatchObject({
      attempted: true,
      success: true,
      status: "available",
      cacheHit: false,
    });
    expect(secondBody.weatherFusionSummary).toMatchObject({
      professionalSourceStatus: "专业增强：meteoblue 通过",
    });
    expect(JSON.stringify(secondBody)).not.toContain("new-meteoblue-secret");
    expect(JSON.stringify(secondBody)).not.toContain("old-meteoblue-secret");
  });

  it("returns multi-day windows for a 7 day astro calculation without real network calls", async () => {
    const fetchMock = vi.fn(() => {
      throw new Error("real network calls are disabled in forecast tests");
    });
    vi.stubGlobal("fetch", fetchMock);
    app = buildApiServer({ authConfig: forecastTestAuthConfig, logger: false });

    const response = await app.inject({
      method: "POST",
      url: "/forecast/calculate",
      payload: {
        ...validPayload,
        horizon: "7d",
        target: "astro",
      },
    });
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(body.targetDates.length).toBeGreaterThanOrEqual(7);
    expect(body.dailySummaries.length).toBeGreaterThanOrEqual(7);
    expect(
      body.bestWindows.filter((window: { label: string }) => window.label.startsWith("天文黑夜"))
        .length,
    ).toBeGreaterThan(1);
    expect(body.astroAnalysis.milkyWayCandidateWindows.length).toBeGreaterThan(1);
    expect(
      body.astroAnalysis.recommendedMilkyWayWindows.every((window: { date: string }) => {
        const daily = body.astroAnalysis.dailyAstro.find(
          (day: { date: string }) => day.date === window.date,
        );
        return daily?.astroShootable === true && daily.weatherBlockers.length === 0;
      }),
    ).toBe(true);
    expect(body.astroDataSourceLabelZh).toBe("简化本地估算");
    expect(body.dataNotice).toContain("天文数据：简化本地估算");
  });

  it("uses astro-service output for target astro when enabled", async () => {
    const calculateMock = vi.fn((input: AstroServiceCalculateInput) =>
      Promise.resolve(buildAstroServiceResponse(input)),
    );
    const astroServiceClient: AstroServiceClientLike = {
      calculate: calculateMock,
    };
    app = buildApiServer({
      authConfig: forecastTestAuthConfig,
      astroServiceClient,
      env: {
        ...process.env,
        ENABLE_ASTRO_SERVICE: "true",
        ASTRO_SERVICE_URL: "http://127.0.0.1:4100",
      },
      logger: false,
    });

    const response = await app.inject({
      method: "POST",
      url: "/forecast/calculate",
      payload: {
        ...validPayload,
        target: "astro",
      },
    });
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(calculateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        latitudeWgs84: validPayload.latitudeWgs84,
        longitudeWgs84: validPayload.longitudeWgs84,
        elevationMeters: 1860,
        timezone: "Asia/Shanghai",
        horizon: "48h",
        startDateTime: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      }),
    );
    expect(body.astroDataSourceLabelZh).toBe("本地天文服务计算");
    expect(body.dataNotice).toContain("天文数据：本地天文服务计算");
    expect(body.astroCalculationBasis).toMatchObject({
      ephemerisFileName: "de421.bsp",
      coordinateSystem: "WGS84",
      timezone: "Asia/Shanghai",
    });
    expect(body.astroSummaries[0]).toMatchObject({
      moonIllumination: 0.36,
      moonset: expect.stringMatching(/T00:28:00\+08:00$/),
      milkyWayCalculationPrecision: "skyfield",
    });
    expect(body.astroAnalysis.recommendedMilkyWayWindows[0]).toMatchObject({
      labelZh: "推荐银河窗口",
      directionZh: "东南方",
    });
  });

  it("enriches astro terrain horizon scoring with available local DEM profiles", async () => {
    const calculateMock = vi.fn((input: AstroServiceCalculateInput) => {
      const response = buildAstroServiceResponse(input);
      return Promise.resolve({
        ...response,
        milkyWay: {
          ...response.milkyWay,
          recommendedWindows: response.milkyWay.recommendedWindows.map((window) => ({
            ...window,
            bestAzimuth: 146,
          })),
        },
      });
    });
    const queryTerrainDemProfileMock = vi.fn(async () => buildTerrainDemProfileResponse());
    const astroServiceClient: AstroServiceClientLike = {
      calculate: calculateMock,
      queryTerrainDemProfile: queryTerrainDemProfileMock,
    };
    app = buildApiServer({
      authConfig: forecastTestAuthConfig,
      astroServiceClient,
      env: {
        ...process.env,
        ENABLE_ASTRO_SERVICE: "true",
        ASTRO_SERVICE_URL: "http://127.0.0.1:4100",
      },
      logger: false,
    });

    const response = await app.inject({
      method: "POST",
      url: "/forecast/calculate",
      payload: {
        ...validPayload,
        target: "astro",
      },
    });
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(queryTerrainDemProfileMock).toHaveBeenCalledWith(
      expect.objectContaining({
        latitudeWgs84: validPayload.latitudeWgs84,
        longitudeWgs84: validPayload.longitudeWgs84,
        observerElevationMeters: 1860,
        target: "milky_way",
        targetAzimuthDegrees: 146,
        targetAltitudeDegrees: 31,
        maxDistanceMeters: 30000,
        sampleIntervalMeters: 250,
      }),
    );
    expect(body.terrainAnalysis).toMatchObject({
      dataSource: "dem",
      dataSourceLabelZh: "本地 DEM 地形剖面",
      isMock: false,
    });
    expect(body.terrainAnalysis.horizonProfile.directionSamples[0]).toMatchObject({
      target: "milky_way",
      dataSource: "dem_raster",
      dataSourceLabelZh: "本地 DEM 地形剖面",
      sampleCount: 120,
      validSampleCount: 118,
      datasetVersion: "test-dem-v1",
      terrainDemCoverage: expect.objectContaining({
        requiredTileId: "Copernicus_DSM_COG_30_N30_00_E118_00_DEM",
        status: "available",
      }),
    });
    expect(
      body.terrainAnalysis.horizonProfile.directionSamples.filter(
        (sample: { target?: string | null }) => sample.target === "milky_way",
      ),
    ).toHaveLength(1);
    expect(body.astroAnalysis.terrainHorizonAssessment).toMatchObject({
      obstructionLevel: "obstructed",
      confidence: "high",
      dataSource: "dem_raster",
      dataSourceLabelZh: "本地 DEM 地形剖面",
      directionSample: expect.objectContaining({
        dataSource: "dem_raster",
        observerElevationMeters: 1860,
        datasetYear: 2026,
      }),
      professionalDiagnostics: expect.objectContaining({
        sampleCount: 120,
        validSampleCount: 118,
        maxSampleDistanceMeters: 30000,
        datasetVersion: "test-dem-v1",
        terrainDemCoverage: expect.objectContaining({
          requiredTileId: "Copernicus_DSM_COG_30_N30_00_E118_00_DEM",
          status: "available",
        }),
      }),
    });
  });

  it("keeps missing DEM coverage diagnostic without treating terrain as clear", async () => {
    const calculateMock = vi.fn((input: AstroServiceCalculateInput) => {
      const response = buildAstroServiceResponse(input);
      return Promise.resolve({
        ...response,
        milkyWay: {
          ...response.milkyWay,
          recommendedWindows: response.milkyWay.recommendedWindows.map((window) => ({
            ...window,
            bestAzimuth: 146,
          })),
        },
      });
    });
    const queryTerrainDemProfileMock = vi.fn(async () =>
      buildTerrainDemProfileResponse({
        available: false,
        dataAvailable: false,
        unavailableReason: "terrain_dem_out_of_bounds",
        horizonAltitudeDegrees: undefined,
        obstructionClearanceDegrees: undefined,
        obstructionLevel: "unknown",
        confidence: "low",
        sampleCount: 0,
        validSampleCount: 0,
        maxObstructionSample: undefined,
        profileSamples: [],
        demCoverage: {
          requiredTileId: "Copernicus_DSM_COG_30_N30_00_E118_00_DEM",
          status: "missing",
          coveredByActiveDataset: false,
          tileFileExists: false,
          tileMetadataExists: false,
          sourceName: "Copernicus DEM GLO-90 COG",
          datasetName: "Copernicus DEM GLO-90",
          datasetVersion: "2021",
          datasetYear: 2021,
          resolutionMeters: 90,
          localPath:
            "/app/data/terrain-dem/incoming/Copernicus_DSM_COG_30_N30_00_E118_00_DEM/Copernicus_DSM_COG_30_N30_00_E118_00_DEM.tif",
          noteZh: "当前激活 DEM 未覆盖该坐标；需要补充 DEM 瓦片。",
        },
      }),
    );
    const astroServiceClient: AstroServiceClientLike = {
      calculate: calculateMock,
      queryTerrainDemProfile: queryTerrainDemProfileMock,
    };
    app = buildApiServer({
      authConfig: forecastTestAuthConfig,
      astroServiceClient,
      env: {
        ...process.env,
        ENABLE_ASTRO_SERVICE: "true",
        ASTRO_SERVICE_URL: "http://127.0.0.1:4100",
      },
      logger: false,
    });

    const response = await app.inject({
      method: "POST",
      url: "/forecast/calculate",
      payload: {
        ...validPayload,
        target: "astro",
      },
    });
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(body.terrainAnalysis).toMatchObject({
      dataSourceLabelZh: "本地 DEM 覆盖诊断",
      honestyNoteZh: "地形数据不足；缺少可用 DEM 剖面时不按无遮挡处理。",
    });
    expect(body.astroAnalysis.terrainHorizonAssessment).toMatchObject({
      obstructionLevel: "unknown",
      confidence: "low",
      dataSource: "dem_raster",
      unavailableReason: "terrain_dem_out_of_bounds",
      professionalDiagnostics: expect.objectContaining({
        terrainDemCoverage: expect.objectContaining({
          requiredTileId: "Copernicus_DSM_COG_30_N30_00_E118_00_DEM",
          status: "missing",
          coveredByActiveDataset: false,
        }),
      }),
    });
    expect(body.astroAnalysis.terrainHorizonAssessment.obstructionClearanceDegrees).toBeNull();
  });

  it("attaches a safe calibration hint for general forecast when enough labels exist", async () => {
    const fetchMock = vi.fn(() => {
      throw new Error("real network calls are disabled in forecast tests");
    });
    vi.stubGlobal("fetch", fetchMock);
    const { client, state } = await createFakeDatabaseClient();
    state.calibrationStats.set("spot:photo-spot-0:general:deterministic_rules_v1", {
      id: "calibration-stats-general",
      spotId: "photo-spot-0",
      locationKey: "spot:photo-spot-0",
      locationName: "测试机位",
      target: "general",
      ruleVersion: "deterministic_rules_v1",
      sampleCount: 12,
      labeledCount: 12,
      successCount: 8,
      partialCount: 2,
      failCount: 2,
      hitCount: 8,
      partialHitCount: 2,
      falsePositiveCount: 1,
      falseNegativeCount: 0,
      truePositiveCount: 6,
      trueNegativeCount: 2,
      hitRate: 0.75,
      falsePositiveRate: 0.083,
      falseNegativeRate: 0,
      whiteoutFalsePositiveRate: 0,
      bestWindowHitRate: 0.7,
      recommendedTripHitRate: 0.8,
      updatedAt: new Date("2026-05-01T00:00:00.000Z"),
      summaryJson: {},
    });
    app = buildApiServer({ dbClient: client, authConfig: forecastTestAuthConfig, logger: false });

    const response = await app.inject({
      method: "POST",
      url: "/forecast/calculate",
      payload: {
        ...validPayload,
        target: "general",
        photoSpotId: "photo-spot-0",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().calibrationHint).toMatchObject({
      confidenceAdjustment: "slight_up",
      displayNoteZh: expect.stringContaining("历史校准"),
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps general forecast working when calibration stats are missing", async () => {
    const fetchMock = vi.fn(() => {
      throw new Error("real network calls are disabled in forecast tests");
    });
    vi.stubGlobal("fetch", fetchMock);
    const { client } = await createFakeDatabaseClient();
    app = buildApiServer({ dbClient: client, authConfig: forecastTestAuthConfig, logger: false });

    const response = await app.inject({
      method: "POST",
      url: "/forecast/calculate",
      payload: {
        ...validPayload,
        target: "general",
        photoSpotId: "photo-spot-without-stats",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().calibrationHint).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("normalizes supported astro target aliases before calling astro-service", async () => {
    const calculateMock = vi.fn((input: AstroServiceCalculateInput) =>
      Promise.resolve(buildAstroServiceResponse(input)),
    );
    const astroServiceClient: AstroServiceClientLike = {
      calculate: calculateMock,
    };
    app = buildApiServer({
      authConfig: forecastTestAuthConfig,
      astroServiceClient,
      env: {
        ...process.env,
        ENABLE_ASTRO_SERVICE: "enabled",
        ASTRO_SERVICE_URL: "http://127.0.0.1:4100",
      },
      logger: false,
    });

    for (const target of ["星空银河", "milky_way", "stars"]) {
      const response = await app.inject({
        method: "POST",
        url: "/forecast/calculate",
        payload: {
          ...validPayload,
          horizon: "24h",
          target,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        target: "astro",
        astroDataSourceLabelZh: "本地天文服务计算",
      });
    }

    expect(calculateMock).toHaveBeenCalledTimes(3);
  });

  it("treats target general with an astro scenario as an astro calculation", async () => {
    const calculateMock = vi.fn((input: AstroServiceCalculateInput) =>
      Promise.resolve(buildAstroServiceResponse(input)),
    );
    const astroServiceClient: AstroServiceClientLike = {
      calculate: calculateMock,
    };
    app = buildApiServer({
      authConfig: forecastTestAuthConfig,
      astroServiceClient,
      env: {
        ...process.env,
        ENABLE_ASTRO_SERVICE: "1",
        ASTRO_SERVICE_URL: "http://127.0.0.1:4100",
      },
      logger: false,
    });

    const response = await app.inject({
      method: "POST",
      url: "/forecast/calculate",
      payload: {
        ...validPayload,
        target: "general",
        scenario: "astro",
        timezone: "Asia/Shanghai",
        elevationMeters: 1800,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(calculateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        elevationMeters: 1800,
        timezone: "Asia/Shanghai",
      }),
    );
    expect(response.json()).toMatchObject({
      target: "astro",
      astroDataSourceLabelZh: "本地天文服务计算",
    });
  });

  it("returns a stable Chinese error when enabled astro-service is unavailable", async () => {
    const astroServiceClient: AstroServiceClientLike = {
      calculate: vi.fn(() =>
        Promise.reject(
          new AstroServiceClientError("unavailable", astroServiceUnavailableMessage, {
            url: "http://127.0.0.1:4100/astro/calculate",
            upstreamErrorName: "TypeError",
            upstreamErrorMessage: "fetch failed",
          }),
        ),
      ),
    };
    app = buildApiServer({
      authConfig: forecastTestAuthConfig,
      astroServiceClient,
      env: {
        ...process.env,
        ENABLE_ASTRO_SERVICE: "true",
        ASTRO_SERVICE_URL: "http://127.0.0.1:4100",
      },
      logger: false,
    });

    const response = await app.inject({
      method: "POST",
      url: "/forecast/calculate",
      payload: {
        ...validPayload,
        target: "astro",
      },
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      error: "astro_service_unavailable",
      message: astroServiceUnavailableMessage,
    });
    expect(response.body).not.toContain("stack");
    expect(response.body).not.toContain("TypeError");
  });

  it("returns a sanitized Chinese timeout error without leaking AbortError details", async () => {
    const astroServiceClient: AstroServiceClientLike = {
      calculate: vi.fn(() =>
        Promise.reject(
          new AstroServiceClientError("timeout", astroServiceTimeoutMessage, {
            url: "http://127.0.0.1:4100/astro/calculate",
            elapsedMs: 8011,
            timeoutMs: 8000,
            timedOut: true,
            upstreamErrorName: "AbortError",
            upstreamErrorMessage: "This operation was aborted",
          }),
        ),
      ),
    };
    app = buildApiServer({
      authConfig: forecastTestAuthConfig,
      astroServiceClient,
      env: {
        ...process.env,
        ENABLE_ASTRO_SERVICE: "true",
        ASTRO_SERVICE_URL: "http://127.0.0.1:4100",
        ASTRO_SERVICE_TIMEOUT_MS: "8000",
      },
      logger: false,
    });

    const response = await app.inject({
      method: "POST",
      url: "/forecast/calculate",
      payload: {
        ...validPayload,
        target: "astro",
      },
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      error: "astro_service_timeout",
      message: astroServiceTimeoutMessage,
    });
    expect(response.body).not.toContain("stack");
    expect(response.body).not.toContain("AbortError");
    expect(response.body).not.toContain("This operation was aborted");
  });

  it("retries a transient astro-service timeout and returns the recovered forecast", async () => {
    const calculateMock = vi.fn((input: AstroServiceCalculateInput) => {
      if (calculateMock.mock.calls.length === 1) {
        return Promise.reject(
          new AstroServiceClientError("timeout", astroServiceTimeoutMessage, {
            url: "http://127.0.0.1:4100/astro/calculate",
            elapsedMs: 8011,
            timeoutMs: 8000,
            timedOut: true,
          }),
        );
      }
      return Promise.resolve(buildAstroServiceResponse(input));
    });
    app = buildApiServer({
      authConfig: forecastTestAuthConfig,
      astroServiceClient: {
        calculate: calculateMock,
      },
      env: {
        ...process.env,
        ENABLE_ASTRO_SERVICE: "true",
        ASTRO_SERVICE_URL: "http://127.0.0.1:4100",
        FORECAST_CALCULATE_RETRY_BASE_DELAY_MS: "0",
      },
      logger: false,
    });

    const response = await app.inject({
      method: "POST",
      url: "/forecast/calculate",
      payload: {
        ...validPayload,
        target: "astro",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(calculateMock).toHaveBeenCalledTimes(2);
    expect(response.json()).toMatchObject({
      target: "astro",
    });
  });

  it("serves same-key stale forecast data after transient retry exhaustion", async () => {
    const dateNow = vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-05-20T00:00:00+08:00"));
    const calculateMock = vi.fn((input: AstroServiceCalculateInput) => {
      if (calculateMock.mock.calls.length === 1) {
        return Promise.resolve(buildAstroServiceResponse(input));
      }
      return Promise.reject(
        new AstroServiceClientError("timeout", astroServiceTimeoutMessage, {
          url: "http://127.0.0.1:4100/astro/calculate",
          elapsedMs: 8011,
          timeoutMs: 8000,
          timedOut: true,
        }),
      );
    });
    app = buildApiServer({
      authConfig: forecastTestAuthConfig,
      astroServiceClient: {
        calculate: calculateMock,
      },
      env: {
        ...process.env,
        ENABLE_ASTRO_SERVICE: "true",
        ASTRO_SERVICE_URL: "http://127.0.0.1:4100",
        FORECAST_CALCULATE_CACHE_TTL_MS: "1000",
        FORECAST_CALCULATE_STALE_IF_ERROR_TTL_MS: "1800000",
        FORECAST_CALCULATE_RETRY_BASE_DELAY_MS: "0",
      },
      logger: false,
    });
    const payload = {
      ...validPayload,
      target: "astro" as const,
      startDateTime: "2026-05-20T00:00:00+08:00",
    };

    const firstResponse = await app.inject({
      method: "POST",
      url: "/forecast/calculate",
      payload,
    });
    dateNow.mockReturnValue(Date.parse("2026-05-20T00:00:02+08:00"));
    const staleResponse = await app.inject({
      method: "POST",
      url: "/forecast/calculate",
      payload,
    });

    expect(firstResponse.statusCode).toBe(200);
    expect(staleResponse.statusCode).toBe(200);
    expect(staleResponse.headers["x-forecast-stale"]).toBe("1");
    expect(staleResponse.json()).toMatchObject({
      target: "astro",
      generatedAt: firstResponse.json().generatedAt,
    });
    expect(calculateMock).toHaveBeenCalledTimes(4);
  });

  it("does not use stale forecast data for validation errors", async () => {
    const dateNow = vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-05-20T00:00:00+08:00"));
    const calculateMock = vi.fn((input: AstroServiceCalculateInput) =>
      Promise.resolve(buildAstroServiceResponse(input)),
    );
    app = buildApiServer({
      authConfig: forecastTestAuthConfig,
      astroServiceClient: {
        calculate: calculateMock,
      },
      env: {
        ...process.env,
        ENABLE_ASTRO_SERVICE: "true",
        ASTRO_SERVICE_URL: "http://127.0.0.1:4100",
        FORECAST_CALCULATE_CACHE_TTL_MS: "1000",
        FORECAST_CALCULATE_STALE_IF_ERROR_TTL_MS: "1800000",
      },
      logger: false,
    });

    await app.inject({
      method: "POST",
      url: "/forecast/calculate",
      payload: {
        ...validPayload,
        target: "astro",
        startDateTime: "2026-05-20T00:00:00+08:00",
      },
    });
    dateNow.mockReturnValue(Date.parse("2026-05-20T00:00:02+08:00"));
    const invalidPayload: Record<string, unknown> = {
      ...validPayload,
      target: "astro",
    };
    delete invalidPayload.latitudeWgs84;

    const invalidResponse = await app.inject({
      method: "POST",
      url: "/forecast/calculate",
      payload: invalidPayload,
    });

    expect(invalidResponse.statusCode).toBe(400);
    expect(invalidResponse.json()).toMatchObject({
      error: "invalid_wgs84_coordinates",
    });
    expect(invalidResponse.headers["x-forecast-stale"]).toBeUndefined();
    expect(calculateMock).toHaveBeenCalledTimes(1);
  });

  it("returns a sanitized Chinese error when astro-service response shape is invalid", async () => {
    const astroServiceClient: AstroServiceClientLike = {
      calculate: vi.fn(() =>
        Promise.reject(
          new AstroServiceClientError("invalid_response", astroServiceInvalidResponseMessage, {
            url: "http://127.0.0.1:4100/astro/calculate",
            status: 200,
            responseBodyExcerpt: '{"forecastStart":"bad"}',
            upstreamErrorName: "ZodError",
            upstreamErrorMessage: "Required field missing",
          }),
        ),
      ),
    };
    app = buildApiServer({
      authConfig: forecastTestAuthConfig,
      astroServiceClient,
      env: {
        ...process.env,
        ENABLE_ASTRO_SERVICE: "true",
        ASTRO_SERVICE_URL: "http://127.0.0.1:4100",
      },
      logger: false,
    });

    const response = await app.inject({
      method: "POST",
      url: "/forecast/calculate",
      payload: {
        ...validPayload,
        target: "astro",
      },
    });

    expect(response.statusCode).toBe(502);
    expect(response.json()).toMatchObject({
      error: "astro_service_invalid_response",
      message: astroServiceInvalidResponseMessage,
    });
    expect(response.body).not.toContain("stack");
    expect(response.body).not.toContain("ZodError");
    expect(response.body).not.toContain("forecastStart");
  });

  it("returns a Chinese configuration error when enabled astro-service URL is missing", async () => {
    const astroServiceClient: AstroServiceClientLike = {
      calculate: vi.fn(() => {
        throw new Error("astro-service should not be called without ASTRO_SERVICE_URL");
      }),
    };
    app = buildApiServer({
      authConfig: forecastTestAuthConfig,
      astroServiceClient,
      env: {
        ...process.env,
        ENABLE_ASTRO_SERVICE: "true",
        ASTRO_SERVICE_URL: "",
      },
      logger: false,
    });

    const response = await app.inject({
      method: "POST",
      url: "/forecast/calculate",
      payload: {
        ...validPayload,
        target: "astro",
      },
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      error: "astro_service_url_missing",
      message: astroServiceUrlMissingMessage,
    });
    expect(astroServiceClient.calculate).not.toHaveBeenCalled();
    expect(response.body).not.toContain("stack");
  });

  it("returns a coordinate-specific Chinese error without stack traces", async () => {
    app = buildApiServer({
      authConfig: forecastTestAuthConfig,
      env: {
        ...process.env,
        ENABLE_ASTRO_SERVICE: "true",
      },
      logger: false,
    });
    const payloadWithoutLatitude: Record<string, unknown> = { ...validPayload };
    delete payloadWithoutLatitude.latitudeWgs84;

    const response = await app.inject({
      method: "POST",
      url: "/forecast/calculate",
      payload: {
        ...payloadWithoutLatitude,
        target: "astro",
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: "invalid_wgs84_coordinates",
      message: "当前地点缺少有效 WGS84 坐标，无法计算星空银河窗口。",
    });
    expect(response.body).not.toContain("stack");
  });

  it("exposes sanitized local astro-service debug status", async () => {
    app = buildApiServer({
      authConfig: forecastTestAuthConfig,
      env: {
        ...process.env,
        NODE_ENV: "development",
        ENABLE_ASTRO_SERVICE: "false",
        ASTRO_SERVICE_URL: "http://user:secret@localhost:4100?token=hidden",
        ASTRO_SERVICE_TIMEOUT_MS: "bad",
        JWT_SECRET: "dev-secret-that-should-not-appear-in-debug-output",
      },
      logger: false,
    });

    const response = await app.inject({
      method: "GET",
      url: "/debug/astro-service",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      enabled: false,
      url: "http://127.0.0.1:4100",
      timeoutMs: 45000,
      healthOk: false,
      healthStatus: null,
    });
    expect(response.body).not.toContain("secret");
    expect(response.body).not.toContain("token=hidden");
    expect(response.body).not.toContain("JWT_SECRET");
  });

  it("relays safe astro-service health details in the local debug endpoint", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            ok: true,
            service: "astro-service",
            timezoneAvailable: true,
            defaultTimezone: "Asia/Shanghai",
            ephemerisAvailable: true,
            ephemerisFileName: "de421.bsp",
          }),
        ),
    );
    vi.stubGlobal("fetch", fetchMock);
    app = buildApiServer({
      authConfig: forecastTestAuthConfig,
      env: {
        ...process.env,
        NODE_ENV: "development",
        ENABLE_ASTRO_SERVICE: "true",
        ASTRO_SERVICE_URL: "http://user:secret@localhost:4100?token=hidden",
        ASTRO_SERVICE_TIMEOUT_MS: "bad",
        PHOTO_WEATHER_ENV_LOCAL_LOADED: "true",
        DATABASE_URL: "postgresql://user:password@localhost:15432/photo_weather_ai",
      },
      logger: false,
    });

    const response = await app.inject({
      method: "GET",
      url: "/debug/astro-service",
    });

    expect(response.statusCode).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:4100/health",
      expect.objectContaining({ method: "GET" }),
    );
    expect(response.json()).toMatchObject({
      enabled: true,
      url: "http://127.0.0.1:4100",
      timeoutMs: 45000,
      healthOk: true,
      healthStatus: 200,
      timezoneAvailable: true,
      defaultTimezone: "Asia/Shanghai",
      ephemerisAvailable: true,
      ephemerisFileName: "de421.bsp",
      envSource: ".env.local",
    });
    expect(response.body).not.toContain("secret");
    expect(response.body).not.toContain("password");
    expect(response.body).not.toContain("token=hidden");
    expect(response.body).not.toContain("DATABASE_URL");
  });

  it("keeps target astro on an explicitly labeled simplified fallback when service is disabled", async () => {
    const astroServiceClient: AstroServiceClientLike = {
      calculate: vi.fn(() => {
        throw new Error("astro-service should not be called while disabled");
      }),
    };
    app = buildApiServer({
      authConfig: forecastTestAuthConfig,
      astroServiceClient,
      env: {
        ...process.env,
        ENABLE_ASTRO_SERVICE: "false",
      },
      logger: false,
    });

    const response = await app.inject({
      method: "POST",
      url: "/forecast/calculate",
      payload: {
        ...validPayload,
        target: "astro",
      },
    });
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(astroServiceClient.calculate).not.toHaveBeenCalled();
    expect(body.astroDataSourceLabelZh).toBe("简化本地估算");
    expect(body.dataNotice).toContain("天文数据：简化本地估算");
  });

  it("calculates a deterministic glow forecast result without real network calls", async () => {
    const fetchMock = vi.fn(() => {
      throw new Error("real network calls are disabled in glow forecast tests");
    });
    vi.stubGlobal("fetch", fetchMock);
    app = buildApiServer({ authConfig: forecastTestAuthConfig, logger: false });

    const response = await app.inject({
      method: "POST",
      url: "/forecast/calculate",
      payload: {
        ...validPayload,
        horizon: "7d",
        target: "glow",
      },
    });
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(body.target).toBe("glow");
    expect(body.glowAnalysis).toMatchObject({
      sunriseGlowScore: expect.any(Number),
      sunsetGlowScore: expect.any(Number),
      lowCloudObstructionRisk: expect.any(Number),
      glowTravelScore: expect.any(Number),
      recommendationLabel: expect.stringMatching(/推荐重点关注|值得等待|谨慎参考|不建议专程/),
      dataMode: "mock",
    });
    expect(body.glowAnalysis.bestGlowWindows.length).toBeGreaterThan(1);
    expect(body.glowAnalysis.dailyGlow.length).toBeGreaterThanOrEqual(7);
    expect(body.dataNotice).toContain("天气数据：演示数据");
    expect(body.dataNotice).toContain("地形数据：演示数据");
    expect(body.dataNotice).toContain("天文数据：本地算法计算");
  });

  it("can return a rule-based explanation from calculate without GPT / OpenAI", async () => {
    const fetchMock = vi.fn(() => {
      throw new Error("real network calls are disabled in forecast tests");
    });
    vi.stubGlobal("fetch", fetchMock);
    app = buildApiServer({ authConfig: forecastTestAuthConfig, logger: false });

    const response = await app.inject({
      method: "POST",
      url: "/forecast/calculate",
      payload: {
        ...validPayload,
        useAiExplanation: true,
      },
    });
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(body.aiExplanation).toMatchObject({
      conclusion: expect.objectContaining({
        summaryZh: expect.any(String),
        recommendedDayZh: expect.any(String),
      }),
      metadata: expect.objectContaining({
        source: "deterministic_fallback",
      }),
    });
  });

  it("returns a deterministic fallback when GPT / OpenAI real call is enabled without a key", async () => {
    const fetchMock = vi.fn(() => {
      throw new Error("real network calls are disabled in forecast tests");
    });
    vi.stubGlobal("fetch", fetchMock);
    const { client, state } = await createFakeDatabaseClient();
    const provider = state.providers.get("ai:openai");
    state.providers.set("ai:openai", {
      ...provider,
      enabled: true,
      configJson: {
        ...(provider.configJson ?? {}),
        realCallEnabled: true,
      },
      secretJson: {},
      maskedSecretJson: {},
    });
    app = buildApiServer({
      dbClient: client,
      authConfig: forecastTestAuthConfig,
      env: {
        ...process.env,
        NODE_ENV: "development",
      },
      logger: false,
    });

    const response = await app.inject({
      method: "POST",
      url: "/forecast/ai-explain",
      payload: validPayload,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      success: false,
      source: "fallback",
      fallback: true,
      fallbackInterpretation: expect.objectContaining({
        metadata: expect.objectContaining({
          source: "deterministic_fallback",
        }),
      }),
      errorCategory: "config_missing",
      messageZh: expect.stringContaining("GPT / OpenAI API Key 未配置"),
      retryable: false,
      error: "ai_explanation_unavailable",
      latencyMs: 0,
      model: "gpt-5.4-mini",
      promptSizeChars: expect.any(Number),
      parseSuccess: false,
      explanation: expect.objectContaining({
        conclusion: expect.objectContaining({
          recommendedDayZh: expect.any(String),
        }),
      }),
      diagnostics: expect.objectContaining({
        model: "gpt-5.4-mini",
        parseSuccess: false,
        fallback: true,
        errorCategory: "config_missing",
      }),
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(response.body.length).toBeGreaterThan(2);
    expect(response.body).not.toContain("secretJson");
  });

  it("uses the resilient forecast calculation cache for ai-explain", async () => {
    const calculateMock = vi.fn((input: AstroServiceCalculateInput) => {
      if (calculateMock.mock.calls.length === 1) {
        return Promise.reject(
          new AstroServiceClientError("unavailable", astroServiceUnavailableMessage, {
            url: "http://127.0.0.1:4100/astro/calculate",
            upstreamErrorName: "TypeError",
            upstreamErrorMessage: "fetch failed",
          }),
        );
      }
      return Promise.resolve(buildAstroServiceResponse(input));
    });
    app = buildApiServer({
      authConfig: forecastTestAuthConfig,
      astroServiceClient: {
        calculate: calculateMock,
      },
      env: {
        ...process.env,
        ENABLE_ASTRO_SERVICE: "true",
        ASTRO_SERVICE_URL: "http://127.0.0.1:4100",
        FORECAST_CALCULATE_RETRY_BASE_DELAY_MS: "0",
      },
      logger: false,
    });
    const payload = {
      ...validPayload,
      target: "astro" as const,
      timezone: "Asia/Shanghai",
    };

    const aiResponse = await app.inject({
      method: "POST",
      url: "/forecast/ai-explain",
      payload,
    });
    const calculateResponse = await app.inject({
      method: "POST",
      url: "/forecast/calculate",
      payload,
    });

    expect(aiResponse.statusCode).toBe(200);
    expect(aiResponse.json()).toMatchObject({
      success: false,
      source: "fallback",
      error: "ai_explanation_unavailable",
    });
    expect(calculateResponse.statusCode).toBe(200);
    expect(calculateResponse.json()).toMatchObject({
      target: "astro",
    });
    expect(calculateMock).toHaveBeenCalledTimes(2);
  });

  it("does not block forecast calculation on GPT / OpenAI when useAiExplanation is requested", async () => {
    const fetchMock = vi.fn(() => {
      throw new DOMException("GPT / OpenAI should not be called by calculate", "AbortError");
    });
    vi.stubGlobal("fetch", fetchMock);
    const { client, state } = await createFakeDatabaseClient();
    const provider = state.providers.get("ai:openai");
    state.providers.set("ai:openai", {
      ...provider,
      enabled: true,
      configJson: {
        ...(provider.configJson ?? {}),
        realCallEnabled: true,
        model: "gpt-4.1",
      },
      secretJson: {
        apiKey: "openai-secret",
      },
      maskedSecretJson: {
        apiKey: "open****cret",
      },
    });
    app = buildApiServer({
      dbClient: client,
      authConfig: forecastTestAuthConfig,
      env: {
        ...process.env,
        NODE_ENV: "development",
      },
      logger: false,
    });

    const response = await app.inject({
      method: "POST",
      url: "/forecast/calculate",
      payload: {
        ...validPayload,
        useAiExplanation: true,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      aiExplanation: expect.objectContaining({
        conclusion: expect.objectContaining({
          summaryZh: expect.any(String),
        }),
      }),
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(response.body).not.toContain("openai-secret");
  });

  it("returns a non-fatal timeout message for manual GPT / OpenAI interpretation", async () => {
    const fetchMock = vi.fn(async () => {
      throw new DOMException("Request timed out", "AbortError");
    });
    vi.stubGlobal("fetch", fetchMock);
    const { client, state } = await createFakeDatabaseClient();
    const provider = state.providers.get("ai:openai");
    state.providers.set("ai:openai", {
      ...provider,
      enabled: true,
      configJson: {
        ...(provider.configJson ?? {}),
        realCallEnabled: true,
        model: "gpt-4.1",
        timeoutMs: 60000,
      },
      secretJson: {
        apiKey: "openai-secret",
      },
      maskedSecretJson: {
        apiKey: "open****cret",
      },
    });
    app = buildApiServer({
      dbClient: client,
      authConfig: forecastTestAuthConfig,
      env: {
        ...process.env,
        NODE_ENV: "development",
      },
      logger: false,
    });

    const response = await app.inject({
      method: "POST",
      url: "/forecast/ai-explain",
      payload: validPayload,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      success: false,
      source: "fallback",
      fallback: true,
      fallbackInterpretation: expect.objectContaining({
        metadata: expect.objectContaining({
          source: "deterministic_fallback",
        }),
      }),
      errorCategory: "timeout",
      retryable: true,
      error: "ai_explanation_timeout",
      messageZh: expect.stringContaining("GPT / OpenAI 请求超时"),
      latencyMs: expect.any(Number),
      model: "gpt-4.1",
      promptSizeChars: expect.any(Number),
      parseSuccess: false,
      explanation: expect.objectContaining({
        conclusion: expect.objectContaining({
          recommendedDayZh: expect.any(String),
        }),
      }),
      diagnostics: expect.objectContaining({
        model: "gpt-4.1",
        timeoutMs: 60000,
        promptSizeChars: expect.any(Number),
        parseSuccess: false,
        fallback: true,
      }),
      message: expect.stringContaining("GPT / OpenAI 请求超时"),
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(response.body.length).toBeGreaterThan(2);
    expect(response.body).not.toContain("openai-secret");
  });

  it("reports GPT / OpenAI upstream auth failures as non-retryable fallback", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: {
            "Content-Type": "application/json",
          },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { client, state } = await createFakeDatabaseClient();
    const provider = state.providers.get("ai:openai");
    state.providers.set("ai:openai", {
      ...provider,
      enabled: true,
      configJson: {
        ...(provider.configJson ?? {}),
        realCallEnabled: true,
        model: "gpt-4.1",
      },
      secretJson: {
        apiKey: "openai-secret",
      },
      maskedSecretJson: {
        apiKey: "open****cret",
      },
    });
    app = buildApiServer({
      dbClient: client,
      authConfig: forecastTestAuthConfig,
      env: {
        ...process.env,
        NODE_ENV: "development",
      },
      logger: false,
    });

    const response = await app.inject({
      method: "POST",
      url: "/forecast/ai-explain",
      payload: validPayload,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      success: false,
      source: "fallback",
      fallback: true,
      errorCategory: "provider_http_error",
      messageZh: expect.stringContaining("API Key"),
      retryable: false,
      error: "ai_explanation_unavailable",
      model: "gpt-4.1",
      parseSuccess: false,
      diagnostics: expect.objectContaining({
        model: "gpt-4.1",
        parseSuccess: false,
        fallback: true,
        errorCategory: "provider_http_error",
      }),
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(response.body).not.toContain("openai-secret");
  });

  it("returns useful plain GPT / OpenAI text as a displayable success interpretation", async () => {
    const fetchMock = vi.fn(async (_input: string | URL, init?: RequestInit) => {
      const requestBody = JSON.parse(String(init?.body));
      expect(requestBody).toMatchObject({
        model: "gpt-4.1",
        max_output_tokens: 1200,
        store: false,
        stream: false,
      });
      expect(requestBody).not.toHaveProperty("response_format");
      return new Response(
        JSON.stringify({
          output_text:
            "\u7ed3\u8bba\uff1a\u6e05\u6668\u7a97\u53e3\u53ef\u4f5c\u4e3a\u4e3b\u8ba1\u5212\uff0c\u4f46\u4e0d\u8981\u53ea\u4e3a\u5355\u4e00\u4fe1\u53f7\u4e13\u7a0b\u3002\n\u7406\u7531\uff1a\u4f4e\u4e91\u3001\u6e7f\u5ea6\u548c\u5730\u5f62\u4fe1\u53f7\u66f4\u96c6\u4e2d\uff0c\u4ecd\u9700\u77ed\u4e34\u590d\u6838\u3002\n\u5efa\u8bae\uff1a\u6309\u4e3b\u7a97\u53e3\u63d0\u524d\u5230\u4f4d\uff0c\u5931\u8d25\u65f6\u6539\u62cd\u8fd1\u666f\u3002\n\u98ce\u9669\uff1a\u77ed\u4e34\u964d\u6c34\u3001\u767d\u5899\u548c\u9635\u98ce\u4ecd\u9700\u73b0\u573a\u590d\u6838\u3002",
          finish_reason: "length",
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        },
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const { client, state } = await createFakeDatabaseClient();
    const provider = state.providers.get("ai:openai");
    state.providers.set("ai:openai", {
      ...provider,
      enabled: true,
      configJson: {
        ...(provider.configJson ?? {}),
        realCallEnabled: true,
        model: "gpt-4.1",
      },
      secretJson: {
        apiKey: "openai-secret",
      },
      maskedSecretJson: {
        apiKey: "open****cret",
      },
    });
    app = buildApiServer({
      dbClient: client,
      authConfig: forecastTestAuthConfig,
      env: {
        ...process.env,
        NODE_ENV: "development",
      },
      logger: false,
    });

    const response = await app.inject({
      method: "POST",
      url: "/forecast/ai-explain",
      payload: {
        ...validPayload,
        photoSpotId: "spot-plain-text-fallback",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      ok: true,
      success: true,
      source: "openai",
      fallback: false,
      displaySuccess: true,
      hasDisplayableAiContent: true,
      model: "gpt-4.1",
      outputMode: "text_with_json_fallback",
      parseSuccess: false,
      parseStrategy: "plain_text_fallback",
      fallbackUsed: true,
      providerFallbackUsed: true,
      deterministicFallbackUsed: false,
      finishReason: "length",
      rawResponseSizeChars: expect.any(Number),
      summaryText: expect.stringContaining("\u6e05\u6668\u7a97\u53e3"),
      explanation: expect.objectContaining({
        summaryText: expect.stringContaining("\u6e05\u6668\u7a97\u53e3"),
        displayOnly: true,
        displayContent: expect.objectContaining({
          hasContent: true,
          summaryText: expect.stringContaining("\u6e05\u6668\u7a97\u53e3"),
        }),
      }),
      interpretation: expect.objectContaining({
        summaryText: expect.stringContaining("\u6e05\u6668\u7a97\u53e3"),
        metadata: expect.objectContaining({
          source: "openai",
          parseStrategy: "plain_text_fallback",
          fallbackUsed: true,
        }),
        conclusion: expect.objectContaining({
          summaryZh: expect.stringContaining("\u6e05\u6668\u7a97\u53e3"),
        }),
      }),
      meta: expect.objectContaining({
        providerCode: "openai",
        model: "gpt-4.1",
        parseStrategy: "plain_text_fallback",
        fallbackUsed: true,
        providerFallbackUsed: true,
        deterministicFallbackUsed: false,
        displaySuccess: true,
        hasDisplayableAiContent: true,
      }),
      diagnostics: expect.objectContaining({
        providerCode: "openai",
        model: "gpt-4.1",
        displaySuccess: true,
        hasDisplayableAiContent: true,
        parseSuccess: false,
        parseStrategy: "plain_text_fallback",
        fallbackUsed: true,
        providerFallbackUsed: true,
        deterministicFallbackUsed: false,
        finishReason: "length",
        rawResponseSizeChars: expect.any(Number),
      }),
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(response.body).not.toContain("openai-secret");
  });

  it("returns a frontend-friendly success contract for strict JSON explanation content", async () => {
    const fetchMock = vi.fn(async (_input: string | URL, init?: RequestInit) => {
      const requestBody = JSON.parse(String(init?.body));
      expect(requestBody).toMatchObject({
        model: "relay-future-json",
        max_output_tokens: 1200,
        store: false,
        stream: false,
      });
      expect(requestBody).not.toHaveProperty("response_format");
      return new Response(
        JSON.stringify({
          output_text: JSON.stringify({
            summaryText: "严格 JSON 摘要可直接展示。",
            conclusion: "清晨窗口可以作为主计划，但仍需复核短临低云。",
            reasons: ["低云、湿度和地形信号集中在清晨。"],
            suggestions: ["按主窗口提前到位，失败时转拍远山层次。"],
            risks: ["短临降水和白墙仍需现场复核。"],
          }),
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        },
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const { client, state } = await createFakeDatabaseClient();
    const provider = state.providers.get("ai:openai");
    state.providers.set("ai:openai", {
      ...provider,
      enabled: true,
      configJson: {
        ...(provider.configJson ?? {}),
        realCallEnabled: true,
        model: "custom",
        customModel: "relay-future-json",
      },
      secretJson: {
        apiKey: "openai-secret",
      },
      maskedSecretJson: {
        apiKey: "open****cret",
      },
    });
    app = buildApiServer({
      dbClient: client,
      authConfig: forecastTestAuthConfig,
      env: {
        ...process.env,
        NODE_ENV: "development",
      },
      logger: false,
    });

    const response = await app.inject({
      method: "POST",
      url: "/forecast/ai-explain",
      payload: {
        ...validPayload,
        photoSpotId: "spot-strict-json-contract",
      },
    });
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      success: true,
      source: "openai",
      fallback: false,
      displaySuccess: true,
      hasDisplayableAiContent: true,
      model: "relay-future-json",
      outputMode: "text_with_json_fallback",
      parseSuccess: true,
      parseStrategy: "strict_json",
      fallbackUsed: false,
      providerFallbackUsed: false,
      deterministicFallbackUsed: false,
      summaryText: expect.stringContaining("严格 JSON"),
      explanation: expect.objectContaining({
        summaryText: expect.stringContaining("严格 JSON"),
        reasons: expect.arrayContaining(["低云、湿度和地形信号集中在清晨。"]),
        suggestions: expect.arrayContaining(["按主窗口提前到位，失败时转拍远山层次。"]),
        risks: expect.arrayContaining(["短临降水和白墙仍需现场复核。"]),
        metadata: expect.objectContaining({
          source: "openai",
          parseStrategy: "strict_json",
          fallbackUsed: false,
        }),
      }),
      meta: expect.objectContaining({
        providerCode: "openai",
        model: "relay-future-json",
        parseStrategy: "strict_json",
        fallbackUsed: false,
        displaySuccess: true,
        hasDisplayableAiContent: true,
      }),
      diagnostics: expect.objectContaining({
        providerCode: "openai",
        model: "relay-future-json",
        parseStrategy: "strict_json",
        displaySuccess: true,
        hasDisplayableAiContent: true,
      }),
    });
    expect(body).not.toHaveProperty("scores");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(response.body).not.toContain("openai-secret");
  });

  it("uses text-first forecast explanation requests while still parsing JSON content", async () => {
    const fetchMock = vi.fn(async (_input: string | URL, init?: RequestInit) => {
      const requestBody = JSON.parse(String(init?.body));
      expect(requestBody).not.toHaveProperty("response_format");
      return new Response(
        JSON.stringify({
          output_text: JSON.stringify(buildOpenAiExplanationContent("文本优先成功")),
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const { client, state } = await createFakeDatabaseClient();
    const provider = state.providers.get("ai:openai");
    state.providers.set("ai:openai", {
      ...provider,
      enabled: true,
      configJson: {
        ...(provider.configJson ?? {}),
        realCallEnabled: true,
        model: "gpt-4.1",
      },
      secretJson: {
        apiKey: "openai-secret",
      },
      maskedSecretJson: {
        apiKey: "open****cret",
      },
    });
    app = buildApiServer({
      dbClient: client,
      authConfig: forecastTestAuthConfig,
      env: {
        ...process.env,
        NODE_ENV: "development",
      },
      logger: false,
    });

    const response = await app.inject({
      method: "POST",
      url: "/forecast/ai-explain",
      payload: {
        ...validPayload,
        photoSpotId: "spot-compat-retry",
      },
    });
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(body).toMatchObject({
      success: true,
      source: "openai",
      fallback: false,
      model: "gpt-4.1",
      outputMode: "text_with_json_fallback",
      parseStrategy: "strict_json",
      compatibilityFallbackUsed: false,
      disabledResponseFormat: false,
      displaySuccess: true,
      hasDisplayableAiContent: true,
      summaryText: expect.stringContaining("文本优先成功"),
      diagnostics: expect.objectContaining({
        attempts: 1,
        compatibilityFallbackUsed: false,
        disabledResponseFormat: false,
        displaySuccess: true,
        hasDisplayableAiContent: true,
      }),
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(response.body).not.toContain("openai-secret");
    expect(response.body).not.toContain("Authorization");
  });

  it("falls back safely when GPT / OpenAI returns empty content", async () => {
    const fetchMock = vi.fn(async (_input: string | URL, init?: RequestInit) => {
      const requestBody = JSON.parse(String(init?.body));
      expect(requestBody).not.toHaveProperty("response_format");
      return new Response(
        JSON.stringify({
          output_text: "",
          status: "completed",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const { client, state } = await createFakeDatabaseClient();
    const provider = state.providers.get("ai:openai");
    state.providers.set("ai:openai", {
      ...provider,
      enabled: true,
      configJson: {
        ...(provider.configJson ?? {}),
        realCallEnabled: true,
        model: "gpt-4.1",
      },
      secretJson: {
        apiKey: "openai-secret",
      },
      maskedSecretJson: {
        apiKey: "open****cret",
      },
    });
    app = buildApiServer({
      dbClient: client,
      authConfig: forecastTestAuthConfig,
      env: {
        ...process.env,
        NODE_ENV: "development",
      },
      logger: false,
    });

    const response = await app.inject({
      method: "POST",
      url: "/forecast/ai-explain",
      payload: {
        ...validPayload,
        photoSpotId: "spot-empty-content-retry",
      },
    });
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(body).toMatchObject({
      success: false,
      source: "fallback",
      fallback: true,
      model: "gpt-4.1",
      parseSuccess: false,
      parseStrategy: "failed",
      compatibilityFallbackUsed: false,
      disabledResponseFormat: false,
      emptyContentFallbackUsed: false,
      errorCategory: "provider_parse_error",
      diagnostics: expect.objectContaining({
        attempts: 1,
        compatibilityFallbackUsed: false,
        disabledResponseFormat: false,
        emptyContentFallbackUsed: false,
        fallback: true,
        errorCategory: "provider_parse_error",
        rawResponseSizeChars: expect.any(Number),
      }),
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(response.body).not.toContain("openai-secret");
    expect(response.body).not.toContain("Authorization");
    expect(response.body).not.toContain("messages");
  });

  it("falls back to deterministic interpretation when GPT / OpenAI JSON parsing fails", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            output_text: "{not-json",
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
            },
          },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { client, state } = await createFakeDatabaseClient();
    const provider = state.providers.get("ai:openai");
    state.providers.set("ai:openai", {
      ...provider,
      enabled: true,
      configJson: {
        ...(provider.configJson ?? {}),
        realCallEnabled: true,
        model: "gpt-4.1",
      },
      secretJson: {
        apiKey: "openai-secret",
      },
      maskedSecretJson: {
        apiKey: "open****cret",
      },
    });
    app = buildApiServer({
      dbClient: client,
      authConfig: forecastTestAuthConfig,
      env: {
        ...process.env,
        NODE_ENV: "development",
      },
      logger: false,
    });

    const response = await app.inject({
      method: "POST",
      url: "/forecast/ai-explain",
      payload: validPayload,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      success: false,
      source: "fallback",
      fallback: true,
      fallbackInterpretation: expect.objectContaining({
        metadata: expect.objectContaining({
          source: "deterministic_fallback",
        }),
      }),
      errorCategory: "provider_parse_error",
      messageZh: expect.stringContaining("GPT / OpenAI 返回内容无法解析"),
      retryable: true,
      latencyMs: expect.any(Number),
      model: "gpt-4.1",
      promptSizeChars: expect.any(Number),
      parseSuccess: false,
      parseStrategy: "failed",
      rawResponseSizeChars: expect.any(Number),
      explanation: expect.objectContaining({
        conclusion: expect.objectContaining({
          recommendedDayZh: expect.any(String),
        }),
      }),
      diagnostics: expect.objectContaining({
        model: "gpt-4.1",
        parseSuccess: false,
        parseStrategy: "failed",
        fallback: true,
        errorCategory: "provider_parse_error",
        rawResponseSizeChars: expect.any(Number),
      }),
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(response.body).not.toContain("openai-secret");
  });

  it("caches successful GPT / OpenAI interpretation by a stable forecast result key", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            output_text: JSON.stringify(buildOpenAiExplanationContent("缓存命中")),
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
            },
          },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { client, state } = await createFakeDatabaseClient();
    const provider = state.providers.get("ai:openai");
    state.providers.set("ai:openai", {
      ...provider,
      enabled: true,
      configJson: {
        ...(provider.configJson ?? {}),
        realCallEnabled: true,
        model: "gpt-4.1",
      },
      secretJson: {
        apiKey: "openai-secret",
      },
      maskedSecretJson: {
        apiKey: "open****cret",
      },
    });
    app = buildApiServer({
      dbClient: client,
      authConfig: forecastTestAuthConfig,
      env: {
        ...process.env,
        NODE_ENV: "development",
      },
      logger: false,
    });

    const firstResponse = await app.inject({
      method: "POST",
      url: "/forecast/ai-explain",
      payload: {
        ...validPayload,
        photoSpotId: "spot-cache-test",
      },
    });
    const secondResponse = await app.inject({
      method: "POST",
      url: "/forecast/ai-explain",
      payload: {
        ...validPayload,
        photoSpotId: "spot-cache-test",
      },
    });

    expect(firstResponse.statusCode).toBe(200);
    expect(secondResponse.statusCode).toBe(200);
    expect(firstResponse.json()).toMatchObject({
      ok: true,
      success: true,
      source: "openai",
      model: "gpt-4.1",
      parseSuccess: true,
      cacheHit: false,
      summaryText: expect.stringContaining("缓存命中"),
      explanation: expect.objectContaining({
        summaryText: expect.stringContaining("缓存命中"),
      }),
      interpretation: expect.objectContaining({
        summaryText: expect.stringContaining("缓存命中"),
        conclusion: expect.objectContaining({
          oneSentenceDecisionZh: expect.stringContaining("缓存命中"),
        }),
      }),
      meta: expect.objectContaining({
        providerCode: "openai",
        model: "gpt-4.1",
        parseStrategy: "strict_json",
      }),
    });
    expect(secondResponse.json()).toMatchObject({
      ok: true,
      success: true,
      source: "openai",
      model: "gpt-4.1",
      parseSuccess: true,
      cacheHit: true,
      latencyMs: 0,
      interpretation: expect.objectContaining({
        summaryText: expect.stringContaining("缓存命中"),
        conclusion: expect.objectContaining({
          oneSentenceDecisionZh: expect.stringContaining("缓存命中"),
        }),
      }),
      meta: expect.objectContaining({
        providerCode: "openai",
        model: "gpt-4.1",
        cacheHit: true,
      }),
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(firstResponse.body).not.toContain("openai-secret");
    expect(secondResponse.body).not.toContain("openai-secret");
  });

  it("keeps GPT / OpenAI interpretation cache keys scoped by access state", () => {
    const source = readFileSync(
      fileURLToPath(new URL("../forecast-routes.ts", import.meta.url)),
      "utf8",
    );

    expect(source).toContain("createForecastInterpretationCacheKey(result, access)");
    expect(source).toContain("activeProductCode");
    expect(source).toContain("access:${accessScope}:report");
    expect(source).toContain("access:${accessScope}:result");
  });

  it("rejects unsupported horizon and target for calculation", async () => {
    app = buildApiServer({ authConfig: forecastTestAuthConfig, logger: false });

    const horizonResponse = await app.inject({
      method: "POST",
      url: "/forecast/calculate",
      payload: {
        ...validPayload,
        horizon: "96h",
      },
    });
    const targetResponse = await app.inject({
      method: "POST",
      url: "/forecast/calculate",
      payload: {
        ...validPayload,
        target: "rainbow",
      },
    });

    expect(horizonResponse.statusCode).toBe(400);
    expect(horizonResponse.json()).toMatchObject({
      error: "validation_error",
      issues: expect.arrayContaining([expect.objectContaining({ path: "horizon" })]),
    });
    expect(targetResponse.statusCode).toBe(400);
    expect(targetResponse.json()).toMatchObject({
      error: "validation_error",
      issues: expect.arrayContaining([expect.objectContaining({ path: "target" })]),
    });
  });
});
