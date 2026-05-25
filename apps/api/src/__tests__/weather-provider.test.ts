import { describe, expect, it } from "vitest";
import type { ProviderConfigRecord } from "@photo-weather/db";
import {
  normalizeOpenMeteoAdminConfigJson,
  normalizeMeteoblueAdminConfigJson,
  normalizeQWeatherAdminConfigJson,
  resolveMeteoblueRuntimeConfig,
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

const baseMeteoblueProvider: ProviderConfigRecord = {
  id: "provider-meteoblue",
  providerType: "weather",
  providerCode: "meteoblue",
  displayName: "meteoblue",
  enabled: true,
  priority: 300,
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
          apiHost: "https://admin.qweather.example/",
          timeoutMs: 9000,
          retryCount: 2,
          language: "en",
          unit: "imperial",
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
      apiHostPresent: true,
      apiHost: "admin.qweather.example",
      baseUrl: "https://admin.qweather.example",
      timeoutMs: 9000,
      retryCount: 2,
      language: "en",
      unit: "imperial",
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
      QWEATHER_API_HOST: "https://env.qweather.example/",
      QWEATHER_TIMEOUT_MS: "12000",
      QWEATHER_RETRY_COUNT: "3",
    });

    expect(config).toMatchObject({
      realCallEnabled: true,
      apiKeyPresent: true,
      apiHostPresent: true,
      apiHost: "env.qweather.example",
      baseUrl: "https://env.qweather.example",
      timeoutMs: 12000,
      retryCount: 3,
      language: "zh",
      unit: "metric",
    });
  });

  it("keeps an empty admin QWeather API Host empty instead of falling back to env", () => {
    const config = resolveQWeatherRuntimeConfig(
      {
        ...baseQWeatherProvider,
        configJson: {
          realCallEnabled: true,
          apiHost: "",
        },
      },
      {
        NODE_ENV: "development",
        QWEATHER_API_HOST: "env.qweather.example",
      },
    );

    expect(config).toMatchObject({
      realCallEnabled: true,
      apiHostPresent: false,
      apiHost: "",
      baseUrl: "",
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
    expect(config.modeLabelZh).toBe("演示模式");
  });

  it("supports optional Open-Meteo key and customer endpoint config", () => {
    const config = resolveOpenMeteoRuntimeConfig(
      {
        ...baseOpenMeteoProvider,
        configJson: {
          realCallEnabled: true,
          mode: "customer",
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
      endpoint: "https://customer.open-meteo.example",
      customerEndpoint: "https://customer.open-meteo.example",
      defaultModel: "ensemble",
      modeLabelZh: "商业客户模式",
    });
    expect(JSON.stringify(config)).not.toContain("open-meteo-secret");
  });

  it("resolves Open-Meteo free mode without requiring an API key", () => {
    const config = resolveOpenMeteoRuntimeConfig(
      {
        ...baseOpenMeteoProvider,
        configJson: {
          realCallEnabled: true,
          mode: "free",
        },
      },
      {
        NODE_ENV: "development",
      },
    );

    expect(config).toMatchObject({
      realCallEnabled: true,
      mode: "free",
      apiKeyPresent: false,
      endpoint: "https://api.open-meteo.com",
      timezone: "Asia/Shanghai",
      modeLabelZh: "免费开发模式",
    });
  });

  it("resolves meteoblue config and keeps keys masked", () => {
    const config = resolveMeteoblueRuntimeConfig(
      {
        ...baseMeteoblueProvider,
        configJson: {
          realCallEnabled: true,
          baseUrl: "https://my.meteoblue.com/",
          packages: "basic-1h,clouds-1h",
          timeoutMs: 5000,
        },
        secretJson: {
          apiKey: "meteoblue-secret",
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
      baseUrl: "https://my.meteoblue.com",
      packages: ["basic-1h", "clouds-1h"],
      packageName: "basic-1h,clouds-1h",
      timeoutMs: 5000,
      modeLabelZh: "真实服务",
    });
    expect(JSON.stringify(config)).not.toContain("meteoblue-secret");
  });

  it("normalizes weather admin config with safe advanced defaults", () => {
    expect(
      normalizeQWeatherAdminConfigJson({
        realCallEnabled: true,
        apiHost: "https://admin.qweatherapi.com/",
      }),
    ).toMatchObject({
      realCallEnabled: true,
      apiHost: "admin.qweatherapi.com",
      timeoutMs: 10000,
      retryCount: 1,
      language: "zh",
      unit: "m",
    });

    expect(normalizeOpenMeteoAdminConfigJson({ customerEndpoint: "" })).toEqual({
      realCallEnabled: false,
      mode: "free",
      baseUrl: "https://api.open-meteo.com/v1",
      customerEndpoint: "https://customer-api.open-meteo.com",
      defaultModel: "forecast",
      timezone: "Asia/Shanghai",
      timeoutMs: 10000,
      retryCount: 1,
    });

    expect(normalizeMeteoblueAdminConfigJson({ baseUrl: "" })).toEqual({
      realCallEnabled: false,
      baseUrl: "https://my.meteoblue.com",
      packages: "basic-1h,clouds-1h",
      packageName: "basic-1h,clouds-1h",
      timeoutMs: 10000,
      retryCount: 1,
    });
  });
});
