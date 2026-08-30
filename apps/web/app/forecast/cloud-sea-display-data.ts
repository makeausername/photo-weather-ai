import {
  buildCloudLayerCompletenessContext,
  buildCloudSeaCloudBasisConsistencyContext,
  buildCloudSeaPrecipitationSignalContext,
  buildCloudSeaWindowCenteredRiskContext,
  formatArrivalDeadlineZh,
  formatForecastWindowZh,
  forecastHorizonLabels,
  type CloudLayerCompletenessContext,
  type CloudSeaCloudBasisConsistencyContext,
  type CloudSeaPrecipitationSignalContext,
  type CloudSeaRecommendationExplanation,
  type CloudSeaRecommendationGuardOutput,
  type CloudSeaAnalysisWindow,
  type CloudSeaWindowRiskContext,
  type CloudSeaWeatherVariableConsistencyContext,
  type CloudLayerFieldCoverageSummary,
  type ForecastCalculationResult,
  type ForecastHorizon,
  type ForecastMultiSourceAgreementContext,
  type ProfessionalHourlyDataPoint,
  type ProfessionalHourlyDataTimeBasis,
} from "@photo-weather/shared";
import {
  filterRowsToForecastWindow,
  resolveRollingForecastHorizon,
  type ForecastWindowAnchor,
} from "@photo-weather/calendar";
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
  readonly key:
    | "temperature"
    | "cloud_visibility"
    | "wind_precipitation"
    | "humidity_dew_point"
    | "gear";
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

export type ProfessionalHourlyRowBadge = {
  readonly label: string;
  readonly detail: string;
  readonly tone?: "default" | "success" | "warning" | "danger" | "info";
};

export type ProfessionalHourlyRowAnnotation = ProfessionalHourlyRowBadge & {
  readonly rowTime: string;
  readonly badges?: readonly ProfessionalHourlyRowBadge[];
};

export type ProfessionalHourlyDisplayData = {
  readonly rows: readonly ProfessionalHourlyDataPoint[];
  readonly timeBasis: ProfessionalHourlyDataTimeBasis | null;
  readonly cloudLayerCompleteness: CloudLayerCompletenessContext;
  readonly cloudBasisConsistency: CloudSeaCloudBasisConsistencyContext;
  readonly focusWindows: readonly CloudSeaProfessionalHourlyWindow[];
  readonly riskWindows: readonly CloudSeaProfessionalHourlyWindow[];
  readonly rowAnnotations?: readonly ProfessionalHourlyRowAnnotation[];
};

export type CloudSeaProfessionalHourlyDisplayData = ProfessionalHourlyDisplayData;

export type CloudSeaImportantWindowDisplay = {
  readonly displayLabelZh: string;
  readonly startTime: string | null;
  readonly endTime: string | null;
  readonly hasWindow: boolean;
};

export type CloudSeaArrivalDisplay = {
  readonly displayLabelZh: string;
  readonly arrivalTime: string | null;
  readonly hasArrivalTime: boolean;
};

export type CloudSeaImportantWindowDisplayData = {
  readonly bestWindow: CloudSeaImportantWindowDisplay;
  readonly arrival: CloudSeaArrivalDisplay;
  readonly mainWindow: CloudSeaImportantWindowDisplay;
  readonly backupWindow: CloudSeaImportantWindowDisplay;
};

type CloudSeaDisplayTravelDecision = "go" | "cautious" | "no_go";

export type CloudSeaDisplayDataMeta = {
  readonly generatedAt: string;
  readonly timezone: string;
  readonly horizon: ForecastHorizon;
  readonly anchorStart: string;
  readonly anchorEnd: string;
  readonly expectedRowCount: number;
  readonly actualRowCount: number;
  readonly firstRowTime: string | null;
  readonly lastRowTime: string | null;
  readonly isRollingFutureRange: boolean;
  readonly displayRangeZh: string;
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
  readonly importantWindows: CloudSeaImportantWindowDisplayData;
  readonly cloudSeaWindowCards: readonly CloudSeaWindowItem[];
  readonly windowRiskContext: CloudSeaWindowRiskContext;
  readonly professionalHourlyData: CloudSeaProfessionalHourlyDisplayData;
  readonly dailyJudgment: readonly CloudSeaDailyTrendItem[];
  readonly judgmentBasis: readonly CloudSeaReasoningItem[];
  readonly actionPlan: readonly CloudSeaActionPlanItem[];
  readonly riskReview: readonly ForecastResultSectionItem[];
  readonly multiSourceConsistency: ForecastMultiSourceAgreementContext | null;
  readonly displayDataMeta: CloudSeaDisplayDataMeta;
};

