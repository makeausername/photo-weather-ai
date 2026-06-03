import {
  buildCloudLayerCompletenessContext,
  buildCloudSeaCloudBasisConsistencyContext,
  forecastHorizonLabels,
  type CloudLayerCompletenessContext,
  type CloudSeaCloudBasisConsistencyContext,
  type CloudSeaPrecipitationSignalContext,
  type CloudSeaRecommendationExplanation,
  type CloudSeaRecommendationGuardOutput,
  type CloudSeaWeatherVariableConsistencyContext,
  type ForecastCalculationResult,
  type ForecastHorizon,
  type ForecastMultiSourceAgreementContext,
  type ProfessionalHourlyDataPoint,
  type ProfessionalHourlyDataTimeBasis,
} from "@photo-weather/shared";
import type { CloudSeaDisplayTemperatureContext } from "./cloud-sea-display-temperature";
import type { CloudSeaRuleContext } from "./cloud-sea-rule-context";
import type { CloudSeaTerrainContext } from "./cloud-sea-terrain-context";
import type {
  CloudSeaActionPlanItem,
  CloudSeaDailyTrendItem,
  CloudSeaHeroConclusionView,
  CloudSeaReasoningItem,
  CloudSeaWindowItem,
  ForecastResultCard,
  ForecastResultSectionItem,
} from "./forecast-result-view-model";

export type CloudSeaDisplayBadgeVariant =
  | "default"
  | "success"
  | "warning"
  | "danger"
  | "muted"
  | "accent"
  | "info";

export type CloudSeaDisplayHeader = CloudSeaHeroConclusionView & {
  readonly heroBadgeLabel: string;
  readonly dataBadgeLabel: string;
  readonly dataBadgeVariant: CloudSeaDisplayBadgeVariant;
  readonly horizonLabel: string;
  readonly generatedAtLabel: string;
};

export type CloudSeaDisplayScoreCard = {
  readonly label: string;
  readonly score: number;
  readonly badgeLabel: string;
  readonly badgeVariant: CloudSeaDisplayBadgeVariant;
  readonly summary: string;
};

export type CloudSeaNearTermWeatherDisplayCard = {
  readonly key: "temperature" | "cloud_visibility" | "wind_precipitation" | "humidity_dew_point" | "gear";
  readonly title: string;
  readonly timeBasis: string;
  readonly badge: string;
  readonly value: string;
  readonly detail: string;
  readonly tone?: "default" | "success" | "warning";
};

export type CloudSeaCurrentNearTermWeatherDisplay = {
  readonly sectionTitle: string;
  readonly sectionDescription: string;
  readonly sectionBadge: string;
  readonly sectionWindowLabel: string;
  readonly currentBasisLabel: string;
  readonly nearTermBasisLabel: string;
  readonly tripBasisLabel: string;
  readonly anchorStart: string;
  readonly anchorEnd: string;
  readonly rows: readonly ProfessionalHourlyDataPoint[];
  readonly cards: readonly CloudSeaNearTermWeatherDisplayCard[];
};

export type CloudSeaProfessionalHourlyWindow = {
  readonly startTime: string;
  readonly endTime: string;
  readonly label?: string;
};

export type CloudSeaProfessionalHourlyDisplayData = {
  readonly rows: readonly ProfessionalHourlyDataPoint[];
  readonly timeBasis: ProfessionalHourlyDataTimeBasis | null;
  readonly cloudLayerCompleteness: CloudLayerCompletenessContext;
  readonly cloudBasisConsistency: CloudSeaCloudBasisConsistencyContext;
  readonly focusWindows: readonly CloudSeaProfessionalHourlyWindow[];
  readonly riskWindows: readonly CloudSeaProfessionalHourlyWindow[];
};

export type CloudSeaAiInterpretationDisplayPayload = {
  readonly finalRecommendation: {
    readonly label: string;
    readonly reasonZh: string;
    readonly actionSummaryZh: string;
  };
  readonly explanationContext: {
    readonly oneLineConclusionZh: string;
    readonly confidenceExplanationZh: string;
    readonly reviewPointsZh: readonly string[];
  };
  readonly displayTemperatureContext: Pick<
    CloudSeaDisplayTemperatureContext,
    | "basis"
    | "displayTemperatureC"
    | "displayTemperatureRangeC"
    | "bodyFeelTemperatureC"
    | "bodyFeelRangeC"
    | "basisLabelZh"
    | "userTemperatureSummaryZh"
    | "clothingAdviceZh"
  >;
  readonly precipitationSignalContext: Pick<
    CloudSeaPrecipitationSignalContext,
    | "precipitationSignalType"
    | "precipitationImpactLevel"
    | "maxProbabilityPercent"
    | "maxAmountMm"
    | "riskLabelZh"
    | "userSummaryZh"
    | "actionAdviceZh"
    | "shouldDowngradeWindow"
  >;
  readonly cloudLayerCoverageContext: Pick<
    CloudLayerCompletenessContext,
    | "cloudLayerBasis"
    | "layerCompletenessLevel"
    | "totalHoursCount"
    | "completeLayerHoursCount"
    | "missingLayerHoursCount"
    | "lowLayerMissingHoursCount"
    | "userNoteZh"
  >;
  readonly professionalHourlySummary: {
    readonly rowCount: number;
    readonly nearTermRowCount: number;
    readonly anchorStart: string;
    readonly anchorEnd: string;
    readonly precipitationAmountMm: number | null;
    readonly precipitationProbabilityPercent: number | null;
    readonly cloudLowPercent: number | null;
    readonly cloudMidPercent: number | null;
    readonly cloudHighPercent: number | null;
    readonly visibilityMeters: number | null;
  };
  readonly actionPlan: readonly CloudSeaActionPlanItem[];
  readonly riskReview: readonly ForecastResultSectionItem[];
};

