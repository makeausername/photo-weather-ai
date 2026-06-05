import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  loginPublicAccount,
  shouldShowAdminEntry,
} from "../../components/account-session";
import {
  invalidCredentialsMessage,
  loginServiceUnavailableMessage,
  sanitizeAuthErrorMessage,
} from "../../components/auth-errors";
import { publicHeaderActionLabels, publicHeaderNavLabels } from "../../components/public-header";
import AccountPage, { metadata as accountMetadata } from "./page";
import {
  accountCenterSectionLabels,
  formatAccountRoleLabels,
  UnauthenticatedAccountPrompt,
} from "./account-center-client";
import { sessionHasAdminAccess } from "../admin/admin-api";
import AdminLoginPage from "../admin/login/page";
import LoginPage, { metadata as loginMetadata } from "../login/page";
import { publicLoginFormLabels } from "../login/login-form";
import RegisterPage, { metadata as registerMetadata } from "../register/page";
import { publicRegisterFormLabels } from "../register/register-form";

const testGlobal = globalThis as typeof globalThis & { React: typeof React };
testGlobal.React = React;

afterEach(() => {
  vi.restoreAllMocks();
});

describe("public account navigation", () => {
  it("uses a unified account entry instead of top-level login or admin actions", () => {
    expect(publicHeaderNavLabels).toEqual([
      "首页",
      "云海",
      "朝霞晚霞",
      "星空银河",
      "机位库",
      "定价",
    ]);
    expect(publicHeaderActionLabels).toContain("账户");
    expect(publicHeaderActionLabels).toContain("开始分析");
    expect([...publicHeaderNavLabels, ...publicHeaderActionLabels]).not.toContain("管理后台");
    expect([...publicHeaderNavLabels, ...publicHeaderActionLabels]).not.toContain("登录");
  });

  it("shows admin entry for admin role, super admin role, or manage permission only", () => {
    expect(shouldShowAdminEntry({ roles: ["admin"], permissions: [] })).toBe(true);
    expect(
      shouldShowAdminEntry({
        roles: [{ id: "role-admin", code: "admin", name: "admin", displayName: "管理员" }],
        permissions: [],
      }),
    ).toBe(true);
    expect(
      shouldShowAdminEntry({
        roles: [{ id: "role-admin", code: "ADMIN", name: "ADMIN" }],
        permissions: [],
      }),
    ).toBe(true);
    expect(shouldShowAdminEntry({ roles: ["super_admin"], permissions: [] })).toBe(true);
    expect(shouldShowAdminEntry({ roles: ["user"], permissions: ["admin.manage"] })).toBe(true);
    expect(shouldShowAdminEntry({ roles: ["user"], permissions: ["locations.manage"] })).toBe(
      false,
    );
    expect(shouldShowAdminEntry(null)).toBe(false);
  });

  it("formats structured admin roles for the account page", () => {
    expect(
      formatAccountRoleLabels([
        { id: "role-admin", code: "admin", name: "admin", displayName: "管理员" },
      ]),
    ).toBe("管理员");
    expect(formatAccountRoleLabels([], ["admin"])).toBe("管理员");
    expect(formatAccountRoleLabels([], [])).toBe("暂无数据");
  });

  it("allows /admin access only for admin role data or admin permission", () => {
    expect(
      sessionHasAdminAccess({
        roles: [{ id: "role-admin", code: "admin", name: "admin" }],
        permissions: [],
      }),
    ).toBe(true);
    expect(
      sessionHasAdminAccess({
        roles: [{ id: "role-user", code: "user", name: "user" }],
        permissions: [],
      }),
    ).toBe(false);
    expect(sessionHasAdminAccess({ roles: [], permissions: ["admin.manage"] })).toBe(true);
  });
});

describe("account center foundation", () => {
  it("keeps the account route importable with account center metadata", () => {
    expect(AccountPage()).toBeTruthy();
    expect(accountMetadata.title).toBe("账户中心 - 逐光天气");
    expect(accountCenterSectionLabels).toEqual([
      "账户概览",
      "我的查询",
      "收藏机位",
      "报告管理",
      "套餐权益",
      "安全设置",
    ]);
  });

  it("shows the unauthenticated account login prompt", () => {
    const html = renderToStaticMarkup(React.createElement(UnauthenticatedAccountPrompt));

    expect(html).toContain("请先登录后查看账户中心。");
    expect(html).toContain("登录逐光天气");
    expect(html).toContain("创建账户");
    expect(html).toContain('href="/login"');
  });

  it("keeps public login and admin login routes importable", () => {
    expect(LoginPage({})).toBeTruthy();
    expect(loginMetadata.title).toBe("用户登录 - 逐光天气");
    expect(publicLoginFormLabels).toEqual(["邮箱", "密码", "登录", "创建账户", "返回首页"]);
    expect(AdminLoginPage).toBeTypeOf("function");
  });

  it("keeps the public register route importable with the expected form labels", () => {
    expect(RegisterPage()).toBeTruthy();
    expect(registerMetadata.title).toBe("创建账户 - 逐光天气");
    expect(publicRegisterFormLabels).toEqual([
      "昵称",
      "邮箱",
      "密码",
      "确认密码",
      "注册",
      "已有账户，去登录",
    ]);
  });
});

describe("login error sanitization", () => {
  const rawPrismaLoginError =
    "Invalid `prisma.user.findUnique()` invocation: Authentication failed against database server at `postgres`, the provided database credentials for `photo_weather_ai` are not valid.\n    at login (auth-routes.ts:1:1)";

  it("does not expose raw Prisma/database text in login alerts", () => {
    expect(sanitizeAuthErrorMessage(rawPrismaLoginError)).toBe(loginServiceUnavailableMessage);
    const html = renderToStaticMarkup(
      React.createElement("div", { role: "alert" }, sanitizeAuthErrorMessage(rawPrismaLoginError)),
    );

    expect(html).toContain(loginServiceUnavailableMessage);
    expect(html).not.toContain("Prisma");
    expect(html).not.toContain("postgres");
    expect(html).not.toContain("photo_weather_ai");
    expect(html).not.toContain("auth-routes.ts");
  });

  it("preserves invalid-credential copy from the auth API", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ error: "invalid_credentials", message: invalidCredentialsMessage }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    await expect(loginPublicAccount("user@example.com", "wrong-password")).rejects.toThrow(
      invalidCredentialsMessage,
    );
  });

  it("sanitizes raw database failures returned to the browser", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ message: rawPrismaLoginError }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(loginPublicAccount("user@example.com", "CorrectHorseBattery99")).rejects.toThrow(
      loginServiceUnavailableMessage,
    );
  });
});
