import type { JsonValue, SafeUser } from "./types.js";

type JsonRecord = { readonly [key: string]: JsonValue };

const unknownUserLabel = "未知用户";
const systemActorLabel = "系统";

const actionLabels: Record<string, string> = {
  "account.delete.completed": "账户注销完成",
  "account.delete.requested": "请求注销账户",
  "account.email.changed": "更新绑定邮箱",
  "account.email.code_sent": "发送邮箱验证码",
  "account.email.verify_failure": "邮箱验证码校验失败",
  "account.forecast_history.cleared": "清空查询历史",
  "account.password.change_failure": "修改密码失败",
  "account.password.changed": "修改密码",
  "account.phone.changed": "更新绑定手机号",
  "account.phone.code_sent": "发送短信验证码",
  "account.phone.verify_failure": "短信验证码校验失败",
  "admin.order.cancel": "取消订单",
  "admin.order.close": "关闭订单",
  "admin.order.manual_mark_paid": "手动确认订单",
  "admin.order.update": "更新订单",
  "admin.user.create": "新建用户",
  "admin.user.disable": "禁用用户",
  "admin.user.enable": "启用用户",
  "admin.user.reset_password": "重置用户密码",
  "admin.user.revoke_sessions": "撤销用户会话",
  "admin.user.roles_update": "更新用户角色",
  "admin.user.update": "更新用户资料",
  "auth.captcha.failure": "人机验证失败",
  "auth.captcha.success": "人机验证通过",
  "auth.login.failure": "登录失败",
  "auth.login.success": "登录成功",
  "auth.logout.success": "退出登录",
  "auth.refresh.failure": "登录状态刷新失败",
  "auth.refresh.success": "刷新登录状态",
  "auth.register.code_sent": "发送注册验证码",
  "auth.register.confirmed": "注册成功",
  "auth.register.duplicate": "重复注册拦截",
  "auth.register.success": "注册成功",
  "auth.register.verify_failure": "注册验证码校验失败",
  "billing.entitlement.full_forecast_access_granted": "发放完整访问权益",
  "billing.entitlement.grant": "发放权益",
  "billing.entitlement.revoke": "取消权益",
  "billing.order.manual_mark_paid": "手动确认订单",
  "billing.order.mark_paid": "手动确认订单",
  "billing.order.update": "更新订单",
  "billing.product.update": "更新套餐定价",
  "calibration.history.fetch": "拉取历史天气",
  "calibration.outcome.update": "更新校准结果",
  "calibration.outcome.upsert": "记录校准结果",
  "calibration.replay.run": "历史回放",
  "cdn.prefetch": "CDN URL 预热",
  "cdn.refresh": "CDN 缓存刷新",
  "location.create": "旧版地点记录新增",
  "location.delete": "旧版地点记录删除",
  "location.update": "旧版地点记录编辑",
  "photo_spot.create": "旧版拍摄点记录新增",
  "photo_spot.delete": "旧版拍摄点记录删除",
  "photo_spot.update": "旧版拍摄点记录编辑",
  "provider_config.update": "更新服务商配置",
  "storage_test.delete": "删除对象存储测试文件",
  "storage_test.upload": "对象存储测试上传",
  "system_setting.update": "更新系统设置",
};

const providerLabels: Record<string, string> = {
  "ai:openai": "GPT / OpenAI",
  "ai:deepseek": "DeepSeek",
  "billing:alipay": "支付宝",
  "billing:mock": "模拟支付",
  "billing:wechat_pay": "微信支付",
  "captcha:tencent_captcha": "腾讯云验证码",
  "cdn:aliyun_cdn": "阿里云 CDN",
  "cdn:tencent_cdn": "腾讯云 CDN",
  "email:aliyun_smtp": "阿里云企业邮箱 SMTP",
  "geo:amap": "高德地图",
  "sms:aliyun_sms": "阿里云短信",
  "storage:aliyun_oss": "阿里云 OSS",
  "storage:local_storage": "本地存储",
  "storage:tencent_cos": "腾讯云 COS",
  "weather:meteoblue": "meteoblue",
  "weather:open_meteo": "Open-Meteo",
  "weather:qweather": "和风天气",
};

