import type { JsonValue, PaymentProviderCode } from "@photo-weather/db";
import {
  createNonce,
  decryptWechatResource,
  isPlainRecord,
  rsaSha256Sign,
  rsaSha256Verify,
  sanitizePaymentErrorMessage,
} from "./payment-security.js";
import type {
  PaymentCreateInput,
  PaymentCreateResult,
  PaymentNotificationInput,
  PaymentNotificationVerificationResult,
  PaymentProvider,
  WechatPayRuntimeConfig,
} from "./payment-provider.js";

type Fetcher = typeof fetch;
type WechatPayResolvedMode = "native" | "h5" | "jsapi";

const wechatJsapiUnsupportedMessage =
  "微信内浏览器支付需要 JSAPI 授权，当前请在系统浏览器打开或使用支付宝。";
const wechatH5RedirectMessage = "正在唤起微信支付...";

export function resolveWechatPayMode(
  clientMode: string | null | undefined,
  configuredMode: WechatPayRuntimeConfig["mode"],
): WechatPayResolvedMode {
  if (clientMode === "wechat_browser") {
    return "jsapi";
  }

  if (configuredMode !== "auto") {
    return configuredMode;
  }

  if (clientMode === "mobile_browser" || clientMode === "alipay_browser") {
    return "h5";
  }

  return "native";
}

export class WechatPayProvider implements PaymentProvider {
  readonly providerCode: PaymentProviderCode = "wechat_pay";

  constructor(
    private readonly config: WechatPayRuntimeConfig,
    private readonly fetcher: Fetcher = fetch,
  ) {}

  async createPayment(input: PaymentCreateInput): Promise<PaymentCreateResult> {
    if (!this.config.realCallEnabled) {
      return {
        provider: "wechat_pay",
        mode: this.config.mode,
        realCall: false,
        publicPayload: {
          kind: "mock",
          message: "微信支付处于配置检查模式，订单已创建为待支付，不会发放权益。",
        },
      };
    }

    const resolvedMode = resolveWechatPayMode(input.clientMode, this.config.mode);
    if (resolvedMode === "jsapi") {
      return {
        provider: "wechat_pay",
        mode: "jsapi",
        realCall: true,
        providerPayloadJson: {
          provider: "wechat_pay",
          configuredMode: this.config.mode,
          resolvedMode,
          clientMode: input.clientMode ?? null,
          transportMode: "wechat_jsapi_unsupported",
        },
        publicPayload: {
          kind: "mock",
          message: wechatJsapiUnsupportedMessage,
        },
      };
    }

    if (resolvedMode === "h5") {
      return this.createH5Payment(input);
    }

    return this.createNativePayment(input);
  }

