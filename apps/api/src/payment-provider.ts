import { getRuntimeProviderConfig } from "@photo-weather/db";
import type {
  BillingProductRecord,
  DatabaseClient,
  JsonValue,
  PaymentOrderRecord,
  PaymentProviderCode,
} from "@photo-weather/db";
import {
  alipayDefaultGatewayUrl,
  paymentDefaultTimeoutMs,
  wechatPayDefaultApiBaseUrl,
} from "@photo-weather/shared";
import {
  assertPrivateKeyPem,
  assertPublicKeyPem,
  isPlainRecord,
  readBooleanField,
  readIntegerField,
  readStringField,
} from "./payment-security.js";
import { normalizeAlipayCharset, type AlipayCharset } from "./alipay-encoding.js";

export type PaymentCreateInput = {
  readonly order: PaymentOrderRecord;
  readonly product: BillingProductRecord;
  readonly clientIp?: string | null;
  readonly clientMode?: string;
  readonly returnUrl?: string | null;
};

export type PublicCheckoutPayload =
  | {
      readonly kind: "mock";
      readonly message: string;
    }
  | {
      readonly kind: "qr_code";
      readonly codeUrl: string;
      readonly message: string;
    }
  | {
      readonly kind: "redirect_url";
      readonly redirectUrl: string;
      readonly message: string;
    }
  | {
      readonly kind: "form_post";
      readonly actionUrl: string;
      readonly method: "POST";
      readonly charset: string;
      readonly fields: Record<string, string>;
      readonly message: string;
    }
  | {
      readonly kind: "form_html";
      readonly formHtml: string;
      readonly message: string;
    };

export type PaymentCreateResult = {
  readonly provider: PaymentProviderCode;
  readonly mode: string;
  readonly realCall: boolean;
  readonly providerPayloadJson?: JsonValue | null;
  readonly publicPayload: PublicCheckoutPayload;
};

export type PaymentNotificationInput = {
  readonly rawBody: string;
  readonly rawBodyBytes?: Uint8Array;
  readonly headers: Record<string, string | undefined>;
};

export type ParsedPaymentNotification = {
  readonly orderNo: string;
  readonly providerTradeNo?: string | null;
  readonly amountCents: number;
  readonly status: "paid" | "ignored" | "failed";
  readonly rawJson?: JsonValue | null;
};

export type PaymentNotificationVerificationResult =
  | {
      readonly ok: true;
      readonly parsed: ParsedPaymentNotification;
    }
  | {
      readonly ok: false;
      readonly error: string;
      readonly safeMessage: string;
      readonly parsed?: Partial<ParsedPaymentNotification>;
      readonly rawJson?: JsonValue | null;
    };

export type PaymentProvider = {
  readonly providerCode: PaymentProviderCode;
  createPayment(input: PaymentCreateInput): Promise<PaymentCreateResult>;
  verifyNotification(
    input: PaymentNotificationInput,
  ): Promise<PaymentNotificationVerificationResult>;
};

export type WechatPayRuntimeConfig = {
  readonly providerCode: "wechat_pay";
  readonly enabled: boolean;
  readonly realCallEnabled: boolean;
  readonly mode: "native" | "h5" | "jsapi" | "auto";
  readonly appId: string;
  readonly mchId: string;
  readonly notifyUrl: string;
  readonly returnUrl: string;
  readonly apiBaseUrl: string;
  readonly timeoutMs: number;
  readonly merchantSerialNo: string;
  readonly merchantPrivateKeyPem: string;
  readonly apiV3Key: string;
  readonly platformCertificatePem: string;
  readonly platformPublicKeyPem: string;
};

export type AlipayRuntimeConfig = {
  readonly providerCode: "alipay";
  readonly enabled: boolean;
  readonly realCallEnabled: boolean;
  readonly mode: "page" | "wap";
  readonly appId: string;
  readonly notifyUrl: string;
  readonly returnUrl: string;
  readonly gatewayUrl: string;
  readonly charset: AlipayCharset;
  readonly signType: "RSA2";
  readonly timeoutMs: number;
  readonly appPrivateKeyPem: string;
  readonly alipayPublicKeyPem: string;
  readonly sellerId: string;
  readonly forceAsciiSubject: boolean;
};

