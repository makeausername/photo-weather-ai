import type {
  ForecastDecisionMode,
  ForecastRiskFlag,
  ForecastTarget,
  ForecastTimeWindow,
} from "./types.js";

export function applyForecastDecisionToWindows(
  windows: readonly ForecastTimeWindow[],
  decision: {
    readonly target: ForecastTarget;
    readonly decisionMode?: ForecastDecisionMode;
    readonly finalDecisionSummaryZh?: string;
  },
): readonly ForecastTimeWindow[] {
  if (
    decision.target !== "general" ||
    !decision.decisionMode ||
    decision.decisionMode === "strong_go"
  ) {
    return windows;
  }
  return windows.map((window) => ({
    ...window,
    executableForDedicatedTrip: false,
    windowLevel: window.windowLevel === "blocked" ? "blocked" : "watchable",
    recommendationLevel:
      window.recommendationLevel === "recommended" ? "cautious" : window.recommendationLevel,
    copyReasonZh: decision.finalDecisionSummaryZh ?? window.copyReasonZh,
    arrivalAdvice: undefined,
  }));
}

export function isExecutableForecastWindow(window: ForecastTimeWindow | undefined): boolean {
  if (
    !window ||
    window.practicalKind === "formation_signal" ||
    window.windowLevel === "blocked" ||
    window.recommendationLevel === "not_recommended" ||
    (window.weatherBlockers?.length ?? 0) > 0 ||
    (window.blockerReasons?.length ?? 0) > 0
  )
    return false;
  if (window.executableForDedicatedTrip !== undefined) return window.executableForDedicatedTrip;
  return (
    (window.windowLevel === "best" ||
      window.windowLevel === "shootable" ||
      window.recommendationLevel === "recommended") &&
    (window.practicalScore ?? window.score) >= 72
  );
}

export function prioritizeForecastRisks(
  risks: readonly ForecastRiskFlag[],
  window?: Pick<ForecastTimeWindow, "startTime" | "endTime">,
): readonly ForecastRiskFlag[] {
  const severity = { high: 3, medium: 2, low: 1 };
  const relevant = (risk: ForecastRiskFlag) =>
    !window ||
    !risk.startTime ||
    !risk.endTime ||
    (Date.parse(risk.startTime) < Date.parse(window.endTime) &&
      Date.parse(risk.endTime) > Date.parse(window.startTime));
  return [...risks].sort(
    (left, right) =>
      Number(right.key.startsWith("weather_alert:") && right.level === "high") -
        Number(left.key.startsWith("weather_alert:") && left.level === "high") ||
      Number(relevant(right)) - Number(relevant(left)) ||
      severity[right.level] - severity[left.level],
  );
}
