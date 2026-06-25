import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  changeAccountPassword,
  confirmRegisterPublicAccount,
  createBillingOrder,
  getCaptchaPublicConfig,
  getCurrentAccountSession,
  loginPublicAccount,
  registerPublicAccount,
  sendRegisterVerificationCode,
  shouldShowAdminEntry,
  type AccountAccessStatus,
  type AccountBillingOrderRecord,
  type AccountEntitlementRecord,
  type AccountForecastHistoryRecord,
  type CaptchaToken,
  type PublicAccountSession,
} from "../../components/account-session";
import {
  invalidCredentialsMessage,
  loginServiceUnavailableMessage,
  sanitizeAuthErrorMessage,
} from "../../components/auth-errors";
import { CollapsibleSection } from "../../components/collapsible-section";
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
import { getStoredAdminTokens, sessionHasAdminAccess, storeAdminSession } from "../admin/admin-api";
import AdminLoginPage from "../admin/login/page";
import LoginPage, { metadata as loginMetadata } from "../login/page";
import { publicLoginFormLabels } from "../login/login-form";
import RegisterPage, { metadata as registerMetadata } from "../register/page";
import {
  buildRegisteredLoginHref,
  canSubmitRegisterForm,
  getRegisterPasswordStatusMessage,
  publicRegisterFormLabels,
} from "../register/register-form";

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

const baseFreeAccess: AccountAccessStatus = {
  userId: "user-1",
  tier: "free",
  hasFullAccess: false,
  maxForecastHours: 24,
  allowedTargets: ["general"],
  canViewFullHistory: false,
  currentPlanName: "免费版",
  remainingDays: null,
  trialExpired: false,
  upgradeRequiredForFullAccess: true,
  freeLimitMessage: "当前账户只能查看未来 24 小时基础天气。",
  reason: "none",
};

function createAccountAccess(overrides: Partial<AccountAccessStatus> = {}): AccountAccessStatus {
  return {
    ...baseFreeAccess,
    ...overrides,
  };
}

const baseBillingOrder: AccountBillingOrderRecord = {
  orderNo: "P202606210001",
  provider: "wechat_pay",
  amountCents: 1900,
  currency: "CNY",
  productCode: "monthly_full",
  status: "paid",
  paidAt: "2026-06-21T08:05:00.000Z",
  expiresAt: null,
  providerTradeNo: "wx-transaction-id",
  entitlementGrantedAt: "2026-06-21T08:05:01.000Z",
  createdAt: "2026-06-21T08:00:00.000Z",
  updatedAt: "2026-06-21T08:05:01.000Z",
};

function createBillingOrderRecord(
  overrides: Partial<AccountBillingOrderRecord> = {},
): AccountBillingOrderRecord {
  return {
    ...baseBillingOrder,
    ...overrides,
  };
}

afterEach(() => {
  routerReplaceMock.mockReset();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function createLocalStorageMock(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key: string) => store.get(key) ?? null,
    key: (index: number) => [...store.keys()][index] ?? null,
    removeItem: (key: string) => {
      store.delete(key);
    },
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
  };
}

function installBrowserWindow() {
  const localStorage = createLocalStorageMock();
  vi.stubGlobal("window", {
    localStorage,
    location: {
      pathname: "/account",
      search: "",
      href: "/account",
    },
  });

  return { localStorage };
}

