import { describe, expect, it } from "vitest";
import type { ProviderConfigRecord } from "@photo-weather/db";
import { normalizeOpenAiAdminConfigJson, resolveOpenAiRuntimeConfig } from "../ai-provider.js";

const baseProvider: ProviderConfigRecord = {
  id: "provider-openai",
  providerType: "ai",
  providerCode: "openai",
  displayName: "GPT / OpenAI",
  enabled: true,
  priority: 100,
  configJson: {},
  secretJson: {},
  maskedSecretJson: {},
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

describe("OpenAI runtime resolver", () => {
  it("resolves admin OpenAI config without exposing secrets", () => {
    const config = resolveOpenAiRuntimeConfig(
      {
        ...baseProvider,
        configJson: {
          realCallEnabled: true,
          model: "gpt-4.1-mini",
          baseUrl: "https://relay.example",
          temperature: 0.4,
          maxTokens: 1800,
          promptMaxChars: 5000,
          timeoutMs: 90000,
        },
        secretJson: {
          apiKey: "sk-test",
          internalRelayToken: "relay-secret",
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
      internalRelayTokenPresent: true,
      model: "gpt-4.1-mini",
      baseUrl: "https://relay.example",
      temperature: 0.4,
      maxTokens: 1800,
      promptMaxChars: 5000,
      timeoutMs: 90000,
      mode: "responses_api",
      modeLabelZh: "GPT / OpenAI",
    });
    expect(JSON.stringify(config)).not.toContain("sk-test");
    expect(JSON.stringify(config)).not.toContain("relay-secret");
  });

  it("accepts configured GPT / OpenAI preset models", () => {
    expect(
      resolveOpenAiRuntimeConfig(
        {
          ...baseProvider,
          configJson: {
            model: "gpt-5.5",
          },
        },
        {
          NODE_ENV: "development",
        },
      ).model,
    ).toBe("gpt-5.5");

    expect(
      resolveOpenAiRuntimeConfig(
        {
          ...baseProvider,
          configJson: {
            model: "gpt-5.4-mini",
          },
        },
        {
          NODE_ENV: "development",
        },
      ).model,
    ).toBe("gpt-5.4-mini");
  });

  it("resolves custom GPT / OpenAI model IDs without preset validation", () => {
    const config = resolveOpenAiRuntimeConfig(
      {
        ...baseProvider,
        configJson: {
          model: "custom",
          customModel: "  relay-preview-2026-06  ",
        },
      },
      {
        NODE_ENV: "development",
      },
    );

    expect(config.model).toBe("relay-preview-2026-06");
  });

  it("falls back to the default model when custom or preset selection is empty or invalid", () => {
    expect(
      resolveOpenAiRuntimeConfig(
        {
          ...baseProvider,
          configJson: {
            model: "custom",
            customModel: "  ",
          },
          secretJson: {
            model: "gpt-5.5",
          },
        },
        {
          NODE_ENV: "development",
          OPENAI_DEFAULT_MODEL: "gpt-4o",
        },
      ).model,
    ).toBe("gpt-5.4-mini");

    expect(
      resolveOpenAiRuntimeConfig(
        {
          ...baseProvider,
          configJson: {
            model: "",
          },
        },
        {
          NODE_ENV: "development",
        },
      ).model,
    ).toBe("gpt-5.4-mini");

    expect(
      resolveOpenAiRuntimeConfig(
        {
          ...baseProvider,
          configJson: {
            model: "not-a-dropdown-option",
          },
        },
        {
          NODE_ENV: "development",
        },
      ).model,
    ).toBe("gpt-5.4-mini");
  });

  it("keeps legacy secret and env model fallbacks flexible when no config model is selected", () => {
    expect(
      resolveOpenAiRuntimeConfig(
        {
          ...baseProvider,
          configJson: {},
          secretJson: {
            model: "relay-secret-model",
          },
        },
        {
          NODE_ENV: "development",
        },
      ).model,
    ).toBe("relay-secret-model");

    expect(
      resolveOpenAiRuntimeConfig(
        {
          ...baseProvider,
          configJson: {},
          secretJson: {},
        },
        {
          NODE_ENV: "development",
          OPENAI_DEFAULT_MODEL: "relay-env-model",
        },
      ).model,
    ).toBe("relay-env-model");
  });

  it("uses OpenAI env fallback values without enabling real calls in tests", () => {
    const config = resolveOpenAiRuntimeConfig(
      {
        ...baseProvider,
        configJson: {},
        secretJson: {},
      },
      {
        NODE_ENV: "test",
        ENABLE_REAL_OPENAI: "true",
        OPENAI_API_KEY: "sk-env",
        OPENAI_DEFAULT_MODEL: "gpt-4.1",
        OPENAI_BASE_URL: "https://env.openai.example",
        OPENAI_TIMEOUT_MS: "60000",
        OPENAI_AI_EXPLAIN_PROMPT_MAX_CHARS: "5500",
      },
    );

    expect(config).toMatchObject({
      enabled: true,
      realCallEnabled: false,
      apiKeyPresent: true,
      model: "gpt-4.1",
      baseUrl: "https://env.openai.example",
      timeoutMs: 60000,
      promptMaxChars: 5500,
    });
    expect(JSON.stringify(config)).not.toContain("sk-env");
  });

  it("defaults to disabled GPT / OpenAI Responses API config", () => {
    const config = resolveOpenAiRuntimeConfig(null, {
      NODE_ENV: "development",
    });

    expect(config).toMatchObject({
      enabled: false,
      realCallEnabled: false,
      apiKeyPresent: false,
      model: "gpt-5.4-mini",
      baseUrl: "https://api.openai.com",
      temperature: 0.2,
      maxTokens: 1200,
      promptMaxChars: 6000,
      timeoutMs: 120000,
      mode: "responses_api",
    });
  });

  it("normalizes admin config fields for safe storage", () => {
    expect(
      normalizeOpenAiAdminConfigJson({
        realCallEnabled: true,
        model: "",
        customModel: " future-relay ",
        baseUrl: "",
        temperature: 3,
        maxTokens: 32,
        promptMaxChars: 999999,
        timeoutMs: 10,
      }),
    ).toMatchObject({
      realCallEnabled: true,
      model: "gpt-5.4-mini",
      customModel: "future-relay",
      defaultModel: "gpt-5.4-mini",
      baseUrl: "https://api.openai.com",
      temperature: 2,
      maxTokens: 128,
      promptMaxChars: 6000,
      timeoutMs: 1000,
    });
  });

  it("normalizes custom admin model selection while preserving unknown custom IDs", () => {
    expect(
      normalizeOpenAiAdminConfigJson({
        model: "custom",
        customModel: " relay-future-model ",
      }),
    ).toMatchObject({
      model: "custom",
      customModel: "relay-future-model",
      defaultModel: "relay-future-model",
    });
  });
});
