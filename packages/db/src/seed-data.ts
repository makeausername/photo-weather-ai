import { cloneJsonValue } from "./json.js";
import type {
  JsonValue,
  LocationSource,
  LocationType,
  ProviderType,
  SettingValueType,
} from "./types.js";

export type RoleSeed = {
  readonly code: string;
  readonly name: string;
  readonly description: string;
};

export type PermissionSeed = {
  readonly code: string;
  readonly name: string;
  readonly description: string;
};

export type RolePermissionSeed = {
  readonly roleCode: string;
  readonly permissionCode: string;
};

export type SystemSettingSeed = {
  readonly key: string;
  readonly valueJson: JsonValue;
  readonly valueType: SettingValueType;
  readonly group: string;
  readonly label: string;
  readonly description: string;
  readonly isPublic: boolean;
  readonly isSecret: boolean;
  readonly isEditable: boolean;
};

export type ProviderConfigSeed = {
  readonly providerType: ProviderType;
  readonly providerCode: string;
  readonly displayName: string;
  readonly enabled: boolean;
  readonly priority: number;
  readonly configJson: JsonValue;
  readonly secretJson: JsonValue;
  readonly maskedSecretJson: JsonValue;
};

export type BillingProductSeed = {
  readonly code: string;
  readonly name: string;
  readonly description: string | null;
  readonly amountCents: number;
  readonly currency: "CNY";
  readonly credits: number;
  readonly durationDays: number | null;
  readonly enabled: boolean;
  readonly sortOrder: number;
  readonly metadataJson: JsonValue;
};

export type LocationSeed = {
  readonly name: string;
  readonly slug: string;
  readonly province: string;
  readonly city: string;
  readonly district: string | null;
  readonly address: string | null;
  readonly latitudeGcj02: number;
  readonly longitudeGcj02: number;
  readonly latitudeWgs84: number;
  readonly longitudeWgs84: number;
  readonly elevation: number | null;
  readonly locationType: LocationType;
  readonly source: LocationSource;
  readonly isVerified: boolean;
};

export type DatabaseSeedData = {
  readonly roles: readonly RoleSeed[];
  readonly permissions: readonly PermissionSeed[];
  readonly rolePermissions: readonly RolePermissionSeed[];
  readonly systemSettings: readonly SystemSettingSeed[];
  readonly providerConfigs: readonly ProviderConfigSeed[];
  readonly billingProducts: readonly BillingProductSeed[];
  readonly locations: readonly LocationSeed[];
};

const roles = [
  {
    code: "super_admin",
    name: "超级管理员",
    description: "自托管系统的完整管理权限。",
  },
  {
    code: "admin",
    name: "管理员",
    description: "日常运营管理权限。",
  },
  {
    code: "user",
    name: "用户",
    description: "默认前台用户角色。",
  },
] as const satisfies readonly RoleSeed[];

const permissions = [
  {
    code: "admin.manage",
    name: "访问管理后台",
    description: "进入后台控制台和运营管理流程。",
  },
  {
    code: "settings.manage",
    name: "管理系统设置",
    description: "查看并更新允许编辑的系统设置。",
  },
  {
    code: "providers.manage",
    name: "管理服务商配置",
    description: "查看并更新第三方服务商配置。",
  },
  {
    code: "users.manage",
    name: "管理用户",
    description: "查看并更新用户状态和角色分配。",
  },
  {
    code: "audit.read",
    name: "查看审计日志",
    description: "查看已脱敏的后台操作审计日志。",
  },
  {
    code: "usage.read",
    name: "查看用量日志",
    description: "查看服务商调用和成本统计。",
  },
] as const satisfies readonly PermissionSeed[];

const rolePermissions = [
  ...permissions.map((permission) => ({
    roleCode: "super_admin",
    permissionCode: permission.code,
  })),
  ...permissions.map((permission) => ({
    roleCode: "admin",
    permissionCode: permission.code,
  })),
] satisfies readonly RolePermissionSeed[];

