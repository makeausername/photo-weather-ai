import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { CheckoutPayloadView } from "../../components/billing-checkout-payload-view";
import type { BillingPaymentProvider, PublicBillingProduct } from "../../components/account-session";
import {
  CheckoutClient,
  CheckoutPaymentMethods,
  checkoutClientLabels,
  checkoutPathForProduct,
  isCheckoutProductCode,
} from "./checkout-client";

vi.mock("next/navigation", () => ({
  usePathname: () => "/checkout",
}));

const testGlobal = globalThis as typeof globalThis & { React: typeof React };
testGlobal.React = React;

const __dirname = dirname(fileURLToPath(import.meta.url));
const checkoutClientSource = readFileSync(resolve(__dirname, "checkout-client.tsx"), "utf8");
const payloadViewSource = readFileSync(
  resolve(__dirname, "../../components/billing-checkout-payload-view.tsx"),
  "utf8",
);

const products: readonly PublicBillingProduct[] = [
  {
    code: "monthly_full",
    name: "月卡",
    description: "开通后 30 天内查看完整摄影判断。",
    amountCents: 2100,
    currency: "CNY",
    priceText: "¥21.00",
    durationDays: 30,
    durationText: "30 天",
    recommended: false,
    badgeText: null,
    featureBullets: ["未来多日完整摄影判断"],
    sortOrder: 10,
  },
  {
    code: "quarterly_full",
    name: "季卡",
    description: "开通后 90 天内查看完整摄影判断。",
    amountCents: 5600,
    currency: "CNY",
    priceText: "¥56.00",
    durationDays: 90,
    durationText: "90 天",
    recommended: true,
    badgeText: "推荐",
    featureBullets: ["未来多日完整摄影判断"],
    sortOrder: 20,
  },
  {
    code: "yearly_full",
    name: "年卡",
    description: "开通后 365 天内查看完整摄影判断。",
    amountCents: 18800,
    currency: "CNY",
    priceText: "¥188.00",
    durationDays: 365,
    durationText: "365 天",
    recommended: false,
    badgeText: null,
    featureBullets: ["全年完整摄影判断"],
    sortOrder: 30,
  },
];

type ClickableElement = React.ReactElement<{
  readonly children?: React.ReactNode;
  readonly disabled?: boolean;
  readonly onClick?: () => void;
}>;

function nodeText(value: React.ReactNode): string {
  if (value === null || value === undefined || typeof value === "boolean") {
    return "";
  }
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => nodeText(item)).join("");
  }
  if (React.isValidElement<{ readonly children?: React.ReactNode }>(value)) {
    return nodeText(value.props.children);
  }
  return "";
}

function collectClickableElements(
  value: React.ReactNode,
  result: ClickableElement[] = [],
): ClickableElement[] {
  if (Array.isArray(value)) {
    value.forEach((item) => collectClickableElements(item, result));
    return result;
  }
  if (
    React.isValidElement<{ readonly children?: React.ReactNode; readonly onClick?: () => void }>(
      value,
    )
  ) {
    if (typeof value.props.onClick === "function") {
      result.push(value as ClickableElement);
    }
    collectClickableElements(value.props.children, result);
  }
  return result;
}

function findClickableByText(value: React.ReactNode, text: string): ClickableElement {
  const element = collectClickableElements(value).find((item) =>
    nodeText(item.props.children).includes(text),
  );
  if (!element) {
    throw new Error(`Expected clickable element containing ${text}`);
  }
  return element;
}

