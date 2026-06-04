import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  formatArrivalDeadlineZh,
  formatForecastWindowZh,
  type ForecastCalculationResult,
  type ProfessionalHourlyDataPoint,
} from "@photo-weather/shared";
import { cloudSeaRegressionFixture } from "./__tests__/fixtures/cloudSeaRegressionFixtures";
import { CloudSeaResultPage } from "./forecast-result-client";
import { buildCloudSeaForecastViewModel } from "./forecast-result-view-model";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const testGlobal = globalThis as typeof globalThis & { React: typeof React };
testGlobal.React = React;

describe("Cloud Sea display data rolling horizon", () => {
  it("renders Cloud Sea important windows with full date labels in cards, daily judgment, action plan, and AI payload", () => {
    const fixture = cloudSeaRegressionFixture("genericHighMountainGoodCloudSeaCase");
    const result = cloudSeaImportantWindowResult(fixture.result);
    const viewModel = buildCloudSeaForecastViewModel(result);
    const html = renderToStaticMarkup(
      React.createElement(CloudSeaResultPage, {
        query: fixture.query,
        result,
        viewModel,
      }),
    );
    const expectedWindow = formatForecastWindowZh(
      "2026-06-05T04:38:00+08:00",
      "2026-06-05T06:35:00+08:00",
      "Asia/Shanghai",
    );
    const expectedArrival = formatArrivalDeadlineZh("2026-06-05T03:08:00+08:00", "Asia/Shanghai");
    const expectedBackup = formatForecastWindowZh(
      "2026-06-05T08:10:00+08:00",
      "2026-06-05T09:20:00+08:00",
      "Asia/Shanghai",
    );
    const bestCard = viewModel.displayData.recommendationCards.find(
      (card) => card.key === "cloud-sea-best-window",
    );
    const arrivalCard = viewModel.displayData.recommendationCards.find(
      (card) => card.key === "cloud-sea-arrival",
    );
    const mainAction = viewModel.displayData.actionPlan.find((item) => item.key === "main-window");
    const arrivalAction = viewModel.displayData.actionPlan.find((item) => item.key === "arrival");
    const backupAction = viewModel.displayData.actionPlan.find((item) => item.key === "backup");

    expect(viewModel.displayData.importantWindows.bestWindow.displayLabelZh).toBe(expectedWindow);
    expect(viewModel.displayData.importantWindows.arrival.displayLabelZh).toBe(expectedArrival);
    expect(viewModel.displayData.importantWindows.mainWindow.displayLabelZh).toBe(expectedWindow);
    expect(viewModel.displayData.importantWindows.backupWindow.displayLabelZh).toBe(expectedBackup);
    expect(viewModel.displayData.header.bestWindowLabel).toBe(expectedWindow);
    expect(bestCard?.value).toBe(expectedWindow);
    expect(arrivalCard?.value).toBe(expectedArrival);
    expect(viewModel.displayData.cloudSeaWindowCards[0]?.displayLabelZh).toBe(expectedWindow);
    expect(viewModel.displayData.dailyJudgment[0]?.bestMorningWindow).toBe(expectedWindow);
    expect(mainAction?.value).toBe(expectedWindow);
    expect(arrivalAction?.value).toBe(expectedArrival);
    expect(backupAction?.value).toBe(expectedBackup);
    expect(viewModel.displayData.riskReview.find((item) => item.label === "影响时段")?.value).toBe(
      expectedWindow,
    );
    expect(
      viewModel.displayData.aiInterpretationPayload.actionPlan.find(
        (item) => item.key === "main-window",
      )?.value,
    ).toBe(expectedWindow);
    expect(
      viewModel.displayData.aiInterpretationPayload.precipitationSignalContext.mainTimeRangeZh,
    ).toBe(expectedWindow);
    expect(html).toContain(expectedWindow);
    expect(html).toContain(expectedArrival);
    expect(html).toContain(expectedBackup);
    expect(html).not.toMatch(/>\s*04:38-06:35\s*</);
  });

  it("aligns professional table, near-term cards, temperature context, and AI payload to the same rolling rows", () => {
    const fixture = cloudSeaRegressionFixture("genericHighMountainGoodCloudSeaCase");
    const baseRow = fixture.result.professionalHourlyData?.[0];
    if (!baseRow) {
      throw new Error("Cloud Sea regression fixture must include professional hourly rows.");
    }
    const rows = rollingRows(baseRow);
    const result = rollingResult(fixture.result, rows);
    const viewModel = buildCloudSeaForecastViewModel(result);
    const display = viewModel.displayData;
    const rowTimes = display.professionalHourlyData.rows.map((row) => row.time);
    const nearTermTimes = display.currentNearTermWeather.rows.map((row) => row.time);

    expect(rowTimes).toHaveLength(24);
    expect(rowTimes[0]).toBe("2026-06-02T11:00:00+08:00");
    expect(rowTimes.at(-1)).toBe("2026-06-03T10:00:00+08:00");
    expect(rowTimes).not.toContain("2026-06-02T10:00:00+08:00");
    expect(nearTermTimes).toEqual(rowTimes.slice(0, 6));
    expect(display.displayDataMeta).toMatchObject({
      horizon: "24h",
      anchorStart: "2026-06-02T11:00:00+08:00",
      anchorEnd: "2026-06-03T10:00:00+08:00",
      expectedRowCount: 24,
      actualRowCount: 24,
      firstRowTime: "2026-06-02T11:00:00+08:00",
      lastRowTime: "2026-06-03T10:00:00+08:00",
      isRollingFutureRange: true,
    });

    const precipitationCard = display.currentNearTermWeather.cards.find(
      (card) => card.key === "wind_precipitation",
    );
    expect(precipitationCard?.value).toContain("80%");
    expect(precipitationCard?.value).toContain("2.2 mm");
    expect(viewModel.displayTemperatureContext.displayTemperatureC).toBe(5);
    expect(
      display.currentNearTermWeather.cards.find((card) => card.key === "temperature")?.value,
    ).toContain("5");
    expect(display.aiInterpretationPayload.professionalHourlySummary).toMatchObject({
      rowCount: 24,
      nearTermRowCount: 6,
      anchorStart: "2026-06-02T11:00:00+08:00",
      anchorEnd: "2026-06-03T10:00:00+08:00",
      precipitationAmountMm: 2.2,
      precipitationProbabilityPercent: 80,
    });
  });

  it("keeps the professional table free of same-day filtering logic", () => {
    const source = readFileSync(
      resolve(repoRoot, "apps/web/app/forecast/forecast-result-client.tsx"),
      "utf8",
    );
    const panelSource = source.slice(
      source.indexOf("function CloudSeaProfessionalHourlyDataPanel"),
      source.indexOf("function CloudSeaMultiSourceAgreementCard"),
    );

    expect(panelSource).toContain("const rows = data.rows");
    expect(panelSource).not.toMatch(/row\.date|currentDate|isSameDay|23:00/);
    expect(panelSource).not.toMatch(/startsWith\(\s*`\$\{date\}T`/);
  });

  it("keeps future48 provider-short coverage as 39 of 48 display hours", () => {
    const fixture = cloudSeaRegressionFixture("genericHighMountainGoodCloudSeaCase");
    const baseRow = fixture.result.professionalHourlyData?.[0];
    if (!baseRow) {
      throw new Error("Cloud Sea regression fixture must include professional hourly rows.");
    }
    const rows = hourlyRowsFrom(baseRow, "2026-06-04T09:00:00+08:00", 39);
    const result = future48RollingResult(fixture.result, rows);
    const viewModel = buildCloudSeaForecastViewModel(result);
    const display = viewModel.displayData;

    expect(display.professionalHourlyData.rows).toHaveLength(39);
    expect(display.professionalHourlyData.rows[0]?.time).toBe("2026-06-04T09:00:00+08:00");
    expect(display.professionalHourlyData.rows.at(-1)?.time).toBe("2026-06-05T23:00:00+08:00");
    expect(display.professionalHourlyData.timeBasis).toMatchObject({
      anchorStartLocal: "2026-06-04T09:00:00+08:00",
      anchorEndLocal: "2026-06-06T08:00:00+08:00",
      expectedRowCount: 48,
      requestedHours: 48,
      recommendedRequestHours: 54,
      requiredForecastDays: 3,
      partialData: true,
    });
    expect(display.displayDataMeta).toMatchObject({
      horizon: "48h",
      anchorStart: "2026-06-04T09:00:00+08:00",
      anchorEnd: "2026-06-06T08:00:00+08:00",
      expectedRowCount: 48,
      actualRowCount: 39,
      firstRowTime: "2026-06-04T09:00:00+08:00",
      lastRowTime: "2026-06-05T23:00:00+08:00",
      sourceAlignmentStatus: "partial",
    });

    const html = renderToStaticMarkup(
      React.createElement(CloudSeaResultPage, {
        query: {
          ...fixture.query,
          horizon: "48h",
        },
        result,
        viewModel,
      }),
    );
    expect(html).toContain("覆盖率");
    expect(html).toContain("39 / 48 小时");
    expect(html).not.toContain("39 / 39 小时");
    expect(html).toContain("2026年6月4日 09:00");
    expect(html).toContain("2026年6月6日 08:00");
  });
});

function cloudSeaImportantWindowResult(
  result: ForecastCalculationResult,
): ForecastCalculationResult {
  const bestWindow = {
    ...result.cloudSeaAnalysis.bestCloudSeaWindow!,
    label: "generic Cloud Sea window 04:38 - 06:35",
    date: "2026-06-05",
    startTime: "2026-06-05T04:38:00+08:00",
    endTime: "2026-06-05T06:35:00+08:00",
  };
  const backupWindow = {
    ...bestWindow,
    label: "generic backup Cloud Sea window 08:10 - 09:20",
    startTime: "2026-06-05T08:10:00+08:00",
    endTime: "2026-06-05T09:20:00+08:00",
    score: 62,
    shootableScore: 62,
    formationScore: 70,
    phase: "waiting" as const,
  };
  const forecastWindow = {
    ...result.bestWindows[0]!,
    label: bestWindow.label,
    date: bestWindow.date,
    startTime: bestWindow.startTime,
    endTime: bestWindow.endTime,
    arrivalAdvice: {
      ...result.bestWindows[0]!.arrivalAdvice!,
      recommendedArrivalTime: "2026-06-05T03:08:00+08:00",
      recommendedArrivalLabel: "03:08 前到达",
    },
  };

  return {
    ...result,
    forecastStart: "2026-06-04T08:00:00+08:00",
    forecastEnd: "2026-06-06T08:00:00+08:00",
    targetDates: ["2026-06-05"],
    calendarBasis: {
      ...result.calendarBasis,
      forecastStart: "2026-06-04T08:00:00+08:00",
      forecastEnd: "2026-06-06T08:00:00+08:00",
      targetDates: ["2026-06-05"],
      timezone: "Asia/Shanghai",
    },
    cloudSeaAnalysis: {
      ...result.cloudSeaAnalysis,
      bestCloudSeaWindow: bestWindow,
      bestCloudSeaWindows: [bestWindow],
      watchableCloudSeaWindows: [backupWindow],
      dailyCloudSea: [
        {
          ...result.cloudSeaAnalysis.dailyCloudSea[0]!,
          date: "2026-06-05",
          dateLabelZh: "2026年6月5日 周五",
          bestWindow,
          watchableWindow: backupWindow,
        },
      ],
    },
    bestWindows: [forecastWindow],
  };
}

function rollingResult(
  result: ForecastCalculationResult,
  rows: readonly ProfessionalHourlyDataPoint[],
): ForecastCalculationResult {
  return {
    ...result,
    horizon: "24h",
    generatedAt: "2026-06-02T10:26:00+08:00",
    forecastStart: "2026-06-02T11:00:00+08:00",
    forecastEnd: "2026-06-03T11:00:00+08:00",
    targetDates: ["2026-06-02", "2026-06-03"],
    calendarBasis: {
      ...result.calendarBasis,
      forecastStart: "2026-06-02T11:00:00+08:00",
      forecastEnd: "2026-06-03T11:00:00+08:00",
      targetDates: ["2026-06-02", "2026-06-03"],
      horizonHours: 24,
      timezone: "Asia/Shanghai",
    },
    currentWeather: result.currentWeather
      ? {
          ...result.currentWeather,
          precipitation: 0,
          precipitationAmountMm: 0,
          rainAmountMm: 0,
          precipitationProbability: 0,
          precipitationProbabilityPercent: 0,
          temperature: 99,
          rawTemperature: 99,
          elevationAdjustedTemperature: 88,
        }
      : result.currentWeather,
    professionalHourlyData: rows,
    professionalHourlyDataTimeBasis: {
      ...(result.professionalHourlyDataTimeBasis ?? {
        stepMinutes: 60,
        timezone: "Asia/Shanghai",
        temperatureBasis: "terrain_adjusted" as const,
        temperatureBasisNoteZh: "synthetic terrain-adjusted temperature",
        cloudLayerBasis: "explicit_layers" as const,
        cloudLayerBasisNoteZh: "synthetic explicit cloud layers",
        partialData: false,
      }),
      startTime: rows[0]?.time ?? "2026-06-02T00:00:00+08:00",
      endTime: rows.at(-1)?.time ?? "2026-06-03T11:00:00+08:00",
      stepMinutes: 60,
      timezone: "Asia/Shanghai",
      generatedAtLocal: "2026-06-02T10:26:00+08:00",
      anchorStartLocal: "2026-06-02T11:00:00+08:00",
      anchorEndLocal: "2026-06-03T10:00:00+08:00",
      horizonHours: 24,
      expectedRowCount: 24,
      requestedHours: 24,
      rule: "rolling_future_hours",
      displayLabel: "未来24小时",
      displayRangeZh: "2026年6月2日 11:00 至 2026年6月3日 10:00",
      isFutureOnly: true,
      anchorRule: "future_hour_ceil_to_next_hour",
      partialData: false,
    },
  };
}

function rollingRows(baseRow: ProfessionalHourlyDataPoint): readonly ProfessionalHourlyDataPoint[] {
  return Array.from({ length: 36 }, (_, index) => {
    const time = formatOffsetHour("2026-06-02T00:00:00+08:00", index);
    const isAnchor = time === "2026-06-02T11:00:00+08:00";
    return {
      ...baseRow,
      time,
      dateLabel: time.slice(5, 10),
      timeLabel: time.slice(11, 16),
      rawTemperatureC: isAnchor ? 15 : 99,
      terrainAdjustedTemperatureC: isAnchor ? 5 : 88,
      displayedTemperatureC: isAnchor ? 5 : 88,
      dewPointC: isAnchor ? 3 : 60,
      dewPointSpreadC: isAnchor ? 2 : 28,
      relativeHumidityPercent: isAnchor ? 92 : 20,
      precipitationAmountMm: isAnchor ? 2.2 : 0,
      precipitationProbabilityPercent: isAnchor ? 80 : 0,
      cloudTotalPercent: isAnchor ? 86 : 20,
      cloudHighPercent: isAnchor ? 30 : 10,
      cloudMidPercent: isAnchor ? 45 : 10,
      cloudLowPercent: isAnchor ? 78 : 5,
      visibilityMeters: isAnchor ? 5000 : 20000,
      windSpeedMs: isAnchor ? 3.4 : 1.2,
    };
  });
}

function future48RollingResult(
  result: ForecastCalculationResult,
  rows: readonly ProfessionalHourlyDataPoint[],
): ForecastCalculationResult {
  return {
    ...result,
    horizon: "48h",
    generatedAt: "2026-06-04T08:22:00+08:00",
    forecastStart: "2026-06-04T08:22:00+08:00",
    forecastEnd: "2026-06-06T08:22:00+08:00",
    targetDates: ["2026-06-04", "2026-06-05", "2026-06-06"],
    calendarBasis: {
      ...result.calendarBasis,
      forecastStart: "2026-06-04T08:22:00+08:00",
      forecastEnd: "2026-06-06T08:22:00+08:00",
      targetDates: ["2026-06-04", "2026-06-05", "2026-06-06"],
      horizonHours: 48,
      timezone: "Asia/Shanghai",
    },
    professionalHourlyData: rows,
    professionalHourlyDataTimeBasis: {
      ...(result.professionalHourlyDataTimeBasis ?? {
        stepMinutes: 60,
        timezone: "Asia/Shanghai",
        temperatureBasis: "terrain_adjusted" as const,
        temperatureBasisNoteZh: "synthetic terrain-adjusted temperature",
        cloudLayerBasis: "explicit_layers" as const,
        cloudLayerBasisNoteZh: "synthetic explicit cloud layers",
        partialData: true,
      }),
      startTime: rows[0]?.time ?? "2026-06-04T09:00:00+08:00",
      endTime: rows.at(-1)?.time ?? "2026-06-05T23:00:00+08:00",
      stepMinutes: 60,
      timezone: "Asia/Shanghai",
      generatedAtLocal: "2026-06-04T08:22:00+08:00",
      anchorStartLocal: "2026-06-04T09:00:00+08:00",
      anchorEndLocal: "2026-06-06T08:00:00+08:00",
      horizonHours: 48,
      expectedRowCount: 48,
      requestedHours: 48,
      minRequestHours: 48,
      recommendedRequestHours: 54,
      requiredForecastDays: 3,
      requestStartLocal: "2026-06-04T00:00:00+08:00",
      requestEndLocal: "2026-06-06T23:00:00+08:00",
      providerCoverageVersion: "rolling-provider-coverage-v2",
      coverageRule: "forecast_hours_with_buffer",
      rule: "rolling_future_hours",
      displayLabel: "未来48小时",
      displayRangeZh: "2026年6月4日 09:00 至 2026年6月6日 08:00",
      isFutureOnly: true,
      anchorRule: "future_hour_ceil_to_next_hour",
      partialData: true,
    },
  };
}

function hourlyRowsFrom(
  baseRow: ProfessionalHourlyDataPoint,
  start: string,
  length: number,
): readonly ProfessionalHourlyDataPoint[] {
  return Array.from({ length }, (_, index) => {
    const time = formatOffsetHour(start, index);
    return {
      ...baseRow,
      time,
      dateLabel: time.slice(5, 10),
      timeLabel: time.slice(11, 16),
    };
  });
}

function formatOffsetHour(start: string, index: number): string {
  const offset = start.slice(-6);
  const offsetMinutes = offsetToMinutes(offset);
  const date = new Date(Date.parse(start) + index * 60 * 60 * 1000);
  const local = new Date(date.getTime() + offsetMinutes * 60 * 1000);
  return `${local.getUTCFullYear()}-${pad2(local.getUTCMonth() + 1)}-${pad2(
    local.getUTCDate(),
  )}T${pad2(local.getUTCHours())}:00:00${offset}`;
}

function offsetToMinutes(offset: string): number {
  const sign = offset.startsWith("-") ? -1 : 1;
  const [hours, minutes] = offset.slice(1).split(":").map(Number);
  return sign * ((hours ?? 0) * 60 + (minutes ?? 0));
}

function pad2(value: number): string {
  return value.toString().padStart(2, "0");
}
