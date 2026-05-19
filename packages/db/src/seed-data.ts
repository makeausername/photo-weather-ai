import { cloneJsonValue } from "./json.js";
import type {
  JsonValue,
  LocationSource,
  LocationType,
  ProviderType,
  SettingValueType,
  ViewDirection,
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

export type PhotoSpotSeed = {
  readonly locationSlug: string;
  readonly name: string;
  readonly slug: string;
  readonly description: string | null;
  readonly latitudeGcj02: number;
  readonly longitudeGcj02: number;
  readonly latitudeWgs84: number;
  readonly longitudeWgs84: number;
  readonly elevation: number | null;
  readonly viewDirection: ViewDirection;
  readonly bestForSunrise: boolean;
  readonly bestForSunset: boolean;
  readonly bestForCloudSea: boolean;
  readonly bestForStars: boolean;
  readonly bestForMilkyWay: boolean;
  readonly bestForSnow: boolean;
  readonly accessNote: string | null;
  readonly trafficNote: string | null;
  readonly safetyNote: string | null;
  readonly riskNote: string | null;
  readonly isHot: boolean;
  readonly isVerified: boolean;
};

export type SpotTagSeed = {
  readonly code: string;
  readonly name: string;
  readonly description: string;
};

export type DatabaseSeedData = {
  readonly roles: readonly RoleSeed[];
  readonly permissions: readonly PermissionSeed[];
  readonly rolePermissions: readonly RolePermissionSeed[];
  readonly systemSettings: readonly SystemSettingSeed[];
  readonly providerConfigs: readonly ProviderConfigSeed[];
  readonly locations: readonly LocationSeed[];
  readonly photoSpots: readonly PhotoSpotSeed[];
  readonly spotTags: readonly SpotTagSeed[];
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
    code: "locations.manage",
    name: "管理地点",
    description: "维护景区、城市和拍摄地点基础资料。",
  },
  {
    code: "photo_spots.manage",
    name: "管理摄影机位",
    description: "维护摄影机位、方向、交通、安全和适拍标签。",
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

const adminPermissionCodes = [
  "admin.manage",
  "locations.manage",
  "photo_spots.manage",
  "audit.read",
] as const;

const rolePermissions = [
  ...permissions.map((permission) => ({
    roleCode: "super_admin",
    permissionCode: permission.code,
  })),
  ...adminPermissionCodes.map((permissionCode) => ({
    roleCode: "admin",
    permissionCode,
  })),
] satisfies readonly RolePermissionSeed[];

const systemSettings = [
  {
    key: "site.name",
    valueJson: "风光天气 AI",
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
    key: "ai.defaultProvider",
    valueJson: "deepseek",
    valueType: "select",
    group: "ai",
    label: "默认 AI 服务商",
    description: "未来解读流程使用的默认 AI 服务商代码。",
    isPublic: false,
    isSecret: false,
    isEditable: true,
  },
  {
    key: "ai.defaultModel",
    valueJson: "deepseek-chat",
    valueType: "string",
    group: "ai",
    label: "默认 AI 模型",
    description: "未来 AI 请求使用的默认模型标识。",
    isPublic: false,
    isSecret: false,
    isEditable: true,
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
    providerType: "ai",
    providerCode: "deepseek",
    displayName: "DeepSeek",
    enabled: false,
    priority: 100,
    configJson: {
      baseUrl: "https://api.deepseek.com",
      defaultModel: "deepseek-chat",
    },
    secretJson: {},
    maskedSecretJson: {},
  },
  {
    providerType: "weather",
    providerCode: "qweather",
    displayName: "QWeather",
    enabled: false,
    priority: 100,
    configJson: {},
    secretJson: {},
    maskedSecretJson: {},
  },
  {
    providerType: "weather",
    providerCode: "open_meteo",
    displayName: "Open-Meteo",
    enabled: false,
    priority: 200,
    configJson: {},
    secretJson: {},
    maskedSecretJson: {},
  },
  {
    providerType: "geo",
    providerCode: "amap",
    displayName: "高德地图",
    enabled: false,
    priority: 100,
    configJson: {},
    secretJson: {},
    maskedSecretJson: {},
  },
  {
    providerType: "storage",
    providerCode: "local_storage",
    displayName: "本地存储",
    enabled: true,
    priority: 100,
    configJson: {
      rootPath: "data/uploads",
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
    configJson: {},
    secretJson: {},
    maskedSecretJson: {},
  },
  {
    providerType: "storage",
    providerCode: "tencent_cos",
    displayName: "腾讯云 COS",
    enabled: false,
    priority: 300,
    configJson: {},
    secretJson: {},
    maskedSecretJson: {},
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
] as const satisfies readonly ProviderConfigSeed[];

const locations = [
  {
    name: "黄山",
    slug: "huangshan",
    province: "安徽省",
    city: "黄山市",
    district: "黄山区",
    address: "安徽省黄山市黄山风景区",
    latitudeGcj02: 30.1351,
    longitudeGcj02: 118.1767,
    latitudeWgs84: 30.1328,
    longitudeWgs84: 118.171,
    elevation: 1864,
    locationType: "scenic_area",
    source: "manual",
    isVerified: false,
  },
  {
    name: "老君山",
    slug: "laojunshan",
    province: "河南省",
    city: "洛阳市",
    district: "栾川县",
    address: "河南省洛阳市栾川县老君山景区",
    latitudeGcj02: 33.7867,
    longitudeGcj02: 111.6462,
    latitudeWgs84: 33.7852,
    longitudeWgs84: 111.6402,
    elevation: 2217,
    locationType: "mountain",
    source: "manual",
    isVerified: false,
  },
  {
    name: "三清山",
    slug: "sanqingshan",
    province: "江西省",
    city: "上饶市",
    district: "玉山县",
    address: "江西省上饶市三清山风景名胜区",
    latitudeGcj02: 28.9164,
    longitudeGcj02: 118.0733,
    latitudeWgs84: 28.9134,
    longitudeWgs84: 118.0681,
    elevation: 1819,
    locationType: "scenic_area",
    source: "manual",
    isVerified: false,
  },
  {
    name: "武功山",
    slug: "wugongshan",
    province: "江西省",
    city: "萍乡市",
    district: "芦溪县",
    address: "江西省萍乡市芦溪县武功山景区",
    latitudeGcj02: 27.4748,
    longitudeGcj02: 114.1859,
    latitudeWgs84: 27.4716,
    longitudeWgs84: 114.1808,
    elevation: 1918,
    locationType: "mountain",
    source: "manual",
    isVerified: false,
  },
] as const satisfies readonly LocationSeed[];

const sampleVerificationNote = "种子示例数据，坐标、海拔、交通和风险信息上线前必须人工核验。";

const photoSpots = [
  {
    locationSlug: "huangshan",
    name: "黄山光明顶",
    slug: "huangshan-guangmingding",
    description: sampleVerificationNote,
    latitudeGcj02: 30.1351,
    longitudeGcj02: 118.1767,
    latitudeWgs84: 30.1328,
    longitudeWgs84: 118.171,
    elevation: 1860,
    viewDirection: "all",
    bestForSunrise: true,
    bestForSunset: true,
    bestForCloudSea: true,
    bestForStars: true,
    bestForMilkyWay: false,
    bestForSnow: true,
    accessNote: "需按景区开放与索道运营时间安排。",
    trafficNote: "生产使用前请补充最新交通和步道信息。",
    safetyNote: "山顶风大、低温和结冰风险需单独核验。",
    riskNote: sampleVerificationNote,
    isHot: true,
    isVerified: false,
  },
  {
    locationSlug: "laojunshan",
    name: "老君山金顶",
    slug: "laojunshan-jinding",
    description: sampleVerificationNote,
    latitudeGcj02: 33.7867,
    longitudeGcj02: 111.6462,
    latitudeWgs84: 33.7852,
    longitudeWgs84: 111.6402,
    elevation: 2190,
    viewDirection: "all",
    bestForSunrise: true,
    bestForSunset: true,
    bestForCloudSea: true,
    bestForStars: true,
    bestForMilkyWay: false,
    bestForSnow: true,
    accessNote: "需核验景区夜间和清晨开放政策。",
    trafficNote: "生产使用前请补充索道、摆渡车和徒步路线信息。",
    safetyNote: "冬季积雪、结冰、强风风险需单独核验。",
    riskNote: sampleVerificationNote,
    isHot: true,
    isVerified: false,
  },
  {
    locationSlug: "sanqingshan",
    name: "三清山女神峰",
    slug: "sanqingshan-nvshenfeng",
    description: sampleVerificationNote,
    latitudeGcj02: 28.9169,
    longitudeGcj02: 118.0751,
    latitudeWgs84: 28.9139,
    longitudeWgs84: 118.0699,
    elevation: 1600,
    viewDirection: "east",
    bestForSunrise: true,
    bestForSunset: false,
    bestForCloudSea: true,
    bestForStars: true,
    bestForMilkyWay: false,
    bestForSnow: true,
    accessNote: "需结合景区栈道开放状态安排。",
    trafficNote: "生产使用前请补充索道和步行时间。",
    safetyNote: "雨雾、湿滑栈道和雷电风险需单独核验。",
    riskNote: sampleVerificationNote,
    isHot: true,
    isVerified: false,
  },
  {
    locationSlug: "wugongshan",
    name: "武功山金顶",
    slug: "wugongshan-jinding",
    description: sampleVerificationNote,
    latitudeGcj02: 27.4748,
    longitudeGcj02: 114.1859,
    latitudeWgs84: 27.4716,
    longitudeWgs84: 114.1808,
    elevation: 1918,
    viewDirection: "all",
    bestForSunrise: true,
    bestForSunset: true,
    bestForCloudSea: true,
    bestForStars: true,
    bestForMilkyWay: true,
    bestForSnow: true,
    accessNote: "需核验露营、夜爬和景区开放规则。",
    trafficNote: "生产使用前请补充缆车、徒步线路和返程信息。",
    safetyNote: "高山草甸风大、雷雨和失温风险需单独核验。",
    riskNote: sampleVerificationNote,
    isHot: true,
    isVerified: false,
  },
] as const satisfies readonly PhotoSpotSeed[];

const spotTags = [
  {
    code: "seed_example",
    name: "种子示例",
    description: "仅用于初始化演示，生产使用前必须人工核验。",
  },
  {
    code: "mountain_view",
    name: "山岳视野",
    description: "适合山岳、峰林、云海和远景层次。",
  },
  {
    code: "night_sky",
    name: "星空参考",
    description: "可作为未来星空和银河判断的人工标签。",
  },
] as const satisfies readonly SpotTagSeed[];

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
    locations: locations.map((location) => ({ ...location })),
    photoSpots: photoSpots.map((photoSpot) => ({ ...photoSpot })),
    spotTags: spotTags.map((spotTag) => ({ ...spotTag })),
  };
}
