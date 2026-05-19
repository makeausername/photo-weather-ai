import { z } from "zod";

const optionalString = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().trim().min(1).optional(),
);

const optionalSecret = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().trim().min(1).optional(),
);

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
    AMAP_API_KEY: optionalSecret,
    AMAP_WEB_SERVICE_KEY: optionalSecret,
    QWEATHER_API_KEY: optionalSecret,
    OPEN_METEO_API_KEY: optionalSecret,
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
