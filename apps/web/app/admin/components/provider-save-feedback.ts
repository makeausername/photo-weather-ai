export type ProviderSaveFeedbackState = {
  readonly status: "idle" | "saving" | "saved" | "testing" | "error";
  readonly message?: string;
};

export const adminProviderTestSessionExpiredMessage =
  "登录状态已失效，请重新登录后台后再测试。";

type ProviderIdentity = {
  readonly providerType: string;
  readonly providerCode: string;
  readonly displayName?: string;
};

const unsafeSaveErrorPatterns = [
  /Prisma/i,
  /stack/i,
  /secretJson/i,
  /configJson/i,
  /apiKey/i,
  /apikey/i,
  /authorization/i,
  /token/i,
  /password/i,
  /secret/i,
  /DATABASE_URL/i,
  /postgres/i,
  /\bat\s+\S+\s+\(/,
  /\bError:\s/i,
  /:\d+:\d+/,
];

export function providerSaveSuccessMessage(provider: ProviderIdentity): string {
  if (provider.providerCode === "qweather") {
    return "和风天气 配置已保存。";
  }

  if (provider.providerCode === "open_meteo") {
    return "Open-Meteo 配置已保存。";
  }

  if (provider.providerCode === "meteoblue") {
    return "meteoblue 配置已保存。";
  }

  if (provider.providerCode === "deepseek") {
    return "DeepSeek 配置已保存。";
  }

  if (provider.providerCode === "amap") {
    return "高德地图 配置已保存。";
  }

  return "服务商配置已保存。";
}

export function providerSaveButtonLabel(state: ProviderSaveFeedbackState | undefined): string {
  return state?.status === "saving" ? "保存中..." : "保存配置";
}

export function isProviderSaveDisabled(state: ProviderSaveFeedbackState | undefined): boolean {
  return state?.status === "saving";
}

export function providerSaveErrorMessage(error: unknown): string {
  const fallback = "保存失败，请稍后重试。";
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  const trimmed = message.trim();
  if (!trimmed) {
    return fallback;
  }
  if (trimmed === adminProviderTestSessionExpiredMessage) {
    return trimmed;
  }

  if (unsafeSaveErrorPatterns.some((pattern) => pattern.test(trimmed))) {
    return fallback;
  }

  return `保存失败：${trimmed}`;
}

export function providerTestButtonLabel(state: ProviderSaveFeedbackState | undefined): string {
  return state?.status === "testing" ? "测试中..." : "测试连接";
}

export function isProviderTestDisabled(state: ProviderSaveFeedbackState | undefined): boolean {
  return state?.status === "testing";
}

export function providerTestSuccessMessage(
  provider: ProviderIdentity,
  result: {
    readonly message?: string;
    readonly messageZh?: string;
    readonly latencyMs?: number;
    readonly success?: boolean;
    readonly connectionMode?: "mock" | "fixture" | "real";
  },
): string {
  const providerLabel = providerSaveSuccessMessage(provider).replace("配置已保存。", "").trim();
  const safeLabel = providerLabel || provider.displayName || "服务商";
  const latency =
    typeof result.latencyMs === "number" && Number.isFinite(result.latencyMs)
      ? `，耗时 ${Math.max(0, Math.round(result.latencyMs))}ms`
      : "";

  if (result.success === false) {
    const message = result.messageZh ?? result.message ?? "上游服务未返回成功状态。";
    return `${safeLabel} 连接测试失败：${message}`;
  }

  if (result.connectionMode && result.connectionMode !== "real") {
    return result.messageZh ?? result.message ?? `${safeLabel} 连接测试通过。`;
  }

  return `${safeLabel} 连接测试通过${latency}。`;
}

export function providerTestErrorMessage(provider: ProviderIdentity, error: unknown): string {
  const providerLabel = providerSaveSuccessMessage(provider).replace("配置已保存。", "").trim();
  const safeLabel = providerLabel || provider.displayName || "服务商";
  const fallback = `${safeLabel} 连接测试失败：请稍后重试。`;
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  const trimmed = message.trim();
  if (!trimmed) {
    return fallback;
  }

  if (unsafeSaveErrorPatterns.some((pattern) => pattern.test(trimmed))) {
    return fallback;
  }

  return `${safeLabel} 连接测试失败：${trimmed}`;
}