export type BuildCloudSeaDisplayDataInput = {
  readonly result: ForecastCalculationResult;
  readonly ruleContext: CloudSeaRuleContext;
  readonly terrainContext: CloudSeaTerrainContext;
  readonly displayTemperatureContext: CloudSeaDisplayTemperatureContext;
  readonly windowRiskContext?: CloudSeaWindowRiskContext;
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

export type BuildProfessionalHourlyDisplayDataInput = {
  readonly result: ForecastCalculationResult;
  readonly focusWindows?: readonly CloudSeaProfessionalHourlyWindow[];
  readonly riskWindows?: readonly CloudSeaProfessionalHourlyWindow[];
  readonly rowAnnotations?: readonly ProfessionalHourlyRowAnnotation[];
};

type ProfessionalHourlyDisplayBundle = {
  readonly rows: readonly ProfessionalHourlyDataPoint[];
  readonly timeBasis: ProfessionalHourlyDataTimeBasis | null;
  readonly horizonWindow: ForecastWindowAnchor;
  readonly displayData: ProfessionalHourlyDisplayData;
};

export function buildCloudSeaDisplayData(
  input: BuildCloudSeaDisplayDataInput,
): CloudSeaDisplayData {
  const professionalHourlyBundle = buildProfessionalHourlyDisplayBundle({
    result: input.result,
    focusWindows: cloudSeaFocusWindows(input.result),
    riskWindows: input.result.cloudSeaAnalysis.notRecommendedCloudSeaWindows.map(compactWindow),
  });
  const horizonWindow = professionalHourlyBundle.horizonWindow;
  const displayRows = professionalHourlyBundle.rows;
  const nearTermRows = displayRows.slice(0, 6);
  const nearTermEnd =
    nearTermRows.at(-1)?.time ?? fallbackNearTermEnd(horizonWindow.anchorStartLocal);
  const professionalHourlyData = professionalHourlyBundle.displayData;
  const cloudLayerCompleteness = professionalHourlyData.cloudLayerCompleteness;
  const cloudBasisConsistency = professionalHourlyData.cloudBasisConsistency;
  const displayPrecipitationSignalContext = buildDisplayPrecipitationSignalContext({
    input,
    rows: displayRows,
    cloudLayerCompleteness,
  });
  const windowRiskContext =
    input.windowRiskContext ??
    buildDisplayWindowRiskContext({
      input,
      rows: displayRows,
      precipitationSignalContext: displayPrecipitationSignalContext,
      cloudLayerCompleteness,
      cloudBasisConsistency,
      horizonWindow,
    });
  const currentNearTermWeather = buildCurrentNearTermWeatherDisplay({
    result: input.result,
    terrainContext: input.terrainContext,
    displayTemperatureContext: input.displayTemperatureContext,
    precipitationSignalContext: displayPrecipitationSignalContext,
    windowRiskContext,
    weatherVariableConsistencyContext: input.ruleContext.weatherVariableConsistencyContext,
    cloudLayerCompleteness,
    cloudBasisConsistency,
    anchorStart: horizonWindow.anchorStartLocal,
    anchorEnd: nearTermEnd,
    rows: nearTermRows,
  });
  const displayDataMeta = buildDisplayDataMeta({
    result: input.result,
    horizonWindow,
    displayRows,
    nearTermRows,
    displayTemperatureContext: input.displayTemperatureContext,
    precipitationSignalContext: displayPrecipitationSignalContext,
    cloudLayerCompleteness,
    cloudBasisConsistency,
  });
  const travelDecision = deriveCloudSeaDisplayTravelDecision(input);
  const importantWindows = buildImportantWindowDisplayData(input, travelDecision);
  const finalRecommendationLabel =
    input.result.finalRecommendationLabel ?? input.header.recommendationLabel;
  const finalDecisionSummary = input.result.finalDecisionSummaryZh ?? input.scoreCardSummary;
  // This card is explicitly the Cloud Sea score. Keep it on the calibrated
  // target scale instead of mixing in the cross-target/global score.
  const finalScore = input.result.cloudSeaAnalysis.scoreCalibration.finalCloudSeaScore;
  const recommendationCards = applyImportantWindowRecommendationLabels(
    input.recommendationCards,
    importantWindows,
    travelDecision,
  );
  const actionPlan = applyWindowRiskActionLabels(
    applyImportantWindowActionLabels(input.actionPlan, importantWindows, travelDecision),
    windowRiskContext,
    travelDecision,
  );

  return {
    header: {
      ...input.header,
      recommendationLabel: finalRecommendationLabel,
      conclusion: input.result.finalDecisionSummaryZh ?? input.header.conclusion,
      bestWindowLabel: windowDisplayValueForDecision(
        importantWindows.bestWindow.displayLabelZh,
        travelDecision,
        input.header.bestWindowLabel,
      ),
      arrivalLabel: arrivalDisplayValueForDecision(
        importantWindows.arrival.displayLabelZh,
        travelDecision,
        "hero",
      ),
      heroBadgeLabel: input.terrainContext.vocabulary.heroBadgeLabel,
      dataBadgeLabel: cloudSeaDataBadgeLabel(input.result),
      dataBadgeVariant: cloudSeaDataBadgeVariant(input.result),
      horizonLabel: forecastHorizonLabels[input.result.horizon],
      generatedAtLabel: formatDateTime(
        input.result.generatedAt,
        input.result.calendarBasis.timezone,
      ),
    },
    scoreCard: {
      label: input.terrainContext.vocabulary.scoreCardLabel,
      score: clampScorePercent(finalScore),
      badgeLabel: finalRecommendationLabel,
      badgeVariant: recommendationBadgeVariant(finalRecommendationLabel),
      summary: finalDecisionSummary,
    },
    recommendationCards,
    currentNearTermWeather,
    importantWindows,
    cloudSeaWindowCards: input.cloudSeaWindowCards,
    windowRiskContext,
    professionalHourlyData,
    dailyJudgment: input.dailyJudgment,
    judgmentBasis: input.judgmentBasis,
    actionPlan,
    riskReview: input.riskReview,
    multiSourceConsistency: input.ruleContext.multiSourceAgreementContext,
    displayDataMeta,
  };
}

export function buildProfessionalHourlyDisplayDataForResult(
  input: BuildProfessionalHourlyDisplayDataInput,
): ProfessionalHourlyDisplayData {
  return buildProfessionalHourlyDisplayBundle(input).displayData;
}

function buildProfessionalHourlyDisplayBundle(
  input: BuildProfessionalHourlyDisplayDataInput,
): ProfessionalHourlyDisplayBundle {
  const rows = input.result.professionalHourlyData ?? [];
  const timeBasis = input.result.professionalHourlyDataTimeBasis ?? null;
  const horizonWindow = resolveCloudSeaDisplayHorizon(input.result, rows);
  const displayRows = filterRowsToForecastWindow(rows, horizonWindow, (row) => row.time);
  const displayTimeBasis = buildDisplayProfessionalHourlyTimeBasis(
    timeBasis,
    horizonWindow,
    displayRows,
  );
  const cloudLayerCompleteness = buildCloudLayerCompletenessContext(displayRows);
  const cloudBasisConsistency = buildCloudSeaCloudBasisConsistencyContext({
    hourlyRows: displayRows,
    cloudLayerCompletenessContext: cloudLayerCompleteness,
  });

  return {
    rows: displayRows,
    timeBasis: displayTimeBasis,
    horizonWindow,
    displayData: {
      rows: displayRows,
      timeBasis: displayTimeBasis,
      cloudLayerCompleteness,
      cloudBasisConsistency,
      focusWindows: input.focusWindows ?? [],
      riskWindows: input.riskWindows ?? [],
      rowAnnotations: input.rowAnnotations,
    },
  };
}

type CloudSeaDisplayWindowSource = {
  readonly startTime?: string | null;
  readonly endTime?: string | null;
  readonly displayLabelZh?: string | null;
};

function buildImportantWindowDisplayData(
  input: BuildCloudSeaDisplayDataInput,
  travelDecision: CloudSeaDisplayTravelDecision,
): CloudSeaImportantWindowDisplayData {
  const timezone = input.result.calendarBasis.timezone;
  const bestSource = firstDisplayWindowAtOrAfterAnchor(input.result);
  const bestCard = bestSource
    ? input.cloudSeaWindowCards.find((window) => sameWindowTime(window, bestSource))
    : undefined;
  const bestWindow = formatImportantWindowDisplay(
    bestCard ?? bestSource,
    timezone,
    input.terrainContext.shouldDowngradeCloudSeaWording
      ? "暂无明确低云/晨雾窗口"
      : "暂无明确云海窗口",
  );
  const forecastBestWindow = bestSource
    ? input.result.bestWindows.find((window) => sameWindowTime(window, bestSource))
    : undefined;
  const arrivalTime =
    travelDecision === "no_go"
      ? null
      : forecastBestWindow?.arrivalAdvice?.recommendedArrivalTime ??
        (bestSource?.startTime ? shiftDisplayTime(bestSource.startTime, -90) : null);
  const backupSource =
    input.cloudSeaWindowCards.find(
      (window) =>
        windowStartsAtOrAfterAnchor(input.result, window) &&
        (!bestSource || !sameWindowTime(window, bestSource)),
    ) ?? firstDisplayWindowAtOrAfterAnchor(input.result, bestSource);

  return {
    bestWindow,
    arrival: formatArrivalDisplayForDecision(arrivalTime, timezone, travelDecision),
    mainWindow: bestWindow,
    backupWindow: formatImportantWindowDisplay(backupSource, timezone, "暂无备选窗口"),
  };
}

function applyImportantWindowRecommendationLabels(
  cards: readonly ForecastResultCard[],
  importantWindows: CloudSeaImportantWindowDisplayData,
  travelDecision: CloudSeaDisplayTravelDecision,
): readonly ForecastResultCard[] {
  let changed = false;
  const normalized = cards.map((card) => {
    if (card.key === "cloud-sea-best-window") {
      const value = windowDisplayValueForDecision(
        importantWindows.bestWindow.displayLabelZh,
        travelDecision,
        card.label,
      );
      if (card.value === value) {
        return card;
      }
      changed = true;
      return {
        ...card,
        value,
      };
    }
    if (card.key === "cloud-sea-arrival") {
      const label = arrivalCardLabelForDecision(travelDecision, card.label);
      const value = arrivalDisplayValueForDecision(
        importantWindows.arrival.displayLabelZh,
        travelDecision,
        "card",
      );
      const detail = arrivalCardDetailForDecision(travelDecision, card.detail);
      const tone = travelDecision === "no_go" ? "danger" : card.tone;
      if (
        card.label === label &&
        card.value === value &&
        card.detail === detail &&
        card.tone === tone
      ) {
        return card;
      }
      changed = true;
      return {
        ...card,
        label,
        value,
        detail,
        tone,
      };
    }
    return card;
  });
  return changed ? normalized : cards;
}

function applyImportantWindowActionLabels(
  items: readonly CloudSeaActionPlanItem[],
  importantWindows: CloudSeaImportantWindowDisplayData,
  travelDecision: CloudSeaDisplayTravelDecision,
): readonly CloudSeaActionPlanItem[] {
  let changed = false;
  const normalized = items.map((item) => {
    if (item.key === "arrival") {
      const label = arrivalActionLabelForDecision(travelDecision, item.label);
      const value = arrivalDisplayValueForDecision(
        importantWindows.arrival.displayLabelZh,
        travelDecision,
        "action",
      );
      const detail = arrivalActionDetailForDecision(travelDecision, item.detail);
      const tone = travelDecision === "no_go" ? "danger" : item.tone;
      if (
        item.label === label &&
        item.value === value &&
        item.detail === detail &&
        item.tone === tone
      ) {
        return item;
      }
      changed = true;
      return {
        ...item,
        label,
        value,
        detail,
        tone,
      };
    }
    if (item.key === "main-window") {
      const value = windowDisplayValueForDecision(
        importantWindows.mainWindow.displayLabelZh,
        travelDecision,
        item.label,
      );
      if (item.value === value) {
        return item;
      }
      changed = true;
      return {
        ...item,
        value,
      };
    }
    if (item.key === "backup" && importantWindows.backupWindow.hasWindow) {
      if (item.value === importantWindows.backupWindow.displayLabelZh) {
        return item;
      }
      changed = true;
      return {
        ...item,
        value: importantWindows.backupWindow.displayLabelZh,
      };
    }
    return item;
  });
  return changed ? normalized : items;
}

function applyWindowRiskActionLabels(
  items: readonly CloudSeaActionPlanItem[],
  windowRiskContext: CloudSeaWindowRiskContext,
  travelDecision: CloudSeaDisplayTravelDecision,
): readonly CloudSeaActionPlanItem[] {
  let changed = false;
  const normalized = items.map((item) => {
    if (item.key === "main-window") {
      const detail = windowRiskActionDetailForDecision(
        item.detail,
        windowRiskContext.actionAdviceZh,
        travelDecision,
      );
      if (item.detail === detail) {
        return item;
      }
      changed = true;
      return {
        ...item,
        detail,
      };
    }
    return item;
  });
  return changed ? normalized : items;
}

function buildDisplayWindowRiskContext(input: {
  readonly input: BuildCloudSeaDisplayDataInput;
  readonly rows: readonly ProfessionalHourlyDataPoint[];
  readonly precipitationSignalContext: CloudSeaPrecipitationSignalContext;
  readonly cloudLayerCompleteness: CloudLayerCompletenessContext;
  readonly cloudBasisConsistency: CloudSeaCloudBasisConsistencyContext;
  readonly horizonWindow: ForecastWindowAnchor;
}): CloudSeaWindowRiskContext {
  const result = input.input.result;
  const bestWindow =
    result.cloudSeaAnalysis.bestCloudSeaWindow ??
    result.cloudSeaAnalysis.bestCloudSeaWindows[0] ??
    result.cloudSeaAnalysis.watchableCloudSeaWindows[0] ??
    null;

  if (input.rows.length === 0 && result.cloudSeaAnalysis.windowRiskContext) {
    return result.cloudSeaAnalysis.windowRiskContext;
  }

  return buildCloudSeaWindowCenteredRiskContext({
    normalizedHourlyRows: input.rows,
    bestWindow,
    mainWindow: bestWindow,
    backupWindows: [
      ...result.cloudSeaAnalysis.bestCloudSeaWindows,
      ...result.cloudSeaAnalysis.watchableCloudSeaWindows,
    ],
    forecastWindowRange: {
      startTime: input.horizonWindow.anchorStartLocal,
      endTime: input.horizonWindow.anchorEndLocal,
    },
    precipitationSignalContext: input.precipitationSignalContext,
    cloudLayerCoverageContext: input.cloudLayerCompleteness,
    cloudBasisConsistencyContext: input.cloudBasisConsistency,
    displayTemperatureContext: {
      displayTemperatureC: input.input.displayTemperatureContext.displayTemperatureC,
      bodyFeelTemperatureC: input.input.displayTemperatureContext.bodyFeelTemperatureC,
      terrainAdjustedTemperatureC:
        input.input.displayTemperatureContext.terrainAdjustedTemperatureC,
      basis: input.input.displayTemperatureContext.basis,
    },
    terrainContext: {
      elevationMeters: input.input.terrainContext.elevationMeters,
      surroundingReliefMeters: input.input.terrainContext.surroundingReliefMeters,
      terrainMode: result.cloudSeaAnalysis.terrainSupport.terrainMode,
      terrainType: input.input.terrainContext.terrainType,
      confidence: result.cloudSeaAnalysis.terrainSupport.confidence,
    },
    whiteoutRiskContext: {
      whiteoutRiskScore: result.cloudSeaAnalysis.whiteoutRiskScore,
    },
    timezone: result.calendarBasis.timezone,
  });
}

function firstDisplayWindowAtOrAfterAnchor(
  result: ForecastCalculationResult,
  excludedWindow?: CloudSeaDisplayWindowSource | null,
): CloudSeaDisplayWindowSource | null {
  const candidates = [
    result.cloudSeaAnalysis.bestCloudSeaWindow,
    ...result.cloudSeaAnalysis.bestCloudSeaWindows,
    ...result.cloudSeaAnalysis.watchableCloudSeaWindows,
    ...result.cloudSeaAnalysis.notRecommendedCloudSeaWindows,
  ].filter((window): window is CloudSeaAnalysisWindow => Boolean(window));
  return (
    candidates.find(
      (window) =>
        windowStartsAtOrAfterAnchor(result, window) &&
        (!excludedWindow || !sameWindowTime(window, excludedWindow)),
    ) ?? null
  );
}

function formatImportantWindowDisplay(
  window: CloudSeaDisplayWindowSource | null | undefined,
  timezone: string,
  fallback: string,
): CloudSeaImportantWindowDisplay {
  if (!window?.startTime || !window.endTime) {
    return {
      displayLabelZh: fallback,
      startTime: null,
      endTime: null,
      hasWindow: false,
    };
  }
  return {
    displayLabelZh:
      window.displayLabelZh ??
      formatForecastWindowZh(window.startTime, window.endTime, timezone, {
        missingText: fallback,
        invalidText: "时间待确认",
      }),
    startTime: window.startTime,
    endTime: window.endTime,
    hasWindow: true,
  };
}

function formatArrivalDisplay(
  arrivalTime: string | null | undefined,
  timezone: string,
): CloudSeaArrivalDisplay {
  return {
    displayLabelZh: formatArrivalDeadlineZh(arrivalTime ?? undefined, timezone, {
      missingText: "暂无明确到达时间",
    }),
    arrivalTime: arrivalTime ?? null,
    hasArrivalTime: Boolean(arrivalTime),
  };
}

function formatArrivalDisplayForDecision(
  arrivalTime: string | null | undefined,
  timezone: string,
  travelDecision: CloudSeaDisplayTravelDecision,
): CloudSeaArrivalDisplay {
  if (travelDecision === "no_go") {
    return {
      displayLabelZh: "暂不安排行程",
      arrivalTime: null,
      hasArrivalTime: false,
    };
  }
  const arrival = formatArrivalDisplay(arrivalTime, timezone);
  if (travelDecision === "cautious") {
    return {
      ...arrival,
      displayLabelZh: cautiousArrivalDisplayValue(arrival.displayLabelZh),
    };
  }
  return arrival;
}

function deriveCloudSeaDisplayTravelDecision(
  input: BuildCloudSeaDisplayDataInput,
): CloudSeaDisplayTravelDecision {
  const recommendationLevel = input.recommendationGuard.finalRecommendationLevel;
  const primaryDecisionText = [
    input.recommendationGuard.finalRecommendationLabel,
    input.header.recommendationLabel,
    input.recommendationCards.find((card) => card.key === "cloud-sea-recommendation")?.value,
    input.actionPlan.find((item) => item.key === "departure")?.value,
  ]
    .filter(Boolean)
    .join(" ");

  if (recommendationLevel === "do_not_go_special" || containsNoGoDecision(primaryDecisionText)) {
    return "no_go";
  }

  if (
    !input.recommendationGuard.isSpecialTripRecommended ||
    recommendationLevel === "cautious_reference" ||
    recommendationLevel === "observe_if_nearby" ||
    recommendationLevel === "backup_only" ||
    containsCautiousDecision(primaryDecisionText)
  ) {
    return "cautious";
  }

  return "go";
}

function windowDisplayValueForDecision(
  value: string,
  travelDecision: CloudSeaDisplayTravelDecision,
  preferredPrefix?: string,
): string {
  if (travelDecision === "go" || value.startsWith("暂无") || value.startsWith("需")) {
    return value;
  }
  const prefix = windowReferencePrefixForDecision(travelDecision, preferredPrefix);
  if (value.startsWith(prefix)) {
    return value;
  }
  const colonIndex = value.indexOf("：");
  if (colonIndex >= 0) {
    return `${prefix}${value.slice(colonIndex)}`;
  }
  return `${prefix}：${value}`;
}

function windowReferencePrefixForDecision(
  travelDecision: CloudSeaDisplayTravelDecision,
  preferredPrefix?: string,
): string {
  if (travelDecision === "no_go") {
    return "备选观察窗口";
  }
  return preferredPrefix?.includes("低云/晨雾参考窗口") ? "低云/晨雾参考窗口" : "参考窗口";
}

function arrivalDisplayValueForDecision(
  value: string,
  travelDecision: CloudSeaDisplayTravelDecision,
  surface: "card" | "action" | "hero",
): string {
  if (travelDecision === "no_go") {
    return surface === "action" ? "等待下次预报" : "暂不安排行程";
  }
  if (travelDecision === "cautious") {
    return cautiousArrivalDisplayValue(value);
  }
  return value;
}

function arrivalCardLabelForDecision(
  travelDecision: CloudSeaDisplayTravelDecision,
  currentLabel: string,
): string {
  if (travelDecision === "no_go") {
    return "出发决策";
  }
  if (travelDecision === "cautious") {
    return "到达参考";
  }
  return currentLabel;
}

function arrivalActionLabelForDecision(
  travelDecision: CloudSeaDisplayTravelDecision,
  currentLabel: string,
): string {
  if (travelDecision === "no_go") {
    return "行程建议";
  }
  if (travelDecision === "cautious") {
    return "到达参考";
  }
  return currentLabel;
}

function arrivalCardDetailForDecision(
  travelDecision: CloudSeaDisplayTravelDecision,
  currentDetail: string,
): string {
  if (travelDecision === "no_go") {
    return "当前不建议专程出发，等待下一次预报更新；避免为单一窗口安排远途，重新复核降水、能见度和通行条件后再决策。";
  }
  if (travelDecision === "cautious") {
    return "仅作为备选到达参考；如仍前往，出发前必须复核降水、能见度和通行条件，证据不足时等待下一次预报。";
  }
  return currentDetail;
}

function arrivalActionDetailForDecision(
  travelDecision: CloudSeaDisplayTravelDecision,
  currentDetail: string,
): string {
  if (travelDecision === "no_go") {
    return "当前没有推荐的专程出发行程；等待下一次预报，重新复核降水、能见度和通行条件后再决定。";
  }
  if (travelDecision === "cautious") {
    return "到达时间只作备选参考；如仍前往，出发前必须复核降水、能见度和通行条件，不把该窗口当作确定行程。";
  }
  return currentDetail;
}

function cautiousArrivalDisplayValue(value: string): string {
  if (
    value.startsWith("如仍前往") ||
    value.startsWith("到达参考") ||
    value.startsWith("仅供备选")
  ) {
    return value;
  }
  if (value.startsWith("建议到达：")) {
    return `如仍前往，${value}`;
  }
  if (value.startsWith("暂无") || value.startsWith("需")) {
    return "如仍前往，到达时间需临近预报复核";
  }
  return `如仍前往，到达参考：${arrivalReferenceDisplayValue(value)}`;
}

function arrivalReferenceDisplayValue(value: string): string {
  return value.replace(/^建议到达：/, "").trim();
}

function windowRiskActionDetailForDecision(
  currentDetail: string,
  riskAdvice: string,
  travelDecision: CloudSeaDisplayTravelDecision,
): string {
  if (travelDecision === "no_go") {
    return currentDetail.includes(riskAdvice) ? currentDetail : `${currentDetail} ${riskAdvice}`;
  }
  if (travelDecision === "cautious") {
    return currentDetail.includes(riskAdvice) ? currentDetail : `${currentDetail} ${riskAdvice}`;
  }
  return riskAdvice;
}

function containsNoGoDecision(text: string): boolean {
  return /不建议|暂不安排|不安排专程|不安排出发|不安排该行程/.test(text);
}

function containsCautiousDecision(text: string): boolean {
  return /谨慎|备选|参考|等待|如仍前往|已在附近|顺带观察|可观察/.test(text);
}

function sameWindowTime(
  left: CloudSeaDisplayWindowSource,
  right: CloudSeaDisplayWindowSource,
): boolean {
  return Boolean(
    left.startTime &&
      left.endTime &&
      left.startTime === right.startTime &&
      left.endTime === right.endTime,
  );
}

function windowStartsAtOrAfterAnchor(
  result: ForecastCalculationResult,
  window: CloudSeaDisplayWindowSource | null | undefined,
): boolean {
  if (!window?.startTime) {
    return false;
  }
  const anchorMs = Date.parse(
    result.professionalHourlyDataTimeBasis?.anchorStartLocal ?? result.forecastStart,
  );
  const startMs = Date.parse(window.startTime);
  if (!Number.isFinite(anchorMs)) {
    return Number.isFinite(startMs);
  }
  return Number.isFinite(startMs) && startMs >= anchorMs;
}

function shiftDisplayTime(value: string, minutes: number): string | null {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return null;
  }
  return new Date(timestamp + minutes * 60 * 1000).toISOString();
}

