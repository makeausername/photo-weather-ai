import { describe, expect, it, vi } from "vitest";
import {
  buildMeteoblueForecastUrl,
  MeteoblueClient,
  MeteoblueRealProvider,
  normalizeMeteoblueVisibilityKm,
} from "../index";

const coordinates = {
  latitude: 30.1328,
  longitude: 118.1718,
  system: "wgs84",
} as const;

function meteobluePayload() {
  return {
    metadata: {
      modelrun_updatetime_utc: "2026-05-25 01:40",
      name: "",
      height: 1860,
      timezone_abbreviation: "CST",
      latitude: 30.1328,
      longitude: 118.1718,
      utc_timeoffset: 8.0,
    },
    units: {
      temperature: "C",
      windspeed: "m/s",
      winddirection: "degree",
      relativehumidity: "%",
      cloudcover: "%",
      lowclouds: "%",
      midclouds: "%",
      highclouds: "%",
      precipitation: "mm",
      visibility: "m",
    },
    data_1h: {
      time: ["2026-05-25T08:00+08:00", "2026-05-25T09:00+08:00"],
      temperature: [23, 24],
      felttemperature: [26, 27],
      relativehumidity: [97, 95],
      windspeed: [1.1, 1.4],
      winddirection: [129, 130],
      cloudcover: [99, 95],
      lowclouds: [90, 85],
      midclouds: [60, 55],
      highclouds: [30, 20],
      precipitation: [0, 0.1],
      pictocode: [7, 7],
    },
  };
}

function meteobluePayloadWithSpaceSeparatedTimes() {
  return {
    ...meteobluePayload(),
    data_1h: {
      ...meteobluePayload().data_1h,
      time: ["2026-05-25 08:00", "2026-05-25 09:00+08:00"],
    },
  };
}

