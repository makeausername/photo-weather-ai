export type HourlyColumnGroup = "all" | "cloud" | "thermal" | "rain";
export const hourlyColumnGroups = [
  { value: "all", label: "全部指标" },
  { value: "cloud", label: "云层" },
  { value: "thermal", label: "温湿与风" },
  { value: "rain", label: "降水与能见度" },
] as const;

type ColumnVisibility = {
  readonly showCloudColumns?: boolean;
  readonly showTemperatureColumns?: boolean;
  readonly showDewPointColumns?: boolean;
  readonly showHumidityColumn?: boolean;
  readonly showVisibilityColumn?: boolean;
  readonly showWindColumns?: boolean;
  readonly showPrecipitationColumns?: boolean;
};

/** A group can narrow the configured data, never re-enable a deliberately hidden column. */
export function hourlyColumnVisibility(
  group: HourlyColumnGroup,
  config: ColumnVisibility = {},
): ColumnVisibility {
  const enabled = (key: keyof ColumnVisibility, category: HourlyColumnGroup) =>
    config[key] !== false && (group === "all" || group === category);
  return {
    showCloudColumns: enabled("showCloudColumns", "cloud"),
    showTemperatureColumns: enabled("showTemperatureColumns", "thermal"),
    showDewPointColumns: enabled("showDewPointColumns", "thermal"),
    showHumidityColumn: enabled("showHumidityColumn", "thermal"),
    showWindColumns: enabled("showWindColumns", "thermal"),
    showVisibilityColumn: enabled("showVisibilityColumn", "rain"),
    showPrecipitationColumns: enabled("showPrecipitationColumns", "rain"),
  };
}

const numberFormats = [0, 1, 2].map(
  (precision) =>
    new Intl.NumberFormat("en-US", { useGrouping: false, maximumFractionDigits: precision }),
);

export function hourlyTableNumber(value: number | null | undefined, precision = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const threshold = 10 ** -precision;
  if (value > 0 && value < threshold) return `<${threshold}`;
  if (value < 0 && value > -threshold) return `>-${threshold}`;
  return (
    numberFormats[precision] ??
    new Intl.NumberFormat("en-US", { useGrouping: false, maximumFractionDigits: precision })
  ).format(value);
}
