export function looksLikeCuid(value: string | null | undefined): boolean {
  return Boolean(value && /^c[a-z0-9]{20,32}$/i.test(value.trim()));
}

export function looksLikeUuid(value: string | null | undefined): boolean {
  return Boolean(
    value &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value.trim(),
      ),
  );
}

export function looksLikeDeveloperIdentifier(value: string | null | undefined): boolean {
  const text = value?.trim();
  if (!text) {
    return false;
  }
  return (
    looksLikeCuid(text) ||
    looksLikeUuid(text) ||
    /^(actorUserId|targetId|userId|roleId|permissionId|orderId|entitlementId|sessionId|refreshTokenHash|queryKey|providerCode|productCode)$/i.test(
      text,
    )
  );
}

export function maskEmail(value: string | null | undefined): string | null {
  const email = value?.trim();
  if (!email) {
    return null;
  }
  const [name, domain] = email.split("@");
  if (!name || !domain) {
    return email;
  }
  const visible = name.length <= 2 ? name.slice(0, 1) : name.slice(0, 2);
  return `${visible}***@${domain}`;
}

export function maskPhone(value: string | null | undefined): string | null {
  const phone = value?.trim();
  if (!phone) {
    return null;
  }
  return phone.length === 11 ? `${phone.slice(0, 3)}****${phone.slice(-4)}` : phone;
}

export function compactIdentifierForTechnicalDetails(value: string | null | undefined): string {
  const text = value?.trim();
  if (!text) {
    return "-";
  }
  if (text.length <= 14) {
    return text;
  }
  return `${text.slice(0, 6)}...${text.slice(-4)}`;
}

export function maskProviderTradeNo(value: string | null | undefined): string {
  return compactIdentifierForTechnicalDetails(value);
}

export function safeDisplayNameFromUser(
  user:
    | {
        readonly displayName?: string | null;
        readonly email?: string | null;
        readonly emailMasked?: string | null;
        readonly phone?: string | null;
        readonly phoneMasked?: string | null;
      }
    | null
    | undefined,
): string {
  return (
    user?.displayName?.trim() ||
    user?.emailMasked?.trim() ||
    maskEmail(user?.email) ||
    user?.phoneMasked?.trim() ||
    maskPhone(user?.phone) ||
    "未知用户"
  );
}

export function providerDisplayName(
  providerType: string | null | undefined,
  providerCode: string | null | undefined,
): string {
  const labels: Record<string, string> = {
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
  return labels[`${providerType ?? ""}:${providerCode ?? ""}`] ?? "服务商";
}

export function productDisplayName(productCode: string | null | undefined): string {
  const labels: Record<string, string> = {
    forecast_credit_20: "20 次专业预测包",
    forecast_credit_100: "100 次专业预测包",
    monthly_full: "月卡",
    quarterly_full: "季卡",
    trial_7_days: "注册赠送 7 天",
    yearly_full: "年卡",
  };
  const code = productCode?.trim();
  return code ? labels[code] ?? "会员套餐" : "会员套餐";
}

export function paymentProviderDisplayName(provider: string | null | undefined): string {
  if (provider === "wechat_pay") {
    return "微信支付";
  }
  if (provider === "alipay") {
    return "支付宝";
  }
  if (provider === "mock") {
    return "模拟支付";
  }
  return "支付渠道";
}

export function actionDisplayName(action: string | null | undefined): string {
  const labels: Record<string, string> = {
    "auth.login.success": "登录成功",
    "auth.login.failure": "登录失败",
    "auth.refresh.success": "刷新登录状态",
    "auth.refresh.failure": "登录状态刷新失败",
    "auth.logout.success": "退出登录",
    "provider_config.update": "更新服务商配置",
    "system_setting.update": "更新系统设置",
  };
  return action ? labels[action] ?? "系统操作" : "系统操作";
}

export function entitlementTypeDisplayName(type: string | null | undefined): string {
  const labels: Record<string, string> = {
    feature_unlock: "功能解锁",
    forecast_credit: "预测次数",
    full_forecast_access: "完整访问权益",
    subscription: "订阅权益",
  };
  return type ? labels[type] ?? "权益" : "权益";
}

export function ledgerReasonDisplayName(reason: string | null | undefined): string {
  const labels: Record<string, string> = {
    forecast_credit_consumed: "使用预测次数",
    full_forecast_access_grant: "发放完整访问权益",
    payment_entitlement_grant: "订单权益发放",
  };
  return reason ? labels[reason] ?? "积分变动" : "积分变动";
}
