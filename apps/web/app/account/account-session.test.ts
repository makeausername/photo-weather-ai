import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  confirmRegisterPublicAccount,
  loginPublicAccount,
  registerPublicAccount,
  sendRegisterVerificationCode,
  shouldShowAdminEntry,
  type AccountBillingOrderRecord,
  type AccountEntitlementRecord,
  type AccountForecastHistoryRecord,
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
  buildForecastHistoryHref,
  formatAccountRoleLabels,
  UnauthenticatedAccountPrompt,
} from "./account-center-client";
import { sessionHasAdminAccess } from "../admin/admin-api";
import AdminLoginPage from "../admin/login/page";
import { loginAuthTrustItems, loginAuthWorkflowItems } from "../login/auth-content";
import LoginPage, { metadata as loginMetadata } from "../login/page";
import { publicLoginFormLabels } from "../login/login-form";
import { registerAuthTrustItems, registerAuthWorkflowItems } from "../register/auth-content";
import RegisterPage, { metadata as registerMetadata } from "../register/page";
import { buildRegisteredLoginHref, publicRegisterFormLabels } from "../register/register-form";

const routerReplaceMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({
    replace: routerReplaceMock,
  }),
}));

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

const cloudSeaHistoryRecord: AccountForecastHistoryRecord = {
  id: "history-cloud-sea-1",
  locationName: "测试山顶",
  target: "cloud_sea",
  horizon: "48h",
  timezone: "Asia/Shanghai",
  latitudeGcj02: 30.12,
  longitudeGcj02: 118.16,
  latitudeWgs84: 30.118,
  longitudeWgs84: 118.156,
  elevationMeters: 1200,
  locationId: "location-test",
  photoSpotId: "spot-test",
  queryJson: {
    name: "测试山顶",
    source: "manual",
    latitudeGcj02: 30.12,
    longitudeGcj02: 118.16,
    latitudeWgs84: 30.118,
    longitudeWgs84: 118.156,
    horizon: "48h",
    target: "cloud_sea",
    timezone: "Asia/Shanghai",
    elevationMeters: 1200,
    locationId: "location-test",
    photoSpotId: "spot-test",
  },
  resultSummaryJson: {
    overallScore: 82,
    recommendationLabel: "推荐前往",
    bestWindowStart: "2026-06-22T05:00:00+08:00",
    bestWindowEnd: "2026-06-22T07:00:00+08:00",
  },
  overallScore: 82,
  recommendationLabel: "推荐前往",
  bestWindowStart: "2026-06-22T05:00:00+08:00",
  bestWindowEnd: "2026-06-22T07:00:00+08:00",
  createdAt: "2026-06-21T08:00:00.000Z",
  updatedAt: "2026-06-21T08:00:00.000Z",
};

afterEach(() => {
  routerReplaceMock.mockReset();
  vi.restoreAllMocks();
});

