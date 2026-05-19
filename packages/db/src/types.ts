export type JsonPrimitive = string | number | boolean | null;

export type JsonObject = {
  readonly [key: string]: JsonValue;
};

export type JsonValue = JsonPrimitive | JsonObject | readonly JsonValue[];

export type UserStatus = "active" | "disabled";

export type ProviderType = "ai" | "weather" | "geo" | "terrain" | "storage" | "billing" | "sms";

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

export type DatabaseClient = {
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
