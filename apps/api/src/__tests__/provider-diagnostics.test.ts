import { describe, expect, it, vi } from "vitest";
import { parseProviderDiagnosticsArgs, runProviderDiagnostics } from "../provider-diagnostics-cli.js";
import { createFakeDatabaseClient } from "./fake-db.js";

describe("provider diagnostics CLI helpers", () => {
  it("parses provider and all flags", () => {
    expect(parseProviderDiagnosticsArgs(["--provider", "meteoblue"])).toEqual(["meteoblue"]);
    expect(parseProviderDiagnosticsArgs(["--all"])).toEqual([
      "meteoblue",
      "open_meteo",
      "qweather",
      "amap",
    ]);
    expect(parseProviderDiagnosticsArgs(["--", "--all"])).toEqual([
      "meteoblue",
      "open_meteo",
      "qweather",
      "amap",
    ]);
    expect(parseProviderDiagnosticsArgs(["--", "--provider", "qweather"])).toEqual([
      "qweather",
    ]);
    expect(() => parseProviderDiagnosticsArgs(["--provider=openai"])).toThrow();
    expect(() => parseProviderDiagnosticsArgs(["--", "--unknown"])).toThrow();
  });

  it("runs without browser cookies and never prints provider secrets", async () => {
    const { client, state } = await createFakeDatabaseClient();
    const meteoblueProvider = state.providers.get("weather:meteoblue");
    state.providers.set("weather:meteoblue", {
      ...meteoblueProvider,
      enabled: true,
      configJson: {
        ...(meteoblueProvider.configJson ?? {}),
        realCallEnabled: true,
        baseUrl: "https://my.meteoblue.com",
        packages: "basic-1h,clouds-1h",
      },
      secretJson: {
        apiKey: "meteoblue-cli-secret",
      },
      maskedSecretJson: {
        apiKey: "mete****cret",
      },
    });
    const fetcher = vi.fn(async () => {
      return new Response(JSON.stringify({ error: "Invalid API key" }), {
        status: 401,
        headers: {
          "Content-Type": "application/json",
        },
      });
    }) as unknown as typeof fetch;

    const [result] = await runProviderDiagnostics({
      providerCodes: ["meteoblue"],
      dbClient: client,
      env: {
        ...process.env,
        NODE_ENV: "production",
      },
      fetcher,
    });

    expect(result).toMatchObject({
      providerCode: "meteoblue",
      enabled: true,
      realCallEnabled: true,
      apiKeyPresent: true,
      attempted: true,
      success: false,
      statusCode: 401,
      errorCategory: "invalid_key",
      messageZh: "meteoblue API Key 无效、权限不足或当前数据包未授权。",
    });
    expect(JSON.stringify(result)).not.toContain("meteoblue-cli-secret");
  });

  it("uses the fusion-compatible meteoblue request parser for successful diagnostics", async () => {
    const { client, state } = await createFakeDatabaseClient();
    const meteoblueProvider = state.providers.get("weather:meteoblue");
    state.providers.set("weather:meteoblue", {
      ...meteoblueProvider,
      enabled: true,
      configJson: {
        ...(meteoblueProvider.configJson ?? {}),
        realCallEnabled: true,
        baseUrl: "https://my.meteoblue.com",
        packages: "basic-1h,clouds-1h",
      },
      secretJson: {
        apiKey: "meteoblue-cli-secret",
      },
      maskedSecretJson: {
        apiKey: "mete****cret",
      },
    });
    const fetcher = vi.fn(async () => {
      return new Response(
        JSON.stringify({
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
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        },
      );
    }) as unknown as typeof fetch;

    const [result] = await runProviderDiagnostics({
      providerCodes: ["meteoblue"],
      dbClient: client,
      env: {
        ...process.env,
        NODE_ENV: "production",
      },
      fetcher,
    });

    expect(result).toMatchObject({
      providerCode: "meteoblue",
      enabled: true,
      realCallEnabled: true,
      apiKeyPresent: true,
      attempted: true,
      success: true,
      statusCode: 200,
      baseUrl: "https://my.meteoblue.com",
      packages: ["basic-1h", "clouds-1h"],
    });
    expect(JSON.stringify(result)).not.toContain("meteoblue-cli-secret");
  });

});
