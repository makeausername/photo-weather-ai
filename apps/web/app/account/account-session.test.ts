import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  loginPublicAccount,
  shouldShowAdminEntry,
  type PublicAccountSession,
} from "../../components/account-session";
import {
  invalidCredentialsMessage,
  loginServiceUnavailableMessage,
  sanitizeAuthErrorMessage,
} from "../../components/auth-errors";
import {
  PublicAccountEntry,
  PublicAccountMenuContent,
  publicAccountMenuLinks,
} from "../../components/public-account-entry";
import { publicHeaderActionLabels, publicHeaderNavLabels } from "../../components/public-header";
import AccountPage, { metadata as accountMetadata } from "./page";
import {
  accountCenterSectionLabels,
  AuthenticatedAccountCenter,
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

const baseAccountSession: PublicAccountSession = {
  user: {
    id: "user-1",
    email: "photo@example.com",
    phone: null,
    displayName: "逐光摄影师",
    status: "active",
    createdAt: "2026-06-01T08:20:00.000Z",
    updatedAt: "2026-06-10T10:00:00.000Z",
    lastLoginAt: "2026-06-17T14:35:00.000Z",
  },
  profile: {
    id: "profile-1",
    userId: "user-1",
    avatarUrl: null,
    preferredUnits: "metric",
    preferredLanguage: "zh-CN",
    createdAt: "2026-06-01T08:20:00.000Z",
    updatedAt: "2026-06-10T10:00:00.000Z",
  },
  roles: ["user"],
  roleCodes: ["user"],
  permissions: [],
  isAdmin: false,
};

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
      "定价",
    ]);
    expect(publicHeaderActionLabels).toEqual(["账户"]);
    expect(publicHeaderActionLabels).not.toContain("开始分析");
    expect([...publicHeaderNavLabels, ...publicHeaderActionLabels]).not.toContain("管理后台");
    expect([...publicHeaderNavLabels, ...publicHeaderActionLabels]).not.toContain("登录");
  });

  it("keeps the logged-out account entry pointed at the public login route", () => {
    const html = renderToStaticMarkup(React.createElement(PublicAccountEntry));

    expect(html).toContain('href="/login"');
    expect(html).toContain("账户");
  });

  it("keeps the account dropdown on real routes only", () => {
    const html = renderPublicAccountMenu();

    expect(publicAccountMenuLinks).toEqual([{ href: "/account", label: "账户中心" }]);
    expect(html).toContain('href="/account"');
    expect(html).toContain("账户中心");
    expect(html).toContain("退出登录");
    expect(html).not.toContain('href="/#analysis"');
    expect(html).not.toContain('href="/pricing"');
    expect(html).not.toContain('href="/admin"');
    expect(html).not.toContain("开始判断");
    expect(html).not.toContain("定价");
    expect(html).not.toContain("/account#queries");
    expect(html).not.toContain("/account#favorites");
    expect(html).not.toContain("我的查询");
    expect(html).not.toContain("收藏机位");
    expect(html).not.toContain("管理后台入口");
  });

  it("keeps admin entry out of the header menu even when admin-like menu state is passed", () => {
    const html = renderPublicAccountMenu({
      session: {
        ...baseAccountSession,
        roles: [{ id: "role-admin", code: "admin", name: "admin", displayName: "管理员" }],
        roleCodes: ["admin"],
        permissions: ["admin.manage"],
        isAdmin: true,
      },
      showAdminEntry: true,
    });

    expect(html).toContain("账户中心");
    expect(html).toContain("退出登录");
    expect(html).not.toContain("管理后台入口");
    expect(html).not.toContain('href="/admin"');
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
      "账户总览",
      "资料信息",
      "权限与角色",
      "偏好设置",
      "安全与登录",
    ]);
  });

  it("shows the unauthenticated account login prompt", () => {
    const html = renderToStaticMarkup(React.createElement(UnauthenticatedAccountPrompt));

    expect(html).toContain("请先登录后查看账户中心。");
    expect(html).toContain("登录后可管理账户信息，并继续使用逐光天气的拍摄判断工具。");
    expect(html).toContain("登录逐光天气");
    expect(html).toContain("创建账户");
    expect(html).toContain('href="/login"');
    expect(html).toContain('href="/register"');
    expect(html).not.toContain("查询历史");
    expect(html).not.toContain("收藏机位");
  });

  it("renders a session-backed authenticated account dashboard", () => {
    const html = renderAuthenticatedAccountCenter(baseAccountSession);

    expect(html).toContain("逐光摄影师");
    expect(html).toContain("photo@example.com");
    expect(html).toContain("正常");
    expect(html).toContain("普通用户");
    expect(html).toContain("注册时间");
    expect(html).toContain("最近登录时间");
    expect(html).toContain("资料更新时间");
    expect(html).toContain("权限与角色");
    expect(html).toContain("暂无额外权限");
    expect(html).toContain("2026/06/01");
    expect(html).toContain("2026/06/10");
    expect(html).toContain("2026/06/17");
    expect(html).toContain("公制单位");
    expect(html).toContain("简体中文");
    expect(html).toContain("退出登录");

    for (const removedDashboardLink of [
      'href="/#analysis"',
      'href="/cloud-sea"',
      'href="/glow"',
      'href="/astro"',
      'href="/pricing"',
    ]) {
      expect(html).not.toContain(removedDashboardLink);
    }

    for (const removedDashboardLabel of [
      "快捷入口",
      "首页 / 开始判断",
      "云海",
      "朝霞晚霞",
      "星空银河",
      "定价",
      "账户偏好将在保存后显示",
    ]) {
      expect(html).not.toContain(removedDashboardLabel);
    }
  });

  it("omits the sparse preferences card when profile data is missing", () => {
    const html = renderAuthenticatedAccountCenter({
      ...baseAccountSession,
      profile: null,
    });

    expect(html).toContain("逐光摄影师");
    expect(html).toContain("权限与角色");
    expect(html).not.toContain("偏好设置");
    expect(html).not.toContain("账户偏好将在保存后显示");
  });

  it("renders the admin card only for admin sessions", () => {
    const userHtml = renderAuthenticatedAccountCenter(baseAccountSession);
    const adminHtml = renderAuthenticatedAccountCenter({
      ...baseAccountSession,
      roles: [{ id: "role-admin", code: "admin", name: "admin", displayName: "管理员" }],
      roleCodes: ["admin"],
      permissions: ["admin.manage"],
      isAdmin: true,
    });
    const adminMenuHtml = renderPublicAccountMenu({ showAdminEntry: true });

    expect(userHtml).not.toContain("管理后台");
    expect(adminHtml).toContain("管理后台");
    expect(adminHtml).toContain("进入管理后台");
    expect(adminHtml).toContain("管理系统配置、服务商配置和地点数据。");
    expect(adminHtml).toContain('href="/admin"');
    expect(adminMenuHtml).not.toContain("管理后台入口");
    expect(adminMenuHtml).not.toContain('href="/admin"');
  });

  it("does not render account placeholder or unavailable-module wording", () => {
    const html = [
      renderAuthenticatedAccountCenter(baseAccountSession),
      renderToStaticMarkup(React.createElement(UnauthenticatedAccountPrompt)),
      renderPublicAccountMenu(),
    ].join("");
    const unavailableCopy = [
      "即将开放",
      "规划中",
      "后续版本开放",
      "基础体验模式",
      "暂无查询记录",
      "暂无收藏机位",
      "暂无已保存报告",
      "占位",
      "开发",
      "coming soon",
      "planned",
      "placeholder",
      "development",
      "unavailable",
      "账户偏好将在保存后显示",
    ];

    for (const phrase of unavailableCopy) {
      expect(html).not.toContain(phrase);
    }
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

function renderAuthenticatedAccountCenter(session: PublicAccountSession): string {
  return renderToStaticMarkup(
    React.createElement(AuthenticatedAccountCenter, {
      session,
      onLogout: () => undefined,
      isLoggingOut: false,
    }),
  );
}

function renderPublicAccountMenu(extraProps: Record<string, unknown> = {}): string {
  return renderToStaticMarkup(
    React.createElement(PublicAccountMenuContent, {
      ...extraProps,
      onLogout: () => undefined,
    } as React.ComponentProps<typeof PublicAccountMenuContent> & Record<string, unknown>),
  );
}

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
