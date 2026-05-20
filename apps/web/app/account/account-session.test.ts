import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { shouldShowAdminEntry } from "../../components/account-session";
import { publicHeaderActionLabels, publicHeaderNavLabels } from "../../components/public-header";
import AccountPage, { metadata as accountMetadata } from "./page";
import { accountCenterSectionLabels, UnauthenticatedAccountPrompt } from "./account-center-client";
import AdminLoginPage from "../admin/login/page";
import LoginPage, { metadata as loginMetadata } from "../login/page";
import { publicLoginFormLabels } from "../login/login-form";
import RegisterPage, { metadata as registerMetadata } from "../register/page";
import { publicRegisterFormLabels } from "../register/register-form";

const testGlobal = globalThis as typeof globalThis & { React: typeof React };
testGlobal.React = React;

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
    expect(shouldShowAdminEntry({ roles: ["super_admin"], permissions: [] })).toBe(true);
    expect(shouldShowAdminEntry({ roles: ["user"], permissions: ["admin.manage"] })).toBe(true);
    expect(shouldShowAdminEntry({ roles: ["user"], permissions: ["locations.manage"] })).toBe(
      false,
    );
    expect(shouldShowAdminEntry(null)).toBe(false);
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
