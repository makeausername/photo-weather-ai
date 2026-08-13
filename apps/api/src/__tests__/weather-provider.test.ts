import { describe, expect, it } from "vitest";
import type { ProviderConfigRecord } from "@photo-weather/db";
import {
  createRuntimeWeatherDataService,
  normalizeOpenMeteoAdminConfigJson,
  normalizeOpenMeteoForecastModelList,
  normalizeMeteoblueAdminConfigJson,
  normalizeQWeatherAdminConfigJson,
  openMeteoForecastCloudLayerDefaultModelList,
  resolveMeteoblueRuntimeConfig,
  resolveOpenMeteoRuntimeConfig,
  resolveQWeatherRuntimeConfig,
  resolveRuntimeWeatherProviders,
} from "../weather-provider.js";
import { createFakeDatabaseClient } from "./fake-db.js";

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
  it("instantiates icon_global only once in the Open-Meteo runtime portfolio", async () => {
    const { client, state } = await createFakeDatabaseClient();
    const openMeteo = state.providers.get("weather:open_meteo");
    state.providers.set("weather:open_meteo", {
      ...openMeteo,
      enabled: true,
      configJson: {
        ...(openMeteo?.configJson ?? {}),
        realCallEnabled: true,
        mode: "free",
        modelList:
          "best_match,gfs_seamless,gfs_global,icon_global,cma_grapes_global,ecmwf_ifs025",
      },
    });
    const resolution = await resolveRuntimeWeatherProviders({
      dbClient: client,
      env: {
        NODE_ENV: "development",
      },
    });
    const openMeteoSnapshots = resolution.runtimeSnapshot.filter(
      (provider) => provider.providerCode === "open_meteo",
    );

    expect(openMeteoSnapshots.filter((provider) => provider.modelName === "icon_global")).toHaveLength(1);
    expect(
      resolution.providers.filter((provider) => provider.source.providerCode === "open_meteo"),
    ).toHaveLength(openMeteoSnapshots.length);
  });

  it("logs one safe participation item for every enabled provider on a cold calculation", async () => {
    const { client, state } = await createFakeDatabaseClient();
    for (const code of ["qweather", "open_meteo", "meteoblue"] as const) {
      const key = `weather:${code}`;
      const current = state.providers.get(key);
      state.providers.set(key, {
        ...current,
        enabled: true,
        configJson: { ...(current?.configJson ?? {}), realCallEnabled: false },
      });
    }
    const logs: { fields: Record<string, unknown>; message: string }[] = [];
    const service = createRuntimeWeatherDataService({
      dbClient: client,
      env: { NODE_ENV: "test" },
      logger: {
        info(fields, message) {
          logs.push({ fields, message });
        },
      },
    });

    await service.getWeatherDataBundle({
      coordinates: { latitude: 30.2, longitude: 120.1, system: "wgs84" },
      forecastStart: "2026-07-11T00:00:00+08:00",
      hours: 24,
      target: "general",
    });

    const summary = logs.find((entry) => entry.message === "Weather provider participation summary");
    const providers = summary?.fields.providers as readonly Record<string, unknown>[];
    expect(providers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ providerCode: "qweather", enabled: true }),
        expect.objectContaining({ providerCode: "open_meteo", enabled: true }),
        expect.objectContaining({ providerCode: "meteoblue", enabled: true, status: "skipped" }),
      ]),
    );
    expect(JSON.stringify(summary)).not.toMatch(/apiKey|authorization/i);
  });

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

  it("defaults Open-Meteo forecast model list to the production consensus portfolio", () => {
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

    expect(config.modelList).toEqual([
      "best_match",
      "gfs_seamless",
      "gfs_global",
      "icon_global",
      "cma_grapes_global",
      "ecmwf_ifs025",
    ]);
    expect(config.modelListLimit).toBe(6);
    expect(config.modelList.join(",")).toBe(openMeteoForecastCloudLayerDefaultModelList);
  });

  it("uses explicit Open-Meteo modelList from admin config before env", () => {
    const config = resolveOpenMeteoRuntimeConfig(
      {
        ...baseOpenMeteoProvider,
        configJson: {
          realCallEnabled: true,
          mode: "free",
          modelList: "best_match,gfs_global",
        },
      },
      {
        NODE_ENV: "development",
        OPEN_METEO_MODEL_LIST: "gfs_seamless",
      },
    );

    expect(config.modelList).toEqual(["best_match", "gfs_global"]);
  });

  it("keeps modelPreference backward compatible when modelList is absent", () => {
    const config = resolveOpenMeteoRuntimeConfig(
      {
        ...baseOpenMeteoProvider,
        configJson: {
          realCallEnabled: true,
          mode: "free",
          modelPreference: "best_match",
        },
      },
      {
        NODE_ENV: "development",
      },
    );

    expect(config.modelList).toEqual(["best_match", "gfs_seamless", "gfs_global"]);
  });

  it("normalizes Open-Meteo modelList values and caps count", () => {
    expect(
      normalizeOpenMeteoForecastModelList(
        " best_match,../bad,gfs_seamless,gfs_seamless,gfs_global,icon_global,ecmwf_ifs025,cma_grapes_global ",
      ),
    ).toEqual([
      "best_match",
      "gfs_seamless",
      "gfs_global",
      "icon_global",
      "ecmwf_ifs025",
      "cma_grapes_global",
    ]);
  });

  it("allows Open-Meteo modelList cap to be raised up to eight", () => {
    expect(
      normalizeOpenMeteoForecastModelList(
        "best_match,gfs_seamless,gfs_global,icon_global,ecmwf_ifs025,cma_grapes_global,jma_seamless,knmi_seamless,extra_model",
        8,
      ),
    ).toEqual([
      "best_match",
      "gfs_seamless",
      "gfs_global",
      "icon_global",
      "ecmwf_ifs025",
      "cma_grapes_global",
      "jma_seamless",
      "knmi_seamless",
    ]);
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
      modelList: "best_match,gfs_seamless,gfs_global,icon_global,cma_grapes_global,ecmwf_ifs025",
      modelListLimit: 6,
      iconModel: "icon_global",
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
