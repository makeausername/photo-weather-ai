import { describe, expect, it } from "vitest";
import {
  deepSeekModelOptions,
  getProviderFieldPreset,
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
          key: "defaultModel",
          target: "configJson",
          control: "select",
        }),
        expect.objectContaining({ key: "baseUrl", target: "configJson", advanced: true }),
      ]),
    );
  });

  it("keeps DeepSeek model dropdown values centralized", () => {
    expect(deepSeekModelOptions.map((option) => option.value)).toEqual([
      "deepseek-chat",
      "deepseek-reasoner",
    ]);
    expect(normalizeDeepSeekModel("deepseek-reasoner")).toBe("deepseek-reasoner");
    expect(normalizeDeepSeekModel("custom-model")).toBe("deepseek-chat");
  });
});
