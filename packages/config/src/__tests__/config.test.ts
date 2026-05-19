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
  });

  it("requires core deployment secrets in production", () => {
    const result = serverEnvSchema.safeParse({
      NODE_ENV: "production",
    });

    expect(result.success).toBe(false);
  });

  it("defines visual admin keys for future configuration", () => {
    expect(adminSettingDefinitions.some((setting) => setting.key === "ai.deepseek.apiKey")).toBe(
      true,
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