export type CloudSeaDisplayDataMeta = {
  readonly generatedAt: string;
  readonly timezone: string;
  readonly horizon: ForecastHorizon;
  readonly anchorStart: string;
  readonly anchorEnd: string;
  readonly normalizedHourlyRowCount: number;
  readonly cloudLayerCoverageSummary: string;
  readonly temperatureBasis: CloudSeaDisplayTemperatureContext["basis"];
  readonly precipitationSignalType: CloudSeaPrecipitationSignalContext["precipitationSignalType"];
  readonly sourceAlignmentStatus: "aligned" | "partial" | "missing_hourly_rows";
  readonly staleFieldWarnings: readonly string[];
};

export type CloudSeaDisplayData = {
  readonly header: CloudSeaDisplayHeader;
  readonly scoreCard: CloudSeaDisplayScoreCard;
  readonly recommendationCards: readonly ForecastResultCard[];
  readonly currentNearTermWeather: CloudSeaCurrentNearTermWeatherDisplay;
  readonly cloudSeaWindowCards: readonly CloudSeaWindowItem[];
  readonly professionalHourlyData: CloudSeaProfessionalHourlyDisplayData;
  readonly dailyJudgment: readonly CloudSeaDailyTrendItem[];
  readonly judgmentBasis: readonly CloudSeaReasoningItem[];
  readonly actionPlan: readonly CloudSeaActionPlanItem[];
  readonly riskReview: readonly ForecastResultSectionItem[];
  readonly multiSourceConsistency: ForecastMultiSourceAgreementContext | null;
  readonly aiInterpretationPayload: CloudSeaAiInterpretationDisplayPayload;
  readonly displayDataMeta: CloudSeaDisplayDataMeta;
};

export type BuildCloudSeaDisplayDataInput = {
  readonly result: ForecastCalculationResult;
  readonly ruleContext: CloudSeaRuleContext;
  readonly terrainContext: CloudSeaTerrainContext;
  readonly displayTemperatureContext: CloudSeaDisplayTemperatureContext;
  readonly recommendationGuard: CloudSeaRecommendationGuardOutput;
  readonly recommendationExplanation: CloudSeaRecommendationExplanation;
  readonly header: CloudSeaHeroConclusionView;
  readonly scoreCardSummary: string;
  readonly recommendationCards: readonly ForecastResultCard[];
  readonly cloudSeaWindowCards: readonly CloudSeaWindowItem[];
  readonly dailyJudgment: readonly CloudSeaDailyTrendItem[];
  readonly judgmentBasis: readonly CloudSeaReasoningItem[];
  readonly actionPlan: readonly CloudSeaActionPlanItem[];
  readonly riskReview: readonly ForecastResultSectionItem[];
};

