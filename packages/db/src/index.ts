export { createAuditLog, listAuditLogs, sanitizeAuditJson } from "./audit.js";
export {
  assertPermission,
  createRefreshToken,
  createUserSession,
  getActiveUserSessionByRefreshToken,
  getUserAuthContextByEmail,
  getUserAuthContextById,
  hashRefreshToken,
  hasPermission,
  requiredAdminPermissions,
  revokeUserSessionByRefreshToken,
  safeUser,
  touchUserLastLogin,
} from "./auth.js";
export { disconnectPrismaClient, getPrismaClient } from "./client.js";
export {
  assertProviderType,
  assertSettingValueType,
  isProviderType,
  isSettingValueType,
  providerTypes,
  settingValueTypes,
  userStatuses,
} from "./constants.js";
export {
  createOrUpdateSuperAdmin,
  formatCreateAdminResult,
  readCreateAdminEnv,
  runCreateAdminFromEnv,
} from "./create-admin.js";
export {
  getProviderConfig,
  listProviderConfigs,
  updateProviderConfig,
  validateProviderCode,
} from "./providers.js";
export { buildSeedData } from "./seed-data.js";
export { seedDatabase } from "./seed.js";
export { maskSecretJson, maskSecretString, maskSecretValue } from "./secrets.js";
export {
  hashPassword,
  minimumAdminPasswordLength,
  validateAdminPassword,
  verifyPassword,
} from "./passwords.js";
export { safeProviderConfig, safeSystemSetting } from "./serializers.js";
export {
  getSystemSetting,
  listSystemSettings,
  setSystemSetting,
  validateSettingKey,
  validateSettingValue,
} from "./settings.js";
export { createApiUsageLog } from "./usage.js";
export type {
  AdminAuditLogInput,
  AdminAuditLogRecord,
  ApiUsageLogInput,
  AuthenticatedPrincipal,
  DatabaseClient,
  JsonObject,
  JsonPrimitive,
  JsonValue,
  ProviderConfigRecord,
  ProviderType,
  SafeProviderConfig,
  SafeSystemSetting,
  SafeUser,
  SettingValueType,
  SystemSettingRecord,
  UserRecord,
  UserSessionRecord,
  UserStatus,
} from "./types.js";

export type DatabasePackageStatus = {
  readonly prismaSchema: "database_foundation";
  readonly businessModels: "created";
};

export const databasePackageStatus: DatabasePackageStatus = {
  prismaSchema: "database_foundation",
  businessModels: "created",
};