const providerTypeSummaries: Record<string, string> = {
  ai: "智能解读配置",
  billing: "支付收款配置",
  captcha: "人机验证配置",
  cdn: "CDN 加速配置",
  email: "邮箱验证码配置",
  geo: "地图服务配置",
  sms: "短信验证码配置",
  storage: "对象存储配置",
  weather: "天气数据配置",
};

const productLabels: Record<string, string> = {
  forecast_credit_20: "20 次专业预测包",
  forecast_credit_100: "100 次专业预测包",
  monthly_full: "月卡",
  quarterly_full: "季卡",
  trial_7_days: "注册赠送 7 天",
  yearly_full: "年卡",
};

const targetLabels: Record<string, string> = {
  account: "账户操作",
  auth: "账户登录",
  billing_product: "套餐定价",
  cdn_provider: "CDN 服务商",
  forecast_replay_run: "历史回放",
  historical_weather_sample: "历史天气",
  location: "旧版地点",
  observed_outcome: "历史校准",
  payment_order: "订单",
  photo_spot: "旧版拍摄点",
  provider_config: "服务商配置",
  storage_object: "测试对象",
  system_setting: "系统设置",
  user: "用户",
};

export function maskEmail(email: string | null | undefined): string | null {
  const value = email?.trim();
  if (!value) {
    return null;
  }
  const [name, domain] = value.split("@");
  if (!name || !domain) {
    return value;
  }
  const visible = name.length <= 2 ? name.slice(0, 1) : name.slice(0, 2);
  return `${visible}***@${domain}`;
}

export function maskPhone(phone: string | null | undefined): string | null {
  const value = phone?.trim();
  if (!value) {
    return null;
  }
  return value.length === 11 ? `${value.slice(0, 3)}****${value.slice(-4)}` : value;
}

export function actionDisplayName(action: string): string {
  return actionLabels[action] ?? "系统操作";
}

export function productDisplayName(productCode: string | null | undefined): string {
  const value = productCode?.trim();
  return value ? productLabels[value] ?? "会员套餐" : "会员套餐";
}

export function providerDisplayName(
  providerType: string | null | undefined,
  providerCode: string | null | undefined,
): string {
  const key = `${providerType ?? ""}:${providerCode ?? ""}`;
  return providerLabels[key] ?? "服务商";
}

export function safeUserDisplayLabel(
  user: Pick<SafeUser, "displayName" | "email" | "phone"> | null | undefined,
): {
  readonly actorDisplayName: string;
  readonly actorEmailMasked: string | null;
  readonly actorPhoneMasked: string | null;
  readonly actorLabel: string;
} {
  const displayName = user?.displayName?.trim() || "";
  const emailMasked = maskEmail(user?.email);
  const phoneMasked = maskPhone(user?.phone);
  const actorLabel = displayName || emailMasked || phoneMasked || unknownUserLabel;

  return {
    actorDisplayName: displayName || actorLabel,
    actorEmailMasked: emailMasked,
    actorPhoneMasked: phoneMasked,
    actorLabel,
  };
}

export function buildAuditLogDisplay(input: {
  readonly actorUserId: string | null;
  readonly actor?: Pick<SafeUser, "displayName" | "email" | "phone"> | null;
  readonly action: string;
  readonly targetType: string;
  readonly targetId: string | null;
  readonly beforeJson: JsonValue | null;
  readonly afterJson: JsonValue | null;
}): {
  readonly actorDisplayName: string;
  readonly actorEmailMasked: string | null;
  readonly actorPhoneMasked: string | null;
  readonly actorLabel: string;
  readonly actionLabel: string;
  readonly targetLabel: string;
  readonly targetSummary: string;
  readonly technicalActorUserId: string | null;
  readonly technicalTargetId: string | null;
} {
  const actor =
    input.actorUserId === null
      ? {
          actorDisplayName: systemActorLabel,
          actorEmailMasked: null,
          actorPhoneMasked: null,
          actorLabel: systemActorLabel,
        }
      : safeUserDisplayLabel(input.actor);
  const target = targetDisplay(input);

  return {
    ...actor,
    actionLabel: actionDisplayName(input.action),
    targetLabel: target.targetLabel,
    targetSummary: target.targetSummary,
    technicalActorUserId: input.actorUserId,
    technicalTargetId: input.targetId,
  };
}