describe("checkout cashier client", () => {
  it("validates route product codes before showing payment actions", () => {
    const html = renderToStaticMarkup(
      React.createElement(CheckoutClient, {
        initialLoggedIn: true,
        initialProducts: products,
        productCode: "trial_7_days",
      }),
    );

    expect(isCheckoutProductCode("monthly_full")).toBe(true);
    expect(isCheckoutProductCode("trial_7_days")).toBe(false);
    expect(html).toContain("无法继续支付");
    expect(html).toContain("返回定价");
    expect(html).not.toContain("支付宝支付");
    expect(html).not.toContain("微信支付");
    expect(html).not.toContain("创建订单");
  });

  it("renders selected plan summary and primary payment buttons before payment payload", () => {
    const html = renderToStaticMarkup(
      React.createElement(CheckoutClient, {
        initialLoggedIn: true,
        initialProducts: products,
        productCode: "monthly_full",
      }),
    );

    expect(checkoutClientLabels).toEqual([
      "确认支付",
      "选择支付方式",
      "支付宝支付",
      "微信支付",
      "正在唤起支付...",
      "正在跳转支付宝收银台...",
      "支付完成后，会员权益自动生效。",
      "返回定价",
    ]);
    expect(html).toContain("确认支付");
    expect(html).toContain("月卡");
    expect(html).toContain("¥21.00");
    expect(html).toContain("30 天");
    expect(html).toContain("选择支付方式");
    expect(html).toContain("支付宝支付");
    expect(html).toContain("微信支付");
    expect(html).toContain('data-checkout-payment-methods="primary"');
    expect(html).not.toContain("创建订单");
    expect(checkoutClientSource.indexOf("<CheckoutPaymentMethods")).toBeLessThan(
      checkoutClientSource.indexOf("<PaymentActionPanel"),
    );
  });

  it("renders a logged-out prompt with returnTo back to the selected cashier route", () => {
    const html = renderToStaticMarkup(
      React.createElement(CheckoutClient, {
        initialLoggedIn: false,
        initialProducts: products,
        productCode: "quarterly_full",
      }),
    );

    expect(html).toContain("请先登录后继续支付");
    expect(html).toContain('href="/login?returnTo=%2Fcheckout%3Fproduct%3Dquarterly_full"');
    expect(html).toContain('href="/register?returnTo=%2Fcheckout%3Fproduct%3Dquarterly_full"');
    expect(html).not.toContain("支付宝支付");
    expect(html).not.toContain("微信支付");
  });

  it("wires payment buttons to the selected provider and disables duplicates while submitting", () => {
    const providers: BillingPaymentProvider[] = [];
    const paymentMethods = CheckoutPaymentMethods({
      selectedProduct: products[0] ?? null,
      submittingProvider: null,
      onProviderPayment: (provider) => providers.push(provider),
    });

    findClickableByText(paymentMethods, "支付宝支付").props.onClick?.();
    findClickableByText(paymentMethods, "微信支付").props.onClick?.();

    expect(providers).toEqual(["alipay", "wechat_pay"]);
    expect(checkoutClientSource).toContain(
      "createBillingOrder({ productCode, provider: nextProvider })",
    );
    expect(checkoutClientSource).toMatch(/if \(checkoutSubmissionRef\.current\) \{\s*return;\s*\}/);
    expect(checkoutClientSource).toContain("checkoutSubmissionRef.current = true");
    expect(checkoutClientSource).toContain("checkoutSubmissionRef.current = false");

    const disabledMethods = CheckoutPaymentMethods({
      selectedProduct: products[0] ?? null,
      submittingProvider: "alipay",
      onProviderPayment: () => undefined,
    });
    const buttons = collectClickableElements(disabledMethods);
    expect(buttons).toHaveLength(2);
    expect(buttons.every((button) => button.props.disabled === true)).toBe(true);
    expect(nodeText(buttons[0]?.props.children)).toBe("正在唤起支付...");
  });

  it("renders Alipay form_post as an auto-submitting POST form with a fallback button", () => {
    const html = renderToStaticMarkup(
      React.createElement(CheckoutPayloadView, {
        autoSubmit: true,
        checkout: {
          kind: "form_post",
          actionUrl: "http://localhost:4000/billing/alipay/page-pay",
          method: "POST",
          charset: "GBK",
          message: "请跳转到支付宝完成支付。",
          fields: {
            orderNo: "P1000",
            checkoutToken: "signed-checkout-proof",
          },
        },
      }),
    );

    expect(html).toContain('action="http://localhost:4000/billing/alipay/page-pay"');
    expect(html).toContain('method="POST"');
    expect(html).toContain('accept-charset="GBK"');
    expect(html).toContain('type="hidden"');
    expect(html).toContain('name="checkoutToken"');
    expect(html).toContain("正在跳转支付宝收银台...");
    expect(html).toContain("继续前往支付宝");
    expect(html).not.toContain("form_post");
    expect(payloadViewSource).toContain("formRef.current?.submit()");
    expect(payloadViewSource).not.toContain("dangerouslySetInnerHTML");
  });

  it("renders WeChat QR mode without faking H5 or JSAPI behavior", () => {
    const html = renderToStaticMarkup(
      React.createElement(CheckoutPayloadView, {
        checkout: {
          kind: "qr_code",
          codeUrl: "weixin://wxpay/bizpayurl?pr=abc",
          message: "请使用微信扫码完成支付。",
        },
      }),
    );

    expect(html).toContain("微信扫码支付");
    expect(html).toContain("weixin://wxpay/bizpayurl?pr=abc");
    expect(html).toContain("当前微信支付为扫码模式，手机端可使用另一台设备扫码，或返回选择支付宝。");
    expect(checkoutClientSource).not.toContain("WeChat H5");
    expect(checkoutClientSource).not.toContain("JSAPI");
  });

  it("shows a friendly payment-return notice and account link", () => {
    const html = renderToStaticMarkup(
      React.createElement(CheckoutClient, {
        initialLoggedIn: true,
        initialProducts: products,
        paymentReturn: "alipay",
        productCode: "yearly_full",
      }),
    );

    expect(html).toContain("如果已经完成支付，权益会在稍后自动生效。");
    expect(html).toContain('href="/account"');
  });

  it("keeps checkout route helpers aligned with the route contract", () => {
    expect(checkoutPathForProduct("monthly_full")).toBe("/checkout?product=monthly_full");
    expect(checkoutPathForProduct("quarterly_full")).toBe("/checkout?product=quarterly_full");
    expect(checkoutPathForProduct("yearly_full")).toBe("/checkout?product=yearly_full");
  });
});
