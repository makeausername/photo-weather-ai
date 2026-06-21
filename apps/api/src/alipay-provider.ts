import type { JsonValue, PaymentProviderCode } from "@photo-weather/db";
import {
  alipayCanonicalString,
  amountCentsToDecimalString,
  decimalAmountToCents,
  parseFormUrlEncodedBody,
  rsaSha256Sign,
  rsaSha256Verify,
} from "./payment-security.js";
import type {
  AlipayRuntimeConfig,
  PaymentCreateInput,
  PaymentCreateResult,
  PaymentNotificationInput,
  PaymentNotificationVerificationResult,
  PaymentProvider,
} from "./payment-provider.js";

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

    const params = this.createRequestParams(input);
    const canonical = alipayCanonicalString(params);
    const signature = rsaSha256Sign(canonical, this.config.appPrivateKeyPem);
    params.set("sign", signature);

    const redirectUrl = `${this.config.gatewayUrl}?${new URLSearchParams(
      [...params.entries()],
    ).toString()}`;
    return {
      provider: "alipay",
      mode: this.config.mode,
      realCall: true,
      providerPayloadJson: {
        gatewayUrl: this.config.gatewayUrl,
        method: params.get("method") ?? "",
      },
      publicPayload: {
        kind: "redirect_url",
        redirectUrl,
        message: "请跳转到支付宝完成支付。",
      },
    };
  }

  async verifyNotification(
    input: PaymentNotificationInput,
  ): Promise<PaymentNotificationVerificationResult> {
    const params = parseFormUrlEncodedBody(input.rawBody);
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
      if (!rsaSha256Verify(canonical, signature, this.config.alipayPublicKeyPem)) {
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
          tradeStatus === "TRADE_SUCCESS" || tradeStatus === "TRADE_FINISHED"
            ? "paid"
            : "ignored",
        rawJson,
      },
    };
  }

  private createRequestParams(input: PaymentCreateInput): Map<string, string> {
    const params = new Map<string, string>();
    params.set("app_id", this.config.appId);
    params.set(
      "method",
      this.config.mode === "wap" ? "alipay.trade.wap.pay" : "alipay.trade.page.pay",
    );
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
        subject: input.product.name,
        product_code:
          this.config.mode === "wap" ? "QUICK_WAP_WAY" : "FAST_INSTANT_TRADE_PAY",
      }),
    );
    return params;
  }
}

function formatAlipayTimestamp(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}