const systemSettings = [
  {
    key: "site.name",
    valueJson: "逐光天气",
    valueType: "string",
    group: "site",
    label: "站点名称",
    description: "前台和后台显示的产品名称。",
    isPublic: true,
    isSecret: false,
    isEditable: true,
  },
  {
    key: "site.baseUrl",
    valueJson: "",
    valueType: "url",
    group: "site",
    label: "站点访问地址",
    description: "部署后用于生成链接和回调地址的公开 URL。",
    isPublic: true,
    isSecret: false,
    isEditable: true,
  },
  {
    key: "locale.defaultLanguage",
    valueJson: "zh-CN",
    valueType: "select",
    group: "locale",
    label: "默认语言",
    description: "产品默认使用简体中文。",
    isPublic: true,
    isSecret: false,
    isEditable: true,
  },
  {
    key: "locale.defaultTimezone",
    valueJson: "Asia/Shanghai",
    valueType: "select",
    group: "locale",
    label: "默认时区",
    description: "日期时间默认按北京时间显示。",
    isPublic: true,
    isSecret: false,
    isEditable: true,
  },
  {
    key: "billing.defaultCurrency",
    valueJson: "CNY",
    valueType: "select",
    group: "billing",
    label: "默认币种",
    description: "未来交易和价格默认使用人民币。",
    isPublic: false,
    isSecret: false,
    isEditable: true,
  },
  {
    key: "map.defaultProvider",
    valueJson: "amap",
    valueType: "select",
    group: "map",
    label: "默认地图服务商",
    description: "中国大陆默认使用高德地图。",
    isPublic: false,
    isSecret: false,
    isEditable: true,
  },
  {
    key: "map.displayCoordinateSystem",
    valueJson: "gcj02",
    valueType: "select",
    group: "map",
    label: "地图显示坐标系",
    description: "地图展示使用 GCJ-02，天气、天文和地形计算使用 WGS84。",
    isPublic: false,
    isSecret: false,
    isEditable: false,
  },
  {
    key: "weather.primaryProvider",
    valueJson: "qweather",
    valueType: "select",
    group: "weather",
    label: "主天气服务商",
    description: "未来预报流程使用的主天气服务商代码。",
    isPublic: false,
    isSecret: false,
    isEditable: true,
  },
  {
    key: "weather.secondaryProvider",
    valueJson: "open_meteo",
    valueType: "select",
    group: "weather",
    label: "备用天气服务商",
    description: "未来预报流程使用的备用天气服务商代码。",
    isPublic: false,
    isSecret: false,
    isEditable: true,
  },
  {
    key: "scoring.defaultVersion",
    valueJson: "v1",
    valueType: "string",
    group: "scoring",
    label: "默认评分版本",
    description: "未来天气评分任务使用的评分规则版本。",
    isPublic: false,
    isSecret: false,
    isEditable: true,
  },
  {
    key: "storage.provider",
    valueJson: "local_storage",
    valueType: "select",
    group: "storage",
    label: "存储服务商",
    description: "未来生成素材和报告使用的默认存储后端。",
    isPublic: false,
    isSecret: false,
    isEditable: true,
  },
  {
    key: "billing.enabled",
    valueJson: false,
    valueType: "boolean",
    group: "billing",
    label: "启用支付",
    description: "预留给未来支付系统的总开关。",
    isPublic: false,
    isSecret: false,
    isEditable: true,
  },
  {
    key: "deployment.mode",
    valueJson: "self_hosted",
    valueType: "select",
    group: "deployment",
    label: "部署模式",
    description: "用于未来安装器和后台诊断的部署档案。",
    isPublic: false,
    isSecret: false,
    isEditable: true,
  },
] as const satisfies readonly SystemSettingSeed[];

