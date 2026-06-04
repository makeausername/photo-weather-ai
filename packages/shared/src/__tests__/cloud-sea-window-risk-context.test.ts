import { describe, expect, it } from "vitest";
import { buildCloudLayerCompletenessContext } from "../cloud-layer-completeness.js";
import { buildCloudSeaCloudBasisConsistencyContext } from "../cloud-sea-cloud-basis-consistency.js";
import { buildCloudSeaPrecipitationSignalContext } from "../cloud-sea-precipitation-signal.js";
import {
  buildCloudSeaWindowCenteredRiskContext,
  type CloudSeaWindowRiskHourlyRow,
} from "../cloud-sea-window-risk-context.js";

const mainWindow = {
  startTime: "2026-06-05T05:00:00+08:00",
  endTime: "2026-06-05T07:00:00+08:00",
  label: "generic cloud sea window",
};

function row(overrides: Partial<CloudSeaWindowRiskHourlyRow> = {}): CloudSeaWindowRiskHourlyRow {
  return {
    time: "2026-06-05T05:00:00+08:00",
    cloudTotalPercent: 72,
    cloudHighPercent: 35,
    cloudMidPercent: 42,
    cloudLowPercent: 58,
    visibilityMeters: 12000,
    relativeHumidityPercent: 88,
    dewPointSpreadC: 4,
    precipitationAmountMm: 0,
    precipitationProbabilityPercent: 10,
    displayedTemperatureC: 12,
    bodyFeelTemperatureC: 9,
    temperatureBasis: "terrain_adjusted",
    cloudLayerBasis: "explicit_layers",
    ...overrides,
  };
}

function buildContext(rows: readonly CloudSeaWindowRiskHourlyRow[]) {
  const cloudLayerCoverageContext = buildCloudLayerCompletenessContext(rows);
  return buildCloudSeaWindowCenteredRiskContext({
    normalizedHourlyRows: rows,
    bestWindow: mainWindow,
    mainWindow,
    forecastWindowRange: {
      startTime: "2026-06-05T00:00:00+08:00",
      endTime: "2026-06-05T12:00:00+08:00",
    },
    precipitationSignalContext: buildCloudSeaPrecipitationSignalContext({
      hourlyRows: rows,
      focusedWindow: mainWindow,
      bestWindow: mainWindow,
    }),
    cloudLayerCoverageContext,
    cloudBasisConsistencyContext: buildCloudSeaCloudBasisConsistencyContext({
      hourlyRows: rows,
      cloudLayerCompletenessContext: cloudLayerCoverageContext,
      focusedWindow: mainWindow,
    }),
    displayTemperatureContext: {
      displayTemperatureC: 12,
      bodyFeelTemperatureC: 9,
      terrainAdjustedTemperatureC: 12,
      rawTemperatureC: 20,
      basis: "terrain_adjusted",
    },
    terrainContext: {
      terrainMode: "high_mountain",
      terrainType: "summit",
      elevationMeters: 1800,
      surroundingReliefMeters: 1000,
      confidence: "high",
    },
    whiteoutRiskContext: {
      whiteoutRiskScore: 35,
    },
    timezone: "Asia/Shanghai",
  });
}