export function buildCloudSeaDisplayData(
  input: BuildCloudSeaDisplayDataInput,
): CloudSeaDisplayData {
  const rows = input.result.professionalHourlyData ?? [];
  const timeBasis = input.result.professionalHourlyDataTimeBasis ?? null;
  const anchorStart = firstValidTime(
    timeBasis?.anchorStartLocal,
    timeBasis?.startTime,
    input.result.forecastStart,
    input.result.generatedAt,
  );
  const anchorEnd = nearTermWindowEnd(anchorStart, timeBasis?.anchorEndLocal ?? timeBasis?.endTime ?? input.result.forecastEnd);
  const normalizedRows = rowsAtOrAfter(rows, anchorStart);
  const nearTermRows = rowsForRange(rows, anchorStart, anchorEnd);
  const currentNearTermRows = nearTermRows.length > 0 ? nearTermRows : normalizedRows.slice(0, 6);
  const cloudLayerCompleteness = buildCloudLayerCompletenessContext(rows);
  const cloudBasisConsistency = buildCloudSeaCloudBasisConsistencyContext({
    hourlyRows: rows,
    cloudLayerCompletenessContext: cloudLayerCompleteness,
  });
  const professionalHourlyData: CloudSeaProfessionalHourlyDisplayData = {
    rows,
    timeBasis,
    cloudLayerCompleteness,
    cloudBasisConsistency,
    focusWindows: cloudSeaFocusWindows(input.result),
    riskWindows: input.result.cloudSeaAnalysis.notRecommendedCloudSeaWindows.map(compactWindow),
  };
  const currentNearTermWeather = buildCurrentNearTermWeatherDisplay({
    result: input.result,
    terrainContext: input.terrainContext,
    displayTemperatureContext: input.displayTemperatureContext,
    precipitationSignalContext: input.ruleContext.precipitationSignalContext,
    weatherVariableConsistencyContext: input.ruleContext.weatherVariableConsistencyContext,
    cloudLayerCompleteness,
    cloudBasisConsistency,
    anchorStart,
    anchorEnd,
    rows: currentNearTermRows,
  });
  const displayDataMeta = buildDisplayDataMeta({
    result: input.result,
    timeBasis,
    rows,
    normalizedRows,
    currentNearTermRows,
    anchorStart,
    anchorEnd,
    displayTemperatureContext: input.displayTemperatureContext,
    precipitationSignalContext: input.ruleContext.precipitationSignalContext,
    cloudLayerCompleteness,
    cloudBasisConsistency,
  });

  return {
    header: {
      ...input.header,
      heroBadgeLabel: input.terrainContext.vocabulary.heroBadgeLabel,
      dataBadgeLabel: cloudSeaDataBadgeLabel(input.result),
      dataBadgeVariant: cloudSeaDataBadgeVariant(input.result),
      horizonLabel: forecastHorizonLabels[input.result.horizon],
      generatedAtLabel: formatDateTime(input.result.generatedAt, input.result.calendarBasis.timezone),
    },
    scoreCard: {
      label: input.terrainContext.vocabulary.scoreCardLabel,
      score: clampScorePercent(input.result.cloudSeaAnalysis.shootableScore),
      badgeLabel: input.header.recommendationLabel,
      badgeVariant: recommendationBadgeVariant(input.header.recommendationLabel),
      summary: input.scoreCardSummary,
    },
    recommendationCards: input.recommendationCards,
    currentNearTermWeather,
    cloudSeaWindowCards: input.cloudSeaWindowCards,
    professionalHourlyData,
    dailyJudgment: input.dailyJudgment,
    judgmentBasis: input.judgmentBasis,
    actionPlan: input.actionPlan,
    riskReview: input.riskReview,
    multiSourceConsistency: input.ruleContext.multiSourceAgreementContext,
    aiInterpretationPayload: buildAiInterpretationDisplayPayload({
      input,
      currentNearTermWeather,
      cloudLayerCompleteness,
      displayDataMeta,
    }),
    displayDataMeta,
  };
}

