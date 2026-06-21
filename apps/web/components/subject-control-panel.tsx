import type { ForecastHorizon, ForecastTarget } from "@photo-weather/shared";
import { PlaceSearchCard } from "./place-search-card";
import type { SelectedLocation } from "./selected-location";

export type SubjectControlPanelConfig = {
  readonly target: ForecastTarget;
  readonly defaultHorizon: ForecastHorizon;
  readonly ctaLabel: string;
  readonly description?: string;
  readonly currentLocationPrivacyHint: string;
};

type SubjectControlPanelProps = {
  readonly config: SubjectControlPanelConfig;
  readonly selectedLocation?: SelectedLocation | null;
  readonly onSelectedLocationChange?: (location: SelectedLocation | null) => void;
  readonly onForecastOptionsChange?: (options: {
    readonly horizon: ForecastHorizon;
    readonly target: ForecastTarget;
  }) => void;
};

export function SubjectControlPanel({
  config,
  selectedLocation,
  onSelectedLocationChange,
  onForecastOptionsChange,
}: SubjectControlPanelProps) {
  const isCloudSea = config.target === "cloud_sea";

  return (
    <aside
      className="grid content-start gap-4 min-[900px]:sticky min-[900px]:top-[88px]"
      data-subject-control-panel="true"
      data-subject-control-panel-target={config.target}
      data-cloud-sea-section={isCloudSea ? "CloudSeaSearchPanel" : undefined}
    >
      <PlaceSearchCard
        title="地点搜索与范围选择"
        description={config.description ?? "选择景区、城市或具体地点后进入对应题材判断。"}
        badgeLabel={null}
        defaultHorizon={config.defaultHorizon}
        fixedTarget={config.target}
        ctaLabel={config.ctaLabel}
        selectedLocationDetailMode="compact"
        showSelectedLocationActions
        showSelectedLocationHorizon
        showQuickLocations={false}
        showForecastSectionDivider={false}
        enableCurrentLocation
        currentLocationPrivacyHint={config.currentLocationPrivacyHint}
        selectedLocation={selectedLocation}
        onSelectedLocationChange={onSelectedLocationChange}
        onForecastOptionsChange={onForecastOptionsChange}
      />
    </aside>
  );
}
