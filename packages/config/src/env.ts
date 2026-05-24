import { z } from "zod";

const optionalString = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().trim().min(1).optional(),
);

const optionalSecret = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().trim().min(1).optional(),
);

const optInFlag = z.preprocess((value) => {
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "") {
      return undefined;
    }

    if (normalized === "true") {
      return true;
    }

    if (normalized === "false") {
      return false;
    }
  }

  return value;
}, z.boolean().default(false));

export const serverEnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    DATABASE_URL: optionalString,
    REDIS_URL: optionalString,
    JWT_SECRET: z.preprocess(
      (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
      z.string().trim().min(32).optional(),
    ),
    DEEPSEEK_API_KEY: optionalSecret,
    DEEPSEEK_BASE_URL: optionalString.default("https://api.deepseek.com"),
    DEEPSEEK_DEFAULT_MODEL: optionalString.default("deepseek-v4-flash"),
    ENABLE_REAL_DEEPSEEK: optInFlag,
    AMAP_API_KEY: optionalSecret,
    AMAP_WEB_SERVICE_KEY: optionalSecret,
    AMAP_BASE_URL: optionalString.default("https://restapi.amap.com"),
    ENABLE_REAL_AMAP: optInFlag,
    WEATHER_PROVIDER: z.enum(["mock", "qweather", "open_meteo", "meteoblue"]).default("mock"),
    WEATHER_PROVIDER_MODE: z.enum(["mock", "fixture", "real"]).default("mock"),
    QWEATHER_API_KEY: optionalSecret,
    QWEATHER_API_HOST: optionalString,
    QWEATHER_BASE_URL: optionalString,
    QWEATHER_LANGUAGE: optionalString.default("zh"),
    QWEATHER_UNIT: z.enum(["metric", "imperial", "m", "i"]).default("metric"),
    QWEATHER_TIMEOUT_MS: optionalString,
    QWEATHER_RETRY_COUNT: optionalString,
    OPEN_METEO_API_KEY: optionalSecret,
    OPEN_METEO_MODE: z.enum(["free", "customer"]).default("free"),
    OPEN_METEO_BASE_URL: optionalString.default("https://api.open-meteo.com/v1"),
    OPEN_METEO_CUSTOMER_ENDPOINT: optionalString,
    OPEN_METEO_DEFAULT_MODEL: optionalString.default("forecast"),
    OPEN_METEO_MODEL_PREFERENCE: optionalString,
    OPEN_METEO_TIMEZONE: optionalString.default("Asia/Shanghai"),
    OPEN_METEO_TIMEOUT_MS: optionalString,
    OPEN_METEO_RETRY_COUNT: optionalString,
    METEOBLUE_API_KEY: optionalSecret,
    METEOBLUE_BASE_URL: optionalString.default("https://my.meteoblue.com"),
    METEOBLUE_PACKAGE_NAME: optionalString,
    METEOBLUE_TIMEOUT_MS: optionalString,
    METEOBLUE_RETRY_COUNT: optionalString,
    STORAGE_PROVIDER: z.enum(["local", "aliyun_oss", "tencent_cos", "s3"]).default("local"),
    ALIYUN_OSS_ACCESS_KEY_ID: optionalSecret,
    ALIYUN_OSS_ACCESS_KEY_SECRET: optionalSecret,
    TENCENT_COS_SECRET_ID: optionalSecret,
    TENCENT_COS_SECRET_KEY: optionalSecret,
    S3_ACCESS_KEY_ID: optionalSecret,
    S3_SECRET_ACCESS_KEY: optionalSecret,
    SENTRY_DSN: optionalString,
  })
  .superRefine((env, context) => {
    if (env.NODE_ENV !== "production") {
      return;
    }

    if (!env.DATABASE_URL) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "DATABASE_URL is required in production",
        path: ["DATABASE_URL"],
      });
    }

    if (!env.REDIS_URL) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "REDIS_URL is required in production",
        path: ["REDIS_URL"],
      });
    }

    if (!env.JWT_SECRET) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "JWT_SECRET is required in production",
        path: ["JWT_SECRET"],
      });
    }
  });

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export type PublicConfig = {
  readonly nodeEnv: ServerEnv["NODE_ENV"];
  readonly storageProvider: ServerEnv["STORAGE_PROVIDER"];
  readonly sentryDsn?: string;
};

export type RuntimeConfig = {
  readonly publicConfig: PublicConfig;
  readonly serverEnv: ServerEnv;
};

export function loadServerEnv(source: NodeJS.ProcessEnv = process.env): ServerEnv {
  return serverEnvSchema.parse(source);
}

export function toPublicConfig(env: ServerEnv): PublicConfig {
  return {
    nodeEnv: env.NODE_ENV,
    storageProvider: env.STORAGE_PROVIDER,
    sentryDsn: env.SENTRY_DSN,
  };
}

export function loadRuntimeConfig(source: NodeJS.ProcessEnv = process.env): RuntimeConfig {
  const serverEnv = loadServerEnv(source);

  return {
    publicConfig: toPublicConfig(serverEnv),
    serverEnv,
  };
}