function buildCurrentNearTermWeatherDisplay(input: {
  readonly result: ForecastCalculationResult;
  readonly terrainContext: CloudSeaTerrainContext;
  readonly displayTemperatureContext: CloudSeaDisplayTemperatureContext;
  readonly precipitationSignalContext: CloudSeaPrecipitationSignalContext;
  readonly weatherVariableConsistencyContext: CloudSeaWeatherVariableConsistencyContext;
  readonly cloudLayerCompleteness: CloudLayerCompletenessContext;
  readonly cloudBasisConsistency: CloudSeaCloudBasisConsistencyContext;
  readonly anchorStart: string;
  readonly anchorEnd: string;
  readonly rows: readonly ProfessionalHourlyDataPoint[];
}): CloudSeaCurrentNearTermWeatherDisplay {
  const sectionWindowLabel = formatWindowRange(input.anchorStart, input.anchorEnd, input.result.calendarBasis.timezone);
  const currentBasisLabel = input.result.currentWeather?.observedAt
    ? `当前实况：${formatDateTime(input.result.currentWeather.observedAt, input.result.calendarBasis.timezone)}`
    : "当前参考：使用预报窗口锚点";
  const nearTermBasisLabel = `近时段参考：${sectionWindowLabel}`;
  const tripBasisLabel = `装备参考：${sectionWindowLabel}`;
  const cloudSummary = cloudLayerSummary(input.rows);
  const precipitationSummary = precipitationSummaryForRows(
    input.rows,
    input.precipitationSignalContext,
  );
  const windSummary = windSummaryForRows(input.rows);
  const humiditySummary = humidityDewPointSummary(input.rows);
  const cloudDetail = cloudVisibilityDetail(
    input.cloudLayerCompleteness,
    input.cloudBasisConsistency,
    cloudSummary,
  );

  return {
    sectionTitle: `当前与近时段天气（${sectionWindowLabel}）`,
    sectionDescription: `${currentBasisLabel}；${nearTermBasisLabel}。以下指标统一来自专业小时数据对应范围，用于复核${
      input.terrainContext.shouldDowngradeCloudSeaWording
        ? "低云、晨雾、低云遮挡、降水和现场装备"
        : "云海、白墙、降水和现场装备"
    }。`,
    sectionBadge: cloudSeaDataBadgeLabel(input.result),
    sectionWindowLabel,
    currentBasisLabel,
    nearTermBasisLabel,
    tripBasisLabel,
    anchorStart: input.anchorStart,
    anchorEnd: input.anchorEnd,
    rows: input.rows,
    cards: [
      {
        key: "temperature",
        title: "气温与体感",
        timeBasis: currentBasisLabel,
        badge: input.displayTemperatureContext.basisLabelZh,
        value: `${input.displayTemperatureContext.userTemperatureTitleZh}：${formatTemperature(
          input.displayTemperatureContext.displayTemperatureC,
        )} / ${bodyFeelLabel(input.displayTemperatureContext)} ${formatTemperature(
          input.displayTemperatureContext.bodyFeelTemperatureC,
        )}`,
        detail: `${input.displayTemperatureContext.userTemperatureSummaryZh} ${input.displayTemperatureContext.clothingAdviceZh}`,
      },
      {
        key: "cloud_visibility",
        title: "云层与能见度",
        timeBasis: nearTermBasisLabel,
        badge: cloudLayerCoverageBadge(input.cloudLayerCompleteness),
        value: `总云 ${formatPercent(cloudSummary.cloudTotalPercent)} / 低云 ${formatPercent(
          cloudSummary.cloudLowPercent,
        )}`,
        detail: cloudDetail,
      },
      {
        key: "wind_precipitation",
        title: "风与降水",
        timeBasis: nearTermBasisLabel,
        badge: windSummary.text,
        value: `降水概率 ${formatPercent(
          precipitationSummary.probabilityPercent,
        )} / 预计雨量 ${formatAmount(precipitationSummary.amountMm)}`,
        detail: `${input.precipitationSignalContext.userSummaryZh} ${input.precipitationSignalContext.actionAdviceZh}`,
      },
      {
        key: "humidity_dew_point",
        title: "湿度与露点",
        timeBasis: nearTermBasisLabel,
        badge: `湿度 ${formatPercent(humiditySummary.humidityPercent)}`,
        value: `露点差 ${formatTemperatureDelta(humiditySummary.dewPointSpreadC)}`,
        detail: dewPointDisplayAdvice(
          humiditySummary.dewPointSpreadC,
          input.weatherVariableConsistencyContext,
          input.result,
        ),
      },
      {
        key: "gear",
        title: "穿衣与装备",
        timeBasis: tripBasisLabel,
        badge: input.result.clothingGuide.titleZh,
        value: input.displayTemperatureContext.equipmentAdviceZh,
        detail: gearDisplayAdvice(
          input.displayTemperatureContext,
          input.precipitationSignalContext,
          input.weatherVariableConsistencyContext,
          input.result,
        ),
      },
    ],
  };
}

function buildDisplayDataMeta(input: {
  readonly result: ForecastCalculationResult;
  readonly timeBasis: ProfessionalHourlyDataTimeBasis | null;
  readonly rows: readonly ProfessionalHourlyDataPoint[];
  readonly normalizedRows: readonly ProfessionalHourlyDataPoint[];
  readonly currentNearTermRows: readonly ProfessionalHourlyDataPoint[];
  readonly anchorStart: string;
  readonly anchorEnd: string;
  readonly displayTemperatureContext: CloudSeaDisplayTemperatureContext;
  readonly precipitationSignalContext: CloudSeaPrecipitationSignalContext;
  readonly cloudLayerCompleteness: CloudLayerCompletenessContext;
  readonly cloudBasisConsistency: CloudSeaCloudBasisConsistencyContext;
}): CloudSeaDisplayDataMeta {
  const precipitationSummary = precipitationSummaryForRows(
    input.currentNearTermRows,
    input.precipitationSignalContext,
  );
  const staleWarnings = buildStaleFieldWarnings({
    result: input.result,
    displayTemperatureContext: input.displayTemperatureContext,
    precipitationSummary,
    cloudLayerCompleteness: input.cloudLayerCompleteness,
  });

  return {
    generatedAt: input.result.generatedAt,
    timezone: input.timeBasis?.timezone ?? input.result.calendarBasis.timezone,
    horizon: input.result.horizon,
    anchorStart: input.anchorStart,
    anchorEnd: input.anchorEnd,
    normalizedHourlyRowCount: input.normalizedRows.length,
    cloudLayerCoverageSummary: cloudLayerCoverageSummary(input.cloudLayerCompleteness),
    temperatureBasis: input.displayTemperatureContext.basis,
    precipitationSignalType: input.precipitationSignalContext.precipitationSignalType,
    sourceAlignmentStatus:
      input.rows.length === 0
        ? "missing_hourly_rows"
        : staleWarnings.length > 0 || input.cloudBasisConsistency.shouldLowerCloudSeaConfidence
          ? "partial"
          : "aligned",
    staleFieldWarnings: staleWarnings,
  };
}

