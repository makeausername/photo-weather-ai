import type {
  ForecastDisagreementLevel,
  ForecastMultiSourceAgreementContext,
  ForecastTarget,
  NormalizedHourlyWeather,
} from "@photo-weather/shared";
import type { WeatherDataBundle } from "./types.js";

export type MultiSourceAgreementWindow = {
  readonly startTime?: string;
  readonly endTime?: string;
  readonly paddingHours?: number;
};

export type BuildMultiSourceAgreementInput = {
  readonly providerBundles: readonly Pick<
    WeatherDataBundle,
    "providerCode" | "providerLabelZh" | "dataMode" | "hourly"
  >[];
  readonly target?: ForecastTarget;
  readonly targetWindow?: MultiSourceAgreementWindow;
};

type AgreementField =
  | "cloudTotal"
  | "cloudLow"
  | "cloudMid"
  | "cloudHigh"
  | "precipitationAmountMm"
  | "precipitationProbability"
  | "temperature"
  | "humidity"
  | "dewPoint"
  | "dewPointSpread"
  | "windSpeed"
  | "visibility";

type FieldDefinition = {
  readonly field: AgreementField;
  readonly labelZh: string;
  readonly unit: string;
  readonly medium: number;
  readonly high: number;
  readonly low?: number;
  readonly value: (hour: NormalizedHourlyWeather) => number | null;
};

type FieldComparison = {
  readonly field: AgreementField;
  readonly labelZh: string;
  readonly level: ForecastDisagreementLevel;
  readonly range: number | null;
  readonly min?: number;
  readonly max?: number;
  readonly unit?: string;
  readonly sourcesAvailable: number;
  readonly messageZh: string;
};

const fieldDefinitions: readonly FieldDefinition[] = [
  {
    field: "cloudTotal",
    labelZh: "总云量",
    unit: "pct",
    medium: 30,
    high: 50,
    value: (hour) => finiteNumber(hour.cloudTotal),
  },
  {
    field: "cloudLow",
    labelZh: "低云",
    unit: "pct",
    medium: 25,
    high: 40,
    value: (hour) => finiteNumber(hour.cloudLow),
  },
  {
    field: "cloudMid",
    labelZh: "中云",
    unit: "pct",
    medium: 35,
    high: 55,
    value: (hour) => finiteNumber(hour.cloudMid),
  },
  {
    field: "cloudHigh",
    labelZh: "高云",
    unit: "pct",
    medium: 35,
    high: 55,
    value: (hour) => finiteNumber(hour.cloudHigh),
  },
  {
    field: "precipitationAmountMm",
    labelZh: "降水量",
    unit: "mm",
    medium: 2,
    high: 5,
    low: 0.8,
    value: (hour) =>
      firstFiniteNumber(
        hour.precipitationAmountMm,
        hour.precipitation,
        hour.rainAmountMm,
        hour.snowAmountMm,
      ),
  },
  {
    field: "precipitationProbability",
    labelZh: "降水概率",
    unit: "pct",
    medium: 40,
    high: 60,
    value: (hour) =>
      finiteNumber(hour.precipitationProbabilityPercent ?? hour.precipitationProbability),
  },
  {
    field: "temperature",
    labelZh: "气温",
    unit: "c",
    medium: 3,
    high: 5,
    value: (hour) => finiteNumber(hour.temperature),
  },
  {
    field: "humidity",
    labelZh: "湿度",
    unit: "pct",
    medium: 20,
    high: 35,
    value: (hour) => finiteNumber(hour.humidity),
  },
  {
    field: "dewPoint",
    labelZh: "露点",
    unit: "c",
    medium: 3,
    high: 5,
    value: (hour) => finiteNumber(hour.dewPoint),
  },
  {
    field: "dewPointSpread",
    labelZh: "露点差",
    unit: "c",
    medium: 2,
    high: 4,
    value: (hour) => {
      const spread = finiteNumber(hour.dewPointSpread);
      if (spread !== null) {
        return spread;
      }
      const temperature = finiteNumber(hour.temperature);
      const dewPoint = finiteNumber(hour.dewPoint);
      return temperature !== null && dewPoint !== null ? round1(temperature - dewPoint) : null;
    },
  },
  {
    field: "windSpeed",
    labelZh: "风速",
    unit: "mps",
    medium: 3,
    high: 5,
    value: (hour) => finiteNumber(hour.windSpeed),
  },
  {
    field: "visibility",
    labelZh: "能见度",
    unit: "km",
    medium: 8,
    high: 15,
    value: (hour) => finiteNumber(hour.rawVisibilityKm ?? hour.visibility),
  },
];

