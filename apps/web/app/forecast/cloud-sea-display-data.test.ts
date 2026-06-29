import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  formatArrivalDeadlineZh,
  formatForecastWindowZh,
  formatLocalTimeRange,
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
  it("surfaces score calibration caps in score card, window card, action plan,", () => {
    const fixture = cloudSeaRegressionFixture("genericHighMountainGoodCloudSeaCase");
    const capReason = "厚实多层云覆盖下开口稳定性不足，最终分数不按近满分处理。";
    const capPhrase = "厚实多层云覆盖下开口稳定性不足，最终分数不按近满分处理";
    const scoreCalibration: ForecastCalculationResult["cloudSeaAnalysis"]["scoreCalibration"] = {
      ...fixture.result.cloudSeaAnalysis.scoreCalibration,
      rawFormationScore: 92,
      rawShootabilityScore: 90,
      calibratedFormationScore: 84,
      calibratedShootabilityScore: 65,
      finalCloudSeaScore: 65,
      scoreBand: "fair",
      confidenceLevel: "medium",
      capApplied: true,
      capReasons: [capReason],
      negativeFactorsZh: [capReason],
      scoreExplanationZh: `形成 92 -> 84 分，可拍 90 -> 65 分，最终 65 分。限制因素：${capReason}`,
      recommendationExplanationZh: `云海形成条件较好，但${capReason.replace(
        /。$/,
        "",
      )}，因此谨慎参考。`,
      finalRecommendationLabel: "谨慎参考",
      shouldBlockStrongRecommendation: true,
      shouldDowngradeToCautious: true,
      shouldDowngradeToBackup: false,
    };
    const bestWindow = {
      ...fixture.result.cloudSeaAnalysis.bestCloudSeaWindow!,
      score: 65,
      formationScore: 84,
      shootableScore: 65,
      scoreCalibration,
    };
    const result: ForecastCalculationResult = {
      ...fixture.result,
      overallScore: 65,
      recommendationLevel: "cautious",
      cloudSeaAnalysis: {
        ...fixture.result.cloudSeaAnalysis,
        overallScore: 65,
        formationScore: 84,
        shootableScore: 65,
        travelScore: 65,
        recommendationLabel: "谨慎参考",
        scoreCalibration,
        bestCloudSeaWindow: bestWindow,
        bestCloudSeaWindows: [bestWindow],
        dailyCloudSea: fixture.result.cloudSeaAnalysis.dailyCloudSea.map((day) => ({
          ...day,
          formationScore: 84,
          shootableScore: 65,
          travelScore: 65,
          recommendationLabel: "谨慎参考",
          scoreCalibration,
          bestWindow,
        })),
      },
    };

    const viewModel = buildCloudSeaForecastViewModel(result);
    const display = viewModel.displayData;

    expect(display.scoreCard.score).toBe(65);
    expect(display.scoreCard.summary).toContain(capPhrase);
    expect(display.cloudSeaWindowCards[0]?.score).toBe(65);
    expect(display.cloudSeaWindowCards[0]?.labelReason).toContain(capReason);
    expect(display.cloudSeaWindowCards[0]?.cloudSeaChance).toContain("形成");
    expect(display.cloudSeaWindowCards[0]?.cloudSeaChance).toContain("可拍");
    expect(display.dailyJudgment[0]?.decisionReason).toContain(capPhrase);
    expect(display.actionPlan.find((item) => item.key === "departure")?.detail).toContain(
      "出发前必须复核云顶高度、降水和开口",
    );
  });

  it("renders Cloud Sea important windows with full date labels in cards, daily judgment, and action plan", () => {
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
    const expectedReferenceWindow = `参考窗口：${expectedWindow}`;
    const expectedArrivalReference = `如仍前往，${expectedArrival}`;
    const expectedBackup = formatForecastWindowZh(
      "2026-06-05T08:10:00+08:00",
      "2026-06-05T09:20:00+08:00",
      "Asia/Shanghai",
    );
    const expectedDailyWindow = formatLocalTimeRange(
      "2026-06-05T04:38:00+08:00",
      "2026-06-05T06:35:00+08:00",
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
    expect(viewModel.displayData.importantWindows.arrival.displayLabelZh).toBe(
      expectedArrivalReference,
    );
    expect(viewModel.displayData.importantWindows.mainWindow.displayLabelZh).toBe(expectedWindow);
    expect(viewModel.displayData.importantWindows.backupWindow.displayLabelZh).toBe(expectedBackup);
    expect(viewModel.displayData.header.bestWindowLabel).toBe(expectedReferenceWindow);
    expect(bestCard?.value).toBe(expectedReferenceWindow);
    expect(arrivalCard?.value).toBe(expectedArrivalReference);
    expect(viewModel.displayData.cloudSeaWindowCards[0]?.displayLabelZh).toBe(expectedWindow);
    expect(viewModel.displayData.dailyJudgment[0]?.bestMorningWindow).toBe(expectedDailyWindow);
    expect(mainAction?.value).toBe(expectedReferenceWindow);
    expect(arrivalAction?.value).toBe(expectedArrivalReference);
    expect(backupAction?.value).toBe(expectedBackup);
    expect(viewModel.displayData.riskReview.find((item) => item.label === "影响时段")?.value).toBe(
      expectedWindow,
    );
    expect(html).toContain(expectedWindow);
    expect(html).toContain(expectedArrivalReference);
    expect(html).toContain(expectedBackup);
    expect(html).not.toMatch(/>\s*04:38-06:35\s*</);
  });

  it("keeps no-go display data free of unconditional arrival recommendations", () => {
    const fixture = cloudSeaRegressionFixture("genericLowScoreContradictionCase");
    const viewModel = buildCloudSeaForecastViewModel(fixture.result);
    const display = viewModel.displayData;
    const arrivalCard = display.recommendationCards.find(
      (card) => card.key === "cloud-sea-arrival",
    );
    const arrivalAction = display.actionPlan.find((item) => item.key === "arrival");
    const html = renderToStaticMarkup(
      React.createElement(CloudSeaResultPage, {
        query: fixture.query,
        result: fixture.result,
        viewModel,
      }),
    );

    expect(viewModel.recommendationGuard.finalRecommendationLabel).toBe("不建议专程");
    expect(display.importantWindows.arrival).toEqual({
      displayLabelZh: "暂不安排行程",
      arrivalTime: null,
      hasArrivalTime: false,
    });
    expect(display.header.arrivalLabel).toBe("暂不安排行程");
    expect(arrivalCard).toMatchObject({
      label: "出发决策",
      value: "暂不安排行程",
    });
    expect(arrivalCard?.detail).toContain("等待下一次预报");
    expect(arrivalCard?.detail).toContain("降水");
    expect(arrivalCard?.detail).toContain("通行");
    expect(arrivalAction).toMatchObject({
      label: "行程建议",
      value: "等待下次预报",
    });
    expect(arrivalAction?.detail).toContain("没有推荐的专程出发行程");
    expect(arrivalAction?.detail).toContain("能见度");

    const arrivalSurfaceText = cloudSeaArrivalSurfaceText(display);
    expect(arrivalSurfaceText).not.toContain("建议到达");
    expect(arrivalSurfaceText).not.toContain("建议到达时间");
    expect(html).not.toContain("建议到达");
    expect(html).not.toContain("建议到达时间");
  });

  it("uses conditional arrival wording for cautious Cloud Sea display data", () => {
    const fixture = cloudSeaRegressionFixture("genericCloudBasisMismatchCase");
    const viewModel = buildCloudSeaForecastViewModel(fixture.result);
    const display = viewModel.displayData;
    const arrivalCard = display.recommendationCards.find(
      (card) => card.key === "cloud-sea-arrival",
    );
    const arrivalAction = display.actionPlan.find((item) => item.key === "arrival");

    expect(viewModel.travelDecision).toBe("cautious");
    expect(display.importantWindows.arrival.hasArrivalTime).toBe(true);
    expect(display.importantWindows.arrival.displayLabelZh).toMatch(/^如仍前往，建议到达：/);
    expect(display.header.arrivalLabel).toBe(display.importantWindows.arrival.displayLabelZh);
    expect(arrivalCard).toMatchObject({
      label: "到达参考",
      value: display.importantWindows.arrival.displayLabelZh,
    });
    expect(arrivalCard?.detail).toContain("出发前必须复核");
    expect(arrivalAction).toMatchObject({
      label: "到达参考",
      value: display.importantWindows.arrival.displayLabelZh,
    });
    expect(arrivalAction?.detail).toContain("不把该窗口当作确定行程");
  });

  it("keeps normal arrival guidance for recommended Cloud Sea display data", () => {
    const fixture = cloudSeaRegressionFixture("genericHighMountainGoodCloudSeaCase");
    const viewModel = buildCloudSeaForecastViewModel(fixture.result);
    const display = viewModel.displayData;
    const arrivalCard = display.recommendationCards.find(
      (card) => card.key === "cloud-sea-arrival",
    );
    const arrivalAction = display.actionPlan.find((item) => item.key === "arrival");

    expect(viewModel.travelDecision).toBe("go");
    expect(display.importantWindows.arrival.displayLabelZh).toContain("建议到达：");
    expect(display.header.arrivalLabel).toBe(display.importantWindows.arrival.displayLabelZh);
    expect(arrivalCard).toMatchObject({
      label: "建议到达",
      value: display.importantWindows.arrival.displayLabelZh,
    });
    expect(arrivalAction).toMatchObject({
      label: "建议到达时间",
      value: display.importantWindows.arrival.displayLabelZh,
    });
  });

  it("aligns professional table, near-term cards, temperature context, to the same rolling rows", () => {
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
  });

  it("keeps the professional table free of same-day filtering logic", () => {
    const source = readFileSync(
      resolve(repoRoot, "apps/web/app/forecast/forecast-result-client.tsx"),
      "utf8",
    );
    const panelSource = source.slice(
      source.indexOf("function CloudSeaProfessionalHourlyDataPanel"),
      source.indexOf("function CloudSeaProfessionalHourlyRow"),
    );
    const rowSource = source.slice(
      source.indexOf("function CloudSeaProfessionalHourlyRow"),
      source.indexOf("function CloudSeaHourlyFocusPreview"),
    );
    const cloudSeaPageSource = source.slice(
      source.indexOf("export function CloudSeaResultPage"),
      source.indexOf("export function GlowResultPage"),
    );
    const glowPageSource = source.slice(
      source.indexOf("export function GlowResultPage"),
      source.indexOf("export function AstroResultPage"),
    );
    const glowProfessionalDataSource = source.slice(
      source.indexOf("function GlowProfessionalDataSection"),
      source.indexOf("function CloudSeaTopResultHeader"),
    );

    expect(panelSource).toContain("const rows = data.rows");
    expect(panelSource).toContain("data-cloud-sea-professional-table-scroll");
    expect(panelSource).toContain('data-professional-hourly-table-layout="mobile-scroll-safe"');
    expect(panelSource).toContain("border-separate border-spacing-0");
    expect(panelSource).not.toContain("border-collapse");
    expect(panelSource).toContain("professionalHourlyDateHeaderClassName");
    expect(panelSource).toContain("min-[760px]:sticky min-[760px]:left-0");
    expect(panelSource).not.toContain("sticky left-0 z-20");
    expect(panelSource).not.toContain("ProfessionalHourlyCloudCard");
    expect(panelSource).not.toContain("professionalHourlyRowsByDate");
    expect(panelSource).not.toContain("data-professional-hourly-card-layout");
    expect(panelSource).not.toContain("data-glow-hourly-cloud-card");
    expect(panelSource).not.toMatch(/row\.date|currentDate|isSameDay|23:00/);
    expect(panelSource).not.toMatch(/startsWith\(\s*`\$\{date\}T`/);
    expect(rowSource).toContain("professionalHourlyDateCellClassName(rowBackgroundClassName)");
    expect(rowSource).toContain("professionalHourlyTimeCellClassName()");
    expect(rowSource).not.toContain("bg-inherit");
    expect(rowSource).not.toContain("sticky left-0");
    expect(cloudSeaPageSource).toContain("<CloudSeaProfessionalHourlyDataPanel");
    expect(cloudSeaPageSource).not.toContain("CloudSeaMultiSourceAgreement");
    expect(glowPageSource).toContain("<GlowProfessionalDataSection");
    expect(glowProfessionalDataSource).toContain("<CloudSeaProfessionalHourlyDataPanel");
    expect(glowProfessionalDataSource).toContain('target="glow"');
    expect(glowProfessionalDataSource).toContain('variant="embedded"');
    expect(glowProfessionalDataSource).not.toContain("<ProfessionalHourlyCloudSection");
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

function cloudSeaArrivalSurfaceText(
  display: ReturnType<typeof buildCloudSeaForecastViewModel>["displayData"],
): string {
  return [
    display.header.arrivalLabel,
    display.importantWindows.arrival.displayLabelZh,
    ...display.recommendationCards.flatMap((card) => [card.label, card.value, card.detail]),
    ...display.actionPlan.flatMap((item) => [item.label, item.value, item.detail]),
  ].join(" ");
}

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
          dateLabelZh: "2026年6月5日 星期五",
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
      displayRangeZh: "2026年6月2日 11:00–2026年6月3日 10:00",
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
      displayRangeZh: "2026年6月4日 09:00–2026年6月6日 08:00",
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
