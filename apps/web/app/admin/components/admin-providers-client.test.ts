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
const providerPageSource = readFileSync(resolve(__dirname, "../providers/page.tsx"), "utf8");

describe("admin provider console source", () => {
  it("defines compact category navigation and provider overview", () => {
    for (const label of [
      "服务商配置",
      "服务商总数",
      "地图与地理",
      "天气数据",
      "智能解读",
      "支付收款",
      "邮箱短信",
      "对象存储",
      "已启用",
      "真实调用",
      "需处理",
    ]) {
      expect(source).toContain(label);
    }

    expect(source).toContain("data-provider-category-nav");
    expect(source).toContain("data-provider-category={group.key}");
    expect(source).toContain("group.marker");
    expect(source).toContain("selectGroup(group.key)");
    expect(source).toContain('useState<ProviderGroupKey>("weather")');
    expect(source).toContain("categorySessionStorageKey");
    expect(source).toContain("lg:grid-cols-[280px_minmax(0,1fr)]");
    expect(source).toContain("flex min-w-[190px] items-center gap-2 rounded-md");
    expect(source).not.toContain("min-w-[220px] gap-3 rounded-lg border border-border bg-card p-4");
  });

  it("uses compact summaries and one selected provider detail instead of full sequential forms", () => {
    expect(source).toContain("StatusFacts");
    expect(source).toContain("ProviderTestDetails");
    expect(source).toContain("providerTestButtonLabel");
    expect(source).toContain("有未保存修改");
    expect(source).toContain("展开高级配置");
    expect(source).toContain("ProviderCardErrorBoundary");
    expect(source).toContain("该服务商配置暂时无法显示，请刷新或检查配置。");
    expect(source).toContain("data-provider-list");
    expect(source).toContain("data-provider-list-group={group.key}");
    expect(source).toContain("data-provider-summary");
    expect(source).toContain("data-provider-detail-panel");
    expect(source).toContain("data-provider-detail");
    expect(source).toContain("selectedProvider ? renderProviderDetail(selectedProvider) : null");
    expect(source).toContain("renderProviderListRow(provider)");
    expect(source).toContain("selectProvider(provider)");
    expect(source).toContain("preferredVisibleProvider");
    expect(source).not.toContain("group.providers.map((provider, index)");
    expect(source).not.toContain("providers.map((provider) => renderProviderDetail");
    expect(source).not.toContain("group.providers.map((provider) => renderProviderDetail");
    expect(source).not.toContain("renderProviderSummaryCard");
    expect(source).not.toContain("isOddLast");
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
      "Native 扫码",
      "API v3 签名",
      "回调验签",
      "电脑网站支付",
      "手机网站支付",
      "RSA2 签名",
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

  it("keeps payment, account verification, and object storage providers easy to find", () => {
    for (const snippet of [
      '"email:aliyun_smtp"',
      '"sms:aliyun_sms"',
      '"storage:local_storage"',
      '"storage:aliyun_oss"',
      '"storage:tencent_cos"',
      '"billing:wechat_pay"',
      '"billing:alipay"',
      'displayName: "阿里云企业邮箱 SMTP"',
      'displayName: "阿里云短信"',
      'displayName: "微信支付"',
      'displayName: "支付宝"',
      'displayName: "本地存储"',
      'displayName: "阿里云 OSS"',
      'displayName: "腾讯云 COS"',
      'requiredConfigKeys: ["host", "port", "secure", "fromAddress"]',
      'requiredConfigKeys: ["regionId", "signName", "templateCode"]',
      'requiredConfigKeys: ["rootPath", "publicBaseUrl", "basePrefix", "maxUploadBytes"]',
      'requiredConfigKeys: ["region", "endpoint", "bucket", "basePrefix", "publicBaseUrl"]',
      'requiredConfigKeys: ["region", "bucket", "basePrefix", "publicBaseUrl"]',
      'requiredConfigKeys: ["mode", "appId", "mchId", "notifyUrl", "returnUrl"]',
      'requiredConfigKeys: ["mode", "appId", "notifyUrl", "returnUrl"]',
      "按服务类型管理地图与地理、天气数据、智能解读、支付收款、邮箱短信和对象存储配置。",
      'group: "billing"',
      'group: "storage"',
    ]) {
      expect(source).toContain(snippet);
    }
  });

  it("supports provider search by name, provider code, capability, and purpose", () => {
    for (const snippet of [
      "providerMatchesSearch",
      "providerName(provider)",
      "provider.displayName",
      "provider.providerCode",
      "provider.providerType",
      "meta?.purpose",
      'meta?.capabilities.join(" ")',
      "支持中文名称、provider code、能力和用途",
      "例如 微信支付、wechat_pay、阿里云 OSS",
      "aliyun_oss",
      "group?.title",
      "setSelectedProviderId(null)",
    ]) {
      expect(source).toContain(snippet);
    }
  });

  it("structures the selected provider detail into the required sections", () => {
    for (const label of [
      "顶部概览",
      "基础开关",
      "常用配置",
      "密钥配置",
      "展开高级配置",
      "保存配置",
      "测试连接",
    ]) {
      expect(source).toContain(label);
    }
  });

  it("exposes object storage and payment field labels through the imported provider presets", () => {
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
      "商户私钥 PEM",
      "API v3 密钥",
      "平台公钥 PEM",
      "应用私钥 PEM",
      "支付宝公钥 PEM",
      "支付宝网关",
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
      'mode: "native"',
      'apiBaseUrl: "https://api.mch.weixin.qq.com"',
      'mode: "page"',
      'gatewayUrl: "https://openapi.alipay.com/gateway.do"',
      'signType: "RSA2"',
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

  it("does not add filler or stale limited provider copy", () => {
    for (const forbidden of [
      "占位",
      "敬请期待",
      "coming soon",
      "暂无功能",
      "min-h-[",
      "min-h-96",
      "h-[520px]",
    ]) {
      expect(source).not.toContain(forbidden);
      expect(providerPageSource).not.toContain(forbidden);
    }

    expect(providerPageSource).toContain(
      "按服务类型管理地图与地理、天气数据、智能解读、支付收款、邮箱短信和对象存储配置。",
    );
    expect(providerPageSource).not.toContain(
      "统一管理地图、天气数据源、智能解读、邮箱和短信验证码服务。",
    );
  });
});
