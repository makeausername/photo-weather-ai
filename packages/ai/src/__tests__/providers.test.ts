import { decisionCardSchema } from "@photo-weather/shared";
import { describe, expect, it } from "vitest";
import { DeepSeekProvider, MockAIProvider, RuleOnlyProvider } from "../index";

const place = {
  id: "mock-place-huangshan",
  name: "Huangshan Scenic Area",
  countryCode: "CN",
  coordinates: {
    latitude: 30.129,
    longitude: 118.169,
    system: "wgs84" as const,
  },
};

describe("AI providers", () => {
  it("uses deterministic mock output", async () => {
    const provider = new MockAIProvider();
    const card = await provider.generateDecisionCard({
      place,
      forecastSummary: "Sample forecast",
      score: 82,
    });

    expect(card.grade).toBe("good");
    expect(card.summary).toContain("Sample forecast");
  });

  it("keeps rule-only fallback independent from network providers", async () => {
    const provider = new RuleOnlyProvider();
    const card = await provider.generateDecisionCard({
      place,
      forecastSummary: "Rules only",
      score: 64,
    });

    expect(card.grade).toBe("fair");
  });

  it("blocks DeepSeek real calls in local tests", async () => {
    const provider = new DeepSeekProvider();

    await expect(
      provider.generateDecisionCard({
        place,
        forecastSummary: "Should not call network",
      }),
    ).rejects.toThrow("not implemented for local tests");
  });

  it("validates JSON output through a supplied schema", () => {
    const provider = new MockAIProvider();
    const parsed = provider.validateJsonOutput(
      decisionCardSchema,
      JSON.stringify({
        grade: "good",
        score: 80,
        title: "Valid",
        summary: "Valid JSON",
        reasons: ["Schema matches"],
      }),
    );

    expect(parsed.score).toBe(80);
  });
});