function fallbackNearTermEnd(anchorStartLocal: string): string {
  const startMs = Date.parse(anchorStartLocal);
  if (!Number.isFinite(startMs)) {
    return anchorStartLocal;
  }
  return new Date(startMs + 5 * 60 * 60 * 1000).toISOString();
}

function resolveCloudSeaDisplayHorizon(
  result: ForecastCalculationResult,
  rows: readonly ProfessionalHourlyDataPoint[],
): ForecastWindowAnchor {
  const timeBasis = result.professionalHourlyDataTimeBasis;
  return resolveRollingForecastHorizon({
    generatedAt: timeBasis?.generatedAtLocal ?? result.generatedAt ?? result.forecastStart,
    timezone: timeBasis?.timezone ?? result.calendarBasis.timezone,
    horizon: result.horizon,
    requestedForecastHours:
      timeBasis?.expectedRowCount ?? timeBasis?.requestedHours ?? result.calendarBasis.horizonHours,
    providerRows: rows,
    selectProviderRowTime: (row) => (row as ProfessionalHourlyDataPoint).time,
  });
}

function buildDisplayProfessionalHourlyTimeBasis(
  timeBasis: ProfessionalHourlyDataTimeBasis | null,
  horizonWindow: ForecastWindowAnchor,
  rows: readonly ProfessionalHourlyDataPoint[],
): ProfessionalHourlyDataTimeBasis | null {
  if (!timeBasis) {
    return null;
  }

  const firstRow = rows[0];
  const lastRow = rows.at(-1);
  const partialData = timeBasis.partialData || rows.length < horizonWindow.expectedRowCount;
  const shortCoverageNote =
    rows.length < horizonWindow.expectedRowCount
      ? "当前数据源返回的未来小时数不足，已展示可用未来时段。"
      : null;
  const hadProviderCoverageNote = Boolean(
    timeBasis.professionalCoverageNoteZh ?? timeBasis.userFacingCoverageNoteZh,
  );

  return {
    ...timeBasis,
    startTime: firstRow?.time ?? horizonWindow.anchorStartLocal,
    endTime: lastRow?.time ?? horizonWindow.anchorEndLocal,
    timezone: horizonWindow.timezone,
    generatedAtLocal: horizonWindow.generatedAtLocal,
    anchorStartLocal: horizonWindow.anchorStartLocal,
    anchorEndLocal: horizonWindow.anchorEndLocal,
    horizonHours: horizonWindow.horizonHours,
    expectedRowCount: horizonWindow.expectedRowCount,
    requestedHours: horizonWindow.requestedHours,
    minRequestHours: timeBasis.minRequestHours,
    recommendedRequestHours: timeBasis.recommendedRequestHours,
    requiredForecastDays: timeBasis.requiredForecastDays,
    requestStartLocal: timeBasis.requestStartLocal,
    requestEndLocal: timeBasis.requestEndLocal,
    providerCoverageVersion: timeBasis.providerCoverageVersion,
    coverageRule: timeBasis.coverageRule,
    rule: horizonWindow.rule,
    displayLabel: horizonWindow.displayLabel,
    displayRangeZh: horizonWindow.displayRangeZh,
    isFutureOnly: horizonWindow.isFutureOnly,
    anchorRule: horizonWindow.anchorRule,
    debugMeta: horizonWindow.debugMeta,
    partialData,
    missingDataNoteZh: shortCoverageNote ?? timeBasis.missingDataNoteZh,
    // Provider notes describe the raw response window and can contradict the
    // selected display horizon after clipping. Only expose the recomputed
    // display-window coverage note here.
    professionalCoverageNoteZh: hadProviderCoverageNote
      ? [shortCoverageNote, buildDisplayProfessionalCoverageNote(rows)].filter(Boolean).join(" ")
      : shortCoverageNote ?? undefined,
    fieldCoverageSummary: timeBasis.fieldCoverageSummary
      ? buildDisplayFieldCoverageSummary(rows)
      : timeBasis.fieldCoverageSummary,
  };
}

