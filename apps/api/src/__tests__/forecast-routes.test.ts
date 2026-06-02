import { afterEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
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
} from "../astro-service-client.js";

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

function buildDeepSeekExplanationContent(label: string) {
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
      source: "deepseek" as const,
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

function isoHour(index: number): string {
  return new Date(Date.UTC(2026, 4, 20, index, 0, 0)).toISOString().replace(".000Z", "+08:00");
}

function dateForIndex(index: number): string {
  return new Date(Date.UTC(2026, 4, 20 + index, 0, 0, 0)).toISOString().slice(0, 10);
}

function buildQWeatherHourlyPayload() {
  return {
    code: "200",
    hourly: Array.from({ length: 48 }, (_, index) => ({
      fxTime: isoHour(index),
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

function buildQWeatherDailyPayload() {
  return {
    code: "200",
    daily: Array.from({ length: 3 }, (_, index) => ({
      fxDate: dateForIndex(index),
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

function buildOpenMeteoPayload() {
  const times = Array.from({ length: 48 }, (_, index) => isoHour(index).slice(0, 16));
  const dates = Array.from({ length: 3 }, (_, index) => dateForIndex(index));

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

function buildMeteobluePayload() {
  const times = Array.from({ length: 48 }, (_, index) => isoHour(index));
  const dates = Array.from({ length: 3 }, (_, index) => dateForIndex(index));

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

describe("forecast query validation route", () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    if (app) {
      await app.close();
      app = undefined;
    }
    vi.unstubAllGlobals();
  });

  it("normalizes a public forecast query without calling providers", async () => {
    app = buildApiServer({ authConfig: testAuthConfig, logger: false });

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
    app = buildApiServer({ authConfig: testAuthConfig, logger: false });

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

  it("calculates a deterministic mock forecast result without real network calls", async () => {
    const fetchMock = vi.fn(() => {
      throw new Error("real network calls are disabled in forecast tests");
    });
    vi.stubGlobal("fetch", fetchMock);
    app = buildApiServer({ authConfig: testAuthConfig, logger: false });

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

  it("enriches a non-seeded selected location with mocked elevation during calculation", async () => {
    const elevationProvider = {
      getElevationForLocation: vi.fn(async () => ({
        elevationMeters: 1326,
        elevationSource: "open_meteo_elevation" as const,
        elevationConfidence: "medium" as const,
      })),
    };
    app = buildApiServer({
      authConfig: testAuthConfig,
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
      authConfig: testAuthConfig,
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
      authConfig: testAuthConfig,
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
      authConfig: testAuthConfig,
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
      authConfig: testAuthConfig,
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
    app = buildApiServer({ authConfig: testAuthConfig, logger: false });

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
      authConfig: testAuthConfig,
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
    app = buildApiServer({ dbClient: client, authConfig: testAuthConfig, logger: false });

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
    app = buildApiServer({ dbClient: client, authConfig: testAuthConfig, logger: false });

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
      authConfig: testAuthConfig,
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
      authConfig: testAuthConfig,
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
      authConfig: testAuthConfig,
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
      authConfig: testAuthConfig,
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
      authConfig: testAuthConfig,
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
      authConfig: testAuthConfig,
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
      authConfig: testAuthConfig,
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
      authConfig: testAuthConfig,
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
      authConfig: testAuthConfig,
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
      authConfig: testAuthConfig,
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
    app = buildApiServer({ authConfig: testAuthConfig, logger: false });

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

  it("can return a rule-based explanation from calculate without DeepSeek", async () => {
    const fetchMock = vi.fn(() => {
      throw new Error("real network calls are disabled in forecast tests");
    });
    vi.stubGlobal("fetch", fetchMock);
    app = buildApiServer({ authConfig: testAuthConfig, logger: false });

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

  it("returns a deterministic fallback when DeepSeek real call is enabled without a key", async () => {
    const fetchMock = vi.fn(() => {
      throw new Error("real network calls are disabled in forecast tests");
    });
    vi.stubGlobal("fetch", fetchMock);
    const { client, state } = await createFakeDatabaseClient();
    const provider = state.providers.get("ai:deepseek");
    state.providers.set("ai:deepseek", {
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
      authConfig: testAuthConfig,
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
      errorCategory: "missing_api_key",
      messageZh: expect.stringContaining("DeepSeek API Key 未配置"),
      retryable: false,
      error: "ai_explanation_unavailable",
      latencyMs: 0,
      model: "deepseek-v4-pro",
      promptSizeChars: expect.any(Number),
      parseSuccess: false,
      explanation: expect.objectContaining({
        conclusion: expect.objectContaining({
          recommendedDayZh: expect.any(String),
        }),
      }),
      diagnostics: expect.objectContaining({
        model: "deepseek-v4-pro",
        parseSuccess: false,
        fallback: true,
        errorCategory: "missing_api_key",
      }),
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(response.body.length).toBeGreaterThan(2);
    expect(response.body).not.toContain("secretJson");
  });

  it("does not block forecast calculation on DeepSeek when useAiExplanation is requested", async () => {
    const fetchMock = vi.fn(() => {
      throw new DOMException("DeepSeek should not be called by calculate", "AbortError");
    });
    vi.stubGlobal("fetch", fetchMock);
    const { client, state } = await createFakeDatabaseClient();
    const provider = state.providers.get("ai:deepseek");
    state.providers.set("ai:deepseek", {
      ...provider,
      enabled: true,
      configJson: {
        ...(provider.configJson ?? {}),
        realCallEnabled: true,
        model: "deepseek-v4-pro",
      },
      secretJson: {
        apiKey: "deepseek-secret",
      },
      maskedSecretJson: {
        apiKey: "deep****cret",
      },
    });
    app = buildApiServer({
      dbClient: client,
      authConfig: testAuthConfig,
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
    expect(response.body).not.toContain("deepseek-secret");
  });

  it("returns a non-fatal timeout message for manual DeepSeek interpretation", async () => {
    const fetchMock = vi.fn(async () => {
      throw new DOMException("Request timed out", "AbortError");
    });
    vi.stubGlobal("fetch", fetchMock);
    const { client, state } = await createFakeDatabaseClient();
    const provider = state.providers.get("ai:deepseek");
    state.providers.set("ai:deepseek", {
      ...provider,
      enabled: true,
      configJson: {
        ...(provider.configJson ?? {}),
        realCallEnabled: true,
        model: "deepseek-v4-pro",
        timeoutMs: 60000,
      },
      secretJson: {
        apiKey: "deepseek-secret",
      },
      maskedSecretJson: {
        apiKey: "deep****cret",
      },
    });
    app = buildApiServer({
      dbClient: client,
      authConfig: testAuthConfig,
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
      messageZh: expect.stringContaining("DeepSeek 请求超时"),
      latencyMs: expect.any(Number),
      model: "deepseek-v4-pro",
      promptSizeChars: expect.any(Number),
      parseSuccess: false,
      explanation: expect.objectContaining({
        conclusion: expect.objectContaining({
          recommendedDayZh: expect.any(String),
        }),
      }),
      diagnostics: expect.objectContaining({
        model: "deepseek-v4-pro",
        timeoutMs: 60000,
        promptSizeChars: expect.any(Number),
        parseSuccess: false,
        fallback: true,
      }),
      message: expect.stringContaining("DeepSeek 请求超时"),
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(response.body.length).toBeGreaterThan(2);
    expect(response.body).not.toContain("deepseek-secret");
  });

  it("falls back to deterministic interpretation when DeepSeek JSON parsing fails", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: "{not-json",
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
        ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { client, state } = await createFakeDatabaseClient();
    const provider = state.providers.get("ai:deepseek");
    state.providers.set("ai:deepseek", {
      ...provider,
      enabled: true,
      configJson: {
        ...(provider.configJson ?? {}),
        realCallEnabled: true,
        model: "deepseek-v4-pro",
      },
      secretJson: {
        apiKey: "deepseek-secret",
      },
      maskedSecretJson: {
        apiKey: "deep****cret",
      },
    });
    app = buildApiServer({
      dbClient: client,
      authConfig: testAuthConfig,
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
      errorCategory: "parse_error",
      messageZh: expect.stringContaining("DeepSeek 返回内容无法解析"),
      retryable: true,
      latencyMs: expect.any(Number),
      model: "deepseek-v4-pro",
      promptSizeChars: expect.any(Number),
      parseSuccess: false,
      explanation: expect.objectContaining({
        conclusion: expect.objectContaining({
          recommendedDayZh: expect.any(String),
        }),
      }),
      diagnostics: expect.objectContaining({
        model: "deepseek-v4-pro",
        parseSuccess: false,
        fallback: true,
        errorCategory: "parse_error",
      }),
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(response.body).not.toContain("deepseek-secret");
  });

  it("caches successful DeepSeek interpretation by a stable forecast result key", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify(buildDeepSeekExplanationContent("缓存命中")),
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
        ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { client, state } = await createFakeDatabaseClient();
    const provider = state.providers.get("ai:deepseek");
    state.providers.set("ai:deepseek", {
      ...provider,
      enabled: true,
      configJson: {
        ...(provider.configJson ?? {}),
        realCallEnabled: true,
        model: "deepseek-v4-pro",
      },
      secretJson: {
        apiKey: "deepseek-secret",
      },
      maskedSecretJson: {
        apiKey: "deep****cret",
      },
    });
    app = buildApiServer({
      dbClient: client,
      authConfig: testAuthConfig,
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
      success: true,
      source: "deepseek",
      model: "deepseek-v4-pro",
      parseSuccess: true,
      cacheHit: false,
      interpretation: expect.objectContaining({
        conclusion: expect.objectContaining({
          oneSentenceDecisionZh: expect.stringContaining("缓存命中"),
        }),
      }),
    });
    expect(secondResponse.json()).toMatchObject({
      success: true,
      source: "deepseek",
      model: "deepseek-v4-pro",
      parseSuccess: true,
      cacheHit: true,
      latencyMs: 0,
      interpretation: expect.objectContaining({
        conclusion: expect.objectContaining({
          oneSentenceDecisionZh: expect.stringContaining("缓存命中"),
        }),
      }),
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(firstResponse.body).not.toContain("deepseek-secret");
    expect(secondResponse.body).not.toContain("deepseek-secret");
  });

  it("rejects unsupported horizon and target for calculation", async () => {
    app = buildApiServer({ authConfig: testAuthConfig, logger: false });

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
