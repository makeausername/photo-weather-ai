import type { ForecastHorizon, ForecastTarget } from "@photo-weather/shared";
import { PlaceSearchCard } from "./place-search-card";
import type { SelectedLocation } from "./selected-location";

export const homepageDefaultHorizon: ForecastHorizon = "48h";
export const homepageDefaultTarget: ForecastTarget = "general";
export const homepageTargetHelperText =
  "需要专门判断云海、朝霞晚霞或星空银河，可从顶部导航进入对应专题。";

export function HomepageSearchPanel({
  onSelectedLocationChange,
  onForecastOptionsChange,
}: {
  readonly onSelectedLocationChange?: (location: SelectedLocation | null) => void;
  readonly onForecastOptionsChange?: (options: {
    readonly horizon: ForecastHorizon;
    readonly target: ForecastTarget;
  }) => void;
} = {}) {
  return (
    <PlaceSearchCard
      className="min-[900px]:sticky min-[900px]:top-[88px]"
      defaultHorizon={homepageDefaultHorizon}
      defaultTarget={homepageDefaultTarget}
      showTargetSelector={false}
      targetHelperText={homepageTargetHelperText}
      ctaLabel="查看拍摄天气分析"
      onSelectedLocationChange={onSelectedLocationChange}
      onForecastOptionsChange={onForecastOptionsChange}
    />
  );
}