function buildAiInterpretationDisplayPayload(input: {
  readonly input: BuildCloudSeaDisplayDataInput;
  readonly currentNearTermWeather: CloudSeaCurrentNearTermWeatherDisplay;
  readonly cloudLayerCompleteness: CloudLayerCompletenessContext;
  readonly displayDataMeta: CloudSeaDisplayDataMeta;
}): CloudSeaAiInterpretationDisplayPayload {
  const cloudSummary = cloudLayerSummary(input.currentNearTermWeather.rows);
  const precipitationSummary = precipitationSummaryForRows(
    input.currentNearTermWeather.rows,
    input.input.ruleContext.precipitationSignalContext,
  );
  return {
    finalRecommendation: {
      label: input.input.recommendationGuard.finalRecommendationLabel,
      reasonZh: input.input.recommendationGuard.reasonZh,
      actionSummaryZh: input.input.recommendationExplanation.actionSummaryZh,
    },
    explanationContext: {
      oneLineConclusionZh: input.input.recommendationExplanation.oneLineConclusionZh,
      confidenceExplanationZh: input.input.recommendationExplanation.confidenceExplanationZh,
      reviewPointsZh: input.input.recommendationExplanation.reviewPointsZh,
    },
    displayTemperatureContext: {
      basis: input.input.displayTemperatureContext.basis,
      displayTemperatureC: input.input.displayTemperatureContext.displayTemperatureC,
      displayTemperatureRangeC: input.input.displayTemperatureContext.displayTemperatureRangeC,
      bodyFeelTemperatureC: input.input.displayTemperatureContext.bodyFeelTemperatureC,
      bodyFeelRangeC: input.input.displayTemperatureContext.bodyFeelRangeC,
      basisLabelZh: input.input.displayTemperatureContext.basisLabelZh,
      userTemperatureSummaryZh: input.input.displayTemperatureContext.userTemperatureSummaryZh,
      clothingAdviceZh: input.input.displayTemperatureContext.clothingAdviceZh,
    },
    precipitationSignalContext: {
      precipitationSignalType: input.input.ruleContext.precipitationSignalContext.precipitationSignalType,
      precipitationImpactLevel:
        input.input.ruleContext.precipitationSignalContext.precipitationImpactLevel,
      maxProbabilityPercent:
        input.input.ruleContext.precipitationSignalContext.maxProbabilityPercent,
      maxAmountMm: input.input.ruleContext.precipitationSignalContext.maxAmountMm,
      riskLabelZh: input.input.ruleContext.precipitationSignalContext.riskLabelZh,
      userSummaryZh: input.input.ruleContext.precipitationSignalContext.userSummaryZh,
      actionAdviceZh: input.input.ruleContext.precipitationSignalContext.actionAdviceZh,
      shouldDowngradeWindow:
        input.input.ruleContext.precipitationSignalContext.shouldDowngradeWindow,
    },
    cloudLayerCoverageContext: {
      cloudLayerBasis: input.cloudLayerCompleteness.cloudLayerBasis,
      layerCompletenessLevel: input.cloudLayerCompleteness.layerCompletenessLevel,
      totalHoursCount: input.cloudLayerCompleteness.totalHoursCount,
      completeLayerHoursCount: input.cloudLayerCompleteness.completeLayerHoursCount,
      missingLayerHoursCount: input.cloudLayerCompleteness.missingLayerHoursCount,
      lowLayerMissingHoursCount: input.cloudLayerCompleteness.lowLayerMissingHoursCount,
      userNoteZh: input.cloudLayerCompleteness.userNoteZh,
    },
    professionalHourlySummary: {
      rowCount: input.displayDataMeta.normalizedHourlyRowCount,
      nearTermRowCount: input.currentNearTermWeather.rows.length,
      anchorStart: input.displayDataMeta.anchorStart,
      anchorEnd: input.displayDataMeta.anchorEnd,
      precipitationAmountMm: precipitationSummary.amountMm,
      precipitationProbabilityPercent: precipitationSummary.probabilityPercent,
      cloudLowPercent: cloudSummary.cloudLowPercent,
      cloudMidPercent: cloudSummary.cloudMidPercent,
      cloudHighPercent: cloudSummary.cloudHighPercent,
      visibilityMeters: cloudSummary.visibilityMeters,
    },
    actionPlan: input.input.actionPlan,
    riskReview: input.input.riskReview,
  };
}

