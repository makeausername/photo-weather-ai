import { describe, expect, it, vi } from "vitest";
import { buildMeteoblueForecastUrl, MeteoblueClient, MeteoblueRealProvider } from "../index";

const coordinates = {
  latitude: 30.1328,
  longitude: 118.1718,
  system: "wgs84",
} as const;

function meteobluePayload() {
  return {
    data_1h: {
      time: ["2026-05-20T00:00:00+08:00"],
      temperature: [12],
      relativehumidity: [82],
      windspeed: [3.2],
      cloudcover: [58],
      lowclouds: [26],
      midclouds: [40],
      highclouds: [52],
      visibility: [24],
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
      messageZh: "meteoblue 返回中未找到可用的 basic-1h/clouds-1h 字段。",
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
      temperature: 12,
      humidity: 82,
      cloudLow: 26,
      cloudMid: 40,
      cloudHigh: 52,
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
      "meteoblue 返回中未找到可用的 basic-1h/clouds-1h 字段。",
    );
    expect(() => provider.normalizeWeatherData({ metadata: { name: "basic-1h" } })).not.toThrow(
      /meteoblue-secret/,
    );
  });
});