export function buildMultiSourceAgreementContext(
  input: BuildMultiSourceAgreementInput,
): ForecastMultiSourceAgreementContext {
  const sources = input.providerBundles.filter((bundle) => bundle.hourly.length > 0);
  if (sources.length < 2) {
    return dataLimitedContext(sources.length);
  }

  const sourceHours = sources.map((source) => ({
    source,
    hours: hoursForWindow(source.hourly, input.targetWindow),
  }));
  const effectiveSourceHours = sourceHours.some((source) => source.hours.length > 0)
    ? sourceHours
    : sources.map((source) => ({ source, hours: source.hourly }));
  const comparisons = fieldDefinitions
    .map((definition) => compareField(definition, effectiveSourceHours))
    .filter((comparison): comparison is FieldComparison => comparison !== null);
  const comparableComparisons = comparisons.filter((comparison) => comparison.level !== "unknown");
  const highestLevel = highestDisagreementLevel(comparableComparisons);
  const unknownComparisons = comparisons.filter((comparison) => comparison.level === "unknown");
  const keyWarningsZh = buildKeyWarnings(comparisons, sources.length);
  const fieldDisagreements = [...comparisons].sort(compareFieldPriority);

  if (comparableComparisons.length === 0) {
    const limited = unknownComparisons[0]?.messageZh ?? "当前可比较的多源字段不足，暂不判定分歧。";
    return {
      agreementLevel: "unknown",
      disagreementLevel: "unknown",
      fieldDisagreements,
      keyWarningsZh: uniqueStrings([limited, ...keyWarningsZh]),
      userSummaryZh:
        "当前数据源不足，不能判定多源是否一致；结果仍按已有数据给出，出行前需结合临近预报复核。",
      professionalSummaryZh:
        "当前至少两套来源可用，但关键字段缺少同一时段的可比较数值；缺失值未按 0 参与分歧判断。",
      shouldLowerConfidence: false,
      shouldShowReviewWarning: true,
    };
  }

  return {
    agreementLevel: agreementLevelFromDisagreement(highestLevel),
    disagreementLevel: highestLevel,
    fieldDisagreements,
    keyWarningsZh,
    userSummaryZh: buildUserSummary(comparisons, highestLevel),
    professionalSummaryZh: buildProfessionalSummary(comparisons, highestLevel),
    shouldLowerConfidence: shouldLowerCloudSeaConfidence(comparisons),
    shouldShowReviewWarning: shouldShowReviewWarning(comparisons, keyWarningsZh),
  };
}

function compareField(
  definition: FieldDefinition,
  sourceHours: readonly {
    readonly source: Pick<
      WeatherDataBundle,
      "providerCode" | "providerLabelZh" | "dataMode" | "hourly"
    >;
    readonly hours: readonly NormalizedHourlyWeather[];
  }[],
): FieldComparison | null {
  const valuesByTime = new Map<string, number[]>();
  let maxSourcesAvailable = 0;

  for (const source of sourceHours) {
    const sourceValuesByTime = new Map<string, number>();
    for (const hour of source.hours) {
      const key = hourBucketKey(hour.time);
      if (!key || sourceValuesByTime.has(key)) {
        continue;
      }
      const value = definition.value(hour);
      if (value !== null) {
        sourceValuesByTime.set(key, value);
      }
    }
    for (const [key, value] of sourceValuesByTime.entries()) {
      const values = valuesByTime.get(key) ?? [];
      values.push(value);
      valuesByTime.set(key, values);
      maxSourcesAvailable = Math.max(maxSourcesAvailable, values.length);
    }
  }

  let strongest:
    | {
        readonly values: readonly number[];
        readonly level: ForecastDisagreementLevel;
        readonly range: number;
      }
    | undefined;
  let comparableValues:
    | {
        readonly values: readonly number[];
        readonly range: number;
      }
    | undefined;

  for (const values of valuesByTime.values()) {
    if (values.length < 2) {
      continue;
    }
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = round1(max - min);
    comparableValues = { values, range };
    const level = classifyFieldLevel(definition, min, max, range);
    if (level === "none") {
      continue;
    }
    if (!strongest || severityRank(level) > severityRank(strongest.level)) {
      strongest = { values, level, range };
    }
  }

  if (!strongest) {
    if (comparableValues) {
      const min = Math.min(...comparableValues.values);
      const max = Math.max(...comparableValues.values);
      return {
        field: definition.field,
        labelZh: definition.labelZh,
        level: "none",
        range: comparableValues.range,
        min: round1(min),
        max: round1(max),
        unit: definition.unit,
        sourcesAvailable: comparableValues.values.length,
        messageZh: `${definition.labelZh}暂无明显多源分歧。`,
      };
    }
    if (maxSourcesAvailable === 1 && shouldReportLimitedField(definition.field)) {
      return {
        field: definition.field,
        labelZh: definition.labelZh,
        level: "unknown",
        range: null,
        unit: definition.unit,
        sourcesAvailable: 1,
        messageZh: `${definition.labelZh}当前只有单源可比较，暂不判定多源分歧。`,
      };
    }
    return null;
  }

  const min = Math.min(...strongest.values);
  const max = Math.max(...strongest.values);
  return {
    field: definition.field,
    labelZh: definition.labelZh,
    level: strongest.level,
    range: strongest.range,
    min: round1(min),
    max: round1(max),
    unit: definition.unit,
    sourcesAvailable: strongest.values.length,
    messageZh: fieldMessage(definition, strongest.level, strongest.range),
  };
}

