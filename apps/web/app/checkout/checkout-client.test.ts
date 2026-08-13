import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { CheckoutPayloadView } from "../../components/billing-checkout-payload-view";
import type {
  BillingPaymentProvider,
  PublicBillingPaymentMethod,
  PublicBillingProduct,
} from "../../components/account-session";
import {
  CheckoutClient,
  CheckoutPaymentMethods,
  checkoutClientLabels,
  checkoutPathForProduct,
  checkoutReturnPathForProvider,
  detectPaymentClientMode,
  isCheckoutProductCode,
  paymentReturnStatusMessage,
} from "./checkout-client";

const checkoutRouterReplaceMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  usePathname: () => "/checkout",
  useRouter: () => ({
    replace: checkoutRouterReplaceMock,
  }),
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

const paymentMethods: readonly PublicBillingPaymentMethod[] = [
  {
    provider: "alipay",
    label: "支付宝支付",
    enabled: true,
    ready: true,
    recommended: true,
  },
  {
    provider: "wechat_pay",
    label: "微信支付",
    enabled: true,
    ready: true,
    recommended: false,
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
        initialPaymentMethods: paymentMethods,
        initialProducts: products,
        productCode: "monthly_full",
      }),
    );

    expect(checkoutClientLabels).toEqual([
      "确认支付",
      "选择支付方式",
      "支付宝支付",
      "微信扫码支付",
      "打开支付宝支付",
      "打开微信支付",
      "正在唤起支付宝...",
      "正在唤起微信支付...",
      "正在生成二维码...",
      "支付完成后，会员权益自动生效。",
      "已从支付宝返回。如果已经完成支付，权益会在稍后自动生效。",
      "支付成功，会员权益已生效。",
      "支付结果同步中，请稍后刷新或查看账户权益。",
      "支付未完成，请重新选择支付方式。",
      "返回定价",
      "当前暂未开放在线支付，请稍后再试。",
      "查看账户权益",
    ]);
    expect(html).toContain("确认支付");
    expect(html).toContain("月卡");
    expect(html).toContain("¥21.00");
    expect(html).toContain("30 天");
    expect(html).toContain("选择支付方式");
    expect(html).toContain("支付宝支付");
    expect(html).toContain("微信扫码支付");
    expect(html).toContain('data-checkout-payment-methods="primary"');
    expect(html).not.toContain("创建订单");
    expect(checkoutClientSource).toContain("grid gap-2 sm:flex sm:flex-wrap");
    expect(checkoutClientSource).toContain("min-w-0 text-sm font-semibold leading-6");
    expect(checkoutClientSource).toContain(
      "w-full items-center justify-center rounded-lg border border-border bg-card px-3",
    );
    expect(checkoutClientSource).toContain("sm:w-auto");
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
    expect(html).not.toContain("微信扫码支付");
  });

  it("renders only the public-ready payment methods returned by the backend", () => {
    const alipayOnlyMethods = paymentMethods.filter((method) => method.provider === "alipay");
    const html = renderToStaticMarkup(
      React.createElement(CheckoutClient, {
        initialLoggedIn: true,
        initialPaymentMethods: alipayOnlyMethods,
        initialProducts: products,
        productCode: "monthly_full",
      }),
    );

    expect(html).toContain("选择支付方式");
    expect(html).toContain("支付宝支付");
    expect(html).not.toContain("微信扫码支付");
    expect(html).not.toContain("打开微信支付");
  });

  it("shows pricing and account actions when no public payment method is available", () => {
    const html = renderToStaticMarkup(
      React.createElement(CheckoutClient, {
        initialLoggedIn: true,
        initialPaymentMethods: [],
        initialProducts: products,
        productCode: "monthly_full",
      }),
    );

    expect(html).toContain("当前暂未开放在线支付，请稍后再试。");
    expect(html).toContain('href="/pricing"');
    expect(html).toContain("返回定价");
    expect(html).toContain('href="/account"');
    expect(html).toContain("查看账户权益");
    expect(html).not.toContain("支付宝支付");
    expect(html).not.toContain("微信扫码支付");
  });

  it("detects desktop, mobile, WeChat, and Alipay browser payment modes", () => {
    expect(detectPaymentClientMode({ userAgent: "Mozilla/5.0", viewportWidth: 1280 })).toBe(
      "desktop",
    );
    expect(
      detectPaymentClientMode({
        userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) Mobile",
        maxTouchPoints: 5,
        viewportWidth: 390,
        viewportHeight: 844,
      }),
    ).toBe("mobile_browser");
    expect(
      detectPaymentClientMode({
        userAgent: "Mozilla/5.0 MicroMessenger/8.0.48 Mobile",
        viewportWidth: 390,
      }),
    ).toBe("wechat_browser");
    expect(
      detectPaymentClientMode({
        userAgent: "Mozilla/5.0 AlipayClient/10.5.0 Mobile",
        viewportWidth: 390,
      }),
    ).toBe("alipay_browser");
  });

  it("wires payment buttons to the selected provider and disables duplicates while submitting", () => {
    const providers: BillingPaymentProvider[] = [];
    const renderedMethods = CheckoutPaymentMethods({
      clientMode: "desktop",
      paymentMethods,
      paymentMethodsState: "ready",
      selectedProduct: products[0] ?? null,
      submittingProvider: null,
      onProviderPayment: (provider) => providers.push(provider),
    });

    findClickableByText(renderedMethods, "支付宝支付").props.onClick?.();
    findClickableByText(renderedMethods, "微信扫码支付").props.onClick?.();

    expect(providers).toEqual(["alipay", "wechat_pay"]);
    expect(checkoutClientSource).toContain(
      "createBillingOrder({\n        productCode,\n        provider: nextProvider,\n        clientMode: nextClientMode,\n        returnUrl,\n      })",
    );
    expect(checkoutClientSource).toContain(
      "checkoutReturnPathForProvider(productCode, nextProvider)",
    );
    expect(checkoutClientSource).toMatch(/if \(checkoutSubmissionRef\.current\) \{\s*return;\s*\}/);
    expect(checkoutClientSource).toContain("checkoutSubmissionRef.current = true");
    expect(checkoutClientSource).toContain("checkoutSubmissionRef.current = false");

    const disabledMethods = CheckoutPaymentMethods({
      clientMode: "desktop",
      paymentMethods,
      paymentMethodsState: "ready",
      selectedProduct: products[0] ?? null,
      submittingProvider: "alipay",
      onProviderPayment: () => undefined,
    });
    const buttons = collectClickableElements(disabledMethods);
    expect(buttons).toHaveLength(2);
    expect(buttons.every((button) => button.props.disabled === true)).toBe(true);
    expect(nodeText(buttons[0]?.props.children)).toBe("正在跳转支付宝...");

    const mobileMethods = CheckoutPaymentMethods({
      clientMode: "mobile_browser",
      paymentMethods,
      paymentMethodsState: "ready",
      selectedProduct: products[0] ?? null,
      submittingProvider: null,
      onProviderPayment: () => undefined,
    });
    expect(nodeText(collectClickableElements(mobileMethods)[0]?.props.children)).toBe(
      "打开支付宝支付",
    );
    expect(nodeText(collectClickableElements(mobileMethods)[1]?.props.children)).toBe(
      "打开微信支付",
    );
  });

  it("does not render a clickable control for unavailable payment providers", () => {
    const providers: BillingPaymentProvider[] = [];
    const alipayOnlyMethods = paymentMethods.filter((method) => method.provider === "alipay");
    const renderedMethods = CheckoutPaymentMethods({
      clientMode: "desktop",
      paymentMethods: alipayOnlyMethods,
      paymentMethodsState: "ready",
      selectedProduct: products[0] ?? null,
      submittingProvider: null,
      onProviderPayment: (provider) => providers.push(provider),
    });
    const buttons = collectClickableElements(renderedMethods);

    expect(buttons).toHaveLength(1);
    findClickableByText(renderedMethods, "支付宝支付").props.onClick?.();
    expect(() => findClickableByText(renderedMethods, "微信扫码支付")).toThrow(
      "Expected clickable element containing 微信扫码支付",
    );
    expect(providers).toEqual(["alipay"]);
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

  it("renders WeChat QR mode as a real QR image with a small raw-link fallback", () => {
    const html = renderToStaticMarkup(
      React.createElement(CheckoutPayloadView, {
        checkout: {
          kind: "qr_code",
          codeUrl: "weixin://wxpay/bizpayurl?pr=abc",
          message: "请使用微信扫码完成支付。",
        },
      }),
    );

    expect(html).toContain("请使用微信扫码支付");
    expect(html).toContain('data-qr-code-image="wechat-native"');
    expect(html).toContain('src="data:image/svg+xml');
    expect(html).toContain("weixin://wxpay/bizpayurl?pr=abc");
    expect(html).toContain("当前为扫码模式，建议在电脑端打开，或返回选择支付宝。");
    expect(payloadViewSource).toContain("min-w-0 max-w-full rounded-lg");
    expect(payloadViewSource).toContain("h-48 w-48 max-w-full");
    expect(payloadViewSource).toContain("[overflow-wrap:anywhere]");
  });

  it("renders redirect_url as an auto-redirecting payment fallback", () => {
    const html = renderToStaticMarkup(
      React.createElement(CheckoutPayloadView, {
        autoRedirect: true,
        checkout: {
          kind: "redirect_url",
          redirectUrl: "https://wx.tenpay.com/cgi-bin/mmpayweb-bin/checkmweb?prepay_id=wx123",
          message: "正在唤起微信支付...",
        },
      }),
    );

    expect(html).toContain("正在唤起微信支付...");
    expect(html).toContain("继续完成支付");
    expect(payloadViewSource).toContain("window.location.assign(checkout.redirectUrl)");
    expect(checkoutClientSource).toContain(
      'autoRedirect={checkout.kind === "redirect_url" && !submitting}',
    );
  });

  it("redirects legacy checkout payment-return URLs to account center without payment buttons", () => {
    const html = renderToStaticMarkup(
      React.createElement(CheckoutClient, {
        initialLoggedIn: true,
        initialPaymentMethods: paymentMethods,
        initialProducts: products,
        orderNo: "ML202606290001",
        paymentReturn: "alipay",
        productCode: "yearly_full",
      }),
    );

    expect(html).toContain("已从支付宝返回。如果已经完成支付，权益会在稍后自动生效。");
    expect(html).toContain("支付结果同步中，请稍后刷新或查看账户权益。");
    expect(html).toContain("ML202606290001");
    expect(html).toContain('href="/account"');
    expect(html).toContain('href="/pricing"');
    expect(html).toContain("支付返回确认");
    expect(html).not.toContain('data-checkout-payment-methods="primary"');
    expect(html).not.toContain("选择支付方式");
    expect(html).not.toContain("打开支付宝支付");
    expect(html).not.toContain("打开微信支付");
    expect(checkoutClientSource).toContain("router.replace(legacyCheckoutPaymentReturnPath)");
    expect(checkoutClientSource).toContain("getBillingOrder(paymentReturnOrderNo)");
    expect(checkoutClientSource).toContain("orderNo={paymentReturnOrderNo}");
  });

  it("renders a return-only checkout view when Alipay comes back with only an order number", () => {
    const html = renderToStaticMarkup(
      React.createElement(CheckoutClient, {
        orderNo: "ML202606290002",
        paymentReturn: "alipay",
      }),
    );

    expect(html).toContain("支付返回确认");
    expect(html).toContain("已从支付宝返回。如果已经完成支付，权益会在稍后自动生效。");
    expect(html).toContain("支付结果同步中，请稍后刷新或查看账户权益。");
    expect(html).toContain("ML202606290002");
    expect(html).not.toContain("无法继续支付");
  });

  it("maps returned payment order statuses to user-facing checkout messages", () => {
    expect(paymentReturnStatusMessage("paid")).toBe("支付成功，会员权益已生效。");
    expect(paymentReturnStatusMessage("pending")).toBe(
      "支付结果同步中，请稍后刷新或查看账户权益。",
    );
    expect(paymentReturnStatusMessage("created")).toBe(
      "支付结果同步中，请稍后刷新或查看账户权益。",
    );
    expect(paymentReturnStatusMessage("failed")).toBe("支付未完成，请重新选择支付方式。");
    expect(paymentReturnStatusMessage("closed")).toBe("支付未完成，请重新选择支付方式。");
    expect(paymentReturnStatusMessage("canceled")).toBe("支付未完成，请重新选择支付方式。");
  });

  it("keeps checkout route helpers aligned with the route contract", () => {
    expect(checkoutPathForProduct("monthly_full")).toBe("/checkout?product=monthly_full");
    expect(checkoutPathForProduct("quarterly_full")).toBe("/checkout?product=quarterly_full");
    expect(checkoutPathForProduct("yearly_full")).toBe("/checkout?product=yearly_full");
    expect(checkoutReturnPathForProvider("monthly_full", "alipay")).toBe(
      "/account?payment_return=alipay",
    );
    expect(checkoutReturnPathForProvider("monthly_full", "wechat_pay")).toBe(
      "/account?payment_return=wechat_pay",
    );
  });
});
