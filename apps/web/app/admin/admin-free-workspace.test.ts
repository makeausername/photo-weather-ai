import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AdminShell, adminNavigation } from "./components/admin-shell";
import { selectWebsiteSettings } from "./components/admin-settings-client";
import type { SafeSystemSetting } from "./admin-api";
import HistoryPage from "./history/page";
import LegacySettingsPage from "./history/settings/page";
import UsersPage from "./users/page";
import UserPage from "./users/[userId]/page";
import OrdersPage from "./orders/page";
import OrderPage from "./orders/[orderNo]/page";
import ProductsPage from "./products/page";
import BillingPage from "./providers/billing/page";
import CaptchaPage from "./providers/captcha/page";
import NotificationPage from "./providers/notification/page";
import StoragePage from "./providers/storage/page";
import CdnPage from "./providers/cdn/page";

Object.assign(globalThis, { React });
vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/providers/geo",
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));

describe("free admin workspace", () => {
  it("selects the map module independently from weather", () => {
    const html = renderToStaticMarkup(
      React.createElement(AdminShell, {
        title: "高德地图",
        description: "地图配置",
        children: null,
      }),
    );
    expect(adminNavigation).toHaveLength(6);
    expect(html.match(/aria-current="page"/g)).toHaveLength(2);
    const activeLinks = html.match(/<a[^>]*aria-current="page"[^>]*>/g) ?? [];
    expect(activeLinks.every((link) => link.includes('href="/admin/providers/geo"'))).toBe(true);
    expect(html).not.toContain("历史管理");
  });

  it.each([
    ["history", HistoryPage],
    ["history/settings", LegacySettingsPage],
    ["users", UsersPage],
    ["users/detail", UserPage],
    ["orders", OrdersPage],
    ["orders/detail", OrderPage],
    ["products", ProductsPage],
    ["billing", BillingPage],
    ["captcha", CaptchaPage],
    ["notification", NotificationPage],
    ["storage", StoragePage],
    ["cdn", CdnPage],
  ])("redirects retired %s routes without loading records", (_route, Page) => {
    expect(() => Page()).toThrow("redirect:/admin");
  });

  it("selects only website fields even when legacy configuration is returned", () => {
    const keys = [
      "billing.enabled",
      "weather.primaryProvider",
      "site.baseUrl",
      "storage.provider",
      "locale.defaultTimezone",
      "site.name",
      "deployment.mode",
      "scoring.defaultVersion",
      "locale.defaultLanguage",
      "unknown.setting",
    ];
    const settings = keys.map((key) => ({ key, group: key.split(".")[0] })) as SafeSystemSetting[];
    expect(selectWebsiteSettings(settings).map((s) => s.key)).toEqual([
      "site.name",
      "site.baseUrl",
      "locale.defaultLanguage",
      "locale.defaultTimezone",
    ]);
  });
});
