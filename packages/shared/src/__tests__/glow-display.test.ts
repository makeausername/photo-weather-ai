import { describe, expect, it } from "vitest";
import {
  classifyGlowWindowLifecycle,
  glowLocalDateKey,
  glowDisplayRecommendationForScore,
  glowDisplayRecommendationVocabulary,
  glowScoreToDisplayProbabilityPercent,
  glowVividnessLevelForIndex,
  glowVividnessLevelLabelZh,
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

  it("centralizes vividness thresholds and labels", () => {
    expect(glowVividnessLevelForIndex(12)).toBe("weak");
    expect(glowVividnessLevelForIndex(25)).toBe("slightly_weak");
    expect(glowVividnessLevelForIndex(45)).toBe("moderate");
    expect(glowVividnessLevelForIndex(65)).toBe("strong");
    expect(glowVividnessLevelForIndex(80)).toBe("very_strong");
    expect(glowVividnessLevelLabelZh("very_strong")).toBe("很鲜艳");
  });
});

describe("glow window lifecycle classification", () => {
  it("classifies past, active, future, and missing windows distinctly", () => {
    const evaluatedAt = "2026-06-09T10:00:00+08:00";

    expect(
      classifyGlowWindowLifecycle({
        startAt: "2026-06-09T05:17:00+08:00",
        endAt: "2026-06-09T06:32:00+08:00",
        evaluatedAt,
        timezone: "Asia/Shanghai",
      }),
    ).toMatchObject({
      state: "ended",
      isRecommendationEligible: false,
    });
    expect(
      classifyGlowWindowLifecycle({
        startAt: "2026-06-09T09:30:00+08:00",
        endAt: "2026-06-09T10:30:00+08:00",
        evaluatedAt,
        timezone: "Asia/Shanghai",
      }),
    ).toMatchObject({
      state: "active",
      isRecommendationEligible: true,
    });
    expect(
      classifyGlowWindowLifecycle({
        startAt: "2026-06-09T18:10:00+08:00",
        endAt: "2026-06-09T19:20:00+08:00",
        evaluatedAt,
        timezone: "Asia/Shanghai",
      }),
    ).toMatchObject({
      state: "upcoming",
      isRecommendationEligible: true,
    });
    expect(
      classifyGlowWindowLifecycle({
        startAt: undefined,
        endAt: undefined,
        evaluatedAt,
        timezone: "Asia/Shanghai",
      }),
    ).toMatchObject({
      state: "unavailable",
      isRecommendationEligible: false,
    });
  });

  it("keeps lifecycle independent from true future zero probability", () => {
    const lifecycle = classifyGlowWindowLifecycle({
      startAt: "2026-06-09T18:10:00+08:00",
      endAt: "2026-06-09T19:20:00+08:00",
      evaluatedAt: "2026-06-09T10:00:00+08:00",
      timezone: "Asia/Shanghai",
    });

    expect(lifecycle.state).toBe("upcoming");
    expect(glowScoreToDisplayProbabilityPercent(0)).toBe(0);
    expect(glowDisplayRecommendationForScore(0)).toBe("不建议专程前往");
  });

  it("marks future windows outside the selected forecast range without hiding ended windows", () => {
    expect(
      classifyGlowWindowLifecycle({
        startAt: "2026-06-10T18:10:00+08:00",
        endAt: "2026-06-10T19:20:00+08:00",
        evaluatedAt: "2026-06-09T10:00:00+08:00",
        timezone: "Asia/Shanghai",
        rangeStartAt: "2026-06-09T12:00:00+08:00",
        rangeEndAt: "2026-06-10T12:00:00+08:00",
      }),
    ).toMatchObject({
      state: "outside_horizon",
      isRecommendationEligible: false,
    });

    expect(
      classifyGlowWindowLifecycle({
        startAt: "2026-06-09T05:17:00+08:00",
        endAt: "2026-06-09T06:32:00+08:00",
        evaluatedAt: "2026-06-09T10:00:00+08:00",
        timezone: "Asia/Shanghai",
        rangeStartAt: "2026-06-09T12:00:00+08:00",
        rangeEndAt: "2026-06-10T12:00:00+08:00",
      }),
    ).toMatchObject({
      state: "ended",
      isRecommendationEligible: false,
    });
  });

  it("uses the selected IANA timezone for local date grouping", () => {
    expect(glowLocalDateKey("2026-06-10T03:30:00Z", "America/New_York")).toBe("2026-06-09");
    expect(glowLocalDateKey("2026-06-10T03:30:00Z", "Asia/Shanghai")).toBe("2026-06-10");
  });
});