function cloudSeaFocusWindows(result: ForecastCalculationResult): readonly CloudSeaProfessionalHourlyWindow[] {
  const primary =
    result.cloudSeaAnalysis.bestCloudSeaWindow ??
    result.cloudSeaAnalysis.bestCloudSeaWindows[0] ??
    result.cloudSeaAnalysis.watchableCloudSeaWindows[0];
  return primary ? [compactWindow(primary)] : [];
}

function compactWindow(window: CloudSeaProfessionalHourlyWindow): CloudSeaProfessionalHourlyWindow {
  return {
    startTime: window.startTime,
    endTime: window.endTime,
    label: window.label,
  };
}

function rowsAtOrAfter(
  rows: readonly ProfessionalHourlyDataPoint[],
  anchorStart: string,
): readonly ProfessionalHourlyDataPoint[] {
  const anchorMs = Date.parse(anchorStart);
  if (!Number.isFinite(anchorMs)) {
    return rows;
  }
  return rows.filter((row) => {
    const rowMs = Date.parse(row.time);
    return Number.isFinite(rowMs) && rowMs >= anchorMs;
  });
}

function rowsForRange(
  rows: readonly ProfessionalHourlyDataPoint[],
  start: string,
  end: string,
): readonly ProfessionalHourlyDataPoint[] {
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    return [];
  }
  return rows.filter((row) => {
    const rowMs = Date.parse(row.time);
    return Number.isFinite(rowMs) && rowMs >= startMs && rowMs <= endMs;
  });
}

function nearTermWindowEnd(startTime: string, forecastEnd: string): string {
  const startTimestamp = Date.parse(startTime);
  const forecastEndTimestamp = Date.parse(forecastEnd);
  if (!Number.isFinite(startTimestamp)) {
    return forecastEnd;
  }
  const sixHoursLater = new Date(startTimestamp + 6 * 60 * 60 * 1000).toISOString();
  const sixHoursLaterTimestamp = Date.parse(sixHoursLater);
  if (
    Number.isFinite(forecastEndTimestamp) &&
    Number.isFinite(sixHoursLaterTimestamp) &&
    forecastEndTimestamp > startTimestamp
  ) {
    return new Date(Math.min(forecastEndTimestamp, sixHoursLaterTimestamp)).toISOString();
  }
  return sixHoursLater;
}

function firstValidTime(...values: readonly (string | undefined)[]): string {
  return values.find((value) => value !== undefined && Number.isFinite(Date.parse(value))) ?? "";
}

function cloudLayerSummary(rows: readonly ProfessionalHourlyDataPoint[]) {
  return {
    cloudTotalPercent: averageNumber(rows.map((row) => row.cloudTotalPercent)),
    cloudHighPercent: maxNumber(rows.map((row) => row.cloudHighPercent)),
    cloudMidPercent: maxNumber(rows.map((row) => row.cloudMidPercent)),
    cloudLowPercent: maxNumber(rows.map((row) => row.cloudLowPercent)),
    visibilityMeters: minNumber(rows.map((row) => row.visibilityMeters)),
  };
}

function precipitationSummaryForRows(
  rows: readonly ProfessionalHourlyDataPoint[],
  context: CloudSeaPrecipitationSignalContext,
) {
  const amountValues = rows.map((row) => row.precipitationAmountMm).filter(isFiniteNumber);
  const probabilityValues = rows
    .map((row) => row.precipitationProbabilityPercent)
    .filter(isFiniteNumber);
  return {
    amountMm:
      amountValues.length > 0
        ? round1(Math.max(...amountValues))
        : finiteNumber(context.maxAmountMm) ?? null,
    probabilityPercent:
      probabilityValues.length > 0
        ? Math.round(Math.max(...probabilityValues))
        : finiteNumber(context.maxProbabilityPercent) ?? null,
  };
}

function windSummaryForRows(rows: readonly ProfessionalHourlyDataPoint[]): { readonly text: string } {
  const speed = maxNumber(rows.map((row) => row.windSpeedMs));
  const direction = rows.find((row) => isFiniteNumber(row.windDirectionDeg))?.windDirectionDeg;
  const directionText = isFiniteNumber(direction) ? windDirectionLabel(direction) : "";
  return {
    text: `${isFiniteNumber(speed) ? `${roundDisplay(speed)} m/s` : "暂无风速"}${
      directionText ? ` ${directionText}` : ""
    }`,
  };
}

function humidityDewPointSummary(rows: readonly ProfessionalHourlyDataPoint[]) {
  return {
    humidityPercent: averageNumber(rows.map((row) => row.relativeHumidityPercent)),
    dewPointC: averageNumber(rows.map((row) => row.dewPointC)),
    dewPointSpreadC: minNumber(rows.map((row) => row.dewPointSpreadC)),
  };
}