const providerConfigs = [
  {
    providerType: "weather",
    providerCode: "qweather",
    displayName: "和风天气",
    enabled: false,
    priority: 100,
    configJson: {
      realCallEnabled: false,
      apiHost: "",
      timeoutMs: 10000,
      retryCount: 1,
      language: "zh",
      unit: "m",
    },
    secretJson: {},
    maskedSecretJson: {},
  },
  {
    providerType: "weather",
    providerCode: "open_meteo",
    displayName: "Open-Meteo",
    enabled: false,
    priority: 200,
    configJson: {
      realCallEnabled: false,
      mode: "free",
      baseUrl: "https://api.open-meteo.com/v1",
      customerEndpoint: "https://customer-api.open-meteo.com",
      defaultModel: "forecast",
      iconModel: "icon_global",
      timezone: "Asia/Shanghai",
      timeoutMs: 10000,
      retryCount: 1,
    },
    secretJson: {},
    maskedSecretJson: {},
  },
  {
    providerType: "weather",
    providerCode: "meteoblue",
    displayName: "meteoblue",
    enabled: false,
    priority: 60,
    configJson: {
      realCallEnabled: false,
      baseUrl: "https://my.meteoblue.com",
      packages: "basic-1h,clouds-1h",
      packageName: "basic-1h,clouds-1h",
      timeoutMs: 10000,
      retryCount: 1,
    },
    secretJson: {},
    maskedSecretJson: {},
  },
  {
    providerType: "geo",
    providerCode: "amap",
    displayName: "高德地图",
    enabled: false,
    priority: 100,
    configJson: {
      realCallEnabled: false,
      baseUrl: "https://restapi.amap.com",
      timeoutMs: 10000,
      retryCount: 1,
    },
    secretJson: {},
    maskedSecretJson: {},
  },
  {
    providerType: "billing",
    providerCode: "wechat_pay",
    displayName: "微信支付",
    enabled: false,
    priority: 100,
    configJson: {
      realCallEnabled: false,
      mode: "native",
      appId: "",
      mchId: "",
      notifyUrl: "",
      returnUrl: "",
      apiBaseUrl: "https://api.mch.weixin.qq.com",
      timeoutMs: 10000,
    },
    secretJson: {
      merchantSerialNo: "",
      merchantPrivateKeyPem: "",
      apiV3Key: "",
      platformCertificatePem: "",
      platformPublicKeyPem: "",
    },
    maskedSecretJson: {
      merchantSerialNo: "",
      merchantPrivateKeyPem: "",
      apiV3Key: "",
      platformCertificatePem: "",
      platformPublicKeyPem: "",
    },
  },
  {
    providerType: "billing",
    providerCode: "alipay",
    displayName: "支付宝",
    enabled: false,
    priority: 110,
    configJson: {
      realCallEnabled: false,
      mode: "page",
      appId: "",
      notifyUrl: "",
      returnUrl: "",
      gatewayUrl: "https://openapi.alipay.com/gateway.do",
      charset: "GBK",
      signType: "RSA2",
      timeoutMs: 10000,
    },
    secretJson: {
      appPrivateKeyPem: "",
      alipayPublicKeyPem: "",
    },
    maskedSecretJson: {
      appPrivateKeyPem: "",
      alipayPublicKeyPem: "",
    },
  },
  {
    providerType: "email",
    providerCode: "aliyun_smtp",
    displayName: "阿里云企业邮箱 SMTP",
    enabled: false,
    priority: 100,
    configJson: {
      realCallEnabled: false,
      host: "",
      port: 465,
      secure: true,
      fromName: "逐光天气",
      fromAddress: "",
      timeoutMs: 10000,
    },
    secretJson: {
      username: "",
      password: "",
    },
    maskedSecretJson: {
      username: "",
      password: "",
    },
  },
  {
    providerType: "sms",
    providerCode: "aliyun_sms",
    displayName: "阿里云短信",
    enabled: false,
    priority: 100,
    configJson: {
      realCallEnabled: false,
      regionId: "cn-hangzhou",
      endpoint: "",
      signName: "",
      templateCode: "",
      timeoutMs: 10000,
    },
    secretJson: {
      accessKeyId: "",
      accessKeySecret: "",
    },
    maskedSecretJson: {
      accessKeyId: "",
      accessKeySecret: "",
    },
  },
  {
    providerType: "captcha",
    providerCode: "tencent_captcha",
    displayName: "腾讯云验证码",
    enabled: false,
    priority: 100,
    configJson: {
      realCallEnabled: false,
      captchaAppId: "",
      captchaType: 9,
      endpoint: "https://captcha.tencentcloudapi.com",
      sdkUrl: "https://turing.captcha.qcloud.com/TCaptcha.js",
      region: "ap-guangzhou",
      timeoutMs: 10000,
      retryCount: 1,
      enforceOnLogin: false,
      enforceOnRegisterSendCode: true,
      enforceOnRegisterConfirm: false,
      enforceOnAccountBinding: true,
      failOpenInDevelopment: true,
      failOpenInProduction: false,
    },
    secretJson: {
      secretId: "",
      secretKey: "",
      appSecretKey: "",
    },
    maskedSecretJson: {
      secretId: "",
      secretKey: "",
      appSecretKey: "",
    },
  },
  {
    providerType: "storage",
    providerCode: "local_storage",
    displayName: "本地存储",
    enabled: true,
    priority: 100,
    configJson: {
      rootPath: "data/uploads",
      publicBaseUrl: "",
      basePrefix: "uploads",
      maxUploadBytes: 10485760,
    },
    secretJson: {},
    maskedSecretJson: {},
  },
  {
    providerType: "storage",
    providerCode: "aliyun_oss",
    displayName: "阿里云 OSS",
    enabled: false,
    priority: 200,
    configJson: {
      realCallEnabled: false,
      region: "",
      endpoint: "",
      bucket: "",
      basePrefix: "uploads",
      publicBaseUrl: "",
      forcePathStyle: false,
      timeoutMs: 10000,
      maxUploadBytes: 10485760,
    },
    secretJson: {
      accessKeyId: "",
      accessKeySecret: "",
    },
    maskedSecretJson: {
      accessKeyId: "",
      accessKeySecret: "",
    },
  },
  {
    providerType: "storage",
    providerCode: "tencent_cos",
    displayName: "腾讯云 COS",
    enabled: false,
    priority: 300,
    configJson: {
      realCallEnabled: false,
      region: "",
      bucket: "",
      basePrefix: "uploads",
      publicBaseUrl: "",
      timeoutMs: 10000,
      maxUploadBytes: 10485760,
    },
    secretJson: {
      secretId: "",
      secretKey: "",
    },
    maskedSecretJson: {
      secretId: "",
      secretKey: "",
    },
  },
  {
    providerType: "storage",
    providerCode: "s3_compatible",
    displayName: "S3 兼容存储",
    enabled: false,
    priority: 400,
    configJson: {},
    secretJson: {},
    maskedSecretJson: {},
  },
  {
    providerType: "cdn",
    providerCode: "aliyun_cdn",
    displayName: "阿里云 CDN",
    enabled: false,
    priority: 100,
    configJson: {
      realCallEnabled: false,
      endpoint: "https://cdn.aliyuncs.com",
      domains: [],
      defaultRefreshType: "file",
      timeoutMs: 10000,
      retryCount: 1,
      rateLimitPerMinute: 60,
      dryRun: true,
    },
    secretJson: {
      accessKeyId: "",
      accessKeySecret: "",
    },
    maskedSecretJson: {
      accessKeyId: "",
      accessKeySecret: "",
    },
  },
  {
    providerType: "cdn",
    providerCode: "tencent_cdn",
    displayName: "腾讯云 CDN",
    enabled: false,
    priority: 200,
    configJson: {
      realCallEnabled: false,
      endpoint: "https://cdn.tencentcloudapi.com",
      region: "",
      domains: [],
      defaultPurgeType: "url",
      timeoutMs: 10000,
      retryCount: 1,
      rateLimitPerMinute: 60,
      dryRun: true,
    },
    secretJson: {
      secretId: "",
      secretKey: "",
    },
    maskedSecretJson: {
      secretId: "",
      secretKey: "",
    },
  },
] as const satisfies readonly ProviderConfigSeed[];

