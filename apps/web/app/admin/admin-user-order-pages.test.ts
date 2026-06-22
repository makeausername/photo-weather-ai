import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { AdminShell } from "./components/admin-shell";
import { AdminOrdersClient } from "./components/admin-orders-client";
import { AdminProductsClient } from "./components/admin-products-client";
import { AdminUsersClient } from "./components/admin-users-client";
import type { AdminBillingProduct } from "./admin-api";
import {
  actionDisplayName,
  looksLikeCuid,
  paymentProviderDisplayName,
  productDisplayName,
  providerDisplayName,
} from "../../components/display-labels";

const __dirname = dirname(fileURLToPath(import.meta.url));
const componentDir = resolve(__dirname, "components");
const adminShellSource = readFileSync(resolve(componentDir, "admin-shell.tsx"), "utf8");
const usersClientSource = readFileSync(resolve(componentDir, "admin-users-client.tsx"), "utf8");
const userDetailSource = readFileSync(
  resolve(componentDir, "admin-user-detail-client.tsx"),
  "utf8",
);
const ordersClientSource = readFileSync(resolve(componentDir, "admin-orders-client.tsx"), "utf8");
const orderDetailSource = readFileSync(
  resolve(componentDir, "admin-order-detail-client.tsx"),
  "utf8",
);
const productsClientSource = readFileSync(
  resolve(componentDir, "admin-products-client.tsx"),
  "utf8",
);
const dashboardClientSource = readFileSync(
  resolve(componentDir, "admin-dashboard-client.tsx"),
  "utf8",
);
const auditClientSource = readFileSync(resolve(componentDir, "admin-audit-client.tsx"), "utf8");
const providersClientSource = readFileSync(
  resolve(componentDir, "admin-providers-client.tsx"),
  "utf8",
);
const adminApiSource = readFileSync(resolve(__dirname, "admin-api.ts"), "utf8");
const accountCenterSource = readFileSync(
  resolve(__dirname, "..", "account", "account-center-client.tsx"),
  "utf8",
);
const userPageSource = readFileSync(resolve(__dirname, "users", "page.tsx"), "utf8");
const orderPageSource = readFileSync(resolve(__dirname, "orders", "page.tsx"), "utf8");
const productPageSource = readFileSync(resolve(__dirname, "products", "page.tsx"), "utf8");

const testGlobal = globalThis as typeof globalThis & { React: typeof React };
testGlobal.React = React;

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/users",
}));

