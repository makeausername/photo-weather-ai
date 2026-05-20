export type JsonPrimitive = string | number | boolean | null;

export type JsonObject = {
  readonly [key: string]: JsonValue;
};

export type JsonValue = JsonPrimitive | JsonObject | readonly JsonValue[];

export type UserStatus = "active" | "disabled";

export type ProviderType = "ai" | "weather" | "geo" | "terrain" | "storage" | "billing" | "sms";

export type LocationType = "scenic_area" | "viewpoint" | "mountain" | "lake" | "city" | "custom";

export type LocationSource = "manual" | "amap" | "user";

export type ViewDirection =
  | "north"
  | "northeast"
  | "east"
  | "southeast"
  | "south"
  | "southwest"
  | "west"
  | "northwest"
  | "all"
  | "unknown";

export type SettingValueType =
  | "string"
  | "number"
  | "boolean"
  | "json"
  | "url"
  | "select"
  | "prompt"
  | "secret";

export type SystemSettingRecord = {
  readonly id: string;
  readonly key: string;
  readonly valueJson: JsonValue;
  readonly valueType: SettingValueType;
  readonly group: string;
  readonly label: string;
  readonly description: string | null;
  readonly isPublic: boolean;
  readonly isSecret: boolean;
  readonly isEditable: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export type SafeSystemSetting = SystemSettingRecord;

export type ProviderConfigRecord = {
  readonly id: string;
  readonly providerType: ProviderType;
  readonly providerCode: string;
  readonly displayName: string;
  readonly enabled: boolean;
  readonly priority: number;
  readonly configJson: JsonValue;
  readonly secretJson: JsonValue | null;
  readonly maskedSecretJson: JsonValue | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export type SafeProviderConfig = Omit<ProviderConfigRecord, "secretJson">;

export type UserRecord = {
  readonly id: string;
  readonly email: string;
  readonly phone: string | null;
  readonly passwordHash: string;
  readonly displayName: string | null;
  readonly status: UserStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly lastLoginAt: Date | null;
};

export type SafeUser = Omit<UserRecord, "passwordHash">;

export type UserProfileRecord = {
  readonly id: string;
  readonly userId: string;
  readonly avatarUrl: string | null;
  readonly preferredUnits: string;
  readonly preferredLanguage: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export type SafeUserProfile = UserProfileRecord;

export type RoleRecord = {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly description: string | null;
};

export type PermissionRecord = {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly description: string | null;
};

export type AuthenticatedPrincipal = {
  readonly user: SafeUser;
  readonly profile: SafeUserProfile | null;
  readonly roles: readonly string[];
  readonly permissions: readonly string[];
};

export type UserSessionRecord = {
  readonly id: string;
  readonly userId: string;
  readonly refreshTokenHash: string;
  readonly expiresAt: Date;
  readonly revokedAt: Date | null;
  readonly ipAddress: string | null;
  readonly userAgent: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export type AdminAuditLogInput = {
  readonly actorUserId?: string | null;
  readonly action: string;
  readonly targetType: string;
  readonly targetId?: string | null;
  readonly beforeJson?: JsonValue | null;
  readonly afterJson?: JsonValue | null;
  readonly ipAddress?: string | null;
  readonly userAgent?: string | null;
};

export type AdminAuditLogRecord = {
  readonly id: string;
  readonly actorUserId: string | null;
  readonly action: string;
  readonly targetType: string;
  readonly targetId: string | null;
  readonly beforeJson: JsonValue | null;
  readonly afterJson: JsonValue | null;
  readonly ipAddress: string | null;
  readonly userAgent: string | null;
  readonly createdAt: Date;
};

export type ApiUsageLogInput = {
  readonly providerType: ProviderType;
  readonly providerCode: string;
  readonly operation: string;
  readonly requestId?: string | null;
  readonly success: boolean;
  readonly statusCode?: number | null;
  readonly latencyMs?: number | null;
  readonly estimatedCost?: number | string | null;
  readonly inputTokens?: number | null;
  readonly outputTokens?: number | null;
  readonly errorMessage?: string | null;
};

export type LocationRecord = {
  readonly id: string;
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
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export type PhotoSpotRecord = {
  readonly id: string;
  readonly locationId: string;
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
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly location?: LocationRecord;
};

export type DatabaseClient = {
  readonly user?: {
    readonly findUnique: (args: any) => Promise<any>;
    readonly create: (args: any) => Promise<any>;
    readonly update: (args: any) => Promise<any>;
  };
  readonly systemSetting: {
    readonly findUnique: (args: any) => Promise<any>;
    readonly findMany: (args?: any) => Promise<any[]>;
    readonly upsert: (args: any) => Promise<any>;
  };
  readonly providerConfig: {
    readonly findUnique: (args: any) => Promise<any>;
    readonly findMany: (args?: any) => Promise<any[]>;
    readonly upsert: (args: any) => Promise<any>;
    readonly update: (args: any) => Promise<any>;
  };
  readonly adminAuditLog: {
    readonly create: (args: any) => Promise<any>;
    readonly findMany: (args?: any) => Promise<any[]>;
  };
  readonly apiUsageLog: {
    readonly create: (args: any) => Promise<any>;
  };
  readonly location?: {
    readonly findUnique: (args: any) => Promise<any>;
    readonly findMany: (args?: any) => Promise<any[]>;
    readonly create: (args: any) => Promise<any>;
    readonly update: (args: any) => Promise<any>;
    readonly delete: (args: any) => Promise<any>;
    readonly upsert: (args: any) => Promise<any>;
  };
  readonly photoSpot?: {
    readonly findUnique: (args: any) => Promise<any>;
    readonly findMany: (args?: any) => Promise<any[]>;
    readonly create: (args: any) => Promise<any>;
    readonly update: (args: any) => Promise<any>;
    readonly delete: (args: any) => Promise<any>;
    readonly upsert: (args: any) => Promise<any>;
  };
  readonly spotTag?: {
    readonly upsert: (args: any) => Promise<any>;
  };
  readonly userSession?: {
    readonly create: (args: any) => Promise<any>;
    readonly findUnique: (args: any) => Promise<any>;
    readonly update: (args: any) => Promise<any>;
  };
  readonly userRole?: {
    readonly upsert: (args: any) => Promise<any>;
  };
  readonly userProfile?: {
    readonly create: (args: any) => Promise<any>;
  };
  readonly role?: {
    readonly upsert: (args: any) => Promise<any>;
    readonly findUnique: (args: any) => Promise<any>;
  };
  readonly permission?: {
    readonly upsert: (args: any) => Promise<any>;
    readonly findUnique: (args: any) => Promise<any>;
  };
  readonly rolePermission?: {
    readonly upsert: (args: any) => Promise<any>;
  };
};
