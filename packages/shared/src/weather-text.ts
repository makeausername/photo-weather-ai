const precipitationWeatherPattern = /雨|雪|阵雨|雷阵雨|雨夹雪|冻雨|冰粒|霰/;

export function formatWeatherTransitionZh(
  fromWeather: string | null | undefined,
  toWeather: string | null | undefined,
): string {
  const from = normalizeWeatherToken(fromWeather);
  const to = normalizeWeatherToken(toWeather);

  if (!from && !to) {
    return "未知天气";
  }
  if (!to || from === to) {
    return stableWeatherText(from || to);
  }
  if (!from) {
    return stableWeatherText(to);
  }

  return `${from}转${to}`;
}

export function simplifyWeatherSummaryZh(text: string | null | undefined): string | undefined {
  const trimmed = text?.trim();
  if (!trimmed) {
    return undefined;
  }

  const transition = trimmed.match(/^(.+?)\s*转\s*(.+)$/u);
  if (transition?.[1] && transition[1].trim() === transition[2]?.trim()) {
    return stableWeatherText(transition[1].trim());
  }

  return trimmed;
}

function stableWeatherText(text: string): string {
  return precipitationWeatherPattern.test(text) ? `${text}为主` : text;
}

function normalizeWeatherToken(value: string | null | undefined): string {
  return value?.trim() ?? "";
}
