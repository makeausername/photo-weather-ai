import { describe, expect, it } from "vitest";
import { adminSettingDefinitions, loadRuntimeConfig, maskSecret, serverEnvSchema } from "../index";

describe("environment config", () => {
  it("loads local config without real provider keys", () => {
    const config = loadRuntimeConfig({
      NODE_ENV: "test",
      STORAGE_PROVIDER: "local",
    });

    expect(config.serverEnv.NODE_ENV).toBe("test");
    expect(config.publicConfig).toEqual({
      nodeEnv: "test",
      storageProvider: "local",
      sentryDsn: undefined,
    });
    expect(config.serverEnv.ENABLE_REAL_AMAP).toBe(false);
    expect("ENABLE_REAL_OPENAI" in config.serverEnv).toBe(false);
    expect("OPENAI_DEFAULT_MODEL" in config.serverEnv).toBe(false);
    expect("OPENAI_BASE_URL" in config.serverEnv).toBe(false);
    expect(config.serverEnv.QWEATHER_API_HOST).toBeUndefined();
    expect(config.serverEnv.QWEATHER_LANGUAGE).toBe("zh");
    expect(config.serverEnv.QWEATHER_UNIT).toBe("metric");
    expect(config.serverEnv.OPEN_METEO_BASE_URL).toBe("https://api.open-meteo.com/v1");
  });

  it("parses explicit real development provider flags", () => {
    const config = loadRuntimeConfig({
      NODE_ENV: "development",
      STORAGE_PROVIDER: "local",
      ENABLE_REAL_AMAP: "true",
    });

    expect(config.serverEnv.ENABLE_REAL_AMAP).toBe(true);
    expect("ENABLE_REAL_OPENAI" in config.serverEnv).toBe(false);
  });

  it("requires core deployment secrets in production", () => {
    const result = serverEnvSchema.safeParse({
      NODE_ENV: "production",
    });

    expect(result.success).toBe(false);
  });

  it("defines visual admin keys for future configuration", () => {
    expect(adminSettingDefinitions.some((setting) => setting.key === "ai.openai.apiKey")).toBe(
      false,
    );
    expect(
      adminSettingDefinitions.some((setting) => setting.key === "scoring.weights.cloudCover"),
    ).toBe(true);
  });
});

describe("maskSecret", () => {
  it("masks long secrets while preserving a small prefix and suffix", () => {
    expect(maskSecret("sk-1234567890abcdef")).toBe("sk-1********cdef");
  });

  it("does not reveal short secrets", () => {
    expect(maskSecret("short")).toBe("********");
  });
});
