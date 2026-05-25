import { describe, expect, it, vi } from "vitest";
import { buildMeteoblueForecastUrl, MeteoblueClient, MeteoblueRealProvider } from "../index";

const coordinates = {
  latitude: 30.1328,
  longitude: 118.1718,
  system: "wgs84",
} as const;

function meteobluePayload() {
  return {
    metadata: {
      latitude: 30.1328,
      longitude: 118.1718,
      height: 1860,
    },
    units: {
      temperature: "C",
      windspeed: "ms-1",
    },
    data_1h: {
      time: ["2026-05-25T08:00+08:00"],
      temperature: [23],
      relativehumidity: [97],
      windspeed: [1.1],
      winddirection: [129],
      cloudcover: [99],
      lowclouds: [90],
      midclouds: [60],
      highclouds: [30],
      precipitation: [0],
    },
  };
}

describe("MeteoblueClient", () => {
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
      humidity: 97,
      windSpeed: 1.1,
      windDirection: 129,
      cloudTotal: 99,
      cloudLow: 90,
      cloudMid: 60,
      cloudHigh: 30,
    });
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
      missingFields: expect.arrayContaining(["feelsLike", "dewPoint"]),
      messageZh: "meteoblue 通过，部分字段缺失。",
    });
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
