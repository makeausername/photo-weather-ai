import { describe, expect, it } from "vitest";
import {
  getDeepSeekModeRuntimeDefaults,
  deepSeekModelOptions,
  getProviderFieldPreset,
  normalizeDeepSeekAnalysisMode,
  normalizeDeepSeekModel,
  providerFieldPresets,
} from "../provider-fields.js";

describe("provider field presets", () => {
  it("defines visual fields for common provider secrets", () => {
    expect(providerFieldPresets.map((preset) => preset.providerCode)).toEqual(
      expect.arrayContaining([
        "deepseek",
        "qweather",
        "open_meteo",
        "meteoblue",
        "amap",
        "aliyun_oss",
        "tencent_cos",
        "s3_compatible",
        "local_storage",
      ]),
    );

    expect(getProviderFieldPreset("amap")?.fields).toContainEqual(
      expect.objectContaining({
        key: "apiKey",
        label: "高德 Web 服务 Key",
        target: "secretJson",
        password: true,
      }),
    );
  });

  it("separates editable config fields from masked secret fields", () => {
    expect(getProviderFieldPreset("deepseek")?.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "apiKey", target: "secretJson" }),
        expect.objectContaining({ key: "realCallEnabled", target: "configJson" }),
        expect.objectContaining({
          key: "analysisMode",
          target: "configJson",
          control: "select",
        }),
        expect.objectContaining({
          key: "model",
          target: "configJson",
          control: "select",
        }),
        expect.objectContaining({ key: "baseUrl", target: "configJson", advanced: true }),
      ]),
    );

    const qweatherFields = getProviderFieldPreset("qweather")?.fields;
    expect(qweatherFields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "realCallEnabled", target: "configJson" }),
        expect.objectContaining({
          key: "apiKey",
          label: "和风天气 API Key",
          target: "secretJson",
        }),
        expect.objectContaining({ key: "apiHost", target: "configJson" }),
        expect.objectContaining({ key: "timeoutMs", target: "configJson", advanced: true }),
        expect.objectContaining({ key: "language", target: "configJson", advanced: true }),
        expect.objectContaining({ key: "unit", target: "configJson", advanced: true }),
      ]),
    );
    expect(qweatherFields?.find((field) => field.key === "apiHost")?.advanced).toBeUndefined();

    expect(getProviderFieldPreset("open_meteo")?.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "realCallEnabled", target: "configJson" }),
        expect.objectContaining({
          key: "apiKey",
          label: "Open-Meteo API Key（可选）",
          target: "secretJson",
        }),
        expect.objectContaining({ key: "customerEndpoint", target: "configJson" }),
        expect.objectContaining({ key: "defaultModel", target: "configJson", advanced: true }),
      ]),
    );

    expect(getProviderFieldPreset("meteoblue")?.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "realCallEnabled", target: "configJson" }),
        expect.objectContaining({
          key: "apiKey",
          label: "meteoblue API Key",
          target: "secretJson",
        }),
        expect.objectContaining({
          key: "packages",
          target: "configJson",
          defaultValue: "basic-1h,clouds-1h",
        }),
      ]),
    );
    expect(getProviderFieldPreset("meteoblue")?.helpText).toBe(
      "meteoblue 可作为专业增强天气源，用于 Forecast API 真实测试和后续多源融合。",
    );
    expect(getProviderFieldPreset("amap")?.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "timeoutMs", target: "configJson", advanced: true }),
        expect.objectContaining({ key: "retryCount", target: "configJson", advanced: true }),
      ]),
    );
  });

  it("keeps DeepSeek model dropdown values centralized", () => {
    expect(deepSeekModelOptions.map((option) => option.value)).toEqual([
      "deepseek-v4-flash",
      "deepseek-v4-pro",
    ]);
    expect(normalizeDeepSeekModel("deepseek-reasoner")).toBe("deepseek-v4-pro");
    expect(normalizeDeepSeekModel("deepseek-chat")).toBe("deepseek-v4-flash");
    expect(normalizeDeepSeekModel("custom-model")).toBe("deepseek-v4-flash");
  });

  it("maps DeepSeek modes and legacy models to v4 runtime defaults", () => {
    expect(getDeepSeekModeRuntimeDefaults("fast")).toMatchObject({
      model: "deepseek-v4-flash",
      maxTokens: 4000,
      thinkingEnabled: false,
    });
    expect(getDeepSeekModeRuntimeDefaults("professional")).toMatchObject({
      model: "deepseek-v4-pro",
      maxTokens: 6000,
      thinkingEnabled: true,
      reasoningEffort: "medium",
    });
    expect(normalizeDeepSeekAnalysisMode(undefined, "deepseek-chat")).toBe("fast");
    expect(normalizeDeepSeekAnalysisMode(undefined, "deepseek-reasoner")).toBe("professional");
  });
});
