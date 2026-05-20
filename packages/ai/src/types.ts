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

export type ForecastAiExplanation = {
  readonly summary: string;
  readonly recommendation: string;
  readonly mainReasons: readonly string[];
  readonly mainRisks: readonly string[];
  readonly photographerAdvice: readonly string[];
  readonly backupPlan: readonly string[];
  readonly confidenceNote: string;
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