function buildDisplayProfessionalCoverageNote(
  rows: readonly ProfessionalHourlyDataPoint[],
): string {
  const summary = buildDisplayFieldCoverageSummary(rows);
  return `当前展示范围字段覆盖：总云量 ${summary.totalCloudCoverage}/${summary.totalHours}，低云 ${summary.cloudLowCoverage}/${summary.totalHours}，中云 ${summary.cloudMidCoverage}/${summary.totalHours}，高云 ${summary.cloudHighCoverage}/${summary.totalHours} 小时。`;
}

function buildDisplayFieldCoverageSummary(
  rows: readonly ProfessionalHourlyDataPoint[],
): CloudLayerFieldCoverageSummary {
  const countNumbers = (select: (row: ProfessionalHourlyDataPoint) => number | null | undefined) =>
    rows.filter((row) => isFiniteNumber(select(row))).length;
  const countCloudLayer = (
    select: (row: ProfessionalHourlyDataPoint) => number | null | undefined,
  ) =>
    rows.filter(
      (row) =>
        row.cloudLayerBasis !== "total_only" &&
        row.cloudLayerBasis !== "unknown" &&
        isFiniteNumber(select(row)),
    ).length;

  return {
    totalHours: rows.length,
    totalCloudCoverage: countNumbers((row) => row.cloudTotalPercent),
    cloudLowCoverage: countCloudLayer((row) => row.cloudLowPercent),
    cloudMidCoverage: countCloudLayer((row) => row.cloudMidPercent),
    cloudHighCoverage: countCloudLayer((row) => row.cloudHighPercent),
    temperatureCoverage: countNumbers((row) => row.displayedTemperatureC),
    terrainAdjustedTemperatureCoverage: countNumbers((row) => row.terrainAdjustedTemperatureC),
    dewPointCoverage: countNumbers((row) => row.dewPointC),
    dewPointSpreadCoverage: countNumbers((row) => row.dewPointSpreadC),
    humidityCoverage: countNumbers((row) => row.relativeHumidityPercent),
    precipitationAmountCoverage: countNumbers((row) => row.precipitationAmountMm),
    precipitationProbabilityCoverage: countNumbers((row) => row.precipitationProbabilityPercent),
    visibilityCoverage: countNumbers((row) => row.visibilityMeters),
    windSpeedCoverage: countNumbers((row) => row.windSpeedMs),
    windDirectionCoverage: countNumbers((row) => row.windDirectionDeg),
    weatherCodeCoverage: rows.filter(
      (row) => typeof row.weatherCode === "string" && row.weatherCode.trim().length > 0,
    ).length,
  };
}

