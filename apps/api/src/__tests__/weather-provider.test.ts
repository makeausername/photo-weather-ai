import { describe, expect, it } from "vitest";
import type { ProviderConfigRecord } from "@photo-weather/db";
import {
  normalizeOpenMeteoAdminConfigJson,
  normalizeQWeatherAdminConfigJson,
  resolveOpenMeteoRuntimeConfig,
  resolveQWeatherRuntimeConfig,
} from "../weather-provider.js";

const baseQWeatherProvider: ProviderConfigRecord = {
  id: "provider-qweather",
  providerType: "weather",
  providerCode: "qweather",
  displayName: "和风天气",
  enabled: true,
  priority: 100,
  configJson: {},
  secretJson: {},
  maskedSecretJson: {},
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

const baseOpenMeteoProvider: ProviderConfigRecord = {
  id: "provider-open-meteo",
  providerType: "weather",
  providerCode: "open_meteo",
  displayName: "Open-Meteo",
  enabled: true,
  priority: 200,
  configJson: {},
  secretJson: {},
  maskedSecretJson: {},
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

describe("weather runtime resolvers", () => {
  it("resolves QWeather admin API key before env fallback without exposing it", () => {
    const config = resolveQWeatherRuntimeConfig(
      {
        ...baseQWeatherProvider,
        configJson: {
          realCallEnabled: true,
          apiHost: "https://admin.qweather.example",
          timeoutMs: 9000,
          retryCount: 2,
        },
        secretJson: {
          apiKey: "qweather-admin-secret",
        },
      },
      {
        NODE_ENV: "development",
        WEATHER_PROVIDER: "qweather",
        WEATHER_PROVIDER_MODE: "real",
        QWEATHER_API_KEY: "qweather-env-secret",
        QWEATHER_API_HOST: "https://env.qweather.example",
      },
    );

    expect(config).toMatchObject({
      enabled: true,
      realCallEnabled: true,
      apiKeyPresent: true,
      apiHost: "https://admin.qweather.example",
      baseUrl: "https://admin.qweather.example",
      timeoutMs: 9000,
      retryCount: 2,
      modeLabelZh: "真实服务",
    });
    expect(JSON.stringify(config)).not.toContain("qweather-admin-secret");
    expect(JSON.stringify(config)).not.toContain("qweather-env-secret");
  });

  it("uses env fallback and safe defaults for QWeather when admin config is empty", () => {
    const config = resolveQWeatherRuntimeConfig(baseQWeatherProvider, {
      NODE_ENV: "development",
      WEATHER_PROVIDER: "qweather",
      WEATHER_PROVIDER_MODE: "real",
      QWEATHER_API_KEY: "qweather-env-secret",
      QWEATHER_API_HOST: "https://env.qweather.example",
      QWEATHER_TIMEOUT_MS: "12000",
      QWEATHER_RETRY_COUNT: "3",
    });

    expect(config).toMatchObject({
      realCallEnabled: true,
      apiKeyPresent: true,
      apiHost: "https://env.qweather.example",
      baseUrl: "https://env.qweather.example",
      timeoutMs: 12000,
      retryCount: 3,
    });
  });

  it("forces QWeather real calls off under NODE_ENV=test", () => {
    const config = resolveQWeatherRuntimeConfig(
      {
        ...baseQWeatherProvider,
        configJson: {
          realCallEnabled: true,
        },
      },
      {
        NODE_ENV: "test",
        WEATHER_PROVIDER: "qweather",
        WEATHER_PROVIDER_MODE: "real",
      },
    );

    expect(config.realCallEnabled).toBe(false);
    expect(config.modeLabelZh).toBe("模拟测试");
  });

  it("supports optional Open-Meteo key and customer endpoint config", () => {
    const config = resolveOpenMeteoRuntimeConfig(
      {
        ...baseOpenMeteoProvider,
        configJson: {
          realCallEnabled: true,
          customerEndpoint: "https://customer.open-meteo.example",
          defaultModel: "ensemble",
        },
        secretJson: {
          apiKey: "open-meteo-secret",
        },
      },
      {
        NODE_ENV: "development",
      },
    );

    expect(config).toMatchObject({
      enabled: true,
      realCallEnabled: true,
      apiKeyPresent: true,
      customerEndpointPresent: true,
      customerEndpoint: "https://customer.open-meteo.example",
      defaultModel: "ensemble",
      modeLabelZh: "真实服务",
    });
    expect(JSON.stringify(config)).not.toContain("open-meteo-secret");
  });

  it("normalizes weather admin config with safe advanced defaults", () => {
    expect(normalizeQWeatherAdminConfigJson({ realCallEnabled: true })).toMatchObject({
      realCallEnabled: true,
      apiHost: "https://devapi.qweather.com",
      baseUrl: "https://devapi.qweather.com",
      timeoutMs: 8000,
      retryCount: 1,
    });

    expect(normalizeOpenMeteoAdminConfigJson({ customerEndpoint: "" })).toEqual({
      realCallEnabled: false,
      baseUrl: "https://api.open-meteo.com/v1",
      defaultModel: "forecast",
      timeoutMs: 8000,
      retryCount: 1,
    });
  });
});