export type BillingProviderRuntimeConfig = WechatPayRuntimeConfig | AlipayRuntimeConfig;

export type BillingProviderConfigCheckResult = {
  readonly success: boolean;
  readonly mode: "config_check";
  readonly connectionMode: "mock";
  readonly providerType: "billing";
  readonly providerCode: "wechat_pay" | "alipay";
  readonly providerNameZh: string;
  readonly enabled: boolean;
  readonly realCallEnabled: boolean;
  readonly configReady: boolean;
  readonly missingFields: readonly string[];
  readonly invalidFields: readonly string[];
  readonly messageZh: string;
};

type RuntimeConfigOptions = {
  readonly providerCode: "wechat_pay" | "alipay";
  readonly dbClient?: DatabaseClient;
  readonly env?: NodeJS.ProcessEnv;
};

function configJsonOf(value: unknown): Record<string, unknown> {
  return isPlainRecord(value) ? value : {};
}

function normalizeWechatMode(value: string): "native" | "h5" | "jsapi" | "auto" {
  return value === "native" || value === "h5" || value === "jsapi" ? value : "auto";
}

function normalizeAlipayMode(value: string): "page" | "wap" {
  return value === "wap" ? "wap" : "page";
}

function readConfiguredRealCallEnabled(
  configJson: Record<string, unknown>,
  env: NodeJS.ProcessEnv,
): boolean {
  if (env.NODE_ENV === "test") {
    return false;
  }
  return readBooleanField(configJson.realCallEnabled);
}

function providerNameZh(providerCode: "wechat_pay" | "alipay"): string {
  return providerCode === "wechat_pay" ? "微信支付" : "支付宝";
}

export async function readRuntimeBillingProviderConfig(
  options: RuntimeConfigOptions,
): Promise<BillingProviderRuntimeConfig> {
  const env = options.env ?? process.env;
  const record = await getRuntimeProviderConfig("billing", options.providerCode, {
    client: options.dbClient,
  });
  const configJson = configJsonOf(record?.configJson);
  const secretJson = configJsonOf(record?.secretJson);

  if (options.providerCode === "wechat_pay") {
    return {
      providerCode: "wechat_pay",
      enabled: record?.enabled ?? false,
      realCallEnabled: readConfiguredRealCallEnabled(configJson, env),
      mode: normalizeWechatMode(readStringField(configJson.mode)),
      appId: readStringField(configJson.appId),
      mchId: readStringField(configJson.mchId),
      notifyUrl: readStringField(configJson.notifyUrl),
      returnUrl: readStringField(configJson.returnUrl),
      apiBaseUrl: readStringField(configJson.apiBaseUrl) || wechatPayDefaultApiBaseUrl,
      timeoutMs: readIntegerField(configJson.timeoutMs, paymentDefaultTimeoutMs),
      merchantSerialNo: readStringField(secretJson.merchantSerialNo),
      merchantPrivateKeyPem: readStringField(secretJson.merchantPrivateKeyPem),
      apiV3Key: readStringField(secretJson.apiV3Key),
      platformCertificatePem: readStringField(secretJson.platformCertificatePem),
      platformPublicKeyPem: readStringField(secretJson.platformPublicKeyPem),
    };
  }

  return {
    providerCode: "alipay",
    enabled: record?.enabled ?? false,
    realCallEnabled: readConfiguredRealCallEnabled(configJson, env),
    mode: normalizeAlipayMode(readStringField(configJson.mode)),
    appId: readStringField(configJson.appId),
    notifyUrl: readStringField(configJson.notifyUrl),
    returnUrl: readStringField(configJson.returnUrl),
    gatewayUrl: readStringField(configJson.gatewayUrl) || alipayDefaultGatewayUrl,
    charset: normalizeAlipayCharset(configJson.charset),
    signType: "RSA2",
    timeoutMs: readIntegerField(configJson.timeoutMs, paymentDefaultTimeoutMs),
    appPrivateKeyPem: readStringField(secretJson.appPrivateKeyPem),
    alipayPublicKeyPem: readStringField(secretJson.alipayPublicKeyPem),
    sellerId: readStringField(configJson.sellerId),
    forceAsciiSubject: readBooleanField(env.ALIPAY_FORCE_ASCII_SUBJECT),
  };
}

