import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(__dirname, "admin-providers-client.tsx"), "utf8");

describe("admin provider console source", () => {
  it("defines grouped provider console sections and an overview", () => {
    for (const label of [
      "服务商总览",
      "地图与地理服务",
      "天气数据源",
      "智能解读",
      "已启用",
      "真实调用",
      "密钥已保存",
      "需要处理",
    ]) {
      expect(source).toContain(label);
    }
  });

  it("keeps provider cards secret-safe and compact", () => {
    expect(source).toContain("ProviderBadgeRow");
    expect(source).toContain("CapabilityBadges");
    expect(source).toContain("ProviderTestDetails");
    expect(source).toContain("providerTestButtonLabel");
    expect(source).not.toContain("RealDevCallNotice");
    expect(source).not.toContain("SavedSecretSummary");
    expect(source).not.toContain("当前将请求真实服务，请确认 Key 有效且注意调用费用。");
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
});
