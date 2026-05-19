import { cloneJsonValue } from "./json.js";
import type { JsonValue, ProviderType, SettingValueType } from "./types.js";

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

export type DatabaseSeedData = {
  readonly roles: readonly RoleSeed[];
  readonly permissions: readonly PermissionSeed[];
  readonly rolePermissions: readonly RolePermissionSeed[];
  readonly systemSettings: readonly SystemSettingSeed[];
  readonly providerConfigs: readonly ProviderConfigSeed[];
};

const roles = [
  {
    code: "super_admin",
    name: "Super administrator",
    description: "Full operator access for the self-hosted installation.",
  },
  {
    code: "admin",
    name: "Administrator",
    description: "Operator access for non-destructive admin workflows.",
  },
  {
    code: "user",
    name: "User",
    description: "Default end-user role.",
  },
] as const satisfies readonly RoleSeed[];

const permissions = [
  {
    code: "admin.manage",
    name: "Manage admin console",
    description: "Access the admin console and operator-only workflows.",
  },
  {
    code: "settings.manage",
    name: "Manage system settings",
    description: "View and update editable system settings.",
  },
  {
    code: "providers.manage",
    name: "Manage provider configs",
    description: "View and update provider configuration records.",
  },
  {
    code: "users.manage",
    name: "Manage users",
    description: "View and update user status and role assignments.",
  },
  {
    code: "audit.read",
    name: "Read audit logs",
    description: "Read secret-safe administrative audit logs.",
  },
  {
    code: "usage.read",
    name: "Read usage logs",
    description: "Read provider usage and cost telemetry.",
  },
] as const satisfies readonly PermissionSeed[];

const rolePermissions = permissions.map((permission) => ({
  roleCode: "super_admin",
  permissionCode: permission.code,
})) satisfies readonly RolePermissionSeed[];

const systemSettings = [
  {
    key: "site.name",
    valueJson: "Photo Weather AI",
    valueType: "string",
    group: "site",
    label: "Site name",
    description: "Public product name displayed in the application.",
    isPublic: true,
    isSecret: false,
    isEditable: true,
  },
  {
    key: "site.baseUrl",
    valueJson: "",
    valueType: "url",
    group: "site",
    label: "Site base URL",
    description: "Public base URL used for links and callbacks after deployment.",
    isPublic: true,
    isSecret: false,
    isEditable: true,
  },
  {
    key: "ai.defaultProvider",
    valueJson: "deepseek",
    valueType: "select",
    group: "ai",
    label: "Default AI provider",
    description: "Default AI provider code for future interpretation workflows.",
    isPublic: false,
    isSecret: false,
    isEditable: true,
  },
  {
    key: "ai.defaultModel",
    valueJson: "deepseek-chat",
    valueType: "string",
    group: "ai",
    label: "Default AI model",
    description: "Default model identifier for future AI requests.",
    isPublic: false,
    isSecret: false,
    isEditable: true,
  },
  {
    key: "weather.primaryProvider",
    valueJson: "qweather",
    valueType: "select",
    group: "weather",
    label: "Primary weather provider",
    description: "Primary weather provider code for future forecast workflows.",
    isPublic: false,
    isSecret: false,
    isEditable: true,
  },
  {
    key: "weather.secondaryProvider",
    valueJson: "open_meteo",
    valueType: "select",
    group: "weather",
    label: "Secondary weather provider",
    description: "Fallback weather provider code for future forecast workflows.",
    isPublic: false,
    isSecret: false,
    isEditable: true,
  },
  {
    key: "scoring.defaultVersion",
    valueJson: "v1",
    valueType: "string",
    group: "scoring",
    label: "Default scoring version",
    description: "Default scoring profile used by future weather scoring jobs.",
    isPublic: false,
    isSecret: false,
    isEditable: true,
  },
  {
    key: "storage.provider",
    valueJson: "local_storage",
    valueType: "select",
    group: "storage",
    label: "Storage provider",
    description: "Default storage backend for generated assets and reports.",
    isPublic: false,
    isSecret: false,
    isEditable: true,
  },
  {
    key: "billing.enabled",
    valueJson: false,
    valueType: "boolean",
    group: "billing",
    label: "Billing enabled",
    description: "Master switch reserved for the future billing system.",
    isPublic: false,
    isSecret: false,
    isEditable: true,
  },
  {
    key: "deployment.mode",
    valueJson: "self_hosted",
    valueType: "select",
    group: "deployment",
    label: "Deployment mode",
    description: "Deployment profile for future installer and admin diagnostics.",
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
    displayName: "Amap",
    enabled: false,
    priority: 100,
    configJson: {},
    secretJson: {},
    maskedSecretJson: {},
  },
  {
    providerType: "storage",
    providerCode: "local_storage",
    displayName: "Local storage",
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
    displayName: "Aliyun OSS",
    enabled: false,
    priority: 200,
    configJson: {},
    secretJson: {},
    maskedSecretJson: {},
  },
  {
    providerType: "storage",
    providerCode: "tencent_cos",
    displayName: "Tencent COS",
    enabled: false,
    priority: 300,
    configJson: {},
    secretJson: {},
    maskedSecretJson: {},
  },
  {
    providerType: "storage",
    providerCode: "s3_compatible",
    displayName: "S3 compatible",
    enabled: false,
    priority: 400,
    configJson: {},
    secretJson: {},
    maskedSecretJson: {},
  },
] as const satisfies readonly ProviderConfigSeed[];

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
  };
}