function collectMissingFields(
  config: BillingProviderRuntimeConfig,
  includeSecrets: boolean,
): string[] {
  const missingKeys = (fields: readonly (readonly [string, string])[]): string[] =>
    fields.filter(([, value]) => !value).map(([key]) => key);

  if (config.providerCode === "wechat_pay") {
    const missing = missingKeys([
      ["appId", config.appId],
      ["mchId", config.mchId],
      ["notifyUrl", config.notifyUrl],
      ["merchantSerialNo", includeSecrets ? config.merchantSerialNo : "present"],
      ["merchantPrivateKeyPem", includeSecrets ? config.merchantPrivateKeyPem : "present"],
      ["apiV3Key", includeSecrets ? config.apiV3Key : "present"],
    ]);
    if (includeSecrets && !config.platformCertificatePem && !config.platformPublicKeyPem) {
      missing.push("platformCertificatePem or platformPublicKeyPem");
    }
    return missing;
  }

  return missingKeys([
    ["appId", config.appId],
    ["notifyUrl", config.notifyUrl],
    ["appPrivateKeyPem", includeSecrets ? config.appPrivateKeyPem : "present"],
    ["alipayPublicKeyPem", includeSecrets ? config.alipayPublicKeyPem : "present"],
  ]);
}

function collectInvalidPemFields(config: BillingProviderRuntimeConfig): string[] {
  const invalid: string[] = [];
  if (config.providerCode === "wechat_pay") {
    if (config.merchantPrivateKeyPem) {
      try {
        assertPrivateKeyPem(config.merchantPrivateKeyPem);
      } catch {
        invalid.push("merchantPrivateKeyPem");
      }
    }
    const publicMaterial = config.platformPublicKeyPem || config.platformCertificatePem;
    if (publicMaterial) {
      try {
        assertPublicKeyPem(publicMaterial);
      } catch {
        invalid.push(
          config.platformPublicKeyPem ? "platformPublicKeyPem" : "platformCertificatePem",
        );
      }
    }
    if (config.apiV3Key && Buffer.byteLength(config.apiV3Key, "utf8") !== 32) {
      invalid.push("apiV3Key");
    }
    return invalid;
  }

  if (config.appPrivateKeyPem) {
    try {
      assertPrivateKeyPem(config.appPrivateKeyPem);
    } catch {
      invalid.push("appPrivateKeyPem");
    }
  }
  if (config.alipayPublicKeyPem) {
    try {
      assertPublicKeyPem(config.alipayPublicKeyPem);
    } catch {
      invalid.push("alipayPublicKeyPem");
    }
  }
  return invalid;
}

export async function checkBillingProviderConfig(
  options: RuntimeConfigOptions,
): Promise<BillingProviderConfigCheckResult> {
  const config = await readRuntimeBillingProviderConfig(options);
  const includeSecrets = true;
  const missingFields = collectMissingFields(config, includeSecrets);
  const invalidFields = collectInvalidPemFields(config);
  const configReady = missingFields.length === 0 && invalidFields.length === 0;
  const name = providerNameZh(options.providerCode);
  const messageZh = configReady
    ? `${name} 配置检查通过，未发起真实支付请求。`
    : `${name} 配置尚未完整，请补齐必要字段后再启用。`;

  return {
    success: invalidFields.length === 0,
    mode: "config_check",
    connectionMode: "mock",
    providerType: "billing",
    providerCode: options.providerCode,
    providerNameZh: name,
    enabled: config.enabled,
    realCallEnabled: config.realCallEnabled,
    configReady,
    missingFields,
    invalidFields,
    messageZh,
  };
}
