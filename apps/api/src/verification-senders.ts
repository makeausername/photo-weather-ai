import { createHmac, randomUUID } from "node:crypto";
import { getRuntimeProviderConfig } from "@photo-weather/db";
import type {
  AuthVerificationChannel,
  AuthVerificationPurpose,
  DatabaseClient,
  JsonValue,
  ProviderConfigRecord,
} from "@photo-weather/db";

export type VerificationSendMode = "mock" | "real" | "config_check";

export type VerificationSenderResult = {
  readonly success: boolean;
  readonly channel: AuthVerificationChannel;
  readonly providerCode: string;
  readonly mode: VerificationSendMode;
  readonly messageZh: string;
  readonly error?: string;
  readonly missingFields?: readonly string[];
  readonly upstreamCode?: string;
  readonly upstreamMessageSanitized?: string;
  readonly upstreamRequestId?: string;
  readonly upstreamBizId?: string;
};

export type VerificationSendInput = {
  readonly channel: AuthVerificationChannel;
  readonly purpose: AuthVerificationPurpose;
  readonly target: string;
  readonly code: string;
};

export type VerificationSender = {
  readonly send: (input: VerificationSendInput) => Promise<VerificationSenderResult>;
};

type SenderOptions = {
  readonly dbClient?: DatabaseClient;
  readonly env?: NodeJS.ProcessEnv;
};

type JsonRecord = {
  readonly [key: string]: JsonValue;
};

type EmailProviderConfig = {
  readonly enabled: boolean;
  readonly realCallEnabled: boolean;
  readonly host: string;
  readonly port: number;
  readonly secure: boolean;
  readonly fromName: string;
  readonly fromAddress: string;
  readonly username: string;
  readonly password: string;
  readonly timeoutMs: number;
};

type SmsProviderConfig = {
  readonly enabled: boolean;
  readonly realCallEnabled: boolean;
  readonly regionId: string;
  readonly endpoint: string;
  readonly signName: string;
  readonly templateCode: string;
  readonly accessKeyId: string;
  readonly accessKeySecret: string;
  readonly timeoutMs: number;
};

