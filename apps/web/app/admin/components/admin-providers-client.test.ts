import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(__dirname, "admin-providers-client.tsx"), "utf8");
const providerFieldsSource = readFileSync(
  resolve(__dirname, "../../../../../packages/shared/src/provider-fields.ts"),
  "utf8",
);

describe("admin provider console source", () => {
  it("defines grouped provider console sections and an overview", () => {
    for (const label of [
      "服务商配置",
      "服务商总数",
      "地图与地理服务",
      "天气数据源",
      "智能解读",
      "账户验证服务",
      "对象存储",
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
      "邮箱验证码",
      "短信验证码",
      "阿里云短信",
      "报告文件",
      "导出文件",
      "生成素材",
      "对象存储",
    ]) {
      expect(source).toContain(label);
    }
  });

  it("includes account verification and object storage providers in the managed allowlist", () => {
    for (const snippet of [
      '"email:aliyun_smtp"',
      '"sms:aliyun_sms"',
      '"storage:local_storage"',
      '"storage:aliyun_oss"',
      '"storage:tencent_cos"',
      'displayName: "阿里云企业邮箱 SMTP"',
      'displayName: "阿里云短信"',
      'displayName: "本地存储"',
      'displayName: "阿里云 OSS"',
      'displayName: "腾讯云 COS"',
      'requiredConfigKeys: ["host", "port", "secure", "fromAddress"]',
      'requiredConfigKeys: ["regionId", "signName", "templateCode"]',
      'requiredConfigKeys: ["rootPath", "publicBaseUrl", "basePrefix", "maxUploadBytes"]',
      'requiredConfigKeys: ["region", "endpoint", "bucket", "basePrefix", "publicBaseUrl"]',
      'requiredConfigKeys: ["region", "bucket", "basePrefix", "publicBaseUrl"]',
      "统一管理地图、天气数据源、智能解读、邮箱、短信验证码和对象存储服务。",
    ]) {
      expect(source).toContain(snippet);
    }
  });

  it("exposes object storage field labels through the imported provider presets", () => {
    for (const label of [
      "Bucket",
      "Region",
      "Endpoint",
      "AccessKey ID",
      "AccessKey Secret",
      "Secret ID",
      "Secret Key",
      "最大上传字节数",
      "存储前缀",
      "公开访问地址",
    ]) {
      expect(providerFieldsSource).toContain(label);
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
      "timeoutMs: 120000",
      'host: ""',
      "port: 465",
      "secure: true",
      'fromAddress: ""',
      'regionId: "cn-hangzhou"',
      'signName: ""',
      'templateCode: ""',
      'rootPath: "data/uploads"',
      'basePrefix: "uploads"',
      "maxUploadBytes: 10485760",
      'bucket: ""',
      'endpoint: ""',
    ]) {
      expect(source).toContain(snippet);
    }

    expect(source).toContain("maskedSecretJson");
    expect(source).not.toContain("provider.secretJson");
  });
});