describe("admin user and order console pages", () => {
  it("adds first-class user and order modules to the AdminShell", () => {
    const html = renderToStaticMarkup(
      React.createElement(AdminShell, {
        title: "控制台",
        description: "后台状态",
        children: React.createElement("div", null, "content"),
      }),
    );

    expect(adminShellSource).toContain('{ href: "/admin/users", label: "用户管理" }');
    expect(adminShellSource).toContain('{ href: "/admin/orders", label: "订单管理" }');
    expect(adminShellSource).toContain('{ href: "/admin/products", label: "套餐定价" }');
    expect(adminShellSource).toContain('label: "运营"');
    expect(html).toContain("用户管理");
    expect(html).toContain("订单管理");
    expect(html).toContain("套餐定价");
    expect(html).not.toContain('/admin/providers"');
  });

  it("defines real user, order, and product pages instead of placeholder surfaces", () => {
    expect(userPageSource).toContain('title="用户管理"');
    expect(orderPageSource).toContain('title="订单管理"');
    expect(productPageSource).toContain('title="套餐定价"');
    expect(userPageSource).toContain("AdminUsersClient");
    expect(orderPageSource).toContain("AdminOrdersClient");
    expect(productPageSource).toContain("AdminProductsClient");

    const usersHtml = renderToStaticMarkup(React.createElement(AdminUsersClient));
    const ordersHtml = renderToStaticMarkup(React.createElement(AdminOrdersClient));
    expect(usersHtml).toContain("用户总数");
    expect(usersHtml).toContain("搜索");
    expect(usersHtml).toContain("新建用户");
    expect(ordersHtml).toContain("订单总数");
    expect(ordersHtml).toContain("支付渠道");
    expect(ordersHtml).toContain("订单号");
  });

  it("renders the admin product pricing list and edit controls without raw JSON editing", () => {
    const products: readonly AdminBillingProduct[] = [
      {
        code: "trial_7_days",
        name: "注册赠送 7 天",
        description: "新用户注册后自动发放。",
        amountCents: 0,
        currency: "CNY",
        durationDays: 7,
        enabled: true,
        sortOrder: 10,
        publicVisible: false,
        publicPurchasable: false,
        recommended: false,
        badgeText: null,
        featureBullets: ["注册后自动发放"],
        metadataJson: {
          internal: true,
          source: "registration_trial",
          grantType: "full_forecast_access",
        },
        createdAt: "2026-06-21T00:00:00.000Z",
        updatedAt: "2026-06-21T00:00:00.000Z",
      },
      {
        code: "monthly_full",
        name: "月卡",
        description: "开通完整摄影判断 30 天。",
        amountCents: 2100,
        currency: "CNY",
        durationDays: 30,
        enabled: true,
        sortOrder: 20,
        publicVisible: true,
        publicPurchasable: true,
        recommended: false,
        badgeText: null,
        featureBullets: ["完整摄影判断", "专业逐小时表格"],
        metadataJson: {
          plan: "monthly",
          grantType: "full_forecast_access",
        },
        createdAt: "2026-06-21T00:00:00.000Z",
        updatedAt: "2026-06-21T00:00:00.000Z",
      },
    ];

    const html = renderToStaticMarkup(
      React.createElement(AdminProductsClient, { initialProducts: products }),
    );

    for (const text of [
      "上架套餐数",
      "可购买套餐数",
      "最高价套餐",
      "试用状态",
      "套餐列表",
      "套餐名称",
      "价格（元）",
      "权益时长",
      "公开可购买",
      "保存定价",
      "月卡",
      "¥21.00",
    ]) {
      expect(html).toContain(text);
    }
    expect(productsClientSource).toContain("updateAdminProduct");
    expect(productsClientSource).not.toContain("metadataJson");
    expect(html).not.toContain("BillingProduct");
    expect(html).not.toContain("productCode");
    expect(html).not.toContain("monthly_full");
    expect(html).not.toContain("trial_7_days");
    expect(html).not.toContain("raw JSON");
    expect(html).not.toContain("metadataJson");
    expect(html).not.toContain("占位");
    expect(html).not.toContain("敬请期待");
    expect(html).not.toContain("coming soon");
    expect(html).not.toContain("暂无功能");
  });

  it("uses shared display labels for technical actions, providers, and products", () => {
    expect(looksLikeCuid("cmqlyyel1000qsqe4rq15qz2k")).toBe(true);
    expect(actionDisplayName("auth.refresh.success")).toBe("刷新登录状态");
    expect(actionDisplayName("foo.bar.baz")).toBe("系统操作");
    expect(providerDisplayName("cdn", "aliyun_cdn")).toBe("阿里云 CDN");
    expect(paymentProviderDisplayName("wechat_pay")).toBe("微信支付");
    expect(productDisplayName("monthly_full")).toBe("月卡");
  });

  it("keeps raw identifiers out of primary admin and account display paths", () => {
    expect(dashboardClientSource).toContain("log.actorLabel");
    expect(dashboardClientSource).toContain("log.actionLabel");
    expect(dashboardClientSource).toContain("log.targetLabel");
    expect(dashboardClientSource).toContain("log.targetSummary");
    expect(auditClientSource).toContain("log.actorLabel");
    expect(auditClientSource).toContain("log.actionLabel");
    expect(auditClientSource).toContain("log.targetLabel");
    expect(auditClientSource).toContain("log.targetSummary");

    for (const source of [
      dashboardClientSource,
      auditClientSource,
      userDetailSource,
      orderDetailSource,
    ]) {
      expect(source).not.toContain("{log.action}</td>");
      expect(source).not.toContain("{log.targetType} / {log.targetId");
      expect(source).not.toContain("{log.actorUserId");
    }

    expect(usersClientSource).toContain("safeDisplayNameFromUser");
    expect(usersClientSource).not.toContain("用户 ID");
    expect(userDetailSource).toContain("safeDisplayNameFromUser");
    expect(userDetailSource).not.toContain("user.profile.id");
    expect(userDetailSource).toContain("productDisplayName(order.productCode)");
    expect(orderDetailSource).toContain("safeDisplayNameFromUser(detail.user)");
    expect(orderDetailSource).toContain("maskProviderTradeNo");
    expect(orderDetailSource).not.toContain("detail.product.code");
    expect(orderDetailSource).not.toContain("detail.order.providerTradeNo ??");
    expect(productsClientSource).not.toContain(">productCode<");
    expect(productsClientSource).not.toContain(">BillingProduct<");
    expect(providersClientSource).toContain("providerTypeLabel(provider.providerType)");
    expect(accountCenterSource).toContain("productDisplayName(productCode)");
    expect(accountCenterSource).not.toContain("coming soon");
  });

  it("covers detail sections, safe operation labels, and confirm/cancel dialogs", () => {
    for (const snippet of [
      "概览",
      "订单",
      "权益/积分",
      "查询历史",
      "会话安全",
      "审计记录",
      "编辑资料",
      "角色管理",
      "重置密码",
      "撤销所有会话",
    ]) {
      expect(userDetailSource).toContain(snippet);
    }

    for (const snippet of [
      "支付时间线",
      "支付通知",
      "订单权益",
      "订单积分流水",
      "订单审计日志",
      "手动标记支付",
      "取消订单",
      "关闭订单",
      "管理员备注",
    ]) {
      expect(orderDetailSource).toContain(snippet);
    }

    for (const source of [
      usersClientSource,
      userDetailSource,
      ordersClientSource,
      orderDetailSource,
    ]) {
      expect(source).toContain("ConfirmDialog");
      expect(source).toContain('confirmLabel="确认"');
      expect(source).toContain('cancelLabel="取消"');
    }
  });

  it("types admin APIs without exposing raw secrets, hashes, signatures, or permission dumps", () => {
    for (const snippet of [
      "AdminUserListItem",
      "AdminUserDetail",
      "AdminUserOrderItem",
      "AdminUserForecastHistoryItem",
      "AdminUserEntitlementItem",
      "AdminUserCreditLedgerItem",
      "AdminUserSessionItem",
      "AdminPaymentOrderListItem",
      "AdminPaymentOrderDetail",
      "AdminPaymentNotificationItem",
      "AdminOrderTimelineItem",
      "AdminBillingProduct",
      "UpdateAdminProductInput",
    ]) {
      expect(adminApiSource).toContain(snippet);
    }

    expect(usersClientSource).not.toContain(".permissions");
    for (const source of [
      adminApiSource,
      usersClientSource,
      userDetailSource,
      ordersClientSource,
      orderDetailSource,
    ]) {
      for (const forbidden of [
        "passwordHash",
        "refreshTokenHash",
        "verification code hash",
        "providerPayloadJson",
        "rawBody",
        "headersJson",
        "privateKey",
      ]) {
        expect(source).not.toContain(forbidden);
      }
    }
  });

  it("does not add fake placeholder or filler text", () => {
    for (const source of [
      usersClientSource,
      userDetailSource,
      ordersClientSource,
      orderDetailSource,
      productsClientSource,
      userPageSource,
      orderPageSource,
      productPageSource,
    ]) {
      for (const forbidden of [
        "占位",
        "敬请期待",
        "coming soon",
        "暂无功能",
        "min-h-[",
        "h-[520px]",
      ]) {
        expect(source).not.toContain(forbidden);
      }
    }
  });
});