function classifyFieldLevel(
  definition: FieldDefinition,
  min: number,
  max: number,
  range: number,
): ForecastDisagreementLevel {
  if (definition.field === "precipitationAmountMm") {
    const meaningfulVsNone = max >= 0.5 && min <= 0.1;
    if (meaningfulVsNone && max >= 5) {
      return "high";
    }
    if (meaningfulVsNone) {
      return "medium";
    }
  }

  if (definition.field === "visibility") {
    if ((min <= 3 && max >= 15) || range >= definition.high) {
      return "high";
    }
    if ((min <= 5 && max >= 12) || range >= definition.medium) {
      return "medium";
    }
  }

  if (range >= definition.high) {
    return "high";
  }
  if (range >= definition.medium) {
    return "medium";
  }
  if (range >= (definition.low ?? definition.medium * 0.5)) {
    return "low";
  }
  return "none";
}

function fieldMessage(
  definition: FieldDefinition,
  level: ForecastDisagreementLevel,
  range: number,
): string {
  const rangeText = formatRange(range, definition.unit);
  if (definition.field === "cloudLow") {
    return `低云多源差值约 ${rangeText}，云海形成与白墙风险需结合临近预报复核。`;
  }
  if (definition.field === "cloudTotal") {
    return `总云量多源差值约 ${rangeText}，需回看低云分层后再判断云海参考性。`;
  }
  if (definition.field === "cloudMid" || definition.field === "cloudHigh") {
    return `${definition.labelZh}多源差值约 ${rangeText}，更多影响霞光和云层纹理判断。`;
  }
  if (
    definition.field === "precipitationAmountMm" ||
    definition.field === "precipitationProbability"
  ) {
    return `降水信号多源分歧为${levelLabel(level)}，窗口前后需复核临近预报。`;
  }
  if (definition.field === "visibility") {
    return `能见度多源差值约 ${rangeText}，远景层次与白墙风险需现场复核。`;
  }
  return `${definition.labelZh}多源差值约 ${rangeText}，建议按${levelLabel(level)}分歧处理。`;
}

function buildKeyWarnings(
  comparisons: readonly FieldComparison[],
  sourceCount: number,
): readonly string[] {
  const warnings: string[] = [];
  const lowCloud = findComparison(comparisons, "cloudLow");
  const totalCloud = findComparison(comparisons, "cloudTotal");
  const midCloud = findComparison(comparisons, "cloudMid");
  const highCloud = findComparison(comparisons, "cloudHigh");
  const precipitationAmount = findComparison(comparisons, "precipitationAmountMm");
  const precipitationProbability = findComparison(comparisons, "precipitationProbability");
  const visibility = findComparison(comparisons, "visibility");

  if (lowCloud && severityRank(lowCloud.level) >= severityRank("medium")) {
    warnings.push("低云分歧较大，云海与白墙判断需结合临近预报复核。");
  }

  if (
    totalCloud &&
    severityRank(totalCloud.level) >= severityRank("medium") &&
    (!lowCloud || severityRank(lowCloud.level) < severityRank("medium"))
  ) {
    warnings.push("总云量存在分歧，但低云分歧不明显，云海判断仍以低云和地形为主。");
  }

  if (
    [midCloud, highCloud].some(
      (comparison) => comparison && severityRank(comparison.level) >= severityRank("medium"),
    )
  ) {
    warnings.push("中高云分歧较大，更多影响霞光和云层纹理判断。");
  }

  if (
    [precipitationAmount, precipitationProbability].some(
      (comparison) => comparison && severityRank(comparison.level) >= severityRank("medium"),
    )
  ) {
    warnings.push("降水时段或强度存在多源分歧，出行前需复核临近预报。");
  }

  if (visibility && severityRank(visibility.level) >= severityRank("high")) {
    warnings.push("能见度来源分歧较大，远景层次和白墙风险需现场复核。");
  }

  if (
    sourceCount < 2 ||
    [lowCloud, midCloud, highCloud].some((comparison) => comparison?.level === "unknown")
  ) {
    warnings.push("当前只有部分来源提供分层云量，专业判断需结合临近预报复核。");
  }

  return uniqueStrings(warnings);
}

