import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(__dirname, "admin-providers-client.tsx"), "utf8");

describe("admin provider console source", () => {
  it("defines grouped provider console sections and an overview", () => {
    for (const label of [
      "服务商配置",
      "服务商总数",
      "地图与地理服务",
      "天气数据源",
      "智能解读",
      "已启用",
      "真实调用",
      "需要处理",
    ]) {
      expect(source).toContain(label);
    }
  });

  it("keeps provider cards secret-safe and compact", () => {
    expect(source).toContain("StatusFacts");
    expect(source).toContain("ProviderTestDetails");
    expect(source).toContain("providerTestButtonLabel");
    expect(source).toContain("有未保存修改");
    expect(source).toContain("展开高级配置");
    expect(source).toContain("ProviderCardErrorBoundary");
    expect(source).toContain("该服务商配置暂时无法显示，请刷新或检查配置。");
    expect(source).toContain("data-provider-card");
    expect(source).not.toContain("providerTabs");
    expect(source).not.toContain("RealDevCallNotice");
    expect(source).not.toContain("SavedSecretSummary");
    expect(source).not.toContain("当前将请求真实服务，请确认 Key 有效且注意调用费用。");
    expect(source).not.toContain("V1 仅保留专业增强源接口，不在自动流程中请求 meteoblue 服务");
  });

  it("declares the requested capability badges", () => {
    for (const label of [
      "实时天气",
      "逐小时预报",
      "云层分层",
      "多模型交叉验证",
      "Forecast API",
      "商业精度提升",
      "地点搜索",
      "坐标转换",
      "智能解读",
    ]) {
      expect(source).toContain(label);
    }
  });

  it("keeps advanced provider defaults crash-safe without exposing secrets", () => {
    for (const snippet of [
      "timeoutMs: 10000",
      "retryCount: 1",
      'language: "zh"',
      'unit: "m"',
      'baseUrl: "https://my.meteoblue.com"',
      'packages: ["basic-1h", "clouds-1h"]',
      'model: "deepseek-v4-pro"',
      "timeoutMs: 30000",
    ]) {
      expect(source).toContain(snippet);
    }

    expect(source).toContain("maskedSecretJson");
    expect(source).not.toContain("provider.secretJson");
  });
});
