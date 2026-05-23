import { describe, expect, it } from "vitest";
import {
  isProviderSaveDisabled,
  providerSaveButtonLabel,
  providerSaveErrorMessage,
  providerSaveSuccessMessage,
} from "./provider-save-feedback";

describe("provider save feedback", () => {
  it("uses provider-specific Chinese success messages", () => {
    expect(providerSaveSuccessMessage({ providerType: "weather", providerCode: "qweather" })).toBe(
      "和风天气配置已保存。",
    );
    expect(providerSaveSuccessMessage({ providerType: "ai", providerCode: "deepseek" })).toBe(
      "DeepSeek 配置已保存。",
    );
    expect(providerSaveSuccessMessage({ providerType: "geo", providerCode: "amap" })).toBe(
      "高德地图配置已保存。",
    );
    expect(providerSaveSuccessMessage({ providerType: "storage", providerCode: "local" })).toBe(
      "服务商配置已保存。",
    );
  });

  it("keeps save success copy separate from connection-test copy", () => {
    expect(providerSaveSuccessMessage({ providerType: "weather", providerCode: "qweather" })).toBe(
      "和风天气配置已保存。",
    );
    expect(
      providerSaveSuccessMessage({ providerType: "weather", providerCode: "qweather" }),
    ).not.toContain("连接测试");
  });

  it("shows the saving button label and disables duplicate saves", () => {
    const saving = { status: "saving" as const, message: "正在保存..." };

    expect(providerSaveButtonLabel(saving)).toBe("保存中...");
    expect(isProviderSaveDisabled(saving)).toBe(true);
    expect(providerSaveButtonLabel({ status: "saved", message: "服务商配置已保存。" })).toBe(
      "保存配置",
    );
    expect(isProviderSaveDisabled(undefined)).toBe(false);
  });

  it("shows safe Chinese save errors", () => {
    expect(providerSaveErrorMessage(new Error("权限不足"))).toBe("保存失败：权限不足");
    expect(providerSaveErrorMessage(new Error(""))).toBe("保存失败，请稍后重试。");
  });

  it("does not expose stack traces or provider internals in save errors", () => {
    expect(
      providerSaveErrorMessage(
        new Error("PrismaClientKnownRequestError: configJson secretJson apiKey failed"),
      ),
    ).toBe("保存失败，请稍后重试。");
    expect(providerSaveErrorMessage(new Error("Error: failed\n    at saveProvider (x:1:1)"))).toBe(
      "保存失败，请稍后重试。",
    );
  });
});
