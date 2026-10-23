import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ForecastCalculationResult } from "@photo-weather/shared";
import { CloudDetail } from "../components/free-weather-workbench";

Object.assign(globalThis, { React });

const result = {
  isMock: false,
  weatherDataMode: "real",
  weatherEvidenceStatus: "sufficient",
  calendarBasis: { timezone: "Asia/Shanghai" },
  place: { name: "测试地点" },
  cloudSeaAnalysis: {
    dailyCloudSea: [
      {
        date: "2026-10-23",
        shootableScore: 30,
        keyReason: "云海形成原因",
        riskNote: "云海风险说明",
        recommendationLabel: "不建议专程",
        whiteoutRiskScore: 24,
        bestWindow: {},
      },
    ],
    missingDataNotes: ["云海缺测说明"],
  },
  glowAnalysis: {
    dailyGlow: [
      {
        date: "2026-10-23",
        keyReason: "霞光原因",
        riskNote: "霞光风险说明",
        recommendationLabel: "谨慎参考",
      },
    ],
    canonicalWindows: [
      {
        date: "2026-10-23",
        phase: "sunset",
        practicalSuitabilityScore: 82,
        recommendationLabel: "值得专程",
        bestStartAt: "2026-10-23T17:20:00+08:00",
        bestEndAt: "2026-10-23T17:50:00+08:00",
      },
    ],
    missingDataNotes: ["霞光缺测说明"],
  },
} as unknown as ForecastCalculationResult;

describe("map condition detail", () => {
  it("uses the sunset recommendation and omits cloud-sea risks in the sunset layer", () => {
    const html = renderToStaticMarkup(
      <CloudDetail result={result} date="2026-10-23" layer="sunset" />,
    );
    expect(html).toContain("值得专程");
    expect(html).toContain("17:20–17:50");
    expect(html).toContain("霞光风险说明");
    expect(html).toContain("霞光缺测说明");
    expect(html).not.toContain("白墙风险");
    expect(html).not.toContain("云海缺测说明");
    expect(html).not.toContain("谨慎参考");
  });
  it("preserves cloud-sea risks and missing evidence in the cloud layer", () => {
    const html = renderToStaticMarkup(
      <CloudDetail result={result} date="2026-10-23" layer="cloud" />,
    );
    expect(html).toContain("白墙风险");
    expect(html).toContain("云海风险说明");
    expect(html).toContain("云海缺测说明");
    expect(html).not.toContain("霞光缺测说明");
  });
});
