import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import {
  CheckoutPanel,
  CheckoutPayloadView,
  PricingClient,
  pricingCheckoutIntroCopy,
  pricingCheckoutLabels,
  type BillingProduct,
} from "./pricing-client";
import type {
  AccountBillingOrderRecord,
  BillingPaymentProvider,
} from "../../components/account-session";

vi.mock("next/navigation", () => ({
  usePathname: () => "/pricing",
}));

const testGlobal = globalThis as typeof globalThis & { React: typeof React };
testGlobal.React = React;

const __dirname = dirname(fileURLToPath(import.meta.url));
const pricingClientSource = readFileSync(resolve(__dirname, "pricing-client.tsx"), "utf8");

const staleAiCopy = ["A", "I", " 解读"].join("");
const staleSmartCopy = ["智能", "解读"].join("");
const staleGptCopy = ["G", "P", "T"].join("");
const staleOpenAiCopy = ["Open", "A", "I"].join("");
const oldInternalCheckoutCopy = [
  "订单金额、权益时长和",
  "发放",
  "类型由后台",
  "产品配置读取。",
].join("");
const oldInternalGrantTypeCopy = ["发放", "类型由后台", "产品配置"].join("");

const products: readonly BillingProduct[] = [
  {
    code: "trial_7_days",
    name: "注册赠送 7 天",
    description: "新用户注册后自动发放，不开放购买。",
    amountCents: 0,
    currency: "CNY",
    priceText: "¥0.00",
    durationDays: 7,
    durationText: "7 天",
    recommended: false,
    badgeText: null,
    featureBullets: ["注册后自动发放"],
    sortOrder: 0,
  },
  {
    code: "monthly_full",
    name: "月卡",
    description: `开通后 30 天内查看完整摄影判断、专业时序表和历史报告。${staleAiCopy}`,
    amountCents: 2100,
    currency: "CNY",
    priceText: "¥21.00",
    durationDays: 30,
    durationText: "30 天",
    recommended: false,
    badgeText: null,
    featureBullets: ["未来多日完整摄影判断", staleSmartCopy, "专业逐小时表格"],
    sortOrder: 10,
  },
  {
    code: "quarterly_full",
    name: "季卡",
    description: `开通后 90 天内查看完整摄影判断、专业时序表和历史报告。${staleGptCopy}`,
    amountCents: 5600,
    currency: "CNY",
    priceText: "¥56.00",
    durationDays: 90,
    durationText: "90 天",
    recommended: true,
    badgeText: "推荐",
    featureBullets: ["未来多日完整摄影判断", "云海 / 朝霞晚霞 / 星空银河", "会员期内完整历史报告"],
    sortOrder: 20,
  },
  {
    code: "yearly_full",
    name: "年卡",
    description: `开通后 365 天内查看完整摄影判断、专业时序表和历史报告。${staleOpenAiCopy}`,
    amountCents: 18800,
    currency: "CNY",
    priceText: "¥188.00",
    durationDays: 365,
    durationText: "365 天",
    recommended: false,
    badgeText: "最划算",
    featureBullets: ["全年完整摄影判断", "专业逐小时表格", "全年完整历史报告"],
    sortOrder: 30,
  },
];

type ClickableElement = React.ReactElement<{
  readonly children?: React.ReactNode;
  readonly disabled?: boolean;
  readonly onClick?: () => void;
}>;

