import { describe, expect, it, vi } from "vitest";
import { buildMeteoblueForecastUrl, MeteoblueClient } from "../index";

const coordinates = {
  latitude: 30.1328,
  longitude: 118.1718,
  system: "wgs84",
} as const;

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
      return new Response(JSON.stringify({ metadata: { name: "basic-1h" }, data_1h: {} }), {
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
      messageZh: "meteoblue Key 无效或权限不足",
      statusCode: 403,
    });
    await expect(client.fetchForecast({ coordinates })).rejects.not.toMatchObject({
      message: expect.stringContaining("meteoblue-secret"),
    });
  });
});
