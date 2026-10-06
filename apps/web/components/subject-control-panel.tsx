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
      className="grid min-w-0 content-start gap-4"
      data-subject-control-panel="true"
      data-subject-control-panel-target={config.target}
      data-cloud-sea-section={isCloudSea ? "CloudSeaSearchPanel" : undefined}
    >
      <PlaceSearchCard
        title="选择拍摄地点"
        compactEntry
        ctaDisabledLabel="查看报告"
        description={config.description ?? "选择景区、城市或具体地点后进入对应题材判断。"}
        badgeLabel={null}
        defaultHorizon={config.defaultHorizon}
        fixedTarget={config.target}
        ctaLabel="查看报告"
        selectedLocationDetailMode="compact"
        showSelectedLocationActions
        showQuickLocations={false}
        showForecastSectionDivider={false}
        enableCurrentLocation
        requiresFullAccess
        lockExtendedHorizonsForFree
        selectedLocation={selectedLocation}
        onSelectedLocationChange={onSelectedLocationChange}
        onForecastOptionsChange={onForecastOptionsChange}
      />
    </aside>
  );
}