function targetDisplay(input: {
  readonly action: string;
  readonly targetType: string;
  readonly targetId: string | null;
  readonly beforeJson: JsonValue | null;
  readonly afterJson: JsonValue | null;
}): { readonly targetLabel: string; readonly targetSummary: string } {
  if (input.targetType === "auth") {
    return authTargetDisplay(input);
  }
  if (input.targetType === "account") {
    return accountTargetDisplay(input);
  }
  if (input.targetType === "provider_config" || input.targetType === "cdn_provider") {
    return providerTargetDisplay(input);
  }
  if (input.targetType === "system_setting") {
    const label = readAuditString(input, "label") ?? "系统设置";
    const key = readAuditString(input, "key");
    return { targetLabel: label, targetSummary: key ? "系统设置" : "系统设置" };
  }
  if (input.targetType === "billing_product") {
    const name =
      readAuditString(input, "name") ??
      productDisplayName(readAuditString(input, "code") ?? input.targetId);
    return { targetLabel: name, targetSummary: "套餐定价" };
  }
  if (input.targetType === "payment_order") {
    return paymentOrderTargetDisplay(input);
  }
  if (input.targetType === "user") {
    return userTargetDisplay(input);
  }
  if (input.targetType === "storage_object") {
    const providerCode =
      readAuditString(input, "providerCode") ?? parseProviderIdentity(input.targetId).providerCode;
    return {
      targetLabel: providerDisplayName("storage", providerCode),
      targetSummary: "测试对象",
    };
  }
  if (
    input.targetType === "observed_outcome" ||
    input.targetType === "historical_weather_sample" ||
    input.targetType === "forecast_replay_run"
  ) {
    return calibrationTargetDisplay(input);
  }

  return {
    targetLabel: targetLabels[input.targetType] ?? "操作对象",
    targetSummary: "后台操作",
  };
}

function authTargetDisplay(input: {
  readonly action: string;
  readonly targetId: string | null;
  readonly beforeJson: JsonValue | null;
  readonly afterJson: JsonValue | null;
}) {
  const targetMasked =
    readAuditString(input, "targetMasked") ??
    maskContact(input.targetId) ??
    readAuditString(input, "channel");
  const targetLabel = input.action.includes("register")
    ? "账户注册"
    : input.action.includes("refresh")
      ? "登录状态"
      : input.action.includes("logout")
        ? "退出登录"
        : input.action.includes("captcha")
          ? "人机验证"
          : "账户登录";
  return {
    targetLabel,
    targetSummary: targetMasked || "账户操作",
  };
}

function accountTargetDisplay(input: {
  readonly targetId: string | null;
  readonly beforeJson: JsonValue | null;
  readonly afterJson: JsonValue | null;
}) {
  const targetMasked = readAuditString(input, "targetMasked") ?? maskContact(input.targetId);
  return {
    targetLabel: "账户操作",
    targetSummary: targetMasked || "账户资料",
  };
}

function providerTargetDisplay(input: {
  readonly targetType: string;
  readonly targetId: string | null;
  readonly beforeJson: JsonValue | null;
  readonly afterJson: JsonValue | null;
}) {
  const parsed = parseProviderIdentity(input.targetId);
  const providerType = readAuditString(input, "providerType") ?? parsed.providerType;
  const providerCode = readAuditString(input, "providerCode") ?? parsed.providerCode;
  const displayName =
    readAuditString(input, "displayName") ?? providerDisplayName(providerType, providerCode);
  return {
    targetLabel: displayName,
    targetSummary:
      input.targetType === "cdn_provider"
        ? "CDN 加速配置"
        : providerTypeSummaries[providerType ?? ""] ?? "服务商配置",
  };
}

