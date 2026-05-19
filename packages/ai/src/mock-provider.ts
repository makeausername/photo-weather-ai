import { decisionCardSchema } from "@photo-weather/shared";
import type { DecisionCard } from "@photo-weather/shared";
import type { z } from "zod";
import type {
  AIProvider,
  DecisionCardInput,
  ForecastAnalysis,
  ForecastAnalysisInput,
} from "./types.js";

export class MockAIProvider implements AIProvider {
  async analyzeForecast(input: ForecastAnalysisInput): Promise<ForecastAnalysis> {
    return {
      provider: "mock-ai",
      summary: `Mock analysis for ${input.place.name}: broken clouds and clear visibility support a planning-grade shoot window.`,
      opportunities: [
        "Golden-hour color separation",
        "High visibility for layered mountain scenes",
      ],
      risks: ["Mock forecast data is not suitable for real operations"],
      confidence: 0.72,
    };
  }

  async generateDecisionCard(input: DecisionCardInput): Promise<DecisionCard> {
    return decisionCardSchema.parse({
      grade: "good",
      score: input.score ?? 82,
      title: "Good mock photography window",
      summary: `${input.place.name}: ${input.forecastSummary}`,
      reasons: ["Mock cloud cover is within the preferred range.", "Mock visibility remains high."],
    });
  }

  validateJsonOutput<T>(schema: z.ZodSchema<T>, rawOutput: string): T {
    return schema.parse(JSON.parse(rawOutput));
  }
}
