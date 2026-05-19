import type { ForecastHorizon, ForecastTarget } from "./types.js";

export const locationTypeLabels = {
  scenic_area: "景区",
  viewpoint: "观景点",
  mountain: "山岳",
  lake: "湖泊",
  city: "城市",
  custom: "自定义",
} as const;

export const locationSourceLabels = {
  manual: "人工录入",
  amap: "高德地图",
  user: "用户提交",
} as const;

export const viewDirectionLabels = {
  north: "北",
  northeast: "东北",
  east: "东",
  southeast: "东南",
  south: "南",
  southwest: "西南",
  west: "西",
  northwest: "西北",
  all: "全向",
  unknown: "未标注",
} as const;

export type LocationTypeCode = keyof typeof locationTypeLabels;
export type LocationSourceCode = keyof typeof locationSourceLabels;
export type ViewDirectionCode = keyof typeof viewDirectionLabels;

export const forecastHorizonLabels: Record<ForecastHorizon, string> = {
  "24h": "未来24小时",
  "48h": "未来48小时",
  "72h": "未来72小时",
  "7d": "未来7天",
} as const;

export const forecastTargetLabels: Record<ForecastTarget, string> = {
  general: "综合判断",
  cloud_sea: "云海",
  glow: "朝霞晚霞",
  astro: "星空银河",
} as const;

export function getLocationTypeLabel(code: LocationTypeCode): string {
  return locationTypeLabels[code];
}

export function getLocationSourceLabel(code: LocationSourceCode): string {
  return locationSourceLabels[code];
}

export function getViewDirectionLabel(code: ViewDirectionCode): string {
  return viewDirectionLabels[code];
}

export function getForecastHorizonLabel(code: ForecastHorizon): string {
  return forecastHorizonLabels[code];
}

export function getForecastTargetLabel(code: ForecastTarget): string {
  return forecastTargetLabels[code];
}
