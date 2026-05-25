import { describe, expect, it } from "vitest";
import type { ProviderConfigRecord } from "@photo-weather/db";
import { normalizeDeepSeekAdminConfigJson, resolveDeepSeekRuntimeConfig } from "../ai-provider.js";

const baseProvider: ProviderConfigRecord = {
  id: "provider-deepseek",
  providerType: "ai",
  providerCode: "deepseek",
  displayName: "DeepSeek",
  enabled: true,
  priority: 100,
  configJson: {},
  secretJson: {},
  maskedSecretJson: {},
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

describe("DeepSeek runtime resolver", () => {
  it("overrides fast mode to deepseek-v4-pro", () => {
    const config = resolveDeepSeekRuntimeConfig(
      {
        ...baseProvider,
        configJson: {
          realCallEnabled: true,
          analysisMode: "fast",
        },
        secretJson: {
          apiKey: "sk-test",
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
      analysisMode: "professional",
      model: "deepseek-v4-pro",
      responseFormat: "json_object",
      temperature: 0.2,
      maxTokens: 6000,
      thinkingEnabled: true,
      reasoningEffort: "medium",
      timeoutMs: 90000,
      modeLabelZh: "专业模式",
    });
    expect(JSON.stringify(config)).not.toContain("sk-test");
  });

  it("resolves professional mode to deepseek-v4-pro", () => {
    const config = resolveDeepSeekRuntimeConfig(
      {
        ...baseProvider,
        configJson: {
          realCallEnabled: true,
          analysisMode: "professional",
        },
      },
      {
        NODE_ENV: "development",
        DEEPSEEK_API_KEY: "sk-env",
      },
    );

    expect(config).toMatchObject({
      apiKeyPresent: true,
      analysisMode: "professional",
      model: "deepseek-v4-pro",
      maxTokens: 6000,
      thinkingEnabled: true,
      reasoningEffort: "medium",
      modeLabelZh: "专业模式",
    });
    expect(JSON.stringify(config)).not.toContain("sk-env");
  });

  it("maps legacy or stale models to deepseek-v4-pro", () => {
    expect(
      resolveDeepSeekRuntimeConfig(
        {
          ...baseProvider,
          configJson: {
            defaultModel: "deepseek-chat",
          },
        },
        {
          NODE_ENV: "development",
        },
      ),
    ).toMatchObject({
      analysisMode: "professional",
      model: "deepseek-v4-pro",
    });

    expect(
      resolveDeepSeekRuntimeConfig(
        {
          ...baseProvider,
          configJson: {
            defaultModel: "deepseek-reasoner",
          },
        },
        {
          NODE_ENV: "development",
        },
      ),
    ).toMatchObject({
      analysisMode: "professional",
      model: "deepseek-v4-pro",
    });

    expect(
      resolveDeepSeekRuntimeConfig(
        {
          ...baseProvider,
          configJson: {
            model: "deepseek-v4-flash",
          },
        },
        {
          NODE_ENV: "development",
        },
      ),
    ).toMatchObject({
      analysisMode: "professional",
      model: "deepseek-v4-pro",
    });
  });

  it("uses admin config before env fallback", () => {
    const config = resolveDeepSeekRuntimeConfig(
      {
        ...baseProvider,
        configJson: {
          realCallEnabled: false,
          analysisMode: "fast",
        },
      },
      {
        NODE_ENV: "development",
        ENABLE_REAL_DEEPSEEK: "true",
        DEEPSEEK_DEFAULT_MODEL: "deepseek-v4-pro",
        DEEPSEEK_BASE_URL: "https://env.deepseek.example",
      },
    );

    expect(config).toMatchObject({
      realCallEnabled: false,
      analysisMode: "professional",
      model: "deepseek-v4-pro",
      baseUrl: "https://env.deepseek.example",
    });
  });

  it("normalizes admin config fields for safe storage", () => {
    expect(
      normalizeDeepSeekAdminConfigJson({
        realCallEnabled: true,
        analysisMode: "professional",
      }),
    ).toMatchObject({
      realCallEnabled: true,
      analysisMode: "professional",
      model: "deepseek-v4-pro",
      baseUrl: "https://api.deepseek.com",
      responseFormat: "json_object",
      temperature: 0.2,
      maxTokens: 6000,
      thinkingEnabled: true,
      reasoningEffort: "medium",
      timeoutMs: 90000,
      modelPolicyNoteZh: "当前项目固定使用 deepseek-v4-pro。",
    });
  });
});