function createOrderRecord(
  overrides: Partial<AccountBillingOrderRecord> = {},
): AccountBillingOrderRecord {
  return {
    orderNo: "P202606260001",
    provider: "alipay",
    amountCents: 2100,
    currency: "CNY",
    productCode: "monthly_full",
    status: "pending",
    paidAt: null,
    expiresAt: "2026-06-26T12:00:00.000Z",
    providerTradeNo: null,
    entitlementGrantedAt: null,
    createdAt: "2026-06-26T08:00:00.000Z",
    updatedAt: "2026-06-26T08:00:00.000Z",
    ...overrides,
  };
}

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
  if (React.isValidElement<{ readonly children?: React.ReactNode; readonly onClick?: () => void }>(
    value,
  )) {
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

describe("pricing checkout client", () => {
  it("renders Alipay form_post checkout as a POST form with hidden fields", () => {
    const html = renderToStaticMarkup(
      React.createElement(CheckoutPayloadView, {
        checkout: {
          kind: "form_post",
          actionUrl: "https://openapi.alipay.com/gateway.do",
          method: "POST",
          charset: "utf-8",
          message: "Continue to Alipay.",
          fields: {
            app_id: "alipay-app-id",
            method: "alipay.trade.page.pay",
            sign_type: "RSA2",
            sign: "signed-value",
            biz_content: "{\"out_trade_no\":\"P1000\"}",
          },
        },
      }),
    );

    expect(html).toContain('action="https://openapi.alipay.com/gateway.do"');
    expect(html).toContain('method="POST"');
    expect(html).toContain('accept-charset="utf-8"');
    expect(html).toContain('type="hidden"');
    expect(html).toContain('name="app_id"');
    expect(html).toContain('value="alipay.trade.page.pay"');
    expect(html).toContain('name="sign_type"');
    expect(html).toContain("前往支付宝支付");
    expect(html).toContain("支付页面已生成，请继续完成支付。");
    expect(pricingClientSource).toContain('checkout.kind === "form_post"');
    expect(pricingClientSource).toContain('type="hidden" name={name} value={value}');
    expect(pricingClientSource).not.toContain("dangerouslySetInnerHTML");
  });

  it("renders WeChat QR checkout as a payment action area", () => {
    const html = renderToStaticMarkup(
      React.createElement(CheckoutPayloadView, {
        checkout: {
          kind: "qr_code",
          codeUrl: "weixin://wxpay/bizpayurl?pr=abc",
          message: "请使用微信扫码完成支付。",
        },
      }),
    );

    expect(html).toContain("扫码支付");
    expect(html).toContain("weixin://wxpay/bizpayurl?pr=abc");
    expect(html).toContain("请使用微信扫码完成支付。");
  });

  it("renders checkout panel with provider payment buttons and no public order creation wording", () => {
    const html = renderToStaticMarkup(
      React.createElement(CheckoutPanel, {
        selectedProduct: products[1] ?? null,
        order: null,
        checkout: null,
        submittingProvider: null,
        onProviderPayment: () => undefined,
      }),
    );

    expect(html).toContain("选择支付方式");
    expect(html).toContain(pricingCheckoutIntroCopy);
    expect(html).toContain("月卡");
    expect(html).toContain("¥21.00");
    expect(html).toContain("30 天");
    expect(html).toContain("支付宝支付");
    expect(html).toContain("微信支付");
    expect(html).not.toContain("创建订单");
    expect(html).not.toContain("确认订单");
    expect(html).not.toContain("订单号");
    expect(html).not.toContain("订单状态");
  });

  it("wires provider payment buttons to the selected payment provider", () => {
    const providers: BillingPaymentProvider[] = [];
    const panel = CheckoutPanel({
      selectedProduct: products[1] ?? null,
      order: null,
      checkout: null,
      submittingProvider: null,
      onProviderPayment: (provider) => providers.push(provider),
    });

    findClickableByText(panel, "支付宝支付").props.onClick?.();
    findClickableByText(panel, "微信支付").props.onClick?.();

    expect(providers).toEqual(["alipay", "wechat_pay"]);
    expect(pricingClientSource).toContain(
      "createBillingOrder({ productCode, provider: nextProvider })",
    );
    expect(pricingClientSource).toContain(
      "onProviderPayment={(nextProvider) => void handleCreateOrder(nextProvider)}",
    );
  });

  it("disables both payment buttons while one provider is submitting", () => {
    const panel = CheckoutPanel({
      selectedProduct: products[1] ?? null,
      order: null,
      checkout: null,
      submittingProvider: "alipay",
      onProviderPayment: () => undefined,
    });
    const buttons = collectClickableElements(panel);

    expect(buttons).toHaveLength(2);
    expect(buttons.every((button) => button.props.disabled === true)).toBe(true);
    expect(nodeText(buttons[0]?.props.children)).toBe("正在唤起支付...");
    expect(nodeText(buttons[1]?.props.children)).toBe("微信支付");
    expect(pricingClientSource).toContain("const [submittingProvider, setSubmittingProvider]");
  });

  it("keeps paid status copy public-facing and hides order identifiers", () => {
    const html = renderToStaticMarkup(
      React.createElement(CheckoutPanel, {
        selectedProduct: products[1] ?? null,
        order: createOrderRecord({
          status: "paid",
          paidAt: "2026-06-26T08:01:00.000Z",
          entitlementGrantedAt: "2026-06-26T08:01:01.000Z",
        }),
        checkout: null,
        submittingProvider: null,
        onProviderPayment: () => undefined,
      }),
    );

    expect(html).toContain("支付成功，会员权益已生效。");
    expect(html).toContain("已支付");
    expect(html).not.toContain("订单号");
    expect(html).not.toContain("P202606260001");
  });

  it("renders paid plans without default checkout, stale copy, or free purchase cards", () => {
    const html = renderToStaticMarkup(
      React.createElement(PricingClient, { initialProducts: products }),
    );

    expect(pricingCheckoutLabels).toEqual([
      "月卡",
      "季卡",
      "年卡",
      "选择支付方式",
      "支付宝支付",
      "微信支付",
      "扫码支付",
      "前往支付宝支付",
      "支付成功，会员权益已生效。",
    ]);
    expect(html).toContain("定价方案");
    expect(html).toContain("新用户注册即送 7 天完整权限");
    expect(html.match(/免费版/g) ?? []).toHaveLength(1);
    expect(html).toContain("月卡");
    expect(html).toContain("季卡");
    expect(html).toContain("年卡");
    expect(html).toContain("开通后 30 天内查看完整摄影判断、专业时序表和历史报告。");
    expect(html).toContain("未来多日完整摄影判断");
    expect(html).toContain("专业逐小时表格");
    expect(html).toContain("会员期内完整历史报告");
    expect(html).not.toContain("注册赠送 7 天");
    expect(html).not.toContain("付费套餐");
    expect(html).not.toContain("永久免费");
    expect(html).not.toContain("开始查询");
    expect(html).not.toContain("适合临时查看近端天气");
    expect(html).not.toContain("¥0.00");
    expect(html).toContain("¥21.00");
    expect(html).toContain("¥56.00");
    expect(html).toContain("¥188.00");
    expect(html).not.toContain("¥19.00");
    expect(html).not.toContain("¥49.00");
    expect(html).not.toContain("¥168.00");
    expect(html).not.toContain(staleAiCopy);
    expect(html).not.toContain(staleSmartCopy);
    expect(html).not.toContain(staleGptCopy);
    expect(html).not.toContain(staleOpenAiCopy);
    expect(html).not.toContain("确认订单");
    expect(html).not.toContain("选择支付方式");
    expect(html).not.toContain("支付方式");
    expect(html).not.toContain("微信支付");
    expect(html).not.toContain("支付宝支付");
    expect(html).not.toContain("创建订单");
    expect(html).not.toContain(pricingCheckoutIntroCopy);
    expect(html).not.toContain(oldInternalCheckoutCopy);
    expect(html).not.toContain("选择套餐");
    expect(html).not.toContain("立即购买");
    expect(html.match(/登录后购买/g) ?? []).toHaveLength(3);
    expect(html.match(/href="\/login\?returnTo=%2Fpricing"/g) ?? []).toHaveLength(3);
    expect(html).not.toContain("border-primary shadow-soft");
    expect(html).not.toContain('href="/register"');
    expect(html).not.toContain("注册领取 7 天完整权限");
    expect(html).toContain("查看账户权益");

    expect(pricingClientSource).not.toContain("<ComparisonCard");
    expect(pricingClientSource).not.toContain("function ComparisonCard");
    expect(pricingClientSource).not.toContain("<FreePlanCard");
    expect(pricingClientSource).not.toContain("function FreePlanCard");
    expect(pricingClientSource).not.toContain("sm:grid-cols-2 xl:grid-cols-4");
    expect(pricingClientSource).toContain("lg:grid-cols-3");
    expect(pricingClientSource).toContain("checkoutActive ? (");
    expect(pricingClientSource).not.toContain("onSelect");
    expect(pricingClientSource).not.toContain("handleSelectProduct");
    expect(pricingClientSource).not.toContain('variant="secondary" onClick={onSelect}');
    expect(pricingClientSource).toContain(
      "selected={checkoutActive && selectedProduct?.code === product.code}",
    );
    expect(pricingClientSource).toContain(
      "onStartCheckout={() => handleStartCheckout(product.code)}",
    );
    expect(pricingClientSource).toContain("setCheckoutStarted(true)");
    expect(pricingClientSource).toContain("clearOrderState()");
    expect(pricingClientSource).toMatch(
      /function handleStartCheckout\(productCode: string\) \{[\s\S]*setSelectedProductCode\(productCode\);[\s\S]*checkoutRequestIdRef\.current \+= 1;[\s\S]*setSubmittingProvider\(null\);[\s\S]*clearOrderState\(\);[\s\S]*setCheckoutStarted\(true\);/,
    );
    expect(pricingClientSource).toContain("selectedProduct={selectedProduct}");
    expect(pricingClientSource).not.toContain("创建订单");

    for (const forbidden of [
      "providerPayload",
      "secretJson",
      "merchantPrivateKeyPem",
      "apiV3Key",
      "appPrivateKeyPem",
      "platformCertificatePem",
      "alipayPublicKeyPem",
      "signature",
    ]) {
      expect(html).not.toContain(forbidden);
    }
  });

  it("keeps logged-in purchase actions wired through checkout and order creation", () => {
    const html = renderToStaticMarkup(
      React.createElement(PricingClient, { initialProducts: products, initialLoggedIn: true }),
    );

    expect(html).not.toContain("选择套餐");
    expect(html).not.toContain("登录后购买");
    expect(html.match(/立即购买/g) ?? []).toHaveLength(3);
    expect(html).not.toContain("border-primary shadow-soft");
    expect(html).not.toContain("确认订单");
    expect(html).not.toContain("选择支付方式");
    expect(html).not.toContain("支付方式");
    expect(html).not.toContain("微信支付");
    expect(html).not.toContain('href="/login?returnTo=%2Fpricing"');
    expect(pricingClientSource).toContain(pricingCheckoutIntroCopy);
    expect(pricingClientSource).not.toContain(oldInternalCheckoutCopy);
    expect(pricingClientSource).not.toContain(oldInternalGrantTypeCopy);
    expect(pricingClientSource).toContain(
      "createBillingOrder({ productCode, provider: nextProvider })",
    );
    expect(pricingClientSource).toContain("<CheckoutPanel");
    expect(pricingClientSource).toContain("submittingProvider={submittingProvider}");
    expect(pricingClientSource).toContain(
      "onProviderPayment={(nextProvider) => void handleCreateOrder(nextProvider)}",
    );
    expect(pricingClientSource).toContain(
      'className="w-full" disabled={submitting} onClick={onStartCheckout}',
    );
    expect(pricingClientSource).toContain("grid min-w-0 max-w-full grid-rows-[auto_auto_1fr_auto]");
    expect(pricingClientSource).not.toContain("durationDays:");
    expect(pricingClientSource).not.toContain("grantType:");
    expect(pricingClientSource).not.toContain("hasFullAccess:");
    expect(pricingClientSource).not.toContain("entitlement type");
    expect(pricingClientSource).toMatch(
      /if \(checkoutSubmissionRef\.current\) \{\s*return;\s*\}/,
    );
    expect(pricingClientSource).toContain("checkoutSubmissionRef.current = true");
    expect(pricingClientSource).toContain("checkoutSubmissionRef.current = false");
  });
});