describe("public account navigation", () => {
  it("uses a unified account entry instead of top-level login or admin actions", () => {
    expect(publicHeaderNavLabels).toEqual(["首页", "云海", "朝霞晚霞", "星空银河", "定价"]);
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
    expect(shouldShowAdminEntry({ roles: ["user"], permissions: ["users.manage"] })).toBe(false);
    expect(shouldShowAdminEntry(null)).toBe(false);
  });

  it("formats structured admin roles for the account page", () => {
    expect(
      formatAccountRoleLabels([
        { id: "role-admin", code: "admin", name: "admin", displayName: "管理员" },
      ]),
    ).toBe("管理员");
    expect(formatAccountRoleLabels([], ["admin"])).toBe("管理员");
    expect(formatAccountRoleLabels([], ["super_admin"])).toBe("超级管理员");
    expect(formatAccountRoleLabels([], [])).toBe("普通用户");
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
      "订单与权益",
      "账户资料",
      "安全设置",
      "查询历史",
      "绑定方式",
      "管理入口",
      "注销账户",
    ]);
  });

  it("shows the unauthenticated account login prompt", () => {
    const html = renderToStaticMarkup(React.createElement(UnauthenticatedAccountPrompt));

    expect(html).toContain('data-auth-account-prompt="commercial-auth-prompt"');
    expect(html).toContain("登录后查看账户中心");
    expect(html).toContain("账户中心用于管理查询历史、订单权益、绑定方式和登录安全。");
    expect(html).toContain("查询历史");
    expect(html).toContain("订单与权益");
    expect(html).toContain("账户安全");
    expect(html).toContain("登录");
    expect(html).toContain("创建账户");
    expect(html).toContain('href="/login"');
    expect(html).toContain('href="/register"');
    expect(html).not.toContain("暂无查询历史");
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
    expect(html).toContain("账户资料");
    expect(html).toContain("绑定方式");
    expect(html).toContain("安全设置");
    expect(html).toContain("订单与权益");
    expect(html).toContain("正在读取订单与权益");
    expect(html).toContain("查询历史");
    expect(html).toContain("暂无查询历史");
    expect(html).toContain("修改密码");
    expect(html).toContain("修改绑定邮箱");
    expect(html).toContain("绑定/修改手机");
    expect(html).toContain("注销账户");
    expect(html).toContain("2026/06/01");
    expect(html).toContain("2026/06/10");
    expect(html).toContain("2026/06/17");
    expect(html).toContain("退出登录");
    expect(html).not.toContain("权限与角色");
    expect(html).not.toContain("暂无额外权限");
    expect(html).not.toContain("admin.manage");
    expect(html).not.toContain("providers.manage");

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
      "偏好设置",
      "账户偏好将在保存后显示",
    ]) {
      expect(html).not.toContain(removedDashboardLabel);
    }
  });

  it("renders compact forecast history rows with correct target jump links", () => {
    const html = renderAuthenticatedAccountCenter(baseAccountSession, [cloudSeaHistoryRecord]);
    const href = buildForecastHistoryHref(cloudSeaHistoryRecord);

    expect(href).toContain("/cloud-sea?");
    expect(href).toContain("from=account_history");
    expect(href).toContain("name=%E6%B5%8B%E8%AF%95%E5%B1%B1%E9%A1%B6");
    expect(href).toContain("target=cloud_sea");
    expect(href).toContain("horizon=48h");
    expect(href).toContain("latGcj02=30.12");
    expect(href).toContain("lngGcj02=118.16");
    expect(href).toContain("latWgs84=30.118");
    expect(href).toContain("lngWgs84=118.156");
    expect(href).toContain("elevationMeters=1200");
    expect(href).toContain("timezone=Asia%2FShanghai");
    expect(href).toContain("locationId=location-test");
    expect(href).toContain("photoSpotId=spot-test");
    expect(html).toContain("测试山顶");
    expect(html).toContain("云海");
    expect(html).toContain("未来48小时");
    expect(html).toContain("推荐前往");
    expect(html).toContain("82 分");
    expect(html).toContain("打开分析");
    expect(html).toContain('href="/cloud-sea?');
    expect(html).not.toContain("坐标不足");
  });

  it("renders billing orders and entitlements without provider internals", () => {
    const html = renderAuthenticatedAccountCenter(baseAccountSession, [], {
      orders: [
        {
          orderNo: "P202606210001",
          provider: "wechat_pay",
          amountCents: 990,
          currency: "CNY",
          productCode: "forecast_credit_20",
          status: "paid",
          paidAt: "2026-06-21T08:05:00.000Z",
          expiresAt: null,
          providerTradeNo: "wx-transaction-id",
          entitlementGrantedAt: "2026-06-21T08:05:01.000Z",
          createdAt: "2026-06-21T08:00:00.000Z",
          updatedAt: "2026-06-21T08:05:01.000Z",
        },
      ],
      entitlements: [
        {
          id: "entitlement-1",
          type: "forecast_credit",
          quantity: 20,
          remainingQuantity: 20,
          startsAt: "2026-06-21T08:05:01.000Z",
          expiresAt: null,
          grantedAt: "2026-06-21T08:05:01.000Z",
        },
      ],
    });

    expect(html).toContain("订单与权益");
    expect(html).toContain("可用 20 次");
    expect(html).toContain("已支付订单");
    expect(html).toContain("1 笔");
    expect(html).toContain("P202606210001");
    expect(html).toContain("微信支付");
    expect(html).toContain("已支付");
    for (const rawProviderDetail of [
      "providerPayload",
      "rawBody",
      "rawJson",
      "secretJson",
      "apiV3Key",
      "merchantPrivateKeyPem",
      "platformCertificatePem",
      "signature",
      "wx-transaction-id",
    ]) {
      expect(html).not.toContain(rawProviderDetail);
    }
  });

  it("renders a compact billing empty state only when billing data has loaded", () => {
    const html = renderAuthenticatedAccountCenter(baseAccountSession, [], {
      orders: [],
      entitlements: [],
    });

    expect(html).toContain("暂无订单");
    expect(html).toContain("购买预测次数后，订单状态和剩余权益会显示在这里。");
    expect(html).toContain("查看定价");
    expect(html).toContain('href="/pricing"');
  });

  it("renders a compact and useful empty history state", () => {
    const html = renderAuthenticatedAccountCenter(baseAccountSession, []);

    expect(html).toContain("暂无查询历史");
    expect(html).toContain("完成一次天气分析后，最近记录会自动出现在这里。");
    expect(html).toContain("开始分析");
    expect(html).toContain('href="/"');
    expect(html).not.toContain("占位");
  });

  it("uses a balanced desktop layout without right-column filler", () => {
    const userHtml = renderAuthenticatedAccountCenter(baseAccountSession, []);
    const adminHtml = renderAuthenticatedAccountCenter(
      {
        ...baseAccountSession,
        roles: [{ id: "role-admin", code: "admin", name: "admin", displayName: "admin" }],
        roleCodes: ["admin"],
        permissions: ["admin.manage"],
        isAdmin: true,
      },
      [],
    );

    for (const html of [userHtml, adminHtml]) {
      expect(html).toContain('data-account-layout="balanced-columns"');
      for (const sectionLabel of [
        "\u8d26\u6237\u8d44\u6599",
        "\u67e5\u8be2\u5386\u53f2",
        "\u7ed1\u5b9a\u65b9\u5f0f",
        "\u5b89\u5168\u8bbe\u7f6e",
        "\u6ce8\u9500\u8d26\u6237",
      ]) {
        expect(html).toContain(sectionLabel);
      }
      expect(html).not.toContain("min-h-[");
      expect(html).not.toMatch(/\bmin-h-(?:4[8-9]|[5-9]\d|\d{3,})\b/);
      expect(html).not.toContain(">placeholder<");
      expect(html).not.toContain("filler");
      expect(html).not.toContain("coming soon");
      expect(html).not.toContain("\u5360\u4f4d");
      expect(html).not.toContain("\u656c\u8bf7\u671f\u5f85");
      expect(html).not.toContain("\u6682\u65e0\u529f\u80fd");
    }

    expect(userHtml).not.toContain('href="/admin"');
    expect(userHtml).not.toContain("data-account-admin-placeholder");
    expect(userHtml).not.toContain("data-empty-admin-slot");
    expect(adminHtml).toContain('href="/admin"');
  });

  it("keeps the profile-missing layout free of sparse preference and permission cards", () => {
    const html = renderAuthenticatedAccountCenter({
      ...baseAccountSession,
      profile: null,
    });

    expect(html).toContain("逐光摄影师");
    expect(html).toContain("账户资料");
    expect(html).toContain("查询历史");
    expect(html).not.toContain("权限与角色");
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
    expect(adminHtml).toContain("管理系统配置、服务商配置和历史校准。");
    expect(adminHtml).toContain('href="/admin"');
    expect(adminHtml).toContain("管理员");
    expect(adminHtml).not.toContain("admin.manage");
    expect(adminHtml).not.toContain("audit.read");
    expect(adminHtml).not.toContain("providers.manage");
    expect(adminMenuHtml).not.toContain("管理后台入口");
    expect(adminMenuHtml).not.toContain('href="/admin"');
  });

  it("does not render raw permission codes in the public account center", () => {
    const rawPermissionCodes = [
      "admin.manage",
      "audit.read",
      "providers.manage",
      "settings.manage",
      "users.manage",
      "usage.read",
    ];
    const html = renderAuthenticatedAccountCenter({
      ...baseAccountSession,
      roles: [{ id: "role-admin", code: "admin", name: "admin", displayName: "admin" }],
      roleCodes: ["admin"],
      permissions: rawPermissionCodes,
      isAdmin: true,
    });

    expect(html).toContain('href="/admin"');
    for (const permissionCode of rawPermissionCodes) {
      expect(html).not.toContain(permissionCode);
    }
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
      "development",
      "unavailable",
      "账户偏好将在保存后显示",
    ];

    for (const phrase of unavailableCopy) {
      expect(html).not.toContain(phrase);
    }
  });

  it("renders the public login page as a polished commercial auth layout", () => {
    const html = renderToStaticMarkup(
      React.createElement(LoginPage, {
        searchParams: {
          registered: "1",
          identifier: "photo@example.com",
        },
      }),
    );

    expect(html).toContain('data-auth-layout="commercial-two-column responsive-auth-grid"');
    expect(html).toContain('data-auth-product-panel="trust-and-workflow"');
    expect(html).toContain('data-auth-card="refined-form"');
    expect(html).toContain("逐光天气账户");
    expect(html).toContain("保存常用查询与历史记录");
    expect(html).toContain("管理订单、权益和账户安全");
    expect(html).toContain("欢迎回来");
    expect(html).toContain("邮箱或手机号");
    expect(html).toContain("密码");
    expect(html).toContain('value="photo@example.com"');
    expect(html).toContain("账户创建成功，请登录逐光天气。");
    expect(html).toContain("显示密码");
    expect(html).toContain('href="/register"');
    expect(html).toContain('href="/"');
    expect(html).toContain("lg:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.75fr)]");
    expect(html).toContain("order-1");
    expect(html).toContain("sm:grid-cols-2");
    expect(loginAuthTrustItems).toHaveLength(3);
    expect(loginAuthWorkflowItems).toHaveLength(4);
    expect(html).not.toContain("管理员入口");
  });

  it("keeps public login and admin login routes importable", () => {
    expect(LoginPage({})).toBeTruthy();
    expect(loginMetadata.title).toBe("用户登录 - 逐光天气");
    expect(publicLoginFormLabels).toEqual(["邮箱或手机号", "密码", "登录", "创建账户", "返回首页"]);
    expect(AdminLoginPage).toBeTypeOf("function");
  });

  it("renders the public register page with the shared auth visual system", () => {
    const html = renderToStaticMarkup(React.createElement(RegisterPage));

    expect(html).toContain('data-auth-layout="commercial-two-column responsive-auth-grid"');
    expect(html).toContain('data-auth-product-panel="trust-and-workflow"');
    expect(html).toContain('data-auth-card="refined-form"');
    expect(html).toContain("创建逐光天气账户");
    expect(html).toContain("完成验证，开始管理你的摄影出行记录");
    expect(html).toContain("邮箱注册");
    expect(html).toContain("短信注册");
    expect(html).toContain("验证码");
    expect(html).toContain("发送验证码");
    expect(html).toContain("密码要求");
    expect(html).toContain("至少 8 个字符");
    expect(html).toContain("两次输入一致");
    expect(html).toContain("已有账户，去登录");
    expect(html).toContain("sm:grid-cols-[minmax(0,1fr)_auto]");
    expect(html).toContain("w-full min-w-[132px] sm:w-auto");
    expect(registerAuthTrustItems).toHaveLength(3);
    expect(registerAuthWorkflowItems).toHaveLength(4);
  });

  it("keeps the public register route importable with the expected form labels", () => {
    expect(RegisterPage()).toBeTruthy();
    expect(registerMetadata.title).toBe("创建账户 - 逐光天气");
    expect(publicRegisterFormLabels).toEqual([
      "邮箱注册",
      "短信注册",
      "昵称",
      "邮箱",
      "手机号",
      "验证码",
      "发送验证码",
      "密码",
      "确认密码",
      "注册",
      "已有账户，去登录",
    ]);
    expect(buildRegisteredLoginHref("photo@example.com")).toBe(
      "/login?registered=1&identifier=photo%40example.com",
    );
    expect(buildRegisteredLoginHref("13800138000")).toBe(
      "/login?registered=1&identifier=13800138000",
    );
  });

  it("keeps public auth pages free of placeholder or hardcoded environment copy", () => {
    const html = [
      renderToStaticMarkup(React.createElement(LoginPage)),
      renderToStaticMarkup(React.createElement(RegisterPage)),
      renderToStaticMarkup(React.createElement(UnauthenticatedAccountPrompt)),
    ].join("");
    const forbiddenCopy = [
      "占位",
      "敬请期待",
      "coming soon",
      "暂无功能",
      "admin@zhuguangweather.com",
      "127.0.0.1",
      "localhost",
      "截图",
      "服务器路径",
    ];

    for (const phrase of forbiddenCopy) {
      expect(html).not.toContain(phrase);
    }
  });
});