describe("MeteoblueClient", () => {
  it("normalizes visibility only from explicit units", () => {
    expect(normalizeMeteoblueVisibilityKm(626.9, "m")).toMatchObject({
      value: 0.6,
      sourceUnit: "m",
      validationStatus: "valid",
    });
    expect(normalizeMeteoblueVisibilityKm(5000, "m").value).toBe(5);
    expect(normalizeMeteoblueVisibilityKm(15, "km").value).toBe(15);
    expect(normalizeMeteoblueVisibilityKm(15, undefined)).toMatchObject({
      value: null,
      validationStatus: "unit_uncertain",
      rejectionReason: "missing_or_unsupported_visibility_unit",
    });
  });

  it("does not interpret 626.9 metres as 626.9 kilometres", () => {
    const provider = new MeteoblueRealProvider({
      client: new MeteoblueClient({
        apiKey: "meteoblue-secret",
        baseUrl: "https://my.meteoblue.com",
        packages: ["basic-1h", "clouds-1h"],
        timeoutMs: 1000,
        retryCount: 0,
        fetcher: vi.fn() as unknown as typeof fetch,
      }),
    });
    const payload = meteobluePayload();
    const hourly = provider.normalizeHourlyWeather({
      ...payload,
      data_1h: { ...payload.data_1h, visibility: [626.9, 5000] },
    });

    expect(hourly[0]?.visibility).toBe(0.6);
    expect(hourly[0]?.fieldMetadata?.visibility).toMatchObject({
      rawValue: 626.9,
      sourceUnit: "m",
      validationStatus: "valid",
    });
  });

  it("builds Forecast API package requests without exposing keys as headers", () => {
    const url = new URL(
      buildMeteoblueForecastUrl(
        {
          apiKey: "meteoblue-secret",
          baseUrl: "https://my.meteoblue.com/",
          packages: ["basic-1h", "clouds-1h"],
        },
        {
          coordinates,
          elevationMeters: 1860,
          timezone: "Asia/Shanghai",
        },
      ),
    );

    expect(url.origin).toBe("https://my.meteoblue.com");
    expect(url.pathname).toBe("/packages/basic-1h_clouds-1h");
    expect(url.searchParams.get("lat")).toBe("30.1328");
    expect(url.searchParams.get("lon")).toBe("118.1718");
    expect(url.searchParams.get("asl")).toBe("1860");
    expect(url.searchParams.get("format")).toBe("json");
    expect(url.searchParams.get("apikey")).toBe("meteoblue-secret");
  });

  it("uses mocked fetch for meteoblue connection tests", async () => {
    let capturedUrl = "";
    let capturedInit: RequestInit | undefined;
    const fetcherMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      capturedUrl = String(input);
      capturedInit = init;
      return new Response(JSON.stringify(meteobluePayload()), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      });
    });
    const fetcher = fetcherMock as unknown as typeof fetch;
    const client = new MeteoblueClient({
      apiKey: "meteoblue-secret",
      baseUrl: "https://my.meteoblue.com",
      packages: ["basic-1h", "clouds-1h"],
      timeoutMs: 1000,
      retryCount: 0,
      fetcher,
    });

    await expect(client.testConnection()).resolves.toMatchObject({
      success: true,
      statusCode: 200,
      packages: ["basic-1h", "clouds-1h"],
      sampleLocation: "黄山光明顶",
    });
    expect(fetcherMock).toHaveBeenCalledTimes(1);
    expect(capturedUrl).toContain("/packages/basic-1h_clouds-1h");
    expect(capturedUrl).toContain("apikey=meteoblue-secret");
    expect(capturedInit?.headers).toBeUndefined();
  });

  it("classifies invalid key responses without exposing the key", async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: "Invalid API key" }), {
          status: 403,
          headers: {
            "Content-Type": "application/json",
          },
        }),
    );
    const client = new MeteoblueClient({
      apiKey: "meteoblue-secret",
      baseUrl: "https://my.meteoblue.com",
      packages: ["basic-1h", "clouds-1h"],
      timeoutMs: 1000,
      retryCount: 0,
      fetcher,
    });

    await expect(client.fetchForecast({ coordinates })).rejects.toMatchObject({
      errorCategory: "invalid_key",
      messageZh: "meteoblue API Key 无效、权限不足或当前数据包未授权。",
      statusCode: 403,
    });
    await expect(client.fetchForecast({ coordinates })).rejects.not.toMatchObject({
      message: expect.stringContaining("meteoblue-secret"),
    });
  });

  it("does not mark a 200 response as connected when the forecast payload cannot be fused", async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(JSON.stringify({ metadata: { name: "basic-1h" }, data_1h: {} }), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        }),
    ) as unknown as typeof fetch;
    const client = new MeteoblueClient({
      apiKey: "meteoblue-secret",
      baseUrl: "https://my.meteoblue.com",
      packages: ["basic-1h", "clouds-1h"],
      timeoutMs: 1000,
      retryCount: 0,
      fetcher,
    });

    await expect(client.testConnection()).rejects.toMatchObject({
      errorCategory: "parse_error",
      messageZh: "meteoblue 返回中没有可用的 basic-1h/clouds-1h 天气字段。",
    });
  });

  it("normalizes the successful diagnostics response through the fusion provider", async () => {
    const client = new MeteoblueClient({
      apiKey: "meteoblue-secret",
      baseUrl: "https://my.meteoblue.com",
      packages: ["basic-1h", "clouds-1h"],
      timeoutMs: 1000,
      retryCount: 0,
      fetcher: vi.fn(
        async () => new Response(JSON.stringify(meteobluePayload())),
      ) as unknown as typeof fetch,
    });
    const provider = new MeteoblueRealProvider({ client, timezone: "Asia/Shanghai" });

    const hourly = await provider.getHourlyForecast({
      coordinates,
      hours: 1,
      timezone: "Asia/Shanghai",
    });

    expect(hourly[0]).toMatchObject({
      providerCode: "meteoblue",
      temperature: 23,
      feelsLike: 26,
      humidity: 97,
      windSpeed: 1.1,
      windDirection: 129,
      cloudTotal: 99,
      cloudLow: 90,
      cloudMid: 60,
      cloudHigh: 30,
      weatherCode: "7",
    });
  });

  it("accepts production-shaped data_1h through the active connection-test parser", async () => {
    const client = new MeteoblueClient({
      apiKey: "meteoblue-secret",
      baseUrl: "https://my.meteoblue.com",
      packages: ["basic-1h", "clouds-1h"],
      timeoutMs: 1000,
      retryCount: 0,
      fetcher: vi.fn(
        async () =>
          new Response(JSON.stringify(meteobluePayload()), {
            status: 200,
            headers: {
              "Content-Type": "application/json; charset=utf-8",
            },
          }),
      ) as unknown as typeof fetch,
    });

    await expect(client.testConnection()).resolves.toMatchObject({
      success: true,
      statusCode: 200,
      packages: ["basic-1h", "clouds-1h"],
    });
  });

  it("normalizes meteoblue space-separated hourly timestamps instead of parser mismatch", () => {
    const provider = new MeteoblueRealProvider({
      client: new MeteoblueClient({
        apiKey: "meteoblue-secret",
        baseUrl: "https://my.meteoblue.com",
        packages: ["basic-1h", "clouds-1h"],
        timeoutMs: 1000,
        retryCount: 0,
        fetcher: vi.fn() as unknown as typeof fetch,
      }),
    });

    expect(() =>
      provider.normalizeWeatherData(meteobluePayloadWithSpaceSeparatedTimes()),
    ).not.toThrow("meteoblue 返回格式与当前解析器不匹配，请检查 packages 配置。");
    expect(
      provider.normalizeHourlyWeather(meteobluePayloadWithSpaceSeparatedTimes())[0]?.time,
    ).toBe("2026-05-25T08:00:00+08:00");
  });

  it("lists extracted and missing fields for top-level data_1h payloads", () => {
    const provider = new MeteoblueRealProvider({
      client: new MeteoblueClient({
        apiKey: "meteoblue-secret",
        baseUrl: "https://my.meteoblue.com",
        packages: ["basic-1h", "clouds-1h"],
        timeoutMs: 1000,
        retryCount: 0,
        fetcher: vi.fn() as unknown as typeof fetch,
      }),
    });

    const normalized = provider.normalizeWeatherData(meteobluePayload());
    const summary = normalized.sourceSummaries?.[0];

    expect(normalized.hourly[0]?.providerElevationMeters).toBe(1860);
    expect(normalized.daily[0]?.providerElevationMeters).toBe(1860);
    expect(summary).toMatchObject({
      providerCode: "meteoblue",
      attempted: true,
      success: true,
      packages: ["basic-1h", "clouds-1h"],
      topLevelKeys: ["metadata", "units", "data_1h"],
      extractedFields: expect.arrayContaining([
        "temperature",
        "humidity",
        "windSpeed",
        "windDirection",
        "precipitation",
        "cloudTotal",
        "cloudLow",
        "cloudMid",
        "cloudHigh",
      ]),
      missingFields: expect.arrayContaining(["dewPoint", "windGust", "pressure", "visibility"]),
      partial: true,
      messageZh: "meteoblue 通过，部分字段缺失。",
    });
  });

  it("does not invent meteoblue precipitation probability when only amount is returned", () => {
    const provider = new MeteoblueRealProvider({
      client: new MeteoblueClient({
        apiKey: "meteoblue-secret",
        baseUrl: "https://my.meteoblue.com",
        packages: ["basic-1h", "clouds-1h"],
        timeoutMs: 1000,
        retryCount: 0,
        fetcher: vi.fn() as unknown as typeof fetch,
      }),
    });

    const [hour] = provider.normalizeHourlyWeather({
      ...meteobluePayload(),
      data_1h: {
        ...meteobluePayload().data_1h,
        precipitation: [4.8, 0],
      },
    });

    expect(hour?.precipitationProbability).toBeNull();
    expect(hour?.precipitationProbabilityPercent).toBeNull();
    expect(hour?.precipitationAmountMm).toBe(4.8);
    expect(hour?.precipitationType).toBe("rain");
    expect(hour?.missingFields).toEqual(expect.arrayContaining(["precipitationProbability"]));
  });

  it("extracts partial meteoblue fields from nested package payloads and records missing fields", () => {
    const provider = new MeteoblueRealProvider({
      client: new MeteoblueClient({
        apiKey: "meteoblue-secret",
        baseUrl: "https://my.meteoblue.com",
        packages: ["basic-1h", "clouds-1h"],
        timeoutMs: 1000,
        retryCount: 0,
        fetcher: vi.fn() as unknown as typeof fetch,
      }),
    });

    const hourly = provider.normalizeHourlyWeather({
      "basic-1h": {
        data_1h: {
          time: ["2026-05-20T00:00:00+08:00"],
          temperature_instant: [11],
          windspeed: [3.6],
        },
      },
      "clouds-1h": {
        data_1h: {
          time: ["2026-05-20T00:00:00+08:00"],
          totalcloudcover: [66],
          lowclouds: [18],
        },
      },
    });

    expect(hourly[0]).toMatchObject({
      temperature: 11,
      cloudTotal: 66,
      cloudLow: 18,
      missingFields: expect.arrayContaining(["humidity", "cloudMid", "cloudHigh", "dewPoint"]),
    });
  });

  it("succeeds for partial top-level data_1h fields without fake parse success", () => {
    const provider = new MeteoblueRealProvider({
      client: new MeteoblueClient({
        apiKey: "meteoblue-secret",
        baseUrl: "https://my.meteoblue.com",
        packages: ["basic-1h", "clouds-1h"],
        timeoutMs: 1000,
        retryCount: 0,
        fetcher: vi.fn() as unknown as typeof fetch,
      }),
    });

    const hourly = provider.normalizeHourlyWeather({
      metadata: { latitude: 30.1328 },
      data_1h: {
        time: ["2026-05-25T08:00+08:00"],
        cloudcover: [88],
      },
    });

    expect(hourly[0]).toMatchObject({
      providerCode: "meteoblue",
      cloudTotal: 88,
      missingFields: expect.arrayContaining(["temperature", "humidity", "windSpeed"]),
    });
  });

  it("returns a safe parse error for unexpected valid JSON without leaking API keys", () => {
    const provider = new MeteoblueRealProvider({
      client: new MeteoblueClient({
        apiKey: "meteoblue-secret",
        baseUrl: "https://my.meteoblue.com",
        packages: ["basic-1h", "clouds-1h"],
        timeoutMs: 1000,
        retryCount: 0,
        fetcher: vi.fn() as unknown as typeof fetch,
      }),
    });

    expect(() => provider.normalizeWeatherData({ metadata: { name: "basic-1h" } })).toThrow(
      "meteoblue 返回中未找到 data_1h。",
    );
    expect(() => provider.normalizeWeatherData({ metadata: { name: "basic-1h" } })).not.toThrow(
      /meteoblue-secret/,
    );
  });
});
