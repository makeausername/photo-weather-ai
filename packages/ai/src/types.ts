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
  readonly metadata?: {
    readonly source: "deepseek" | "deterministic_fallback";
    readonly noteZh?: string;
    readonly parseStrategy?: ForecastAiExplanationParseStrategy;
    readonly fallbackUsed?: boolean;
    readonly rawResponseSizeChars?: number;
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
