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

export type HistoricalWeatherSourceProvider =
  | "open_meteo_historical"
  | "meteoblue_history"
  | "manual"
  | "imported";

export type ForecastReplayTarget = "general" | "cloud_sea" | "glow" | "astro";

export type ForecastReplayStatus = "pending" | "running" | "completed" | "failed";

export type ObservedResult = "success" | "partial" | "fail" | "unknown";

export type CalibrationLevel = "none" | "weak" | "medium" | "strong";

export type WhiteoutLevel = "none" | "low" | "medium" | "high";

export type TransparencyLevel = "poor" | "fair" | "good" | "excellent";

export type RainImpactLevel = "none" | "low" | "medium" | "high";

export type ObservedOutcomeSource = "admin_manual" | "user_feedback" | "imported";

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

export type HistoricalWeatherSampleRecord = {
  readonly id: string;
  readonly spotId: string | null;
  readonly locationKey: string | null;
  readonly locationName: string;
  readonly latitudeWgs84: number;
  readonly longitudeWgs84: number;
  readonly elevationMeters: number | null;
  readonly sourceProvider: HistoricalWeatherSourceProvider;
  readonly sampleTime: Date;
  readonly timezone: string;
  readonly temperatureC: number | null;
  readonly relativeHumidityPercent: number | null;
  readonly dewPointC: number | null;
  readonly windSpeedMs: number | null;
  readonly windGustMs: number | null;
  readonly windDirectionDeg: number | null;
  readonly precipitationAmountMm: number | null;
  readonly precipitationProbabilityPercent: number | null;
  readonly rainAmountMm: number | null;
  readonly snowAmountMm: number | null;
  readonly cloudTotalPercent: number | null;
  readonly cloudLowPercent: number | null;
  readonly cloudMidPercent: number | null;
  readonly cloudHighPercent: number | null;
  readonly visibilityMeters: number | null;
  readonly pressureMslHpa: number | null;
  readonly weatherCode: string | null;
  readonly weatherText: string | null;
  readonly rawJson?: JsonValue | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export type ForecastReplayRunRecord = {
  readonly id: string;
  readonly spotId: string | null;
  readonly locationKey: string | null;
  readonly locationName: string;
  readonly latitudeWgs84: number;
  readonly longitudeWgs84: number;
  readonly elevationMeters: number | null;
  readonly dateStart: Date;
  readonly dateEnd: Date;
  readonly target: ForecastReplayTarget;
  readonly modelVersion: string | null;
  readonly ruleVersion: string | null;
  readonly sourceProvider: HistoricalWeatherSourceProvider;
  readonly status: ForecastReplayStatus;
  readonly errorMessage: string | null;
  readonly createdAt: Date;
  readonly completedAt: Date | null;
};

export type ForecastReplayResultRecord = {
  readonly id: string;
  readonly replayRunId: string;
  readonly spotId: string | null;
  readonly locationKey: string | null;
  readonly locationName: string;
  readonly target: ForecastReplayTarget;
  readonly forecastDate: Date;
  readonly overallScore: number | null;
  readonly recommendationLabel: string | null;
  readonly dedicatedTripRecommendation: string | null;
  readonly nearbyObservationRecommendation: string | null;
  readonly bestWindowStart: Date | null;
  readonly bestWindowEnd: Date | null;
  readonly bestSubject: string | null;
  readonly cloudSeaFormationScore: number | null;
  readonly cloudSeaShootableScore: number | null;
  readonly whiteoutRiskScore: number | null;
  readonly sunriseGlowScore: number | null;
  readonly sunsetGlowScore: number | null;
  readonly astroPracticalScore: number | null;
  readonly milkyWayPracticalScore: number | null;
  readonly precipitationRiskLevel: string | null;
  readonly transparencyGrade: string | null;
  readonly confidenceLabel: string | null;
  readonly predictedJson: JsonValue;
  readonly createdAt: Date;
};

export type ObservedOutcomeRecord = {
  readonly id: string;
  readonly spotId: string | null;
  readonly locationKey: string;
  readonly locationName: string;
  readonly target: ForecastReplayTarget;
  readonly outcomeDate: Date;
  readonly observationWindowStart: Date | null;
  readonly observationWindowEnd: Date | null;
  readonly observedResult: ObservedResult;
  readonly cloudSeaLevel: CalibrationLevel | null;
  readonly whiteoutLevel: WhiteoutLevel | null;
  readonly sunriseGlowLevel: CalibrationLevel | null;
  readonly sunsetGlowLevel: CalibrationLevel | null;
  readonly astroVisibilityLevel: CalibrationLevel | null;
  readonly transparencyLevel: TransparencyLevel | null;
  readonly rainImpactLevel: RainImpactLevel | null;
  readonly notes: string | null;
  readonly photoEvidenceUrl: string | null;
  readonly source: ObservedOutcomeSource;
  readonly createdBy: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export type CalibrationStatsRecord = {
  readonly id: string;
  readonly spotId: string | null;
  readonly locationKey: string;
  readonly target: ForecastReplayTarget;
  readonly ruleVersion: string;
  readonly sampleCount: number;
  readonly successCount: number;
  readonly partialCount: number;
  readonly failCount: number;
  readonly hitRate: number;
  readonly falsePositiveRate: number;
  readonly falseNegativeRate: number;
  readonly whiteoutFalsePositiveRate: number | null;
  readonly bestWindowHitRate: number | null;
  readonly recommendedTripHitRate: number | null;
  readonly updatedAt: Date;
  readonly summaryJson: JsonValue;
};

export type TerrainElevationCacheRecord = {
  readonly id: string;
  readonly cacheKey: string;
  readonly latitudeWgs84: number;
  readonly longitudeWgs84: number;
  readonly elevationMeters: number | null;
  readonly elevationSource: string;
  readonly elevationConfidence: string;
  readonly expiresAt: Date;
  readonly rawJson: JsonValue | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
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
  readonly historicalWeatherSample?: {
    readonly findUnique: (args: any) => Promise<any>;
    readonly findMany: (args?: any) => Promise<any[]>;
    readonly create: (args: any) => Promise<any>;
    readonly update: (args: any) => Promise<any>;
    readonly upsert: (args: any) => Promise<any>;
    readonly count: (args?: any) => Promise<number>;
  };
  readonly forecastReplayRun?: {
    readonly findUnique: (args: any) => Promise<any>;
    readonly findMany: (args?: any) => Promise<any[]>;
    readonly create: (args: any) => Promise<any>;
    readonly update: (args: any) => Promise<any>;
  };
  readonly forecastReplayResult?: {
    readonly findUnique: (args: any) => Promise<any>;
    readonly findMany: (args?: any) => Promise<any[]>;
    readonly create: (args: any) => Promise<any>;
    readonly createMany?: (args: any) => Promise<{ count: number }>;
    readonly deleteMany?: (args: any) => Promise<{ count: number }>;
    readonly count: (args?: any) => Promise<number>;
  };
  readonly observedOutcome?: {
    readonly findUnique: (args: any) => Promise<any>;
    readonly findMany: (args?: any) => Promise<any[]>;
    readonly create: (args: any) => Promise<any>;
    readonly update: (args: any) => Promise<any>;
    readonly upsert: (args: any) => Promise<any>;
  };
  readonly calibrationStats?: {
    readonly findUnique: (args: any) => Promise<any>;
    readonly findMany: (args?: any) => Promise<any[]>;
    readonly upsert: (args: any) => Promise<any>;
  };
  readonly terrainElevationCache?: {
    readonly findUnique: (args: any) => Promise<any>;
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