function buildUserSummary(
  comparisons: readonly FieldComparison[],
  highestLevel: ForecastDisagreementLevel,
): string {
  const lowCloud = findComparison(comparisons, "cloudLow");
  const totalCloud = findComparison(comparisons, "cloudTotal");
  const midHighOnly =
    [findComparison(comparisons, "cloudMid"), findComparison(comparisons, "cloudHigh")].some(
      (comparison) => comparison && severityRank(comparison.level) >= severityRank("medium"),
    ) &&
    (!lowCloud || severityRank(lowCloud.level) < severityRank("medium"));

  if (lowCloud && severityRank(lowCloud.level) >= severityRank("medium")) {
    return "多源低云判断分歧较大，云海形成与白墙风险需结合临近预报复核。";
  }
  if (
    totalCloud &&
    severityRank(totalCloud.level) >= severityRank("medium") &&
    (!lowCloud || severityRank(lowCloud.level) < severityRank("medium"))
  ) {
    return "总云量存在分歧，但低云信号未显示同等分歧，云海判断仍以低云和地形为主。";
  }
  if (midHighOnly) {
    return "中高云判断存在分歧，更多影响霞光和云层纹理，对云海结论影响有限。";
  }
  if (severityRank(highestLevel) >= severityRank("medium")) {
    return "部分关键天气字段存在多源分歧，建议在出行前复核临近预报。";
  }
  if (highestLevel === "low") {
    return "内部多源存在轻微差异，但低云与降水判断整体仍可参考。";
  }
  return "多源低云和降水判断较一致，云海判断参考性较高。";
}

function buildProfessionalSummary(
  comparisons: readonly FieldComparison[],
  highestLevel: ForecastDisagreementLevel,
): string {
  if (highestLevel === "none") {
    return "可比较字段未发现明显多源分歧；缺失字段未按 0 参与比较。";
  }
  if (highestLevel === "unknown") {
    return "当前可比较字段不足；缺失值未按 0 参与比较。";
  }
  const messages = comparisons
    .filter((comparison) => severityRank(comparison.level) >= severityRank("medium"))
    .map((comparison) => comparison.messageZh);
  return messages.length > 0
    ? messages.slice(0, 3).join(" ")
    : "多源字段仅存在轻微差异；缺失值未按 0 参与比较。";
}

function shouldLowerCloudSeaConfidence(comparisons: readonly FieldComparison[]): boolean {
  const lowCloud = findComparison(comparisons, "cloudLow");
  const precipitationAmount = findComparison(comparisons, "precipitationAmountMm");
  const precipitationProbability = findComparison(comparisons, "precipitationProbability");
  return (
    Boolean(lowCloud && severityRank(lowCloud.level) >= severityRank("high")) ||
    Boolean(
      [precipitationAmount, precipitationProbability].some(
        (comparison) => comparison && severityRank(comparison.level) >= severityRank("high"),
      ),
    )
  );
}

function shouldShowReviewWarning(
  comparisons: readonly FieldComparison[],
  keyWarningsZh: readonly string[],
): boolean {
  return (
    keyWarningsZh.length > 0 ||
    comparisons.some((comparison) => severityRank(comparison.level) >= severityRank("medium"))
  );
}

