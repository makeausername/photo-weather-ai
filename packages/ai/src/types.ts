import type { DecisionCard, Place } from "@photo-weather/shared";
import type { ForecastCalculationResult } from "@photo-weather/shared";
import type { CurrentWeather, DailyForecast, HourlyForecast } from "@photo-weather/weather";
import type { z } from "zod";

export type ForecastAnalysisInput = {
  readonly place: Place;
  readonly currentWeather?: CurrentWeather;
  readonly hourlyForecast?: HourlyForecast;
  readonly dailyForecast?: DailyForecast;
  readonly userGoal?: string;
};

export type ForecastAnalysis = {
  readonly provider: string;
  readonly summary: string;
  readonly opportunities: readonly string[];
  readonly risks: readonly string[];
  readonly confidence: number;
};

export type DecisionCardInput = {
  readonly place: Place;
  readonly forecastSummary: string;
  readonly score?: number;
};

export type ForecastAiExplanationParseStrategy =
  | "strict_json"
  | "fenced_json"
  | "extracted_json"
  | "plain_text_fallback"
  | "failed";

export type ForecastAiExplanationDisplaySection = {
  readonly title: string;
  readonly text: string;
};

export type ForecastAiExplanationDisplayContent = {
  readonly hasContent: boolean;
  readonly title?: string;
  readonly summaryText?: string;
  readonly conclusion?: string;
  readonly reasons: readonly string[];
  readonly suggestions: readonly string[];
  readonly risks: readonly string[];
  readonly sections: readonly ForecastAiExplanationDisplaySection[];
};

export type ForecastAiExplanationSectionKey =
  | "overview"
  | "timeline"
  | "subject_advice"
  | "risk_gear"
  | "final_decision";

export type ForecastAiExplanationSectionStatus = "success" | "fallback" | "failed" | "skipped";

export type ForecastAiExplanationSectionResult = {
  readonly key: ForecastAiExplanationSectionKey;
  readonly titleZh: string;
  readonly status: ForecastAiExplanationSectionStatus;
  readonly textZh: string;
  readonly bulletPointsZh: readonly string[];
  readonly errorCategory?: string;
  readonly promptSizeChars?: number;
  readonly promptMaxChars?: number;
  readonly compactingApplied?: boolean;
  readonly responseSizeChars?: number;
  readonly parseStrategy?: ForecastAiExplanationParseStrategy;
  readonly model?: string;
  readonly latencyMs?: number;
};

export type ForecastAiExplanationSectionedResult = {
  readonly version: "forecast-ai-sectioned-v1" | "forecast-ai-sectioned-one-shot-v2";
  readonly providerCode: "openai";
  readonly model?: string;
  readonly sections: readonly ForecastAiExplanationSectionResult[];
  readonly success: boolean;
  readonly displaySuccess: boolean;
  readonly promptMaxChars?: number;
  readonly promptSizeChars?: number;
  readonly responseSizeChars?: number;
};

export type ForecastAiExplanation = {
  readonly conclusion: {
    readonly titleZh: string;
    readonly summaryZh: string;
    readonly recommendedDayZh: string;
    readonly recommendationLevelZh: string;
    readonly whetherWorthDedicatedTripZh: string;
    readonly oneSentenceDecisionZh: string;
  };
  readonly bestPlan: {
    readonly primaryTargetZh: string;
    readonly bestDateZh: string;
    readonly bestWindowZh: string;
    readonly recommendedArrivalZh: string;
    readonly whyThisWindowZh: string;
    readonly backupPlanZh: string;
  };
  readonly weatherTrend: {
    readonly trendSummaryZh: string;
    readonly temperatureSummaryZh: string;
    readonly rainSummaryZh: string;
    readonly windSummaryZh: string;
    readonly transparencySummaryZh: string;
  };
  readonly dayByDay: readonly {
    readonly dateZh: string;
    readonly recommendationZh: string;
    readonly scoreZh: string;
    readonly temperatureZh: string;
    readonly rainZh: string;
    readonly cloudSeaZh: string;
    readonly glowZh: string;
    readonly sunsetGlowZh: string;
    readonly astroZh: string;
    readonly transparencyZh: string;
    readonly bestWindowZh: string;
    readonly actionZh: string;
  }[];
  readonly subjectAdvice: {
    readonly cloudSeaZh: string;
    readonly sunriseGlowZh: string;
    readonly sunsetGlowZh: string;
    readonly astroMilkyWayZh: string;
    readonly transparencyZh: string;
  };
  readonly riskAndGear: {
    readonly keyRisks: readonly string[];
    readonly clothingZh: string;
    readonly gearZh: string;
    readonly safetyZh: string;
  };
  readonly finalAdvice: {
    readonly goNoGoZh: string;
    readonly ifAlreadyNearbyZh: string;
    readonly ifDedicatedTripZh: string;
    readonly nextCheckZh: string;
  };
  readonly summaryText?: string;
  readonly reasons?: readonly string[];
  readonly suggestions?: readonly string[];
  readonly risks?: readonly string[];
  readonly displayContent?: ForecastAiExplanationDisplayContent;
  readonly sections?: readonly ForecastAiExplanationSectionResult[];
  readonly sectionedExplanation?: ForecastAiExplanationSectionedResult;
  readonly displayOnly?: boolean;
  readonly metadata?: {
    readonly source: "deepseek" | "openai" | "deterministic_fallback";
    readonly noteZh?: string;
    readonly parseStrategy?: ForecastAiExplanationParseStrategy;
    readonly fallbackUsed?: boolean;
    readonly rawResponseSizeChars?: number;
    readonly finishReason?: string;
  };
};

export type ForecastExplanationInput = {
  readonly forecastResult: ForecastCalculationResult;
  readonly userGoal?: string;
};

export interface AIProvider {
  analyzeForecast(input: ForecastAnalysisInput): Promise<ForecastAnalysis>;
  generateDecisionCard(input: DecisionCardInput): Promise<DecisionCard>;
  validateJsonOutput<T>(schema: z.ZodSchema<T>, rawOutput: string): T;
}
