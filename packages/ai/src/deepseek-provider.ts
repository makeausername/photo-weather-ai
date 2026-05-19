import type { z } from "zod";
import { MockAIProvider } from "./mock-provider.js";
import type { AIProvider, DecisionCardInput, ForecastAnalysisInput } from "./types.js";

const LOCAL_TEST_ERROR =
  "DeepSeekProvider real API calls are not implemented for local tests. Use MockAIProvider or RuleOnlyProvider until provider testing is enabled on staging or production.";

export type DeepSeekProviderOptions = {
  readonly apiKey?: string;
  readonly baseUrl?: string;
  readonly mode?: "disabled" | "mock";
};

export class DeepSeekProvider implements AIProvider {
  private readonly delegate: MockAIProvider;
  private readonly mode: "disabled" | "mock";
  readonly apiKey?: string;
  readonly baseUrl: string;

  constructor(options: DeepSeekProviderOptions = {}) {
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl ?? "https://api.deepseek.com";
    this.mode = options.mode ?? "disabled";
    this.delegate = new MockAIProvider();
  }

  async analyzeForecast(input: ForecastAnalysisInput) {
    if (this.mode === "mock") {
      return this.delegate.analyzeForecast(input);
    }

    throw new Error(LOCAL_TEST_ERROR);
  }

  async generateDecisionCard(input: DecisionCardInput) {
    if (this.mode === "mock") {
      return this.delegate.generateDecisionCard(input);
    }

    throw new Error(LOCAL_TEST_ERROR);
  }

  validateJsonOutput<T>(schema: z.ZodSchema<T>, rawOutput: string): T {
    return this.delegate.validateJsonOutput(schema, rawOutput);
  }
}