  private async createNativePayment(input: PaymentCreateInput): Promise<PaymentCreateResult> {
    const path = "/v3/pay/transactions/native";
    const url = new URL(path, this.config.apiBaseUrl);
    const body = JSON.stringify({
      appid: this.config.appId,
      mchid: this.config.mchId,
      description: input.product.name,
      out_trade_no: input.order.orderNo,
      notify_url: this.config.notifyUrl,
      amount: {
        total: input.order.amountCents,
        currency: input.order.currency,
      },
    });
    const authorization = this.createAuthorizationHeader("POST", path, body);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);
    try {
      const response = await this.fetcher(url, {
        method: "POST",
        headers: {
          Accept: "application/json",
          Authorization: authorization,
          "Content-Type": "application/json",
        },
        body,
        signal: controller.signal,
      });
      const text = await response.text();
      const payload = text ? (JSON.parse(text) as unknown) : {};
      if (!response.ok || !isPlainRecord(payload) || typeof payload.code_url !== "string") {
        throw new Error(`WeChat Pay create payment failed with status ${response.status}.`);
      }

      return {
        provider: "wechat_pay",
        mode: "native",
        realCall: true,
        providerPayloadJson: {
          provider: "wechat_pay",
          configuredMode: this.config.mode,
          resolvedMode: "native",
          clientMode: input.clientMode ?? null,
          endpoint: path,
          transportMode: "wechat_native_qr",
          statusCode: response.status,
          codeUrl: payload.code_url,
        },
        publicPayload: {
          kind: "qr_code",
          codeUrl: payload.code_url,
          message: "请使用微信扫码完成支付。",
        },
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  private async createH5Payment(input: PaymentCreateInput): Promise<PaymentCreateResult> {
    const path = "/v3/pay/transactions/h5";
    const url = new URL(path, this.config.apiBaseUrl);
    const appUrl = this.resolveSiteBaseUrl(input);
    const body = JSON.stringify({
      appid: this.config.appId,
      mchid: this.config.mchId,
      description: input.product.name,
      out_trade_no: input.order.orderNo,
      notify_url: this.config.notifyUrl,
      amount: {
        total: input.order.amountCents,
        currency: input.order.currency,
      },
      scene_info: {
        payer_client_ip: input.clientIp || "127.0.0.1",
        h5_info: {
          type: "Wap",
          app_name: "逐光天气",
          app_url: appUrl,
        },
      },
    });
    const authorization = this.createAuthorizationHeader("POST", path, body);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);
    try {
      const response = await this.fetcher(url, {
        method: "POST",
        headers: {
          Accept: "application/json",
          Authorization: authorization,
          "Content-Type": "application/json",
        },
        body,
        signal: controller.signal,
      });
      const text = await response.text();
      const payload = text ? (JSON.parse(text) as unknown) : {};
      if (!response.ok || !isPlainRecord(payload) || typeof payload.mweb_url !== "string") {
        throw new Error(`WeChat Pay create H5 payment failed with status ${response.status}.`);
      }

      return {
        provider: "wechat_pay",
        mode: "h5",
        realCall: true,
        providerPayloadJson: {
          provider: "wechat_pay",
          configuredMode: this.config.mode,
          resolvedMode: "h5",
          clientMode: input.clientMode ?? null,
          endpoint: path,
          transportMode: "wechat_h5_redirect",
          statusCode: response.status,
          appUrlHost: hostOf(appUrl),
          mwebUrlHost: hostOf(payload.mweb_url),
        },
        publicPayload: {
          kind: "redirect_url",
          redirectUrl: payload.mweb_url,
          message: wechatH5RedirectMessage,
        },
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  async verifyNotification(
    input: PaymentNotificationInput,
  ): Promise<PaymentNotificationVerificationResult> {
    let body: unknown;
    try {
      body = JSON.parse(input.rawBody);
    } catch {
      return {
        ok: false,
        error: "invalid_json",
        safeMessage: "微信支付通知格式无效。",
      };
    }

    if (!this.verifyWechatSignature(input)) {
      return {
        ok: false,
        error: "invalid_signature",
        safeMessage: "微信支付通知签名验证失败。",
        rawJson: body as JsonValue,
      };
    }

    try {
      const resource = this.extractResource(body);
      const tradeState =
        typeof resource.trade_state === "string" ? resource.trade_state.toUpperCase() : "";
      const orderNo = typeof resource.out_trade_no === "string" ? resource.out_trade_no : "";
      const providerTradeNo =
        typeof resource.transaction_id === "string" ? resource.transaction_id : null;
      const amount = isPlainRecord(resource.amount) ? resource.amount : {};
      const amountCents =
        typeof amount.payer_total === "number"
          ? amount.payer_total
          : typeof amount.total === "number"
            ? amount.total
            : null;

      if (!orderNo || typeof amountCents !== "number" || !Number.isInteger(amountCents)) {
        return {
          ok: false,
          error: "invalid_notification",
          safeMessage: "微信支付通知缺少订单号或金额。",
          rawJson: resource as JsonValue,
        };
      }

      return {
        ok: true,
        parsed: {
          orderNo,
          providerTradeNo,
          amountCents,
          status: tradeState === "SUCCESS" ? "paid" : "ignored",
          rawJson: resource as JsonValue,
        },
      };
    } catch (error) {
      return {
        ok: false,
        error: "notification_parse_failed",
        safeMessage: sanitizePaymentErrorMessage(error, "微信支付通知解析失败。"),
        rawJson: body as JsonValue,
      };
    }
  }

  private createAuthorizationHeader(method: string, path: string, body: string): string {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonce = createNonce(16);
    const signatureSource = `${method}\n${path}\n${timestamp}\n${nonce}\n${body}\n`;
    const signature = rsaSha256Sign(signatureSource, this.config.merchantPrivateKeyPem);
    return [
      "WECHATPAY2-SHA256-RSA2048",
      `mchid="${this.config.mchId}"`,
      `nonce_str="${nonce}"`,
      `timestamp="${timestamp}"`,
      `serial_no="${this.config.merchantSerialNo}"`,
      `signature="${signature}"`,
    ].join(" ");
  }

  private resolveSiteBaseUrl(input: PaymentCreateInput): string {
    const base = this.config.returnUrl || this.config.notifyUrl;
    const candidate = input.returnUrl || this.config.returnUrl || this.config.notifyUrl;
    try {
      return new URL(candidate, base).origin;
    } catch {
      return new URL(this.config.notifyUrl).origin;
    }
  }

  private verifyWechatSignature(input: PaymentNotificationInput): boolean {
    const timestamp = input.headers["wechatpay-timestamp"];
    const nonce = input.headers["wechatpay-nonce"];
    const signature = input.headers["wechatpay-signature"];
    const publicKey = this.config.platformPublicKeyPem || this.config.platformCertificatePem;
    if (!timestamp || !nonce || !signature || !publicKey) {
      return false;
    }

    const message = `${timestamp}\n${nonce}\n${input.rawBody}\n`;
    try {
      return rsaSha256Verify(message, signature, publicKey);
    } catch {
      return false;
    }
  }

  private extractResource(body: unknown): Record<string, unknown> {
    if (!isPlainRecord(body)) {
      throw new Error("WeChat Pay notification body is not an object.");
    }
    const resource = body.resource;
    if (!isPlainRecord(resource)) {
      throw new Error("WeChat Pay notification resource is missing.");
    }

    if (typeof resource.ciphertext !== "string") {
      return resource;
    }

    const plaintext = decryptWechatResource({
      apiV3Key: this.config.apiV3Key,
      nonce: typeof resource.nonce === "string" ? resource.nonce : "",
      associatedData:
        typeof resource.associated_data === "string" ? resource.associated_data : undefined,
      ciphertext: resource.ciphertext,
    });
    const parsed = JSON.parse(plaintext) as unknown;
    if (!isPlainRecord(parsed)) {
      throw new Error("WeChat Pay decrypted resource is not an object.");
    }
    return parsed;
  }
}

function hostOf(value: string): string {
  try {
    return new URL(value).host;
  } catch {
    return "invalid";
  }
}
