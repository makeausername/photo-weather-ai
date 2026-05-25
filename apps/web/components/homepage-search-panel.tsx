import type { ForecastHorizon, ForecastTarget } from "@photo-weather/shared";
import { PlaceSearchCard } from "./place-search-card";
import type { SelectedLocation } from "./selected-location";

export const homepageDefaultHorizon: ForecastHorizon = "48h";
export const homepageDefaultTarget: ForecastTarget = "general";
export const homepageTargetHelperText =
  "不同题材对时间窗口要求不同，云海和霞光建议重点查看未来24–72小时，星空银河可查看未来7天。";

export function HomepageSearchPanel({
  selectedLocation,
  onSelectedLocationChange,
  onForecastOptionsChange,
}: {
  readonly selectedLocation?: SelectedLocation | null;
  readonly onSelectedLocationChange?: (location: SelectedLocation | null) => void;
  readonly onForecastOptionsChange?: (options: {
    readonly horizon: ForecastHorizon;
    readonly target: ForecastTarget;
  }) => void;
} = {}) {
  return (
    <PlaceSearchCard
      className="min-[900px]:sticky min-[900px]:top-[88px]"
      description="输入景区、城市或具体机位，系统会优先匹配已知机位，并结合坐标生成判断。"
      searchPlaceholder="输入景区、城市或机位名称"
      horizonLabel="预报范围"
      defaultHorizon={homepageDefaultHorizon}
      defaultTarget={homepageDefaultTarget}
      showTargetSelector={false}
      targetHelperText={homepageTargetHelperText}
      ctaLabel="生成拍摄判断"
      ctaDisabledLabel="请先选择一个地点"
      selectedLocation={selectedLocation}
      onSelectedLocationChange={onSelectedLocationChange}
      onForecastOptionsChange={onForecastOptionsChange}
    />
  );
}