function cloudVisibilityDetail(
  completeness: CloudLayerCompletenessContext,
  consistency: CloudSeaCloudBasisConsistencyContext,
  summary: ReturnType<typeof cloudLayerSummary>,
): string {
  const layerText = `高云 ${formatPercent(summary.cloudHighPercent)}，中云 ${formatPercent(
    summary.cloudMidPercent,
  )}，低云 ${formatPercent(summary.cloudLowPercent)}`;
  const visibilityText = `能见度 ${formatKilometers(summary.visibilityMeters)}`;
  const basisText =
    consistency.cloudBasisLevel === "consistent"
      ? consistency.userSummaryZh
      : `${consistency.userSummaryZh} ${completeness.userNoteZh}`;
  return `${visibilityText}，${layerText}。${basisText}`;
}

function dewPointDisplayAdvice(
  value: number | null,
  context: CloudSeaWeatherVariableConsistencyContext,
  result: ForecastCalculationResult,
): string {
  if (context.humidityDewPointStatus === "conflict") {
    return "水汽指标存在口径差异，湿度与露点差需结合临近预报复核，不宜仅凭湿度判断云海。";
  }
  const auxiliaryNotice =
    result.weatherMissingFields.length > 0 || result.weatherMissingDataNotes.length > 0
      ? "部分辅助指标缺失，建议结合现场云层变化复核。"
      : "云层与能见度已纳入判断。";
  if (!isFiniteNumber(value)) {
    return `露点差暂缺，雾气和结露需现场复核。${auxiliaryNotice}`;
  }
  if (value <= 2) {
    return `露点差很小，雾气、结露和云雾变化会更敏感。${auxiliaryNotice}`;
  }
  if (value <= 5) {
    return `露点差偏小，清晨云雾变化值得关注。${auxiliaryNotice}`;
  }
  return `露点差相对拉开，云雾突变概率较低。${auxiliaryNotice}`;
}

function gearDisplayAdvice(
  temperature: CloudSeaDisplayTemperatureContext,
  precipitation: CloudSeaPrecipitationSignalContext,
  variables: CloudSeaWeatherVariableConsistencyContext,
  result: ForecastCalculationResult,
): string {
  const base = result.clothingGuide.summaryZh;
  const rain =
    precipitation.affectsEquipment || variables.shouldDowngradePrecipitationWording
      ? ` ${precipitation.equipmentAdviceZh}`
      : "";
  return `${base} ${temperature.clothingAdviceZh}${rain}`.trim();
}

function buildStaleFieldWarnings(input: {
  readonly result: ForecastCalculationResult;
  readonly displayTemperatureContext: CloudSeaDisplayTemperatureContext;
  readonly precipitationSummary: ReturnType<typeof precipitationSummaryForRows>;
  readonly cloudLayerCompleteness: CloudLayerCompletenessContext;
}): readonly string[] {
  const warnings: string[] = [];
  const currentPrecipitation = finiteNumber(
    input.result.currentWeather?.precipitationAmountMm ??
      input.result.currentWeather?.precipitation ??
      input.result.currentWeather?.rainAmountMm,
  );
  if (
    isFiniteNumber(currentPrecipitation) &&
    currentPrecipitation <= 0 &&
    isFiniteNumber(input.precipitationSummary.amountMm) &&
    input.precipitationSummary.amountMm > 0
  ) {
    warnings.push("near-term precipitation display ignored stale zero current-weather amount");
  }
  if (
    input.displayTemperatureContext.basis === "terrain_adjusted" ||
    input.displayTemperatureContext.basis === "terrain_adjusted_lapse_estimate"
  ) {
    const raw = input.displayTemperatureContext.rawGridTemperatureC;
    const display = input.displayTemperatureContext.displayTemperatureC;
    if (isFiniteNumber(raw) && isFiniteNumber(display) && Math.abs(raw - display) >= 5) {
      warnings.push("temperature display uses adjusted mountain context instead of raw grid value");
    }
  }
  if (input.cloudLayerCompleteness.layerCompletenessLevel !== "complete") {
    warnings.push("cloud layer display keeps missing low/mid/high layers explicit");
  }
  return warnings;
}

function cloudLayerCoverageBadge(context: CloudLayerCompletenessContext): string {
  if (context.layerCompletenessLevel === "complete") {
    return "分层云量完整";
  }
  if (context.layerCompletenessLevel === "weak") {
    return "分层需复核";
  }
  if (context.layerCompletenessLevel === "missing") {
    return "分层缺失";
  }
  return "分层部分可用";
}

function cloudLayerCoverageSummary(context: CloudLayerCompletenessContext): string {
  return `完整 ${context.completeLayerHoursCount}/${context.totalHoursCount}，低云缺失 ${context.lowLayerMissingHoursCount}`;
}

function bodyFeelLabel(context: CloudSeaDisplayTemperatureContext): string {
  return context.isHighMountainTemperatureSensitive ? "山地体感" : "体感温度";
}