function buildDisplayPrecipitationSignalContext(input: {
  readonly input: BuildCloudSeaDisplayDataInput;
  readonly rows: readonly ProfessionalHourlyDataPoint[];
  readonly cloudLayerCompleteness: CloudLayerCompletenessContext;
}): CloudSeaPrecipitationSignalContext {
  const result = input.input.result;
  const bestWindow =
    result.cloudSeaAnalysis.bestCloudSeaWindow ??
    result.cloudSeaAnalysis.bestCloudSeaWindows[0] ??
    result.cloudSeaAnalysis.watchableCloudSeaWindows[0] ??
    null;

  return buildCloudSeaPrecipitationSignalContext({
    hourlyRows: input.rows,
    timezone: result.calendarBasis.timezone,
    focusedWindow: bestWindow
      ? {
          startTime: bestWindow.startTime,
          endTime: bestWindow.endTime,
        }
      : null,
    bestWindow,
    terrainContext: {
      elevationMeters: input.input.terrainContext.elevationMeters,
      surroundingReliefMeters: input.input.terrainContext.surroundingReliefMeters,
      terrainMode: result.cloudSeaAnalysis.terrainSupport.terrainMode,
      terrainType: input.input.terrainContext.terrainType,
    },
    cloudLayerCompletenessContext: input.cloudLayerCompleteness,
  });
}

