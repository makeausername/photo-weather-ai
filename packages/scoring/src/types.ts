import type { DecisionCard, Place } from "@photo-weather/shared";
import type { CurrentWeather, HourlyForecast } from "@photo-weather/weather";

export type ScoringWeights = {
  readonly cloudCover: number;
  readonly visibility: number;
  readonly wind: number;
  readonly precipitation: number;
  readonly airQuality: number;
  readonly astro: number;
};

export type ScoreInput = {
  readonly place: Place;
  readonly currentWeather: CurrentWeather;
  readonly hourlyForecast?: HourlyForecast;
  readonly weights: ScoringWeights;
};

export type ScoreBreakdown = {
  readonly total: number;
  readonly components: Readonly<Record<keyof ScoringWeights, number>>;
  readonly rationale: readonly string[];
};

export type ScoringEngine = {
  score(input: ScoreInput): Promise<ScoreBreakdown>;
  buildDecisionCard(input: ScoreInput): Promise<DecisionCard>;
};

export const defaultScoringWeights: ScoringWeights = {
  cloudCover: 0.22,
  visibility: 0.2,
  wind: 0.14,
  precipitation: 0.18,
  airQuality: 0.12,
  astro: 0.14,
};
