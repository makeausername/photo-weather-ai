import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { AdminShell } from "./components/admin-shell";
import { AdminOrdersClient } from "./components/admin-orders-client";
import { AdminUsersClient } from "./components/admin-users-client";

const __dirname = dirname(fileURLToPath(import.meta.url));
const componentDir = resolve(__dirname, "components");
const adminShellSource = readFileSync(resolve(componentDir, "admin-shell.tsx"), "utf8");
const usersClientSource = readFileSync(resolve(componentDir, "admin-users-client.tsx"), "utf8");
const userDetailSource = readFileSync(resolve(componentDir, "admin-user-detail-client.tsx"), "utf8");
const ordersClientSource = readFileSync(resolve(componentDir, "admin-orders-client.tsx"), "utf8");
const orderDetailSource = readFileSync(resolve(componentDir, "admin-order-detail-client.tsx"), "utf8");
const adminApiSource = readFileSync(resolve(__dirname, "admin-api.ts"), "utf8");
const userPageSource = readFileSync(resolve(__dirname, "users", "page.tsx"), "utf8");
const orderPageSource = readFileSync(resolve(__dirname, "orders", "page.tsx"), "utf8");

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
    expect(adminShellSource).toContain('label: "运营"');
    expect(html).toContain("用户管理");
    expect(html).toContain("订单管理");
    expect(html).not.toContain('/admin/providers"');
  });

  it("defines real user and order pages instead of placeholder surfaces", () => {
    expect(userPageSource).toContain('title="用户管理"');
    expect(orderPageSource).toContain('title="订单管理"');
    expect(userPageSource).toContain("AdminUsersClient");
    expect(orderPageSource).toContain("AdminOrdersClient");

    const usersHtml = renderToStaticMarkup(React.createElement(AdminUsersClient));
    const ordersHtml = renderToStaticMarkup(React.createElement(AdminOrdersClient));
    expect(usersHtml).toContain("用户总数");
    expect(usersHtml).toContain("搜索");
    expect(usersHtml).toContain("新建用户");
    expect(ordersHtml).toContain("订单总数");
    expect(ordersHtml).toContain("支付渠道");
    expect(ordersHtml).toContain("订单号");
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

    for (const source of [usersClientSource, userDetailSource, ordersClientSource, orderDetailSource]) {
      expect(source).toContain("ConfirmDialog");
      expect(source).toContain("confirmLabel=\"确认\"");
      expect(source).toContain("cancelLabel=\"取消\"");
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
      userPageSource,
      orderPageSource,
    ]) {
      for (const forbidden of ["占位", "敬请期待", "coming soon", "暂无功能", "min-h-[", "h-[520px]"]) {
        expect(source).not.toContain(forbidden);
      }
    }
  });
});
