import { describe, expect, it } from "vitest";
import type {
  Coordinates,
  NormalizedDailyWeather,
  NormalizedHourlyWeather,
} from "@photo-weather/shared";
import {
  WeatherIntelligenceService,
  InMemoryWeatherCache,
  WeatherProviderError,
  type AirQuality,
  type CurrentWeather,
  type WeatherAlert,
  type WeatherDataBundle,
  type WeatherProvider,
  type WeatherRequestInput,
} from "../index";

const coordinates: Coordinates = {
  latitude: 30.1328,
  longitude: 118.1718,
  system: "wgs84",
};

describe("WeatherIntelligenceService", () => {
  it("uses available real providers and records failed auxiliary providers safely", async () => {
    const service = new WeatherIntelligenceService({
      providers: [
        new StaticProvider("qweather", "和风天气", "real", hour({ temperature: 12 })),
        new FailingProvider("open_meteo", "Open-Meteo", "real"),
      ],
    });

    const bundle = await service.getWeatherDataBundle(requestInput());

    expect(bundle.dataMode).toBe("real");
    expect(bundle.currentWeather).toMatchObject({
      providerCode: "qweather",
      providerLabelZh: "和风天气",
      temperature: 12,
    });
    expect(bundle.sourceSummaries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ providerCode: "qweather", status: "available" }),
        expect.objectContaining({
          providerCode: "open_meteo",
          status: "failed",
          attempted: true,
          success: false,
          errorCategory: "provider_error",
          messageZh: "Open-Meteo 暂时不可用，结果已降低置信度。",
        }),
      ]),
    );
    expect(JSON.stringify(bundle)).not.toContain("secret");
  });

  it("falls back explicitly when all real providers fail", async () => {
    const service = new WeatherIntelligenceService({
      providers: [
        new FailingProvider("qweather", "和风天气", "real"),
        new FailingProvider("open_meteo", "Open-Meteo", "real"),
      ],
    });

    const bundle = await service.getWeatherDataBundle(requestInput());

    expect(bundle.dataMode).toBe("fallback");
    expect(bundle.noticeZh).toBe("天气数据：真实数据暂不可用，已回退到演示数据");
    expect(bundle.hourly.length).toBeGreaterThan(0);
    expect(bundle.sourceSummaries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ providerCode: "mock", status: "fallback" }),
        expect.objectContaining({
          providerCode: "qweather",
          status: "failed",
          attempted: true,
          success: false,
        }),
      ]),
    );
    expect(bundle.fusionSummary?.dataStatusZh).toBe("天气数据：真实数据暂不可用，已回退到演示数据");
  });

  it("separates cached provider bundles by runtime namespace", async () => {
    const cache = new InMemoryWeatherCache();
    const first = await new WeatherIntelligenceService({
      providers: [new StaticProvider("meteoblue", "meteoblue", "real", hour({ temperature: 8 }))],
      cache,
      cacheNamespace: "meteoblue-runtime-v1",
    }).getWeatherDataBundle(requestInput());

    const second = await new WeatherIntelligenceService({
      providers: [new StaticProvider("meteoblue", "meteoblue", "real", hour({ temperature: 18 }))],
      cache,
      cacheNamespace: "meteoblue-runtime-v2",
    }).getWeatherDataBundle(requestInput());

    expect(first.currentWeather?.temperature).toBe(8);
    expect(second.currentWeather?.temperature).toBe(18);
    expect(second.sourceSummaries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          providerCode: "meteoblue",
          attempted: true,
          success: true,
          cacheHit: false,
        }),
      ]),
    );
  });

  it("keeps confidence usable when QWeather and Open-Meteo pass but meteoblue parse fails", async () => {
    const service = new WeatherIntelligenceService({
      providers: [
        new StaticProvider("qweather", "和风天气", "real", hour({ providerCode: "qweather" })),
        new StaticProvider(
          "open_meteo",
          "Open-Meteo",
          "real",
          hour({ providerCode: "open_meteo", providerLabelZh: "Open-Meteo" }),
        ),
        new MeteoblueParseFailingProvider(),
      ],
    });

    const bundle = await service.getWeatherDataBundle(requestInput());

    expect(bundle.fusionSummary?.confidenceLevel).not.toBe("low");
    expect(bundle.confidenceByTarget?.general ?? 0).toBeGreaterThanOrEqual(0.55);
    expect(bundle.sourceSummaries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ providerCode: "qweather", success: true }),
        expect.objectContaining({ providerCode: "open_meteo", success: true }),
        expect.objectContaining({
          providerCode: "meteoblue",
          success: false,
          errorCategory: "parse_error",
          messageZh: "meteoblue 返回中未找到可用的 basic-1h/clouds-1h 字段。",
        }),
      ]),
    );
  });
});