function renderAuthenticatedAccountCenter(
  session: PublicAccountSession,
  initialHistory: readonly AccountForecastHistoryRecord[] = [],
  initialBillingSummary?: {
    readonly orders: readonly AccountBillingOrderRecord[];
    readonly entitlements: readonly AccountEntitlementRecord[];
  },
): string {
  return renderToStaticMarkup(
    React.createElement(AuthenticatedAccountCenter, {
      session,
      onLogout: () => undefined,
      isLoggingOut: false,
      initialHistory,
      initialBillingSummary,
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

describe("public registration session API", () => {
  it("sends registration verification codes through the send-code endpoint", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          channel: "email",
          targetMasked: "ph***@example.com",
          expiresInSeconds: 600,
          resendAfterSeconds: 60,
          mode: "mock",
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    await expect(
      sendRegisterVerificationCode({
        channel: "email",
        target: "photo@example.com",
      }),
    ).resolves.toMatchObject({
      success: true,
      channel: "email",
    });
    expect(fetchSpy).toHaveBeenCalledWith(
      "http://localhost:4000/auth/register/send-code",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          channel: "email",
          target: "photo@example.com",
        }),
      }),
    );
  });

  it("confirms registration through the verification endpoint", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          user: {
            id: "user-2",
            email: null,
            phone: "13800138000",
            displayName: null,
            status: "active",
            createdAt: "2026-06-01T08:20:00.000Z",
            updatedAt: "2026-06-01T08:20:00.000Z",
            lastLoginAt: null,
          },
          profile: null,
          roles: [],
          roleCodes: ["user"],
          permissions: [],
          isAdmin: false,
        }),
        {
          status: 201,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    await expect(
      confirmRegisterPublicAccount({
        channel: "sms",
        target: "13800138000",
        code: "123456",
        password: "public88",
      }),
    ).resolves.toMatchObject({
      user: {
        email: null,
        phone: "13800138000",
      },
    });
    expect(fetchSpy).toHaveBeenCalledWith(
      "http://localhost:4000/auth/register/confirm",
      expect.objectContaining({
        method: "POST",
      }),
    );
  });

  it("keeps registerPublicAccount as verification-confirm compatibility only", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          user: {
            id: "user-3",
            email: "photo@example.com",
            phone: null,
            displayName: null,
            status: "active",
            createdAt: "2026-06-01T08:20:00.000Z",
            updatedAt: "2026-06-01T08:20:00.000Z",
            lastLoginAt: null,
          },
          profile: null,
          roles: [],
          roleCodes: ["user"],
          permissions: [],
          isAdmin: false,
        }),
        {
          status: 201,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    await registerPublicAccount({
      channel: "email",
      target: "photo@example.com",
      code: "123456",
      password: "public88",
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      "http://localhost:4000/auth/register/confirm",
      expect.objectContaining({
        method: "POST",
      }),
    );
    expect(JSON.stringify(fetchSpy.mock.calls)).not.toContain('/auth/register"');
  });
});
