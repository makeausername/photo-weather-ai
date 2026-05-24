export { createAuditLog, listAuditLogs, sanitizeAuditJson } from "./audit.js";
export {
  assertPermission,
  createRefreshToken,
  createPublicUserAccount,
  DuplicateUserEmailError,
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
  isLocationSource,
  isLocationType,
  isProviderType,
  isSettingValueType,
  isViewDirection,
  locationSources,
  locationTypes,
  providerTypes,
  settingValueTypes,
  userStatuses,
  viewDirections,
} from "./constants.js";
export {
  AdminVerificationError,
  createOrUpdateSuperAdmin,
  formatCreateAdminResult,
  formatVerifyAdminResult,
  readCreateAdminEnv,
  readVerifyAdminEnv,
  runCreateAdminFromEnv,
  runVerifyAdminFromEnv,
  verifySuperAdmin,
} from "./create-admin.js";
export {
  createLocation,
  createPhotoSpot,
  deleteLocation,
  deletePhotoSpot,
  getLocation,
  getPhotoSpot,
  listLocations,
  listPhotoSpots,
  updateLocation,
  updatePhotoSpot,
} from "./locations.js";
export {
  getProviderConfig,
  getRuntimeProviderConfig,
  listProviderConfigs,
  updateProviderConfig,
  validateProviderCode,
} from "./providers.js";
export { buildSeedData } from "./seed-data.js";
export { seedDatabase } from "./seed.js";
export { maskSecretJson, maskSecretString, maskSecretValue } from "./secrets.js";
export {
  hashPassword,
  hashUserPassword,
  minimumAdminPasswordLength,
  minimumUserPasswordLength,
  validateAdminPassword,
  validateUserPassword,
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
  LocationRecord,
  LocationSource,
  LocationType,
  PhotoSpotRecord,
  ProviderConfigRecord,
  ProviderType,
  SafeProviderConfig,
  SafeSystemSetting,
  SafeUser,
  SafeUserProfile,
  SettingValueType,
  SystemSettingRecord,
  UserRecord,
  UserProfileRecord,
  UserSessionRecord,
  UserStatus,
  ViewDirection,
} from "./types.js";

export type DatabasePackageStatus = {
  readonly prismaSchema: "database_foundation";
  readonly businessModels: "created";
};

export const databasePackageStatus: DatabasePackageStatus = {
  prismaSchema: "database_foundation",
  businessModels: "created",
};