const billingProducts = [
  {
    code: "trial_7_days",
    name: "注册赠送 7 天",
    description: "新注册账户自动发放的 7 天完整摄影天气权限，不作为公开售卖套餐。",
    amountCents: 0,
    currency: "CNY",
    credits: 0,
    durationDays: 7,
    enabled: true,
    sortOrder: 10,
    metadataJson: {
      internal: true,
      public: false,
      publicVisible: false,
      publicPurchasable: false,
      grantType: "full_forecast_access",
      source: "registration_trial",
      featureBullets: ["注册后自动发放", "7 天完整摄影判断", "不可公开购买"],
    },
  },
  {
    code: "monthly_full",
    name: "月卡",
    description: "开通后 30 天内查看完整摄影判断、专业时序表和历史报告。",
    amountCents: 1900,
    currency: "CNY",
    credits: 0,
    durationDays: 30,
    enabled: true,
    sortOrder: 20,
    metadataJson: {
      public: true,
      publicVisible: true,
      publicPurchasable: true,
      grantType: "full_forecast_access",
      plan: "monthly",
      featureBullets: [
        "未来多日完整摄影判断",
        "云海 / 朝霞晚霞 / 星空银河",
        "专业逐小时表格",
        "会员期内完整历史报告",
        "适合短期出行和临时追光",
      ],
    },
  },
  {
    code: "quarterly_full",
    name: "季卡",
    description: "开通后 90 天内查看完整摄影判断、专业时序表和历史报告。",
    amountCents: 4900,
    currency: "CNY",
    credits: 0,
    durationDays: 90,
    enabled: true,
    sortOrder: 30,
    metadataJson: {
      public: true,
      publicVisible: true,
      publicPurchasable: true,
      grantType: "full_forecast_access",
      plan: "quarterly",
      recommended: true,
      badgeText: "推荐",
      featureBullets: [
        "未来多日完整摄影判断",
        "云海 / 朝霞晚霞 / 星空银河",
        "专业逐小时表格",
        "会员期内完整历史报告",
        "适合连续旅行和多地踩点",
        "续费后有效期自动顺延",
      ],
    },
  },
  {
    code: "yearly_full",
    name: "年卡",
    description: "开通后 365 天内查看完整摄影判断、专业时序表和历史报告。",
    amountCents: 16800,
    currency: "CNY",
    credits: 0,
    durationDays: 365,
    enabled: true,
    sortOrder: 40,
    metadataJson: {
      public: true,
      publicVisible: true,
      publicPurchasable: true,
      grantType: "full_forecast_access",
      plan: "yearly",
      badgeText: "最划算",
      featureBullets: [
        "全年完整摄影判断",
        "云海 / 朝霞晚霞 / 星空银河",
        "专业逐小时表格",
        "全年完整历史报告",
        "适合长期风光摄影规划",
        "续费后有效期自动顺延",
      ],
    },
  },
  {
    code: "forecast_credit_20",
    name: "20 次专业预测包",
    description: "适合短期旅行和拍摄计划使用，支付成功后发放预测次数。",
    amountCents: 990,
    currency: "CNY",
    credits: 20,
    durationDays: null,
    enabled: true,
    sortOrder: 100,
    metadataJson: {
      badge: "入门",
      entitlementType: "forecast_credit",
      publicVisible: false,
      publicPurchasable: false,
    },
  },
  {
    code: "forecast_credit_100",
    name: "100 次专业预测包",
    description: "适合高频查询、踩点和团队拍摄前的批量判断。",
    amountCents: 3990,
    currency: "CNY",
    credits: 100,
    durationDays: null,
    enabled: true,
    sortOrder: 200,
    metadataJson: {
      badge: "常用",
      entitlementType: "forecast_credit",
      publicVisible: false,
      publicPurchasable: false,
    },
  },
] as const satisfies readonly BillingProductSeed[];

const locations: readonly LocationSeed[] = [];

export function buildSeedData(): DatabaseSeedData {
  return {
    roles: roles.map((role) => ({ ...role })),
    permissions: permissions.map((permission) => ({ ...permission })),
    rolePermissions: rolePermissions.map((rolePermission) => ({ ...rolePermission })),
    systemSettings: systemSettings.map((setting) => ({
      ...setting,
      valueJson: cloneJsonValue(setting.valueJson),
    })),
    providerConfigs: providerConfigs.map((providerConfig) => ({
      ...providerConfig,
      configJson: cloneJsonValue(providerConfig.configJson),
      secretJson: cloneJsonValue(providerConfig.secretJson),
      maskedSecretJson: cloneJsonValue(providerConfig.maskedSecretJson),
    })),
    billingProducts: billingProducts.map((product) => ({
      ...product,
      metadataJson: cloneJsonValue(product.metadataJson),
    })),
    locations: locations.map((location) => ({ ...location })),
  };
}
