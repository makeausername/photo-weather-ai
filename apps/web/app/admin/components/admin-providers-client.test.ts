import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { getProviderModuleLayout } from "./admin-providers-client";

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(__dirname, "admin-providers-client.tsx"), "utf8");
const adminShellSource = readFileSync(resolve(__dirname, "admin-shell.tsx"), "utf8");
const providerFieldsSource = readFileSync(
  resolve(__dirname, "../../../../../packages/shared/src/provider-fields.ts"),
  "utf8",
);
const providersRouteDir = resolve(__dirname, "../providers");
const providerIndexPageSource = readFileSync(resolve(providersRouteDir, "page.tsx"), "utf8");

function readProviderPage(moduleName: string): string {
  return readFileSync(resolve(providersRouteDir, moduleName, "page.tsx"), "utf8");
}

function sourceBetween(haystack: string, start: string, end: string): string {
  const startIndex = haystack.indexOf(start);
  const endIndex = haystack.indexOf(end, startIndex + start.length);

  expect(startIndex).toBeGreaterThanOrEqual(0);
  expect(endIndex).toBeGreaterThan(startIndex);

  return haystack.slice(startIndex, endIndex);
}

const providerPageSources = [
  providerIndexPageSource,
  readProviderPage("geo"),
  readProviderPage("weather"),
  readProviderPage("ai"),
  readProviderPage("billing"),
  readProviderPage("notification"),
  readProviderPage("captcha"),
  readProviderPage("storage"),
  readProviderPage("cdn"),
].join("\n");
const providerListRowSource = sourceBetween(
  source,
  "function renderProviderListRow",
  "function renderProviderDetail",
);
const providerDetailSource = sourceBetween(
  source,
  "function renderProviderDetail",
  "if (providers.length === 0",
);

