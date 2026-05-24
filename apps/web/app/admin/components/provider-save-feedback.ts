export type ProviderSaveFeedbackState = {
  readonly status: "idle" | "saving" | "saved" | "testing" | "error";
  readonly message?: string;
};

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
  /\bat\s+\S+\s+\(/,
  /\bError:\s/i,
];

export function providerSaveSuccessMessage(provider: ProviderIdentity): string {
  if (provider.providerCode === "qweather") {
    return "和风天气配置已保存。";
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
    return "高德地图配置已保存。";
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

  if (unsafeSaveErrorPatterns.some((pattern) => pattern.test(trimmed))) {
    return fallback;
  }

  return `保存失败：${trimmed}`;
}