function createStoredSession(overrides: Partial<Parameters<typeof storeAdminSession>[0]> = {}) {
  return {
    accessToken: "account-access-token",
    refreshToken: "account-refresh-token",
    accessTokenExpiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    sessionExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    user: baseAccountSession.user,
    profile: baseAccountSession.profile,
    roles: baseAccountSession.roles,
    roleCodes: baseAccountSession.roleCodes,
    permissions: baseAccountSession.permissions,
    isAdmin: baseAccountSession.isAdmin,
    ...overrides,
  };
}

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
    expect(html).toContain("外观");
    expect(html).toContain("跟随系统");
    expect(html).toContain("浅色");
    expect(html).toContain("深色");
    expect(html.match(/role="menuitemradio"/g)?.length ?? 0).toBe(3);
    expect(html.match(/退出登录/g)?.length ?? 0).toBe(1);
    expect(html).toMatch(/<button\b[^>]*role="menuitem"[^>]*>\s*退出登录\s*<\/button>/);
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
      "会员与套餐",
      "账户资料",
      "安全设置",
      "查询历史",
      "绑定方式",
      "注销账户",
    ]);
    expect(accountCenterSectionLabels).not.toContain("管理入口");
  });

  it("shows the unauthenticated account login prompt", () => {
    const html = renderToStaticMarkup(React.createElement(UnauthenticatedAccountPrompt));

    expect(html).toContain('data-auth-account-prompt="compact-auth-prompt"');
    expect(html).toContain("登录后查看账户中心");
    expect(html).toContain("登录后可以查看历史分析、订单和绑定方式");
    expect(html).toContain("历史分析");
    expect(html).toContain("订单和次数");
    expect(html).toContain("绑定方式");
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
    expect(html).toContain("会员与套餐");
    expect(html).toContain("正在读取会员状态");
    expect(html).toContain("查询历史");
    expect(html).toContain("查询历史默认收起，展开后查看最近分析。");
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain("展开");
    expect(html).not.toContain("暂无查询历史");
    expect(html).toContain("修改密码");
    expect(html).toContain("当前密码");
    expect(html).toContain("新密码");
    expect(html).toContain("确认新密码");
    expect(html).toContain("保存新密码");
    expect(html).toContain("修改绑定邮箱");
    expect(html).toContain("绑定/修改手机");
    expect(html).toContain("注销账户");
    expect(html).toContain("2026/06/01");
    expect(html).toContain("2026/06/10");
    expect(html).toContain("2026/06/17");
    expect(html).not.toContain("当前会话");
    expect(html).not.toContain("退出登录");
    expect(html).not.toContain("正在退出");
    expect(html).not.toContain("如需更换设备或结束本机登录");
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

  it("keeps forecast history collapsed by default while preserving target jump links", () => {
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
    expect(html).toContain("查询历史");
    expect(html).toContain("1 笔");
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain("测试山顶");
    expect(html).not.toContain("推荐前往");
    expect(html).not.toContain("82 分");
    expect(html).not.toContain("打开分析");
    expect(html).not.toContain('href="/cloud-sea?');
    expect(html).not.toContain("坐标不足");
  });

  it("renders collapsed-section children only after expansion", () => {
    const closedHtml = renderToStaticMarkup(
      React.createElement(
        CollapsibleSection,
        {
          title: "查询历史",
          description: "查询历史默认收起，展开后查看最近分析。",
          count: 1,
        },
        React.createElement("div", null, "测试山顶"),
      ),
    );
    const openHtml = renderToStaticMarkup(
      React.createElement(
        CollapsibleSection,
        {
          title: "查询历史",
          description: "查询历史默认收起，展开后查看最近分析。",
          count: 1,
          open: true,
        },
        React.createElement("div", null, "测试山顶"),
      ),
    );

    expect(closedHtml).toContain('aria-expanded="false"');
    expect(closedHtml).toContain("展开");
    expect(closedHtml).not.toContain("测试山顶");
    expect(openHtml).toContain('aria-expanded="true"');
    expect(openHtml).toContain("收起");
    expect(openHtml).toContain("测试山顶");
  });

  it("renders a clean admin membership state without missing trial or paid fields", () => {
    const adminHtml = renderAuthenticatedAccountCenter(
      {
        ...baseAccountSession,
        roles: [{ id: "role-admin", code: "admin", name: "admin", displayName: "管理员" }],
        roleCodes: ["admin"],
        permissions: ["admin.manage"],
        isAdmin: true,
      },
      [],
      {
        orders: [],
        entitlements: [],
        access: createAccountAccess({
          tier: "admin",
          hasFullAccess: true,
          maxForecastHours: 168,
          allowedTargets: ["general", "cloud_sea", "glow", "astro"],
          canViewFullHistory: true,
          currentPlanName: "管理员",
          upgradeRequiredForFullAccess: false,
          reason: "admin",
        }),
      },
    );

    expect(adminHtml).toContain('data-account-membership-panel="compact"');
    expect(adminHtml).toContain('data-membership-state="admin"');
    expect(adminHtml).toContain("管理员");
    expect(adminHtml).toContain("完整访问");
    expect(adminHtml).toContain("不受套餐限制");
    expect(adminHtml).toContain("进入管理后台");
    expect(adminHtml).toContain('href="/admin"');
    expect(adminHtml.match(/进入管理后台/g)?.length ?? 0).toBe(1);
    expect(adminHtml).not.toContain("管理入口");
    expect(adminHtml).not.toContain("管理系统配置、服务商配置和历史校准。");
    expect(adminHtml).not.toContain("试用剩余");
    expect(adminHtml).not.toContain("付费套餐");
    expect(adminHtml).not.toContain("到期时间");
    expect(adminHtml).not.toContain("剩余天数");
    expect(adminHtml).not.toContain("暂无数据");
    expect(adminHtml).not.toContain(">暂无订单<");
    expect(adminHtml).not.toContain("暂无订单记录");
    expect(adminHtml).not.toContain("border-dashed");
  });

  it("renders a clean free membership state with one upgrade CTA", () => {
    const html = renderAuthenticatedAccountCenter(baseAccountSession, [], {
      orders: [],
      entitlements: [],
      access: baseFreeAccess,
    });

    expect(html).toContain('data-membership-state="free"');
    expect(html).toContain("免费版");
    expect(html).toContain("可查询：未来 24 小时基础天气");
    expect(html).toContain("查看月卡/季卡/年卡");
    expect(html).toContain('href="/pricing"');
    expect(html).toContain("付费订单");
    expect(html).toContain("0 笔");
    expect(html).not.toContain("暂无付费订单");
    expect(html).not.toContain("付费套餐");
    expect(html).not.toContain("试用剩余");
    expect(html).not.toContain("暂无数据");
    expect(html).not.toContain(">暂无订单<");
    expect(html).not.toContain("border-dashed");
  });

  it("renders an expired trial as a concise free-state membership message", () => {
    const html = renderAuthenticatedAccountCenter(baseAccountSession, [], {
      orders: [],
      entitlements: [],
      access: createAccountAccess({
        trialExpired: true,
        reason: "expired",
      }),
    });

    expect(html).toContain('data-membership-state="free"');
    expect(html).toContain("免费版");
    expect(html).toContain("7 天试用已结束，开通套餐后恢复完整摄影判断。");
    expect(html).toContain("查看月卡/季卡/年卡");
    expect(html).not.toContain("付费套餐");
    expect(html).not.toContain("试用剩余");
    expect(html).not.toContain("暂无数据");
  });

  it("renders active trial membership with remaining days and expiration only", () => {
    const html = renderAuthenticatedAccountCenter(baseAccountSession, [], {
      orders: [
        createBillingOrderRecord({
          orderNo: "T202606210001",
          provider: "mock",
          amountCents: 0,
          productCode: "trial_7_days",
          providerTradeNo: "registration_trial:user-1",
        }),
      ],
      entitlements: [],
      access: createAccountAccess({
        tier: "trial",
        hasFullAccess: true,
        maxForecastHours: 168,
        allowedTargets: ["general", "cloud_sea", "glow", "astro"],
        canViewFullHistory: true,
        activeEntitlementId: "entitlement-trial",
        activeProductCode: "trial_7_days",
        entitlementExpiresAt: "2026-06-29T08:05:01.000Z",
        currentPlanName: "7 天试用",
        remainingDays: 7,
        upgradeRequiredForFullAccess: false,
        reason: "trial_active",
      }),
    });

    expect(html).toContain('data-membership-state="trial"');
    expect(html).toContain("7 天试用");
    expect(html).toContain("试用剩余");
    expect(html).toContain("7 天");
    expect(html).toContain("到期时间");
    expect(html).toContain("2026/06/29");
    expect(html).toContain("完整权限");
    expect(html).toContain("续费/升级");
    expect(html).toContain("续费后，有效期会接在当前试用到期后顺延。");
    expect(html).toContain("付费订单");
    expect(html).toContain("0 笔");
    expect(html).not.toContain("付费套餐");
    expect(html).not.toContain("T202606210001");
    expect(html).not.toContain("模拟支付");
    expect(html).not.toContain("¥0.00");
    expect(html).not.toContain("registration_trial");
    expect(html).not.toContain("trial_7_days");
    expect(html).not.toContain("暂无订单记录");
    expect(html).not.toContain("暂无数据");
  });

  it("renders paid membership with plan, expiration, remaining days, renewal CTA, and collapsed paid orders", () => {
    const html = renderAuthenticatedAccountCenter(baseAccountSession, [], {
      orders: [createBillingOrderRecord()],
      entitlements: [
        {
          id: "entitlement-1",
          type: "full_forecast_access",
          quantity: 1,
          remainingQuantity: null,
          startsAt: "2026-06-21T08:05:01.000Z",
          expiresAt: "2026-07-21T08:05:01.000Z",
          grantedAt: "2026-06-21T08:05:01.000Z",
        },
      ],
      access: createAccountAccess({
        tier: "monthly",
        hasFullAccess: true,
        maxForecastHours: 168,
        allowedTargets: ["general", "cloud_sea", "glow", "astro"],
        canViewFullHistory: true,
        activeEntitlementId: "entitlement-1",
        activeProductCode: "monthly_full",
        entitlementExpiresAt: "2026-07-21T08:05:01.000Z",
        currentPlanName: "月卡",
        remainingDays: 30,
        upgradeRequiredForFullAccess: false,
        reason: "paid_active",
      }),
    });

    expect(html).toContain('data-membership-state="paid"');
    expect(html).toContain("会员与套餐");
    expect(html).toContain("当前套餐");
    expect(html).toContain("月卡");
    expect(html).toContain("到期时间");
    expect(html).toContain("2026/07/21");
    expect(html).toContain("剩余天数");
    expect(html).toContain("30 天");
    expect(html).toContain("完整权限");
    expect(html).toContain(">续费</a>");
    expect(html).toContain("续费后，有效期会从当前到期时间继续顺延。");
    expect(html).toContain("未来 168 小时");
    expect(html).toContain("付费订单");
    expect(html).toContain("1 笔");
    expect(html).toContain("付费订单只展示月卡、季卡、年卡等实际购买记录。");
    expect(html).not.toContain("P202606210001");
    expect(html).not.toContain("微信支付");
    expect(html).not.toContain("已支付</");
    expect(html).not.toContain("monthly_full");
    expect(html).not.toContain("权益记录");
    expect(html).not.toContain("已支付订单");
    expect(html).not.toContain("暂无数据");
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

  it("keeps membership empty orders compact and avoids large blank desktop panels", () => {
    const html = renderAuthenticatedAccountCenter(baseAccountSession, [], {
      orders: [],
      entitlements: [],
      access: baseFreeAccess,
    });

    expect(html).toContain('data-account-membership-panel="compact"');
    expect(html).toContain('data-membership-orders="compact"');
    expect(html).toContain("付费订单");
    expect(html).toContain("0 笔");
    expect(html).not.toContain("暂无付费订单");
    expect(html).not.toContain(">暂无订单<");
    expect(html).not.toContain("购买月卡、季卡或年卡后，订单状态和会员有效期会显示在这里。");
    expect(html).not.toContain("查看定价");
    expect(html).not.toContain("lg:grid-cols-[220px_minmax(0,1fr)]");
    expect(html).not.toContain("border-dashed");
    expect(html).not.toContain("overflow-x-auto");
  });

  it("keeps empty history collapsed by default without large placeholders", () => {
    const html = renderAuthenticatedAccountCenter(baseAccountSession, []);

    expect(html).toContain("查询历史");
    expect(html).toContain("查询历史默认收起，展开后查看最近分析。");
    expect(html).not.toContain("暂无查询历史");
    expect(html).not.toContain("完成一次天气分析后，最近记录会自动出现在这里。");
    expect(html).not.toContain("开始分析");
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
      expect(html).not.toContain("lg:grid-cols-[minmax(0,1fr)_220px]");
      expect(html).not.toContain("当前会话");
      expect(html).not.toContain("退出登录");
      expect(html).toContain("安全设置");
      expect(html).toContain("保存新密码");
      expect(html).not.toContain(">placeholder<");
      expect(html).not.toContain("filler");
      expect(html).not.toContain("coming soon");
      expect(html).not.toContain("\u5360\u4f4d");
      expect(html).not.toContain("\u656c\u8bf7\u671f\u5f85");
      expect(html).not.toContain("\u6682\u65e0\u529f\u80fd");
      expect(html).not.toContain("overflow-x-auto");
      expect(html).not.toContain("管理系统配置、服务商配置和历史校准。");
    }

    expect(userHtml).not.toContain('href="/admin"');
    expect(userHtml).not.toContain("进入管理后台");
    expect(userHtml).not.toContain("data-account-admin-placeholder");
    expect(userHtml).not.toContain("data-empty-admin-slot");
    expect(adminHtml).not.toContain("data-account-admin-placeholder");
    expect(adminHtml).not.toContain("data-empty-admin-slot");
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

  it("renders one membership admin CTA only for admin sessions", () => {
    const userHtml = renderAuthenticatedAccountCenter(baseAccountSession);
    const adminHtml = renderAuthenticatedAccountCenter(
      {
        ...baseAccountSession,
        roles: [{ id: "role-admin", code: "admin", name: "admin", displayName: "管理员" }],
        roleCodes: ["admin"],
        permissions: ["admin.manage"],
        isAdmin: true,
      },
      [],
      {
        orders: [],
        entitlements: [],
        access: createAccountAccess({
          tier: "admin",
          hasFullAccess: true,
          maxForecastHours: 168,
          allowedTargets: ["general", "cloud_sea", "glow", "astro"],
          canViewFullHistory: true,
          currentPlanName: "管理员",
          upgradeRequiredForFullAccess: false,
          reason: "admin",
        }),
      },
    );
    const adminMenuHtml = renderPublicAccountMenu({ showAdminEntry: true });

    expect(userHtml).not.toContain("进入管理后台");
    expect(userHtml).not.toContain('href="/admin"');
    expect(adminHtml).toContain('data-account-membership-panel="compact"');
    expect(adminHtml).toContain('data-membership-state="admin"');
    expect(adminHtml).toContain("进入管理后台");
    expect(adminHtml).toContain('href="/admin"');
    expect(adminHtml.match(/进入管理后台/g)?.length ?? 0).toBe(1);
    expect(adminHtml).toContain("管理员");
    expect(adminHtml).not.toContain("管理入口");
    expect(adminHtml).not.toContain("管理系统配置、服务商配置和历史校准。");
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
    const html = renderAuthenticatedAccountCenter(
      {
        ...baseAccountSession,
        roles: [{ id: "role-admin", code: "admin", name: "admin", displayName: "admin" }],
        roleCodes: ["admin"],
        permissions: rawPermissionCodes,
        isAdmin: true,
      },
      [],
      {
        orders: [],
        entitlements: [],
        access: createAccountAccess({
          tier: "admin",
          hasFullAccess: true,
          maxForecastHours: 168,
          allowedTargets: ["general", "cloud_sea", "glow", "astro"],
          canViewFullHistory: true,
          currentPlanName: "管理员",
          upgradeRequiredForFullAccess: false,
          reason: "admin",
        }),
      },
    );

    expect(html).toContain('href="/admin"');
    expect(html.match(/进入管理后台/g)?.length ?? 0).toBe(1);
    expect(html).not.toContain("管理入口");
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
      "暂无数据",
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

  it("renders the public login page as a centered auth form layout", () => {
    const html = renderToStaticMarkup(
      React.createElement(LoginPage, {
        searchParams: {
          registered: "1",
          identifier: "photo@example.com",
        },
      }),
    );

    expect(html).toContain('data-auth-layout="centered-public-auth"');
    expect(html).toContain('data-auth-card="centered-form-card"');
    expect(html).toContain("max-w-[500px]");
    expect(html).not.toContain('data-auth-product-panel="practical-account-intro"');
    expect(html).not.toContain("lg:grid-cols-[minmax(0,1fr)_minmax(380px,460px)]");
    expect(html).not.toContain("登录账户，继续查看你的拍摄记录");
    expect(html).not.toContain("用邮箱或手机号登录。登录后可以查看历史分析、订单和账户设置。");
    expect(html).not.toContain("最近看过的地点更容易找回");
    expect(html).not.toContain("订单和可用次数放在一起");
    expect(html).not.toContain("有权限时显示后台入口");
    expect(html).not.toContain("登录后可以做什么");
    expect(html).toContain("输入邮箱或手机号和密码");
    expect(html).toContain("邮箱或手机号");
    expect(html).toContain("密码");
    expect(html).toContain('value="photo@example.com"');
    expect(html).toContain("账户已创建，可以用刚才的邮箱或手机号登录。");
    expect(html).toContain("显示密码");
    expect(html).toContain('href="/register"');
    expect(html).toContain('href="/"');
    expect(html).toContain("sm:grid-cols-2");
    for (const phrase of [
      "账户系统",
      "账户工作流",
      "授权进入运营控制台",
      "统一保存",
      "清晰可查",
      "面向风光摄影出行判断",
      "运营控制台",
      "特性",
      "工作流卡片",
    ]) {
      expect(html).not.toContain(phrase);
    }
  });

  it("keeps public login and admin login routes importable", () => {
    expect(LoginPage({})).toBeTruthy();
    expect(loginMetadata.title).toBe("用户登录 - 逐光天气");
    expect(publicLoginFormLabels).toEqual(["邮箱或手机号", "密码", "登录", "创建账户", "返回首页"]);
    expect(AdminLoginPage).toBeTypeOf("function");
  });

  it("renders the public register page as a centered auth form layout", () => {
    const html = renderToStaticMarkup(React.createElement(RegisterPage));

    expect(html).toContain('data-auth-layout="centered-public-auth"');
    expect(html).toContain('data-auth-card="centered-form-card"');
    expect(html).toContain("max-w-[580px]");
    expect(html).not.toContain('data-auth-product-panel="practical-account-intro"');
    expect(html).not.toContain("lg:grid-cols-[minmax(0,1fr)_minmax(380px,460px)]");
    expect(html).not.toContain("创建账户，保存你的拍摄判断");
    expect(html).not.toContain(
      "用邮箱或手机号完成验证。以后可以在账户中心查看历史记录、订单和绑定方式。",
    );
    expect(html).not.toContain("历史分析以后还能找到");
    expect(html).not.toContain("订单和次数跟随账户");
    expect(html).not.toContain("邮箱或手机号都可以使用");
    expect(html).not.toContain("注册前准备");
    expect(html).toContain("邮箱注册");
    expect(html).toContain("短信注册");
    expect(html).toContain("验证码");
    expect(html).toContain("发送验证码");
    expect(html).toContain("密码");
    expect(html).toContain("确认密码");
    expect(html).toContain('placeholder="请输入密码"');
    expect(html).toContain('placeholder="请再次输入密码"');
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*disabled=""/);
    expect(html).not.toContain("密码要求");
    expect(html).not.toContain("两次输入一致");
    expect(html).toContain("已有账户，去登录");
    expect(html).toContain("sm:grid-cols-[minmax(0,1fr)_136px]");
    for (const phrase of [
      "账户体系",
      "工作流",
      "统一管理订单与权益",
      "完成验证，开始管理你的摄影出行记录",
      "安全邮箱或短信验证",
      "编号",
      "信任列表",
    ]) {
      expect(html).not.toContain(phrase);
    }
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

  it("keeps register password validation blocking short or mismatched passwords", () => {
    const validRegistrationInput = {
      targetIsValid: true,
      code: "123456",
      password: "public88",
      confirmPassword: "public88",
      isSubmitting: false,
    };

    expect(canSubmitRegisterForm(validRegistrationInput)).toBe(true);
    expect(
      canSubmitRegisterForm({
        ...validRegistrationInput,
        password: "short",
        confirmPassword: "short",
      }),
    ).toBe(false);
    expect(getRegisterPasswordStatusMessage("short", "short")).toBe("密码至少需要 8 个字符。");
    expect(
      canSubmitRegisterForm({
        ...validRegistrationInput,
        confirmPassword: "public99",
      }),
    ).toBe(false);
    expect(getRegisterPasswordStatusMessage("public88", "public99")).toBe("两次输入的密码不一致。");
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
    readonly access?: AccountAccessStatus;
  },
): string {
  return renderToStaticMarkup(
    React.createElement(AuthenticatedAccountCenter, {
      session,
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
  const captchaToken: CaptchaToken = {
    providerCode: "tencent_captcha",
    ticket: "ticket-valid-123456",
    randstr: "@rand",
  };

  it("stores public login sessions with session expiration metadata", async () => {
    const { localStorage } = installBrowserWindow();
    const sessionExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const accessTokenExpiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          accessToken: "account-access-token",
          refreshToken: "account-refresh-token",
          accessTokenExpiresAt,
          sessionExpiresAt,
          sessionTtlDays: 7,
          sessionRoleType: "user",
          user: baseAccountSession.user,
          profile: baseAccountSession.profile,
          roles: baseAccountSession.roles,
          roleCodes: baseAccountSession.roleCodes,
          permissions: baseAccountSession.permissions,
          isAdmin: false,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    await expect(loginPublicAccount("photo@example.com", "public88")).resolves.toMatchObject({
      user: {
        id: "user-1",
      },
    });
    expect(getStoredAdminTokens()).toEqual({
      accessToken: "account-access-token",
      refreshToken: "account-refresh-token",
    });
    expect(localStorage.getItem("photo_weather_admin_session_expires_at")).toBe(sessionExpiresAt);
    expect(localStorage.getItem("photo_weather_admin_access_token_expires_at")).toBe(
      accessTokenExpiresAt,
    );
  });

  it("creates billing orders with productCode and provider only", async () => {
    installBrowserWindow();
    storeAdminSession(createStoredSession());
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          order: {
            orderNo: "P202606220001",
            provider: "wechat_pay",
            amountCents: 2100,
            currency: "CNY",
            productCode: "monthly_full",
            status: "pending",
            paidAt: null,
            expiresAt: null,
            providerTradeNo: null,
            entitlementGrantedAt: null,
            createdAt: "2026-06-22T08:00:00.000Z",
            updatedAt: "2026-06-22T08:00:00.000Z",
          },
          checkout: {
            kind: "mock",
            message: "测试支付",
          },
        }),
        {
          status: 201,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    await expect(
      createBillingOrder({ productCode: "monthly_full", provider: "wechat_pay" }),
    ).resolves.toMatchObject({
      order: {
        productCode: "monthly_full",
        amountCents: 2100,
      },
    });

    const [, init] = fetchSpy.mock.calls[0] ?? [];
    expect(fetchSpy).toHaveBeenCalledWith(
      "http://localhost:4000/billing/orders",
      expect.objectContaining({
        method: "POST",
      }),
    );
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({
      productCode: "monthly_full",
      provider: "wechat_pay",
    });
    expect(String((init as RequestInit).body)).not.toContain("amountCents");
    expect(String((init as RequestInit).body)).not.toContain("durationDays");
    expect(String((init as RequestInit).body)).not.toContain("grantType");
    expect(String((init as RequestInit).body)).not.toContain("hasFullAccess");
  });

  it("submits account password changes with the current refresh token", async () => {
    installBrowserWindow();
    storeAdminSession(createStoredSession());
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(baseAccountSession), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(
      changeAccountPassword({
        currentPassword: "old-public88",
        newPassword: "new-public88",
        confirmNewPassword: "new-public88",
      }),
    ).resolves.toMatchObject({
      user: {
        id: "user-1",
      },
    });

    const [, init] = fetchSpy.mock.calls[0] ?? [];
    expect(fetchSpy).toHaveBeenCalledWith(
      "http://localhost:4000/account/change-password",
      expect.objectContaining({
        method: "POST",
      }),
    );
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({
      currentPassword: "old-public88",
      newPassword: "new-public88",
      confirmNewPassword: "new-public88",
      currentRefreshToken: "account-refresh-token",
    });
  });

  it("clears public account storage when refresh token is expired or invalid", async () => {
    installBrowserWindow();
    storeAdminSession(createStoredSession());
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    fetchSpy
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "token_expired", message: "expired" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: "invalid_refresh_token",
            message: "Refresh token is invalid or expired.",
          }),
          {
            status: 401,
            headers: { "Content-Type": "application/json" },
          },
        ),
      );

    await expect(getCurrentAccountSession()).resolves.toBeNull();
    expect(getStoredAdminTokens()).toBeNull();
  });

  it("fetches public captcha config without leaking server fields", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          captcha: {
            enabled: true,
            providerCode: "tencent_captcha",
            captchaAppId: "199999164",
            sdkUrl: "https://turing.captcha.qcloud.com/TCaptcha.js",
            enforceOnLogin: true,
            enforceOnRegisterSendCode: true,
            enforceOnRegisterConfirm: false,
            enforceOnAccountBinding: true,
            secretKey: "server-secret",
            endpoint: "https://captcha.tencentcloudapi.com",
          },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    const config = await getCaptchaPublicConfig();
    expect(config).toEqual({
      enabled: true,
      providerCode: "tencent_captcha",
      captchaAppId: "199999164",
      sdkUrl: "https://turing.captcha.qcloud.com/TCaptcha.js",
      enforceOnLogin: true,
      enforceOnRegisterSendCode: true,
      enforceOnRegisterConfirm: false,
      enforceOnAccountBinding: true,
    });
    expect(fetchSpy).toHaveBeenCalledWith("http://localhost:4000/captcha/config", {
      cache: "no-store",
    });
    expect(JSON.stringify(config)).not.toContain("server-secret");
    expect(JSON.stringify(config)).not.toContain("captcha.tencentcloudapi.com");
  });

  it("sends captcha tokens through public auth request bodies", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    fetchSpy
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            accessToken: "access-token",
            refreshToken: "refresh-token",
            user: {
              id: "user-1",
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
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      )
      .mockResolvedValueOnce(
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
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            user: {
              id: "user-2",
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

    await loginPublicAccount("photo@example.com", "public88", captchaToken);
    await sendRegisterVerificationCode({
      channel: "email",
      target: "photo@example.com",
      captcha: captchaToken,
    });
    await confirmRegisterPublicAccount({
      channel: "email",
      target: "photo@example.com",
      code: "123456",
      password: "public88",
      captcha: captchaToken,
    });

    const requestBodies = fetchSpy.mock.calls.map(([, init]) =>
      JSON.parse(String((init as RequestInit).body)),
    );
    expect(requestBodies).toEqual([
      {
        identifier: "photo@example.com",
        password: "public88",
        captcha: captchaToken,
      },
      {
        channel: "email",
        target: "photo@example.com",
        captcha: captchaToken,
      },
      {
        channel: "email",
        target: "photo@example.com",
        code: "123456",
        password: "public88",
        captcha: captchaToken,
      },
    ]);
  });

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
