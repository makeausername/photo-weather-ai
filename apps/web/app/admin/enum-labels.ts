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