function buildCurrentNearTermWeatherDisplay(input: {
  readonly result: ForecastCalculationResult;
  readonly terrainContext: CloudSeaTerrainContext;
  readonly displayTemperatureContext: CloudSeaDisplayTemperatureContext;
  readonly precipitationSignalContext: CloudSeaPrecipitationSignalContext;
  readonly windowRiskContext: CloudSeaWindowRiskContext;
  readonly weatherVariableConsistencyContext: CloudSeaWeatherVariableConsistencyContext;
  readonly cloudLayerCompleteness: CloudLayerCompletenessContext;
  readonly cloudBasisConsistency: CloudSeaCloudBasisConsistencyContext;
  readonly anchorStart: string;
  readonly anchorEnd: string;
  readonly rows: readonly ProfessionalHourlyDataPoint[];
}): CloudSeaCurrentNearTermWeatherDisplay {
  const sectionWindowLabel = formatWindowRange(
    input.anchorStart,
    input.anchorEnd,
    input.result.calendarBasis.timezone,
  );
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
        detail: `${input.windowRiskContext.precipitationWindowSummaryZh} ${input.windowRiskContext.actionAdviceZh}`,
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
          input.windowRiskContext,
          input.weatherVariableConsistencyContext,
          input.result,
        ),
      },
    ],
  };
}

