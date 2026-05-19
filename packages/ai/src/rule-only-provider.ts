import { decisionCardSchema } from "@photo-weather/shared";
import type { DecisionCard } from "@photo-weather/shared";
import type { z } from "zod";
import type {
  AIProvider,
  DecisionCardInput,
  ForecastAnalysis,
  ForecastAnalysisInput,
} from "./types.js";

export class RuleOnlyProvider implements AIProvider {
  async analyzeForecast(input: ForecastAnalysisInput): Promise<ForecastAnalysis> {
    return {
      provider: "rule-only",
      summary: `Rule-only analysis is available for ${input.place.name}.`,
      opportunities: ["Use deterministic provider data and configured scoring weights."],
      risks: ["No generative interpretation is used in this fallback path."],
      confidence: 0.55,
    };
  }

  async generateDecisionCard(input: DecisionCardInput): Promise<DecisionCard> {
    const score = input.score ?? 60;
    const grade = score >= 80 ? "good" : score >= 60 ? "fair" : "poor";

    return decisionCardSchema.parse({
      grade,
      score,
      title: "Rule-only decision card",
      summary: `${input.place.name}: ${input.forecastSummary}`,
      reasons: ["Generated from deterministic rules only."],
    });
  }

  validateJsonOutput<T>(schema: z.ZodSchema<T>, rawOutput: string): T {
    return schema.parse(JSON.parse(rawOutput));
  }
}
