import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const componentDir = resolve(__dirname, "components");

const providersSource = readFileSync(resolve(componentDir, "admin-providers-client.tsx"), "utf8");
const settingsSource = readFileSync(resolve(componentDir, "admin-settings-client.tsx"), "utf8");
const productsSource = readFileSync(resolve(componentDir, "admin-products-client.tsx"), "utf8");
const calibrationSource = readFileSync(resolve(componentDir, "admin-calibration-client.tsx"), "utf8");
const usersSource = readFileSync(resolve(componentDir, "admin-users-client.tsx"), "utf8");
const userDetailSource = readFileSync(
  resolve(componentDir, "admin-user-detail-client.tsx"),
  "utf8",
);
const ordersSource = readFileSync(resolve(componentDir, "admin-orders-client.tsx"), "utf8");
const orderDetailSource = readFileSync(
  resolve(componentDir, "admin-order-detail-client.tsx"),
  "utf8",
);

const actionClientSources = [
  providersSource,
  settingsSource,
  productsSource,
  calibrationSource,
  usersSource,
  userDetailSource,
  ordersSource,
  orderDetailSource,
];

describe("admin action feedback coverage", () => {
  it("mounts the shared action toast on every admin mutation/action client", () => {
    for (const source of actionClientSources) {
      expect(source).toContain("AdminActionToast");
      expect(source).toContain("showActionToast");
      expect(source).toContain('variant: "saving"');
      expect(source).toContain('variant: "success"');
      expect(source).toContain('variant: "error"');
    }
  });

  it("covers provider save, no-change save, test, email test, and CDN actions", () => {
    for (const snippet of [
      "当前配置已是最新。",
      "正在保存「${providerName(provider)}」配置...",
      "providerSaveErrorMessage(error)",
      "providerTestErrorMessage(provider, error)",
      "正在测试「${providerName(provider)}」连接...",
      "正在通过「${providerName(provider)}」发送测试邮件...",
      "CDN 缓存刷新",
      "CDN URL 预热",
      "ProviderSaveDetailMessage",
      "<FeedbackPill state={saveState} dirty={dirty} />",
    ]) {
      expect(providersSource).toContain(snippet);
    }
  });

  it("covers settings, product pricing, and calibration save/action feedback", () => {
    expect(settingsSource).toContain("保存系统设置");
    expect(settingsSource).toContain("parseSettingValue");
    expect(settingsSource).toContain("保存中...");
    expect(settingsSource).toContain("保存失败：${message}");

    expect(productsSource).toContain("保存套餐定价");
    expect(productsSource).toContain("正在保存「${productName}」...");
    expect(productsSource).toContain("套餐保存失败：${errorMessage}");

    for (const snippet of [
      "正在拉取历史天气...",
      "历史天气已入库",
      "正在执行历史回放...",
      "历史回放完成",
      "正在计算校准统计...",
      "校准统计已更新。",
      "正在保存观测标注...",
      "观测标注已保存。",
      "地点搜索",
    ]) {
      expect(calibrationSource).toContain(snippet);
    }
  });

  it("covers user and order admin actions without leaking one-time passwords", () => {
    expect(usersSource).toContain("创建用户");

    for (const source of [usersSource, userDetailSource]) {
      expect(source).toContain("用户操作");
      expect(source).toContain("临时密码已生成，请查看页面提示。");
      expect(source).not.toContain("message: result.generatedPassword");
      expect(source).not.toContain("message: temporaryPassword");
    }

    for (const source of [ordersSource, orderDetailSource]) {
      expect(source).toContain("订单操作");
      expect(source).toContain("订单已手动标记支付并发放权益。");
      expect(source).toContain("订单已取消。");
      expect(source).toContain("订单已关闭。");
    }
    expect(orderDetailSource).toContain("保存订单备注");
    expect(orderDetailSource).toContain("订单备注已保存。");
  });

  it("keeps provider toast messages away from raw secret/config internals", () => {
    expect(providersSource).not.toContain("message: secretJson");
    expect(providersSource).not.toContain("message: configJson");
    expect(providersSource).not.toContain("message: payload.secretJson");
    expect(providersSource).not.toContain("message: JSON.stringify(payload)");
    expect(providersSource).not.toContain("JSON.stringify(result)");
  });
});
