import type { DecisionCard } from "@photo-weather/shared";
import type { ScoreBreakdown, ScoreInput, ScoringEngine } from "./types.js";

export class MockScoringEngine implements ScoringEngine {
  async score(_input: ScoreInput): Promise<ScoreBreakdown> {
    return {
      total: 82,
      components: {
        cloudCover: 18,
        visibility: 19,
        wind: 12,
        precipitation: 16,
        airQuality: 8,
        astro: 9,
      },
      rationale: [
        "Mock scoring favors broken clouds.",
        "Visibility remains high in the sample forecast.",
      ],
    };
  }

  async buildDecisionCard(input: ScoreInput): Promise<DecisionCard> {
    const score = await this.score(input);

    return {
      grade: "good",
      score: score.total,
      title: "Good mock photography window",
      summary: `Sample conditions near ${input.place.name} are suitable for planning validation.`,
      reasons: score.rationale,
    };
  }
}
