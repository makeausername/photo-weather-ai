import { describe, expect, it } from "vitest";
import {
  applyForecastDecisionToWindows,
  isExecutableForecastWindow,
} from "../forecast-display-policy.js";
import type { ForecastDecisionMode, ForecastTimeWindow } from "../types.js";

const window: ForecastTimeWindow = {
  target: "astro",
  label: "星空",
  score: 90,
  practicalScore: 90,
  startTime: "2026-10-05T19:00:00+08:00",
  endTime: "2026-10-06T04:00:00+08:00",
  windowLevel: "best",
  executableForDedicatedTrip: true,
  recommendationLevel: "recommended",
  arrivalAdvice: {
    recommendedArrivalTime: "2026-10-05T18:00:00+08:00",
    recommendedArrivalLabel: "提前到达",
    setupBufferMinutes: 60,
    reasonZh: "布置器材",
  },
};
describe("window actions follow the converged decision", () => {
  it.each([
    "wait_for_update",
    "data_insufficient",
    "nearby_watch",
    "not_recommended",
  ] as ForecastDecisionMode[])(
    "retains a candidate's time and score without dedicated-trip actions in %s mode",
    (decisionMode) => {
      const [candidate] = applyForecastDecisionToWindows([window], {
        target: "general",
        decisionMode,
        finalDecisionSummaryZh: "先复核",
      });
      expect(candidate).toMatchObject({
        score: 90,
        startTime: window.startTime,
        windowLevel: "watchable",
        copyReasonZh: "先复核",
      });
      expect(candidate?.arrivalAdvice).toBeUndefined();
      expect(isExecutableForecastWindow(candidate)).toBe(false);
    },
  );
  it("preserves supported trips and independently queried subjects", () => {
    expect(
      applyForecastDecisionToWindows([window], { target: "general", decisionMode: "strong_go" }),
    ).toEqual([window]);
    expect(
      applyForecastDecisionToWindows([window], {
        target: "astro",
        decisionMode: "wait_for_update",
      }),
    ).toEqual([window]);
  });
  it("does not promote an explicitly executable but blocked window", () => {
    expect(isExecutableForecastWindow({ ...window, weatherBlockers: ["强降水"] })).toBe(false);
  });
});