function requestInput(): WeatherRequestInput {
  return {
    coordinates,
    horizon: "24h",
    hours: 24,
    days: 1,
    forecastStart: "2026-05-20T00:00:00+08:00",
    forecastEnd: "2026-05-21T00:00:00+08:00",
    target: "general",
    timezone: "Asia/Shanghai",
  };
}

class StaticProvider implements WeatherProvider {
  readonly source;

  constructor(
    providerCode: "qweather" | "open_meteo" | "meteoblue",
    providerLabelZh: string,
    mode: "real" | "fixture",
    private readonly hourlyPoint: NormalizedHourlyWeather,
  ) {
    this.source = {
      providerCode,
      displayName: providerLabelZh,
      providerLabelZh,
      isMock: false,
      mode,
    };
  }

  async getCurrentWeather(input: WeatherRequestInput): Promise<CurrentWeather> {
    return {
      provider: this.source.providerCode,
      observedAt: this.hourlyPoint.time,
      coordinates: input.coordinates,
      condition: "partly_cloudy",
      summary: "多云",
      temperatureCelsius: this.hourlyPoint.temperature,
      feelsLikeCelsius: this.hourlyPoint.feelsLike ?? this.hourlyPoint.temperature,
      humidityPercent: this.hourlyPoint.humidity,
      cloudCoverPercent: this.hourlyPoint.cloudTotal,
      windSpeedMetersPerSecond: this.hourlyPoint.windSpeed,
      visibilityKilometers: this.hourlyPoint.visibility ?? 0,
    };
  }

  async getHourlyForecast(
    _input: WeatherRequestInput,
  ): Promise<readonly NormalizedHourlyWeather[]> {
    return [this.hourlyPoint];
  }

  async getDailyForecast(_input: WeatherRequestInput): Promise<readonly NormalizedDailyWeather[]> {
    return [];
  }

  async getWeatherAlerts(_input: WeatherRequestInput): Promise<readonly WeatherAlert[]> {
    return [];
  }

  async getAirQuality(_input: WeatherRequestInput): Promise<AirQuality> {
    return {
      provider: this.source.providerCode,
      observedAt: this.hourlyPoint.time,
      aqi: 35,
      category: "good",
      pm25: 14,
      pm10: 22,
    };
  }

  normalizeHourlyWeather(_input: unknown): readonly NormalizedHourlyWeather[] {
    return [this.hourlyPoint];
  }

  normalizeDailyWeather(_input: unknown): readonly NormalizedDailyWeather[] {
    return [];
  }

  normalizeWeatherData(_input: unknown): WeatherDataBundle {
    return {
      hourly: [this.hourlyPoint],
      daily: [],
      alerts: [],
      providerCode: this.source.providerCode,
      providerLabelZh: this.source.providerLabelZh,
      dataMode: this.source.mode,
      generatedAt: this.hourlyPoint.time,
      noticeZh: `天气数据：${this.source.providerLabelZh}`,
    };
  }
}

class FailingProvider extends StaticProvider {
  constructor(
    providerCode: "qweather" | "open_meteo" | "meteoblue",
    providerLabelZh: string,
    mode: "real" | "fixture",
  ) {
    super(providerCode, providerLabelZh, mode, hour());
  }

  override async getCurrentWeather(_input: WeatherRequestInput): Promise<CurrentWeather> {
    throw new Error("upstream secret failure");
  }
}

class MeteoblueParseFailingProvider extends StaticProvider {
  constructor() {
    super("meteoblue", "meteoblue", "real", hour());
  }

  override async getCurrentWeather(_input: WeatherRequestInput): Promise<CurrentWeather> {
    throw new WeatherProviderError({
      providerCode: "meteoblue",
      providerLabelZh: "meteoblue",
      dataMode: "real",
      errorCategory: "parse_error",
      messageZh: "meteoblue 返回中未找到可用的 basic-1h/clouds-1h 字段。",
    });
  }
}

function hour(overrides: Partial<NormalizedHourlyWeather> = {}): NormalizedHourlyWeather {
  return {
    time: "2026-05-20T06:00:00+08:00",
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
    weatherTextZh: "多云",
    providerCode: "qweather",
    providerLabelZh: "和风天气",
    dataMode: "real",
    sourceConfidence: 0.86,
    missingFields: [],
    ...overrides,
  };
}