describe("buildCloudSeaWindowCenteredRiskContext", () => {
  it("genericPreWindowRainGoodOpeningCase classifies rain before the window without excessive downgrade", () => {
    const context = buildContext([
      row({ time: "2026-06-05T03:00:00+08:00", precipitationAmountMm: 0.2, precipitationProbabilityPercent: 25 }),
      row({ time: "2026-06-05T05:00:00+08:00", precipitationAmountMm: 0, precipitationProbabilityPercent: 15 }),
      row({ time: "2026-06-05T06:00:00+08:00", precipitationAmountMm: 0, precipitationProbabilityPercent: 10 }),
    ]);

    expect(context.preWindowRainImpact.timing).toBe("pre_window");
    expect(context.preWindowRainImpact.impactLevel).toBe("trace");
    expect(context.duringWindowRainImpact.impactLevel).toBe("none");
    expect(context.windowOpeningConfidence).toBe("high");
    expect(context.precipitationWindowSummaryZh).toContain("窗口前");
    expect(context.scoreCapReasons.join("")).not.toContain("主窗口受可计量降水");
  });

  it("genericRainDuringWindowCase caps and warns when meaningful rain overlaps the window", () => {
    const context = buildContext([
      row({ time: "2026-06-05T05:00:00+08:00", precipitationAmountMm: 0.8, precipitationProbabilityPercent: 75 }),
      row({ time: "2026-06-05T06:00:00+08:00", precipitationAmountMm: 0.6, precipitationProbabilityPercent: 70 }),
      row({ time: "2026-06-05T08:00:00+08:00", precipitationAmountMm: 0, precipitationProbabilityPercent: 15 }),
    ]);

    expect(context.duringWindowRainImpact.timing).toBe("during_window");
    expect(context.duringWindowRainImpact.impactLevel).toBe("medium");
    expect(context.duringWindowRainImpact.shouldCapScore).toBe(true);
    expect(context.scoreCapReasons.join("")).toContain("主窗口受可计量降水");
    expect(context.actionAdviceZh).toContain("主窗口受降水影响");
  });

  it("genericPostWindowRainCase keeps post-window rain from over-downgrading the main window", () => {
    const context = buildContext([
      row({ time: "2026-06-05T05:00:00+08:00", precipitationAmountMm: 0, precipitationProbabilityPercent: 10 }),
      row({ time: "2026-06-05T06:00:00+08:00", precipitationAmountMm: 0, precipitationProbabilityPercent: 10 }),
      row({ time: "2026-06-05T08:00:00+08:00", precipitationAmountMm: 1.8, precipitationProbabilityPercent: 78 }),
    ]);

    expect(context.postWindowRainImpact.timing).toBe("post_window");
    expect(context.duringWindowRainImpact.impactLevel).toBe("none");
    expect(context.postWindowRainImpact.shouldCapScore).toBe(false);
    expect(context.precipitationWindowSummaryZh).toContain("窗口后");
  });

  it("genericThickCloudMediumOpeningCase separates formation support from capped shootability", () => {
    const context = buildContext([
      row({ time: "2026-06-05T05:00:00+08:00", cloudTotalPercent: 96, cloudHighPercent: 88, cloudMidPercent: 84, cloudLowPercent: 78 }),
      row({ time: "2026-06-05T06:00:00+08:00", cloudTotalPercent: 95, cloudHighPercent: 86, cloudMidPercent: 82, cloudLowPercent: 76 }),
    ]);

    expect(context.windowOpeningConfidence).toBe("medium");
    expect(context.openingConfidenceReasonZh).toContain("开口稳定性中等");
    expect(context.scoreCapReasons.join("")).toContain("开口稳定性中等");
  });

  it("genericLowCloudWhiteoutReviewCase does not show simply low whiteout under low cloud, humidity, and reduced visibility", () => {
    const context = buildContext([
      row({
        time: "2026-06-05T05:00:00+08:00",
        cloudLowPercent: 82,
        relativeHumidityPercent: 96,
        dewPointSpreadC: 1,
        visibilityMeters: 2400,
      }),
      row({
        time: "2026-06-05T06:00:00+08:00",
        cloudLowPercent: 84,
        relativeHumidityPercent: 95,
        dewPointSpreadC: 1.2,
        visibilityMeters: 2600,
      }),
    ]);

    expect(["medium", "high"]).toContain(context.whiteoutReviewLevel);
    expect(context.whiteoutReviewLabelZh).not.toBe("白墙风险低");
    expect(context.cloudTopReviewNeed).toBe(true);
    expect(context.whiteoutWindowSummaryZh).toContain("白墙");
  });

  it("genericHighMountainTemperatureDisplayCase uses adjusted display temperature basis", () => {
    const context = buildCloudSeaWindowCenteredRiskContext({
      normalizedHourlyRows: [
        row({
          rawTemperatureC: 24,
          terrainAdjustedTemperatureC: 6,
          displayedTemperatureC: 6,
          bodyFeelTemperatureC: 2,
          temperatureBasis: "terrain_adjusted",
        }),
      ],
      bestWindow: mainWindow,
      mainWindow,
      displayTemperatureContext: {
        rawTemperatureC: 24,
        terrainAdjustedTemperatureC: 6,
        displayTemperatureC: 6,
        bodyFeelTemperatureC: 2,
        basis: "terrain_adjusted",
      },
      terrainContext: {
        terrainMode: "high_mountain",
        terrainType: "summit",
        elevationMeters: 1900,
        surroundingReliefMeters: 1200,
        confidence: "high",
      },
    });

    expect(context.displayTemperatureBasis).toBe("terrain_adjusted");
    expect(context.temperaturePreparationLevel).toBe("cold");
    expect(context.equipmentAdviceZh).toContain("机位显示温度");
  });
});