function cloudSeaDataBadgeLabel(result: ForecastCalculationResult): string {
  if (result.weatherDataMode === "real" && successfulRealWeatherSources(result).length >= 2) {
    return "判断依据较完整";
  }
  if (result.weatherDataMode === "real") {
    return "基础预报可用";
  }
  return "数据需复核";
}

function cloudSeaDataBadgeVariant(result: ForecastCalculationResult): CloudSeaDisplayBadgeVariant {
  return result.weatherDataMode === "real" && successfulRealWeatherSources(result).length >= 2
    ? "success"
    : "warning";
}

function successfulRealWeatherSources(
  result: ForecastCalculationResult,
): readonly ForecastCalculationResult["weatherSourceSummaries"][number][] {
  return result.weatherSourceSummaries.filter(
    (summary) =>
      (summary.providerCode === "qweather" ||
        summary.providerCode === "open_meteo" ||
        summary.providerCode === "meteoblue") &&
      summary.dataMode === "real" &&
      Boolean(summary.success ?? summary.status === "available"),
  );
}

function recommendationBadgeVariant(label: string): CloudSeaDisplayBadgeVariant {
  if (label.includes("不建议")) {
    return "danger";
  }
  if (label.includes("谨慎") || label.includes("等待")) {
    return "accent";
  }
  return "default";
}

function clampScorePercent(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(100, Math.max(0, Math.round(value)));
}

function formatWindowRange(start: string, end: string, timezone: string): string {
  if (!start || !end) {
    return "暂无明确时间范围";
  }
  const startParts = localDateTimeParts(start, timezone);
  const endParts = localDateTimeParts(end, timezone);

  if (!startParts || !endParts) {
    return `${formatDateTime(start, timezone)} – ${formatDateTime(end, timezone)}`;
  }

  if (
    startParts.year === endParts.year &&
    startParts.month === endParts.month &&
    startParts.day === endParts.day
  ) {
    return `${startParts.year}年${startParts.month}月${startParts.day}日 ${startParts.hour}:${startParts.minute}–${endParts.hour}:${endParts.minute}`;
  }

  return `${formatFullLocalDateTime(startParts)} – ${formatFullLocalDateTime(endParts)}`;
}

function formatDateTime(value: string, timezone: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return value;
  }
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: timezone,
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(timestamp));
}

function localDateTimeParts(
  value: string,
  timezone: string,
): {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: string;
  readonly minute: string;
} | null {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return null;
  }
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(timestamp));
  const valueByType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const year = Number(valueByType.year);
  const month = Number(valueByType.month);
  const day = Number(valueByType.day);
  const hour = valueByType.hour ?? "00";
  const minute = valueByType.minute ?? "00";

  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null;
  }

  return { year, month, day, hour, minute };
}

function formatFullLocalDateTime(parts: NonNullable<ReturnType<typeof localDateTimeParts>>): string {
  return `${parts.year}年${parts.month}月${parts.day}日 ${parts.hour}:${parts.minute}`;
}

function formatTemperature(value: number | null | undefined): string {
  return isFiniteNumber(value) ? `${Math.round(value)}°C` : "暂无";
}

function formatTemperatureDelta(value: number | null | undefined): string {
  return isFiniteNumber(value) ? `${roundDisplay(value)}°C` : "暂无";
}

function formatPercent(value: number | null | undefined): string {
  return isFiniteNumber(value) ? `${Math.round(value)}%` : "暂无";
}

function formatAmount(value: number | null | undefined): string {
  return isFiniteNumber(value) ? `${roundDisplay(value)} mm` : "缺测";
}

function formatKilometers(value: number | null | undefined): string {
  return isFiniteNumber(value) ? `${roundDisplay(value / 1000)} 公里` : "暂无";
}

function averageNumber(values: readonly (number | null | undefined)[]): number | null {
  const finiteValues = values.filter(isFiniteNumber);
  if (finiteValues.length === 0) {
    return null;
  }
  return round1(finiteValues.reduce((sum, value) => sum + value, 0) / finiteValues.length);
}

function maxNumber(values: readonly (number | null | undefined)[]): number | null {
  const finiteValues = values.filter(isFiniteNumber);
  return finiteValues.length > 0 ? round1(Math.max(...finiteValues)) : null;
}

function minNumber(values: readonly (number | null | undefined)[]): number | null {
  const finiteValues = values.filter(isFiniteNumber);
  return finiteValues.length > 0 ? round1(Math.min(...finiteValues)) : null;
}

function finiteNumber(value: number | null | undefined): number | null {
  return isFiniteNumber(value) ? value : null;
}

function isFiniteNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function roundDisplay(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function windDirectionLabel(value: number): string {
  const directions = ["北风", "东北风", "东风", "东南风", "南风", "西南风", "西风", "西北风"];
  const normalized = ((value % 360) + 360) % 360;
  const index = Math.round(normalized / 45) % directions.length;
  return directions[index] ?? `${Math.round(value)}°`;
}