function paymentOrderTargetDisplay(input: {
  readonly targetId: string | null;
  readonly beforeJson: JsonValue | null;
  readonly afterJson: JsonValue | null;
}) {
  const orderNo = readAuditString(input, "orderNo") ?? input.targetId;
  const productCode = readAuditString(input, "productCode");
  const status = readAuditString(input, "status");
  const summary = [
    productCode ? productDisplayName(productCode) : null,
    status ? orderStatusLabel(status) : null,
  ]
    .filter(Boolean)
    .join(" / ");
  return {
    targetLabel: orderNo && !looksLikeInternalIdentifier(orderNo) ? orderNo : "订单",
    targetSummary: summary || "订单操作",
  };
}

function userTargetDisplay(input: {
  readonly beforeJson: JsonValue | null;
  readonly afterJson: JsonValue | null;
}) {
  const label =
    readAuditString(input, "displayName") ||
    maskEmail(readAuditString(input, "email")) ||
    maskPhone(readAuditString(input, "phone"));
  return {
    targetLabel: label || "用户",
    targetSummary: "用户账户",
  };
}

function calibrationTargetDisplay(input: {
  readonly targetType: string;
  readonly beforeJson: JsonValue | null;
  readonly afterJson: JsonValue | null;
}) {
  const locationName = readAuditString(input, "locationName");
  const target = readAuditString(input, "target");
  const startDate = readAuditString(input, "startDate") ?? readAuditString(input, "outcomeDate");
  const endDate = readAuditString(input, "endDate");
  const dateText = startDate && endDate ? `${startDate} 至 ${endDate}` : startDate;
  const summary = [target ? forecastTargetLabel(target) : null, dateText]
    .filter(Boolean)
    .join(" / ");

  return {
    targetLabel: locationName || targetLabels[input.targetType] || "历史校准",
    targetSummary: summary || "历史校准",
  };
}

function parseProviderIdentity(value: string | null | undefined): {
  readonly providerType: string | null;
  readonly providerCode: string | null;
} {
  const [providerType, providerCode] = value?.split(":") ?? [];
  return {
    providerType: providerType?.trim() || null,
    providerCode: providerCode?.trim() || null,
  };
}

function readAuditString(
  input: { readonly beforeJson: JsonValue | null; readonly afterJson: JsonValue | null },
  key: string,
): string | null {
  return readString(input.afterJson, key) ?? readString(input.beforeJson, key);
}

function readString(value: JsonValue | null | undefined, key: string): string | null {
  if (!isJsonRecord(value)) {
    return null;
  }
  const field = value[key];
  return typeof field === "string" && field.trim() ? field.trim() : null;
}

function isJsonRecord(value: JsonValue | null | undefined): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function maskContact(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  if (value.includes("@")) {
    return maskEmail(value);
  }
  if (/^\+?\d[\d\s-]{6,}$/.test(value)) {
    return maskPhone(value.replace(/[\s-]/g, "").replace(/^\+?86/, ""));
  }
  return looksLikeInternalIdentifier(value) ? null : value;
}

function looksLikeInternalIdentifier(value: string): boolean {
  return (
    /^c[a-z0-9]{20,32}$/i.test(value) ||
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}

function orderStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    canceled: "已取消",
    closed: "已关闭",
    created: "已创建",
    failed: "支付失败",
    paid: "已支付",
    pending: "待支付",
    refunded: "已退款",
  };
  return labels[status] ?? "状态更新";
}

function forecastTargetLabel(target: string): string {
  const labels: Record<string, string> = {
    astro: "星空银河",
    cloud_sea: "云海",
    general: "综合天气",
    glow: "朝霞晚霞",
  };
  return labels[target] ?? "历史校准";
}