function buildDisplayDataMeta(input: {
  readonly result: ForecastCalculationResult;
  readonly horizonWindow: ForecastWindowAnchor;
  readonly displayRows: readonly ProfessionalHourlyDataPoint[];
  readonly nearTermRows: readonly ProfessionalHourlyDataPoint[];
  readonly displayTemperatureContext: CloudSeaDisplayTemperatureContext;
  readonly precipitationSignalContext: CloudSeaPrecipitationSignalContext;
  readonly cloudLayerCompleteness: CloudLayerCompletenessContext;
  readonly cloudBasisConsistency: CloudSeaCloudBasisConsistencyContext;
}): CloudSeaDisplayDataMeta {
  const precipitationSummary = precipitationSummaryForRows(
    input.nearTermRows,
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
    timezone: input.horizonWindow.timezone,
    horizon: input.result.horizon,
    anchorStart: input.horizonWindow.anchorStartLocal,
    anchorEnd: input.horizonWindow.anchorEndLocal,
    expectedRowCount: input.horizonWindow.expectedRowCount,
    actualRowCount: input.displayRows.length,
    firstRowTime: input.displayRows[0]?.time ?? null,
    lastRowTime: input.displayRows.at(-1)?.time ?? null,
    isRollingFutureRange: input.horizonWindow.rule === "rolling_future_hours",
    displayRangeZh: input.horizonWindow.displayRangeZh,
    normalizedHourlyRowCount: input.displayRows.length,
    cloudLayerCoverageSummary: cloudLayerCoverageSummary(input.cloudLayerCompleteness),
    temperatureBasis: input.displayTemperatureContext.basis,
    precipitationSignalType: input.precipitationSignalContext.precipitationSignalType,
    sourceAlignmentStatus:
      input.displayRows.length === 0
        ? "missing_hourly_rows"
        : input.displayRows.length < input.horizonWindow.expectedRowCount ||
            staleWarnings.length > 0 ||
            input.cloudBasisConsistency.shouldLowerCloudSeaConfidence
          ? "partial"
          : "aligned",
    staleFieldWarnings: staleWarnings,
  };
}

function cloudSeaFocusWindows(
  result: ForecastCalculationResult,
): readonly CloudSeaProfessionalHourlyWindow[] {
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

function windSummaryForRows(rows: readonly ProfessionalHourlyDataPoint[]): {
  readonly text: string;
} {
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
  windowRiskContext: CloudSeaWindowRiskContext,
  variables: CloudSeaWeatherVariableConsistencyContext,
  result: ForecastCalculationResult,
): string {
  const base = result.clothingGuide.summaryZh;
  const rain =
    precipitation.affectsEquipment || variables.shouldDowngradePrecipitationWording
      ? ` ${windowRiskContext.equipmentAdviceZh}`
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
  return formatForecastWindowZh(start, end, timezone, {
    missingText: "暂无明确时间范围",
    invalidText: "时间待确认",
  });
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
