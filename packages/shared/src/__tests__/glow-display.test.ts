import { describe, expect, it } from "vitest";
import {
  glowDisplayRecommendationForScore,
  glowDisplayRecommendationVocabulary,
  glowScoreToDisplayProbabilityPercent,
} from "../glow-display.js";

describe("glow display probability mapping", () => {
  it("keeps probability values bounded and monotonic", () => {
    let previous = -1;

    for (let score = -10; score <= 110; score += 1) {
      const probability = glowScoreToDisplayProbabilityPercent(score);
      expect(probability).toBeGreaterThanOrEqual(0);
      expect(probability).toBeLessThanOrEqual(100);

      if (score >= 0 && score <= 100) {
        expect(probability).toBeGreaterThanOrEqual(previous);
        previous = probability;
      }
    }
  });

  it("does not simply relabel deterministic score values as percent", () => {
    expect(glowScoreToDisplayProbabilityPercent(65)).toBe(62);
    expect(glowScoreToDisplayProbabilityPercent(80)).toBe(78);
    expect(glowScoreToDisplayProbabilityPercent(100)).toBe(94);
  });

  it("centralizes the public recommendation vocabulary", () => {
    expect(glowDisplayRecommendationVocabulary).toEqual([
      "推荐前往",
      "可以关注",
      "仅作备选",
      "不建议专程前往",
    ]);
    expect(glowDisplayRecommendationForScore(85)).toBe("推荐前往");
    expect(glowDisplayRecommendationForScore(70)).toBe("可以关注");
    expect(glowDisplayRecommendationForScore(55)).toBe("仅作备选");
    expect(glowDisplayRecommendationForScore(35)).toBe("不建议专程前往");
  });
});