function dataLimitedContext(sourceCount: number): ForecastMultiSourceAgreementContext {
  const message =
    sourceCount === 0
      ? "当前没有可比较的内部天气来源，暂不判定多源分歧。"
      : "当前只有单一内部天气来源可用，暂不判定多源分歧。";
  return {
    agreementLevel: "unknown",
    disagreementLevel: "unknown",
    fieldDisagreements: [
      {
        field: "sourceAvailability",
        level: "unknown",
        range: null,
        sourcesAvailable: sourceCount,
        messageZh: message,
      },
    ],
    keyWarningsZh: [message],
    userSummaryZh:
      "当前数据源不足，不能判定多源是否一致；结果仍按已有数据给出，出行前需结合临近预报复核。",
    professionalSummaryZh: "当前不足两套来源可比较；缺失值未按 0 参与分歧判断。",
    shouldLowerConfidence: false,
    shouldShowReviewWarning: true,
  };
}

function hoursForWindow(
  hours: readonly NormalizedHourlyWeather[],
  window: MultiSourceAgreementWindow | undefined,
): readonly NormalizedHourlyWeather[] {
  if (!window?.startTime || !window.endTime) {
    return hours;
  }
  const start = Date.parse(window.startTime);
  const end = Date.parse(window.endTime);
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return hours;
  }
  const paddingMs = Math.max(0, window.paddingHours ?? 0) * 60 * 60 * 1000;
  const filtered = hours.filter((hour) => {
    const timestamp = Date.parse(hour.time);
    return (
      Number.isFinite(timestamp) && timestamp >= start - paddingMs && timestamp <= end + paddingMs
    );
  });
  return filtered.length > 0 ? filtered : hours;
}

function findComparison(
  comparisons: readonly FieldComparison[],
  field: AgreementField,
): FieldComparison | undefined {
  return comparisons.find((comparison) => comparison.field === field);
}

function highestDisagreementLevel(
  comparisons: readonly FieldComparison[],
): ForecastDisagreementLevel {
  return comparisons.reduce<ForecastDisagreementLevel>(
    (highest, comparison) =>
      severityRank(comparison.level) > severityRank(highest) ? comparison.level : highest,
    "none",
  );
}

function agreementLevelFromDisagreement(
  level: ForecastDisagreementLevel,
): ForecastMultiSourceAgreementContext["agreementLevel"] {
  if (level === "unknown") {
    return "unknown";
  }
  if (level === "high") {
    return "low";
  }
  if (level === "medium" || level === "low") {
    return "medium";
  }
  return "high";
}

function compareFieldPriority(left: FieldComparison, right: FieldComparison): number {
  const severity = severityRank(right.level) - severityRank(left.level);
  if (severity !== 0) {
    return severity;
  }
  return fieldPriority(left.field) - fieldPriority(right.field);
}

function fieldPriority(field: string): number {
  const order = [
    "cloudLow",
    "precipitationAmountMm",
    "precipitationProbability",
    "visibility",
    "cloudTotal",
    "cloudMid",
    "cloudHigh",
    "temperature",
    "windSpeed",
    "humidity",
    "dewPoint",
    "dewPointSpread",
  ];
  const index = order.indexOf(field);
  return index === -1 ? order.length : index;
}

function severityRank(level: ForecastDisagreementLevel): number {
  switch (level) {
    case "high":
      return 4;
    case "medium":
      return 3;
    case "low":
      return 2;
    case "unknown":
      return 1;
    default:
      return 0;
  }
}

function shouldReportLimitedField(field: AgreementField): boolean {
  return field === "cloudLow" || field === "cloudMid" || field === "cloudHigh";
}

function levelLabel(level: ForecastDisagreementLevel): string {
  if (level === "high") {
    return "高";
  }
  if (level === "medium") {
    return "中";
  }
  if (level === "low") {
    return "低";
  }
  return "未知";
}

function formatRange(value: number, unit: string): string {
  if (unit === "pct") {
    return `${Math.round(value)} 个百分点`;
  }
  if (unit === "c") {
    return `${round1(value)}°C`;
  }
  if (unit === "mps") {
    return `${round1(value)} m/s`;
  }
  if (unit === "km") {
    return `${round1(value)} km`;
  }
  if (unit === "mm") {
    return `${round1(value)} mm`;
  }
  return String(round1(value));
}

function hourBucketKey(value: string): string | undefined {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return undefined;
  }
  return String(Math.floor(timestamp / (60 * 60 * 1000)));
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function firstFiniteNumber(...values: readonly unknown[]): number | null {
  for (const value of values) {
    const normalized = finiteNumber(value);
    if (normalized !== null) {
      return normalized;
    }
  }
  return null;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function uniqueStrings(values: readonly string[]): readonly string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}
