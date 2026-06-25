import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import {
  PricingClient,
  pricingCheckoutIntroCopy,
  pricingCheckoutLabels,
  type BillingProduct,
} from "./pricing-client";

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

describe("pricing checkout client", () => {
  it("renders paid plans without default checkout, stale copy, or free purchase cards", () => {
    const html = renderToStaticMarkup(
      React.createElement(PricingClient, { initialProducts: products }),
    );

    expect(pricingCheckoutLabels).toEqual([
      "月卡",
      "季卡",
      "年卡",
      "确认订单",
      "微信支付",
      "支付宝",
      "创建订单",
      "订单状态",
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
    expect(html).not.toContain("支付方式");
    expect(html).not.toContain("微信支付");
    expect(html).not.toContain("支付宝");
    expect(html).not.toContain("创建订单");
    expect(html).not.toContain(pricingCheckoutIntroCopy);
    expect(html).not.toContain(oldInternalCheckoutCopy);
    expect(html).toContain("登录后购买");
    expect(html).toContain('href="/login?returnTo=%2Fpricing"');
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
    expect(pricingClientSource).toContain("onSelect={() => handleSelectProduct(product.code)}");
    expect(pricingClientSource).toContain(
      "onStartCheckout={() => handleStartCheckout(product.code)}",
    );
    expect(pricingClientSource).toContain("setCheckoutStarted(true)");
    expect(pricingClientSource).toContain("clearOrderState()");

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

    expect(html).toContain("立即购买");
    expect(html).not.toContain("确认订单");
    expect(html).not.toContain("支付方式");
    expect(html).not.toContain("微信支付");
    expect(html).not.toContain('href="/login?returnTo=%2Fpricing"');
    expect(pricingClientSource).toContain(pricingCheckoutIntroCopy);
    expect(pricingClientSource).not.toContain(oldInternalCheckoutCopy);
    expect(pricingClientSource).not.toContain(oldInternalGrantTypeCopy);
    expect(pricingClientSource).toContain("createBillingOrder({ productCode, provider })");
    expect(pricingClientSource).toContain("<CheckoutPanel");
    expect(pricingClientSource).toContain("onCreateOrder={() => void handleCreateOrder()}");
    expect(pricingClientSource).not.toContain("durationDays:");
    expect(pricingClientSource).not.toContain("grantType:");
    expect(pricingClientSource).not.toContain("hasFullAccess:");
    expect(pricingClientSource).not.toContain("entitlement type");
  });
});