describe("admin provider module source", () => {
  it("classifies provider layouts by item count", () => {
    expect(getProviderModuleLayout(0)).toBe("empty");
    expect(getProviderModuleLayout(1)).toBe("single-detail");
    expect(getProviderModuleLayout(2)).toBe("top");
    expect(getProviderModuleLayout(3)).toBe("top");
    expect(getProviderModuleLayout(4)).toBe("side");
  });

  it("promotes provider categories into the AdminShell sidebar", () => {
    for (const snippet of [
      '{ href: "/admin", label: "控制台" }',
      '{ href: "/admin/users", label: "用户管理" }',
      '{ href: "/admin/orders", label: "订单管理" }',
      '{ href: "/admin/products", label: "套餐定价" }',
      '{ href: "/admin/settings", label: "系统设置" }',
      '{ href: "/admin/providers/geo", label: "地图服务" }',
      '{ href: "/admin/providers/weather", label: "天气数据" }',
      '{ href: "/admin/providers/ai", label: "智能解读" }',
      '{ href: "/admin/providers/billing", label: "支付收款" }',
      '{ href: "/admin/providers/notification", label: "邮箱短信" }',
      '{ href: "/admin/providers/captcha", label: "人机验证" }',
      '{ href: "/admin/providers/storage", label: "对象存储" }',
      '{ href: "/admin/providers/cdn", label: "CDN加速" }',
      '{ href: "/admin/calibration", label: "历史校准" }',
      '{ href: "/admin/audit", label: "审计日志" }',
    ]) {
      expect(adminShellSource).toContain(snippet);
    }

    expect(adminShellSource).toContain('label: "总览"');
    expect(adminShellSource).toContain('label: "运营"');
    expect(adminShellSource).toContain('label: "配置"');
    expect(adminShellSource).toContain('label: "运维"');
    expect(adminShellSource).not.toContain('{ href: "/admin/providers", label: "服务商配置" }');
  });

  it("keeps the AdminShell sidebar wide enough for first-class module labels", () => {
    expect(adminShellSource).toContain("lg:grid-cols-[260px_minmax(0,1fr)]");
    expect(adminShellSource).toContain("xl:grid-cols-[272px_minmax(0,1fr)]");
    expect(adminShellSource).toContain("lg:w-full lg:min-w-0 lg:whitespace-normal");
    expect(adminShellSource).not.toContain("lg:grid-cols-[228px_minmax(0,1fr)]");
    expect(adminShellSource).not.toContain("truncate");
  });

  it("redirects the retired provider mega page to the weather module", () => {
    expect(providerIndexPageSource).toContain('redirect("/admin/providers/weather")');
    expect(providerIndexPageSource).not.toContain("AdminProvidersClient");
    expect(providerIndexPageSource).not.toContain("服务商配置");
  });

  it("defines dedicated provider module pages with the required titles and module keys", () => {
    const modulePages = [
      {
        route: "geo",
        title: 'title="地图服务"',
        description: "管理高德地图的地点搜索、地理编码和坐标转换配置。",
        providerType: 'providerType="geo"',
      },
      {
        route: "weather",
        title: 'title="天气数据"',
        description: "管理和风天气、Open-Meteo、meteoblue 等天气数据源、逐小时预报和云层分层配置。",
        providerType: 'providerType="weather"',
      },
      {
        route: "ai",
        title: 'title="智能解读"',
        description:
          "管理 GPT / OpenAI 智能解读配置。AI 只负责说明和文案生成，不参与确定性天气、天文和地形计算。",
        providerType: 'providerType="ai"',
      },
      {
        route: "billing",
        title: 'title="支付收款"',
        description: "管理微信支付、支付宝、订单回调、证书、密钥和验签配置。",
        providerType: 'providerType="billing"',
      },
      {
        route: "notification",
        title: 'title="邮箱短信"',
        description: "管理邮箱验证码和短信验证码服务配置。",
        providerType: 'providerType="notification"',
      },
      {
        route: "captcha",
        title: 'title="人机验证"',
        description: "管理腾讯云验证码，用于登录、注册发送验证码和账号绑定前的人机校验。",
        providerType: 'providerType="captcha"',
      },
      {
        route: "storage",
        title: 'title="对象存储"',
        description: "管理本地存储、阿里云 OSS、腾讯云 COS 等报告与文件存储配置。",
        providerType: 'providerType="storage"',
      },
      {
        route: "cdn",
        title: 'title="CDN加速"',
        description: "管理阿里云 CDN、腾讯云 CDN 的缓存刷新、预热、域名和密钥配置。",
        providerType: 'providerType="cdn"',
      },
    ];

    for (const page of modulePages) {
      const pageSource = readProviderPage(page.route);
      expect(pageSource).toContain(page.title);
      expect(pageSource).toContain(page.description);
      expect(pageSource).toContain(page.providerType);
      expect(pageSource).toContain("AdminShell");
      expect(pageSource).toContain("AdminProvidersClient");
    }

    expect(existsSync(resolve(providersRouteDir, "[providerType]", "page.tsx"))).toBe(false);
  });

  it("loads only the backend provider types for the active sidebar module", () => {
    for (const snippet of [
      "readonly providerType: ProviderGroupKey",
      'key: "geo"',
      'apiProviderTypes: ["geo"]',
      'key: "weather"',
      'apiProviderTypes: ["weather"]',
      'key: "ai"',
      'apiProviderTypes: ["ai"]',
      'key: "billing"',
      'apiProviderTypes: ["billing"]',
      'key: "notification"',
      'apiProviderTypes: ["email", "sms"]',
      'key: "captcha"',
      'apiProviderTypes: ["captcha"]',
      'key: "storage"',
      'apiProviderTypes: ["storage"]',
      'key: "cdn"',
      'apiProviderTypes: ["cdn"]',
      "Promise.all(",
      "`/admin/providers?providerType=${encodeURIComponent(apiProviderType)}`",
      ").filter((provider) => getMeta(provider)?.group === moduleDefinition.key)",
      "data-provider-module={moduleDefinition.key}",
      "data-provider-list-group={moduleDefinition.key}",
    ]) {
      expect(source).toContain(snippet);
    }
  });

  it("keeps the exact provider ownership for each module", () => {
    for (const snippet of [
      '"geo:amap"',
      'group: "geo"',
      'displayName: "高德地图"',
      '"weather:qweather"',
      '"weather:open_meteo"',
      '"weather:meteoblue"',
      'group: "weather"',
      'displayName: "和风天气"',
      'displayName: "Open-Meteo"',
      'displayName: "meteoblue"',
      '"ai:openai"',
      'group: "ai"',
      'displayName: "GPT / OpenAI"',
      '"billing:wechat_pay"',
      '"billing:alipay"',
      'group: "billing"',
      'displayName: "微信支付"',
      'displayName: "支付宝"',
      '"email:aliyun_smtp"',
      '"sms:aliyun_sms"',
      'group: "notification"',
      'displayName: "阿里云企业邮箱 SMTP"',
      'displayName: "阿里云短信"',
      '"captcha:tencent_captcha"',
      'group: "captcha"',
      'displayName: "腾讯云验证码"',
      '"storage:local_storage"',
      '"storage:aliyun_oss"',
      '"storage:tencent_cos"',
      'group: "storage"',
      'displayName: "本地存储"',
      'displayName: "阿里云 OSS"',
      'displayName: "腾讯云 COS"',
      '"cdn:aliyun_cdn"',
      '"cdn:tencent_cdn"',
      'group: "cdn"',
      'displayName: "阿里云 CDN"',
      'displayName: "腾讯云 CDN"',
    ]) {
      expect(source).toContain(snippet);
    }
  });

  it("removes internal provider category cards, search, and the all-provider list", () => {
    for (const forbidden of [
      "data-provider-category-nav",
      "data-provider-category={group.key}",
      "selectGroup(",
      "categorySessionStorageKey",
      "providerSearchTerm",
      "providerMatchesSearch",
      "搜索服务商",
      "服务商分类",
      "地图与地理",
      "匹配服务商",
      "lg:grid-cols-[280px_minmax(0,1fr)]",
      "flex min-w-[190px] items-center gap-2 rounded-md",
      "data-provider-console-grid",
    ]) {
      expect(source).not.toContain(forbidden);
    }

    expect(source).toContain(
      "visibleProviders.map((provider, index) =>\n                    renderProviderListRow(provider, index),\n                  )",
    );
    expect(source).not.toContain("providers.map((provider) => renderProviderListRow(provider))");
  });

  it("uses compact module summaries and one selected provider detail panel", () => {
    for (const snippet of [
      "模块服务商",
      "已启用",
      "真实调用",
      "需要处理",
      "StatusFacts",
      "ProviderTestDetails",
      "有未保存修改",
      "展开高级配置",
      "ProviderCardErrorBoundary",
      "该服务商配置暂时无法显示，请刷新或检查配置。",
      "data-provider-list",
      "data-provider-summary",
      "data-provider-detail-panel",
      "data-provider-detail",
      "detailProvider ? renderProviderDetail(detailProvider) : null",
      "visibleProviders.find((provider) => provider.enabled) ??",
      "visibleProviders[0] ??",
    ]) {
      expect(source).toContain(snippet);
    }

    expect(source).not.toContain("providers.map((provider) => renderProviderDetail");
    expect(source).not.toContain("visibleProviders.map((provider) => renderProviderDetail");
    expect(source).not.toContain("renderProviderSummaryCard");
  });

  it("uses adaptive readable provider lists without hard truncating display names", () => {
    for (const snippet of [
      "const providerModuleLayout = getProviderModuleLayout(visibleProviders.length)",
      'const useSideProviderList = providerModuleLayout === "side"',
      "data-provider-layout={providerModuleLayout}",
      'providerModuleLayout === "single-detail"',
      "data-provider-single-detail",
      "xl:grid-cols-[minmax(420px,500px)_minmax(0,1fr)]",
      'data-provider-list-layout={useSideProviderList ? "side" : "top"}',
      "getAdaptiveGridClassName(visibleProviders.length",
      "getAdaptiveGridItemClassName(visibleProviders.length, index",
      "选择一个服务商后，在下方维护完整配置和连接测试。",
      "break-words text-sm font-bold leading-5 text-card-foreground",
      "break-words text-xs leading-5 text-muted-foreground",
      "providerTypeLabel(provider.providerType)",
    ]) {
      expect(source).toContain(snippet);
    }

    expect(source).not.toContain("xl:grid-cols-[minmax(320px,420px)_minmax(0,1fr)]");
    expect(source).not.toContain('visibleProviders.length === 1 && "md:grid-cols-1"');
    expect(providerListRowSource).not.toContain("truncate");
    expect(providerListRowSource).not.toContain("{provider.providerCode}");
    expect(providerDetailSource).not.toContain("{provider.providerCode}");
  });

  it("preserves selected-provider save, test, enable, real-call, secret, and detail actions", () => {
    for (const snippet of [
      "saveProvider(provider)",
      "testProvider(provider)",
      "createProviderConnectionTestRequestInit()",
      "启用该服务商",
      'getFieldByKey(provider, "realCallEnabled")',
      "requiredConfigFields.map((field, index) =>",
      "renderConfigField(provider, field)",
      "secretFields.map((field) =>",
      "maskedSecretLabel(provider, field.key)",
      "toggleSecretVisibility(provider.id, field.key)",
      "toggleClearSecret(provider.id, field.key)",
      "AdvancedConfigContent",
      "dirtyProviders",
      "providerSaveButtonLabel",
      "providerTestButtonLabel",
      "ProviderTestDetails",
    ]) {
      expect(source).toContain(snippet);
    }
  });

  it("keeps provider fields and secrets safe", () => {
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
      "CDN 加速域名",
      "默认刷新类型",
      "每分钟操作限额",
      "CaptchaAppId",
      "CaptchaType",
      "前端 SDK 地址",
      "AppSecretKey",
    ]) {
      expect(providerFieldsSource).toContain(label);
    }

    expect(source).toContain("maskedSecretJson");
    expect(source).toContain("secretFieldDrafts");
    expect(source).not.toContain("provider.secretJson");
  });

  it("keeps Aliyun SMS endpoint optional and shows the default hint", () => {
    const smsMetaSource = sourceBetween(
      source,
      '"sms:aliyun_sms": {',
      '"captcha:tencent_captcha": {',
    );
    const smsFieldPresetSource = sourceBetween(
      providerFieldsSource,
      'providerCode: "aliyun_sms"',
      'providerCode: "tencent_captcha"',
    );

    expect(smsMetaSource).toContain('requiredConfigKeys: ["regionId", "signName", "templateCode"]');
    expect(smsMetaSource).not.toContain('"endpoint"');
    expect(smsFieldPresetSource).toContain(
      'placeholder: "留空则使用默认值：https://dysmsapi.aliyuncs.com"',
    );
    expect(smsFieldPresetSource).toContain(
      'helpText: "正常管理员无需填写；留空时系统会使用默认阿里云短信地址。"',
    );
  });

  it("keeps Aliyun SMS AccessKey Secret masked in the provider page", () => {
    const smsFieldPresetSource = sourceBetween(
      providerFieldsSource,
      'providerCode: "aliyun_sms"',
      'providerCode: "tencent_captcha"',
    );

    expect(smsFieldPresetSource).toContain('key: "accessKeySecret"');
    expect(smsFieldPresetSource).toContain('target: "secretJson"');
    expect(smsFieldPresetSource).toContain("password: true");
    expect(providerDetailSource).toContain("maskedSecretLabel(provider, field.key)");
    expect(source).not.toContain("provider.secretJson");
  });

  it("renders CDN operations only inside the CDN module", () => {
    for (const snippet of [
      'moduleDefinition.key === "cdn"',
      "CdnOperationsPanel",
      "data-cdn-operation-panel",
      "refreshCdnCache",
      "prefetchCdnUrls",
      "缓存刷新与 URL 预热",
      "刷新和预热会消耗 CDN 配额",
      "CDN 操作 URL",
      "providerCode: selectedProviderCode",
    ]) {
      expect(source).toContain(snippet);
    }
  });

  it("adds a separate real SMTP test email panel only for Aliyun SMTP", () => {
    for (const snippet of [
      "isAliyunSmtpProvider(provider) ? renderEmailTestPanel(provider) : null",
      "data-email-send-test-panel",
      'title="发送测试邮件"',
      'description="真实测试会通过当前 SMTP 配置发送邮件。"',
      'label="测试邮箱"',
      "发送测试邮件",
      "/admin/providers/email/aliyun_smtp/send-test",
      "EmailTestResultDetails",
      "result.messageZh",
      "result.toMasked",
      "errorCode",
      "responseCode",
      "command",
      "response",
      "测试邮件已发送，请检查收件箱或垃圾箱。",
    ]) {
      expect(source).toContain(snippet);
    }

    expect(source).toContain(
      "`/admin/providers/${provider.providerType}/${provider.providerCode}/test-connection`",
    );
    expect(source).toContain('"/admin/providers/ai/openai/test-explanation"');
    expect(source).toContain('aria-label="真实解读测试"');
    expect(source).toContain("真实解读测试");
    expect(source).toContain("parseStrategy");
    expect(source).toContain("compatibilityFallbackUsed");
    expect(source).toContain("disabledResponseFormat");
    expect(source).toContain("emptyContentFallbackUsed");
    expect(source).toContain("finishReason");
    expect(source).toContain("contentLength");
    expect(source).toContain("rawResponseSizeChars");
    expect(source).toContain("upstreamMessageSanitized");
    expect(source).toContain("providerTestButtonLabel(testState)");
    expect(source).toContain('aria-label="测试连接"');
    expect(source).not.toContain("raw JSON");
    expect(source).not.toContain("JSON.stringify(result)");
    expect(source).not.toContain("full prompt");
  });

  it("does not add placeholder or filler layout copy", () => {
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
      expect(providerPageSources).not.toContain(forbidden);
    }
  });
});
