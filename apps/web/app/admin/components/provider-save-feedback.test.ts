import { describe, expect, it } from "vitest";
import {
  isProviderSaveDisabled,
  isProviderTestDisabled,
  providerSaveButtonLabel,
  providerSaveErrorMessage,
  providerSaveSuccessMessage,
  providerTestButtonLabel,
  providerTestErrorMessage,
  providerTestSuccessMessage,
} from "./provider-save-feedback";

describe("provider save feedback", () => {
  it("uses provider-specific Chinese success messages", () => {
    expect(providerSaveSuccessMessage({ providerType: "weather", providerCode: "qweather" })).toBe(
      "和风天气 配置已保存。",
    );
    expect(
      providerSaveSuccessMessage({ providerType: "weather", providerCode: "open_meteo" }),
    ).toBe("Open-Meteo 配置已保存。");
    expect(providerSaveSuccessMessage({ providerType: "weather", providerCode: "meteoblue" })).toBe(
      "meteoblue 配置已保存。",
    );
    expect(providerSaveSuccessMessage({ providerType: "geo", providerCode: "amap" })).toBe(
      "高德地图 配置已保存。",
    );
    expect(providerSaveSuccessMessage({ providerType: "storage", providerCode: "local" })).toBe(
      "服务商配置已保存。",
    );
  });

  it("keeps save success copy separate from connection-test copy", () => {
    expect(providerSaveSuccessMessage({ providerType: "weather", providerCode: "qweather" })).toBe(
      "和风天气 配置已保存。",
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

  it("shows the testing button label and disables duplicate tests", () => {
    const testing = { status: "testing" as const, message: "测试中..." };

    expect(providerTestButtonLabel(testing)).toBe("测试中...");
    expect(isProviderTestDisabled(testing)).toBe(true);
    expect(providerTestButtonLabel({ status: "saved", message: "测试通过" })).toBe("测试连接");
    expect(isProviderTestDisabled(undefined)).toBe(false);
  });

  it("builds unified safe provider test messages", () => {
    expect(
      providerTestSuccessMessage(
        { providerType: "weather", providerCode: "qweather" },
        { success: true, connectionMode: "real", latencyMs: 32 },
      ),
    ).toBe("和风天气 连接测试通过，耗时 32ms。");
    expect(
      providerTestSuccessMessage(
        { providerType: "weather", providerCode: "meteoblue" },
        {
          success: true,
          connectionMode: "mock",
          message: "当前为模拟测试，未请求 meteoblue 服务。",
        },
      ),
    ).toBe("当前为模拟测试，未请求 meteoblue 服务。");
    expect(
      providerTestSuccessMessage(
        { providerType: "weather", providerCode: "open_meteo" },
        { success: false, message: "HTTP 状态码：403。" },
      ),
    ).toBe("Open-Meteo 连接测试失败：HTTP 状态码：403。");
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
    expect(
      providerTestErrorMessage(
        { providerType: "weather", providerCode: "qweather" },
        new Error("Prisma secretJson apiKey failed"),
      ),
    ).toBe("和风天气 连接测试失败：请稍后重试。");
  });
});