function isJsonRecord(value: JsonValue | null | undefined): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readString(
  record: JsonValue | null | undefined,
  key: string,
  fallback = "",
): string {
  if (!isJsonRecord(record)) {
    return fallback;
  }

  const value = record[key];
  if (typeof value !== "string") {
    return fallback;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : fallback;
}

function readBoolean(record: JsonValue | null | undefined, key: string, fallback = false): boolean {
  if (!isJsonRecord(record)) {
    return fallback;
  }

  const value = record[key];
  return typeof value === "boolean" ? value : fallback;
}

function readPositiveInteger(
  record: JsonValue | null | undefined,
  key: string,
  fallback: number,
): number {
  if (!isJsonRecord(record)) {
    return fallback;
  }

  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : fallback;
}

function resolveEmailConfig(record: ProviderConfigRecord | null): EmailProviderConfig {
  return {
    enabled: record?.enabled ?? false,
    realCallEnabled: readBoolean(record?.configJson, "realCallEnabled"),
    host: readString(record?.configJson, "host"),
    port: readPositiveInteger(record?.configJson, "port", 465),
    secure: readBoolean(record?.configJson, "secure", true),
    fromName: readString(record?.configJson, "fromName", "逐光天气"),
    fromAddress: readString(record?.configJson, "fromAddress"),
    username: readString(record?.secretJson, "username"),
    password: readString(record?.secretJson, "password"),
    timeoutMs: readPositiveInteger(record?.configJson, "timeoutMs", 10000),
  };
}

function resolveSmsConfig(record: ProviderConfigRecord | null): SmsProviderConfig {
  return {
    enabled: record?.enabled ?? false,
    realCallEnabled: readBoolean(record?.configJson, "realCallEnabled"),
    regionId: readString(record?.configJson, "regionId", "cn-hangzhou"),
    endpoint: readString(record?.configJson, "endpoint", "https://dysmsapi.aliyuncs.com"),
    signName: readString(record?.configJson, "signName"),
    templateCode: readString(record?.configJson, "templateCode"),
    accessKeyId: readString(record?.secretJson, "accessKeyId"),
    accessKeySecret: readString(record?.secretJson, "accessKeySecret"),
    timeoutMs: readPositiveInteger(record?.configJson, "timeoutMs", 10000),
  };
}

function emailConfigReady(config: EmailProviderConfig): boolean {
  return Boolean(
    config.enabled &&
      config.realCallEnabled &&
      config.host &&
      config.port &&
      config.fromAddress &&
      config.username &&
      config.password,
  );
}

function smsConfigReady(config: SmsProviderConfig): boolean {
  return Boolean(
    config.enabled &&
      config.realCallEnabled &&
      config.regionId &&
      config.signName &&
      config.templateCode &&
      config.accessKeyId &&
      config.accessKeySecret,
  );
}

function missingEmailConfigFields(config: EmailProviderConfig): readonly string[] {
  const missingFields: string[] = [];
  if (!config.enabled) {
    missingFields.push("启用该服务商");
  }
  if (!config.host) {
    missingFields.push("SMTP Host");
  }
  if (!config.port) {
    missingFields.push("SMTP 端口");
  }
  if (!config.fromAddress) {
    missingFields.push("发件邮箱");
  }
  if (!config.username) {
    missingFields.push("SMTP 用户名");
  }
  if (!config.password) {
    missingFields.push("SMTP 密码 / 授权码");
  }
  return missingFields;
}

function missingSmsConfigFields(config: SmsProviderConfig): readonly string[] {
  const missingFields: string[] = [];
  if (!config.enabled) {
    missingFields.push("启用该服务商");
  }
  if (!config.regionId) {
    missingFields.push("Region ID");
  }
  if (!config.signName) {
    missingFields.push("短信签名");
  }
  if (!config.templateCode) {
    missingFields.push("模板 Code");
  }
  if (!config.accessKeyId) {
    missingFields.push("AccessKey ID");
  }
  if (!config.accessKeySecret) {
    missingFields.push("AccessKey Secret");
  }
  return missingFields;
}

function missingVerificationConfigMessage(
  channel: AuthVerificationChannel,
  missingFields: readonly string[],
): string {
  const serviceName = channel === "email" ? "邮件服务" : "短信服务";
  const deliveryName = channel === "email" ? "真实邮件" : "真实短信";
  return `${serviceName}真实调用已开启，请补充：${missingFields.join("、")}。本次未发送${deliveryName}。`;
}

function isLocalMockMode(env: NodeJS.ProcessEnv): boolean {
  const mode = env.AUTH_VERIFICATION_SENDER_MODE?.trim().toLowerCase();
  if (mode === "real" || mode === "config_check") {
    return false;
  }

  return mode === "mock" || env.NODE_ENV !== "production";
}

function safeUnavailableMessage(channel: AuthVerificationChannel): string {
  return channel === "email" ? "邮件服务暂不可用，请稍后重试。" : "短信服务暂不可用，请稍后重试。";
}

function verificationPurposeTitle(purpose: AuthVerificationPurpose): string {
  if (purpose === "change_email") {
    return "换绑邮箱验证码";
  }
  if (purpose === "change_phone") {
    return "绑定手机验证码";
  }
  if (purpose === "delete_account") {
    return "注销账户确认验证码";
  }
  return "注册验证码";
}

function verificationPurposeIntro(purpose: AuthVerificationPurpose): string {
  if (purpose === "change_email") {
    return "你正在换绑逐光天气账户邮箱。";
  }
  if (purpose === "change_phone") {
    return "你正在绑定或更换逐光天气账户手机号。";
  }
  if (purpose === "delete_account") {
    return "你正在确认注销逐光天气账户。";
  }
  return "你正在注册逐光天气账户。";
}

function formatEmailHtml(input: Pick<VerificationSendInput, "purpose" | "code">): string {
  const title = verificationPurposeTitle(input.purpose);
  return [
    `<p>${verificationPurposeIntro(input.purpose)}</p>`,
    `<p>${title}：<strong>${input.code}</strong></p>`,
    "<p>验证码 10 分钟内有效，请勿转发给他人。</p>",
  ].join("");
}

export class MockVerificationSender implements VerificationSender {
  async send(input: VerificationSendInput): Promise<VerificationSenderResult> {
    return {
      success: true,
      channel: input.channel,
      providerCode: "mock",
      mode: "mock",
      messageZh: "验证码已在本地模拟发送。",
    };
  }
}

export class SmtpEmailVerificationSender implements VerificationSender {
  constructor(private readonly options: SenderOptions = {}) {}

  async send(input: VerificationSendInput): Promise<VerificationSenderResult> {
    const provider = await getRuntimeProviderConfig("email", "aliyun_smtp", {
      client: this.options.dbClient,
    });
    const config = resolveEmailConfig(provider);
    if (!emailConfigReady(config)) {
      return {
        success: false,
        channel: "email",
        providerCode: "aliyun_smtp",
        mode: "config_check",
        error: "email_provider_not_ready",
        messageZh: safeUnavailableMessage("email"),
      };
    }

    try {
      const dynamicImport = new Function("specifier", "return import(specifier)") as (
        specifier: string,
      ) => Promise<unknown>;
      const nodemailerModule = (await dynamicImport("nodemailer")) as {
        readonly default?: {
          readonly createTransport?: (config: unknown) => {
            readonly sendMail: (message: unknown) => Promise<unknown>;
          };
        };
        readonly createTransport?: (config: unknown) => {
          readonly sendMail: (message: unknown) => Promise<unknown>;
        };
      };
      const createTransport =
        nodemailerModule.createTransport ?? nodemailerModule.default?.createTransport;
      if (!createTransport) {
        throw new Error("nodemailer transport factory is unavailable.");
      }

      const transporter = createTransport({
        host: config.host,
        port: config.port,
        secure: config.secure,
        auth: {
          user: config.username,
          pass: config.password,
        },
        connectionTimeout: config.timeoutMs,
        greetingTimeout: config.timeoutMs,
        socketTimeout: config.timeoutMs,
      });

      await transporter.sendMail({
        from: `"${config.fromName}" <${config.fromAddress}>`,
        to: input.target,
        subject: `逐光天气${verificationPurposeTitle(input.purpose)}`,
        text: `${verificationPurposeIntro(input.purpose)}验证码为 ${input.code}，10 分钟内有效。`,
        html: formatEmailHtml(input),
      });

      return {
        success: true,
        channel: "email",
        providerCode: "aliyun_smtp",
        mode: "real",
        messageZh: "验证码已发送，请查收。",
      };
    } catch {
      return {
        success: false,
        channel: "email",
        providerCode: "aliyun_smtp",
        mode: "real",
        error: "email_send_failed",
        messageZh: safeUnavailableMessage("email"),
      };
    }
  }
}

function percentEncode(value: string): string {
  return encodeURIComponent(value)
    .replace(/!/g, "%21")
    .replace(/'/g, "%27")
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29")
    .replace(/\*/g, "%2A");
}

function aliyunTimestamp(now = new Date()): string {
  return now.toISOString().replace(/\.\d{3}Z$/, "Z");
}

function signAliyunQuery(params: Record<string, string>, accessKeySecret: string): string {
  const canonicalizedQuery = Object.keys(params)
    .sort()
    .map((key) => `${percentEncode(key)}=${percentEncode(params[key] ?? "")}`)
    .join("&");
  const stringToSign = `POST&%2F&${percentEncode(canonicalizedQuery)}`;

  return createHmac("sha1", `${accessKeySecret}&`).update(stringToSign).digest("base64");
}

type UnknownRecord = {
  readonly [key: string]: unknown;
};

type AliyunSmsDiagnostic = {
  readonly upstreamCode?: string;
  readonly upstreamMessageSanitized?: string;
  readonly upstreamRequestId?: string;
  readonly upstreamBizId?: string;
};

function isUnknownRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readResponseString(record: UnknownRecord, key: string): string | undefined {
  const value = record[key];
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed || undefined;
}

function sanitizeAliyunDiagnosticMessage(
  message: string | undefined,
  sensitiveValues: readonly string[],
): string | undefined {
  if (!message) {
    return undefined;
  }

  let sanitized = message.replace(/[\r\n\t]+/g, " ").trim();
  for (const sensitiveValue of sensitiveValues) {
    const trimmed = sensitiveValue.trim();
    if (trimmed) {
      sanitized = sanitized.split(trimmed).join("[redacted]");
    }
  }

  sanitized = sanitized
    .replace(
      /\b(AccessKeySecret|accessKeySecret|Authorization|authorization)\s*[:=]\s*[^&\s,;]+/g,
      "$1=[redacted]",
    )
    .replace(/\b(Signature)\s*[:=]\s*[^&\s,;]+/gi, "$1=[redacted]")
    .replace(/\b(TemplateParam)\s*[:=]\s*[^&\s,;]+/gi, "$1=[redacted]")
    .slice(0, 300)
    .trim();

  return sanitized || undefined;
}

async function parseAliyunSmsDiagnostic(
  response: Response,
  sensitiveValues: readonly string[],
): Promise<AliyunSmsDiagnostic> {
  const payload = await response.json().catch(() => null);
  if (!isUnknownRecord(payload)) {
    return {};
  }

  return {
    upstreamCode: readResponseString(payload, "Code"),
    upstreamMessageSanitized: sanitizeAliyunDiagnosticMessage(
      readResponseString(payload, "Message"),
      sensitiveValues,
    ),
    upstreamRequestId: readResponseString(payload, "RequestId"),
    upstreamBizId: readResponseString(payload, "BizId"),
  };
}

function logAliyunSmsFailure(diagnostic: AliyunSmsDiagnostic): void {
  console.warn(
    {
      providerCode: "aliyun_sms",
      error: "sms_send_failed",
      ...diagnostic,
    },
    "Aliyun SMS send failed",
  );
}

export class AliyunSmsVerificationSender implements VerificationSender {
  constructor(private readonly options: SenderOptions = {}) {}

  async send(input: VerificationSendInput): Promise<VerificationSenderResult> {
    const provider = await getRuntimeProviderConfig("sms", "aliyun_sms", {
      client: this.options.dbClient,
    });
    const config = resolveSmsConfig(provider);
    if (!smsConfigReady(config)) {
      return {
        success: false,
        channel: "sms",
        providerCode: "aliyun_sms",
        mode: "config_check",
        error: "sms_provider_not_ready",
        messageZh: safeUnavailableMessage("sms"),
      };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
    try {
      const params: Record<string, string> = {
        AccessKeyId: config.accessKeyId,
        Action: "SendSms",
        Format: "JSON",
        PhoneNumbers: input.target,
        RegionId: config.regionId,
        SignName: config.signName,
        SignatureMethod: "HMAC-SHA1",
        SignatureNonce: randomUUID(),
        SignatureVersion: "1.0",
        Timestamp: aliyunTimestamp(),
        Version: "2017-05-25",
        TemplateCode: config.templateCode,
        TemplateParam: JSON.stringify({ code: input.code }),
      };
      params.Signature = signAliyunQuery(params, config.accessKeySecret);
      const body = Object.entries(params)
        .map(([key, value]) => `${percentEncode(key)}=${percentEncode(value)}`)
        .join("&");
      const sensitiveDiagnosticValues = [
        config.accessKeyId,
        config.accessKeySecret,
        input.code,
        params.Signature,
        body,
      ];

      const response = await fetch(config.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
        signal: controller.signal,
      });
      const diagnostic = await parseAliyunSmsDiagnostic(response, sensitiveDiagnosticValues);

      if (response.ok && diagnostic.upstreamCode === "OK") {
        return {
          success: true,
          channel: "sms",
          providerCode: "aliyun_sms",
          mode: "real",
          messageZh: "验证码已发送，请查收。",
        };
      }

      logAliyunSmsFailure(diagnostic);
      return {
        success: false,
        channel: "sms",
        providerCode: "aliyun_sms",
        mode: "real",
        error: "sms_send_failed",
        messageZh: safeUnavailableMessage("sms"),
        ...diagnostic,
      };
    } catch (error) {
      console.warn(
        {
          providerCode: "aliyun_sms",
          error: "sms_send_failed",
          errorName: error instanceof Error ? error.name : typeof error,
        },
        "Aliyun SMS send failed",
      );
      return {
        success: false,
        channel: "sms",
        providerCode: "aliyun_sms",
        mode: "real",
        error: "sms_send_failed",
        messageZh: safeUnavailableMessage("sms"),
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function createVerificationSender(options: SenderOptions = {}): VerificationSender {
  const env = options.env ?? process.env;
  if (isLocalMockMode(env)) {
    return new MockVerificationSender();
  }

  return {
    send(input) {
      return input.channel === "email"
        ? new SmtpEmailVerificationSender(options).send(input)
        : new AliyunSmsVerificationSender(options).send(input);
    },
  };
}

export async function checkVerificationProviderConfig(input: {
  readonly channel: AuthVerificationChannel;
  readonly dbClient?: DatabaseClient;
}): Promise<VerificationSenderResult & { readonly configReady: boolean }> {
  if (input.channel === "email") {
    const provider = await getRuntimeProviderConfig("email", "aliyun_smtp", {
      client: input.dbClient,
    });
    const config = resolveEmailConfig(provider);
    if (!config.realCallEnabled) {
      return {
        success: true,
        channel: "email",
        providerCode: "aliyun_smtp",
        mode: "config_check",
        configReady: false,
        messageZh: "当前为模拟测试，未发送真实邮件/短信。",
      };
    }

    const configReady = emailConfigReady(config);
    const missingFields = missingEmailConfigFields(config);
    if (!configReady) {
      return {
        success: false,
        channel: "email",
        providerCode: "aliyun_smtp",
        mode: "config_check",
        configReady: false,
        error: "provider_config_missing",
        missingFields,
        messageZh: missingVerificationConfigMessage("email", missingFields),
      };
    }

    return {
      success: true,
      channel: "email",
      providerCode: "aliyun_smtp",
      mode: "config_check",
      configReady,
      messageZh: "邮件服务配置完整；本次未发送真实邮件。",
    };
  }

  const provider = await getRuntimeProviderConfig("sms", "aliyun_sms", {
    client: input.dbClient,
  });
  const config = resolveSmsConfig(provider);
  if (!config.realCallEnabled) {
    return {
      success: true,
      channel: "sms",
      providerCode: "aliyun_sms",
      mode: "config_check",
      configReady: false,
      messageZh: "当前为模拟测试，未发送真实邮件/短信。",
    };
  }

  const configReady = smsConfigReady(config);
  const missingFields = missingSmsConfigFields(config);
  if (!configReady) {
    return {
      success: false,
      channel: "sms",
      providerCode: "aliyun_sms",
      mode: "config_check",
      configReady: false,
      error: "provider_config_missing",
      missingFields,
      messageZh: missingVerificationConfigMessage("sms", missingFields),
    };
  }

  return {
    success: true,
    channel: "sms",
    providerCode: "aliyun_sms",
    mode: "config_check",
    configReady,
    messageZh:
      "短信服务配置完整；endpoint 留空时将使用默认阿里云短信地址。如需验证 AccessKey、签名和模板，请使用真实测试短信。",
  };
}
