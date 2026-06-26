import type { JsonValue, PaymentProviderCode } from "@photo-weather/db";
import {
  alipayCanonicalString,
  alipayRequestSignContent,
  amountCentsToDecimalString,
  decimalAmountToCents,
  rsaSha256Sign,
  rsaSha256Verify,
} from "./payment-security.js";
import { parseAlipayFormUrlEncodedBody } from "./alipay-encoding.js";
import type {
  AlipayRuntimeConfig,
  PaymentCreateInput,
  PaymentCreateResult,
  PaymentNotificationInput,
  PaymentNotificationVerificationResult,
  PaymentProvider,
} from "./payment-provider.js";

export type AlipayPagePayRequest = {
  readonly charset: AlipayRuntimeConfig["charset"];
  readonly fields: Record<string, string>;
  readonly gatewayUrl: string;
  readonly method: "POST";
  readonly safeDiagnostics: JsonValue;
};

export class AlipayProvider implements PaymentProvider {
  readonly providerCode: PaymentProviderCode = "alipay";

  constructor(private readonly config: AlipayRuntimeConfig) {}

  async createPayment(input: PaymentCreateInput): Promise<PaymentCreateResult> {
    if (!this.config.realCallEnabled) {
      return {
        provider: "alipay",
        mode: this.config.mode,
        realCall: false,
        publicPayload: {
          kind: "mock",
          message: "支付宝处于配置检查模式，订单已创建为待支付，不会发放权益。",
        },
      };
    }

    const pagePayRequest = this.createPagePayRequest(input);
    return {
      provider: "alipay",
      mode: this.config.mode,
      realCall: true,
      providerPayloadJson: pagePayRequest.safeDiagnostics,
      publicPayload: {
        kind: "form_post",
        actionUrl: "/billing/alipay/page-pay",
        method: "POST",
        charset: this.config.charset,
        fields: {
          orderNo: input.order.orderNo,
        },
        message: "请跳转到支付宝完成支付。",
      },
    };
  }

  createPagePayRequest(input: PaymentCreateInput): AlipayPagePayRequest {
    const request = this.createRequestParams(input);
    const signContent = alipayRequestSignContent(request.params);
    const signature = rsaSha256Sign(signContent, this.config.appPrivateKeyPem, this.config.charset);
    request.params.set("sign", signature);

    return {
      charset: this.config.charset,
      fields: Object.fromEntries(request.params.entries()),
      gatewayUrl: this.config.gatewayUrl,
      method: "POST",
      safeDiagnostics: {
        provider: "alipay",
        method: request.method,
        productCode: request.productCode,
        mode: this.config.mode,
        orderNo: input.order.orderNo,
        gatewayHost: gatewayHostOf(this.config.gatewayUrl),
        charset: this.config.charset,
        signType: this.config.signType,
        transportMode: "server_post_form",
        subjectLength: request.subject.length,
        subjectPreview: request.subject.slice(0, 8),
        signContentIncludesSignType: signContent.includes("sign_type=RSA2"),
      },
    };
  }

  async verifyNotification(
    input: PaymentNotificationInput,
  ): Promise<PaymentNotificationVerificationResult> {
    const { params } = parseAlipayFormUrlEncodedBody({
      rawBody: input.rawBody,
      rawBodyBytes: input.rawBodyBytes,
      headers: input.headers,
      fallbackCharset: this.config.charset,
    });
    const rawJson = Object.fromEntries(params.entries()) as JsonValue;
    const signature = params.get("sign") ?? "";
    const canonical = alipayCanonicalString(params);
    if (!signature || !this.config.alipayPublicKeyPem) {
      return {
        ok: false,
        error: "missing_signature",
        safeMessage: "支付宝通知缺少签名。",
        rawJson,
      };
    }

    try {
      if (
        !rsaSha256Verify(
          canonical,
          signature,
          this.config.alipayPublicKeyPem,
          params.get("charset") ?? this.config.charset,
        )
      ) {
        return {
          ok: false,
          error: "invalid_signature",
          safeMessage: "支付宝通知签名验证失败。",
          rawJson,
        };
      }
    } catch {
      return {
        ok: false,
        error: "invalid_signature",
        safeMessage: "支付宝通知签名验证失败。",
        rawJson,
      };
    }

    if (params.get("app_id") !== this.config.appId) {
      return {
        ok: false,
        error: "app_id_mismatch",
        safeMessage: "支付宝通知应用 ID 不匹配。",
        rawJson,
      };
    }

    if (this.config.sellerId) {
      const sellerId = params.get("seller_id") ?? params.get("seller_email") ?? "";
      if (sellerId !== this.config.sellerId) {
        return {
          ok: false,
          error: "seller_mismatch",
          safeMessage: "支付宝通知商户身份不匹配。",
          rawJson,
        };
      }
    }

    const orderNo = params.get("out_trade_no") ?? "";
    const providerTradeNo = params.get("trade_no") ?? null;
    const totalAmount = params.get("total_amount") ?? "";
    if (!orderNo || !totalAmount) {
      return {
        ok: false,
        error: "invalid_notification",
        safeMessage: "支付宝通知缺少订单号或金额。",
        rawJson,
      };
    }

    const tradeStatus = (params.get("trade_status") ?? "").toUpperCase();
    return {
      ok: true,
      parsed: {
        orderNo,
        providerTradeNo,
        amountCents: decimalAmountToCents(totalAmount),
        status:
          tradeStatus === "TRADE_SUCCESS" || tradeStatus === "TRADE_FINISHED" ? "paid" : "ignored",
        rawJson,
      },
    };
  }

  private createRequestParams(input: PaymentCreateInput): {
    readonly method: string;
    readonly params: Map<string, string>;
    readonly productCode: string;
    readonly subject: string;
  } {
    const params = new Map<string, string>();
    const method = this.config.mode === "wap" ? "alipay.trade.wap.pay" : "alipay.trade.page.pay";
    const productCode = this.config.mode === "wap" ? "QUICK_WAP_WAY" : "FAST_INSTANT_TRADE_PAY";
    const subject = this.getProductSubject(input.product);
    params.set("app_id", this.config.appId);
    params.set("method", method);
    params.set("format", "JSON");
    params.set("charset", this.config.charset);
    params.set("sign_type", this.config.signType);
    params.set("timestamp", formatAlipayTimestamp(new Date()));
    params.set("version", "1.0");
    params.set("notify_url", this.config.notifyUrl);
    params.set("return_url", input.returnUrl || this.config.returnUrl);
    params.set(
      "biz_content",
      JSON.stringify({
        out_trade_no: input.order.orderNo,
        total_amount: amountCentsToDecimalString(input.order.amountCents),
        subject,
        body: this.getProductBody(),
        product_code: productCode,
      }),
    );
    return { method, params, productCode, subject };
  }

  private getProductSubject(product: PaymentCreateInput["product"]): string {
    if (this.config.forceAsciiSubject) {
      return `Photo Weather ${product.code}`;
    }

    return product.name;
  }

  private getProductBody(): string {
    return this.config.forceAsciiSubject ? "Photo Weather membership plan" : "逐光天气会员套餐";
  }
}

function formatAlipayTimestamp(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function gatewayHostOf(value: string): string {
  try {
    return new URL(value).host;
  } catch {
    return "invalid";
  }
}
