import {} from "node:path";
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
const testGlobal = globalThis as typeof globalThis & { React: typeof React };
testGlobal.React = React;

describe("Cloud Sea display data rolling horizon", () => {
  it.each([false, true])("adapts cached daily calibration wording, fallback=%s", (fallback) => {
    for (const name of [
      "genericLowElevationWeakCloudSeaCase",
      "genericHighMountainGoodCloudSeaCase",
    ] as const) {
      const fixture = cloudSeaRegressionFixture(name);
      const text = "云海形成或可拍证据不足，不建议专程。";
      const calibration = {
        ...fixture.result.cloudSeaAnalysis.scoreCalibration,
        capApplied: true,
        capReasons: [text],
        recommendationExplanationZh: text,
      };
      const result: ForecastCalculationResult = {
        ...fixture.result,
        cloudSeaAnalysis: {
          ...fixture.result.cloudSeaAnalysis,
          scoreCalibration: calibration,
          dailyCloudSea: fallback
            ? []
            : fixture.result.cloudSeaAnalysis.dailyCloudSea.map((day) => ({
                ...day,
                scoreCalibration: calibration,
              })),
        },
      };
      const model = buildCloudSeaForecastViewModel(result);
      expect(model.dailyTrend.length).toBeGreaterThan(0);
      for (const day of model.dailyTrend) {
        if (name === "genericHighMountainGoodCloudSeaCase") {
          expect(day.decisionReason).toBe(text);
        } else {
          expect(day.decisionReason).toContain("低云/晨雾");
          expect(
            [
              day.decisionReason,
              day.keyReason,
              day.actionSuggestion,
              day.layerCompletenessNote,
            ].join(" "),
          ).not.toMatch(/云海|白墙/);
        }
      }
    }
  });
  it.each(["consistent", "mixed", "partial", "total-only", "missing"])(
    "keeps cloud data-quality notes terrain-neutral for %s evidence",
    (kind) => {
      for (const name of [
        "genericLowElevationWeakCloudSeaCase",
        "genericHighMountainGoodCloudSeaCase",
      ] as const) {
        const fixture = cloudSeaRegressionFixture(name);
        const result: ForecastCalculationResult = {
          ...fixture.result,
          professionalHourlyData: fixture.result.professionalHourlyData!.map((row, index) => ({
            ...row,
            cloudTotalPercent: kind === "missing" ? null : kind === "mixed" ? 10 : 90,
            cloudHighPercent: ["total-only", "missing"].includes(kind) ? null : 20,
            cloudMidPercent: ["total-only", "missing"].includes(kind) ? null : 30,
            cloudLowPercent:
              ["total-only", "missing"].includes(kind) || (kind === "partial" && index % 2 === 0)
                ? null
                : 65,
            missingFields: [],
          })),
        };
        const model = buildCloudSeaForecastViewModel(result);
        const card = model.displayData.currentNearTermWeather.cards.find(
          (c) => c.key === "cloud_visibility",
        )!;
        expect(card.detail).toContain("云量");
        expect(card.detail).not.toMatch(/云海|白墙/);
        const html = renderToStaticMarkup(
          React.createElement(CloudSeaResultPage, {
            query: fixture.query,
            result,
            viewModel: model,
          }),
        );
        expect(html).toContain("data-subject-decision-report=");
        expect(html).not.toMatch(/<table|role="tablist"|data-professional-hourly-row=/);
        if (kind === "consistent") expect(card.detail).toContain("可用于复核云层变化");
        if (name === "genericHighMountainGoodCloudSeaCase")
          expect(model.displayData.header.heroBadgeLabel).toBe("云海判断");
      }
    },
  );
  it("rebuilds missing risk context for each window instead of borrowing another window's rain", () => {
    const fixture = cloudSeaRegressionFixture("genericHighMountainGoodCloudSeaCase");
    const morning = {
      ...fixture.result.cloudSeaAnalysis.bestCloudSeaWindows[0]!,
      windowRiskContext: undefined,
    };
    const evening = {
      ...morning,
      startTime: "2026-05-20T17:00:00+08:00",
      endTime: "2026-05-20T19:00:00+08:00",
      label: "日落云海",
    };
    const morningRows = fixture.result.professionalHourlyData!.map((row) => ({
      ...row,
      precipitationAmountMm: 1.2,
      precipitationProbabilityPercent: 80,
    }));
    const eveningRows = morningRows.map((row, index) => ({
      ...row,
      time: `2026-05-20T${17 + index}:00:00+08:00`,
      precipitationAmountMm: 0,
    }));
    const result = {
      ...fixture.result,
      professionalHourlyData: [...morningRows, ...eveningRows],
      cloudSeaAnalysis: {
        ...fixture.result.cloudSeaAnalysis,
        bestCloudSeaWindow: morning,
        bestCloudSeaWindows: [morning, evening],
        watchableCloudSeaWindows: [],
        notRecommendedCloudSeaWindows: [],
        windowRiskContext: undefined,
        scoreCalibration: {
          ...fixture.result.cloudSeaAnalysis.scoreCalibration,
          windowRiskContext: undefined,
        },
      },
    };
    const viewModel = buildCloudSeaForecastViewModel(result);
    const eveningItem = viewModel.cloudSeaWindows.find(
      (window) => window.startTime === evening.startTime,
    )!;
    expect(eveningItem.rainInterference).toContain("降水概率信号");
    expect(eveningItem.rainInterference).not.toContain("主窗口内有较强或持续可计量降水");
    const html = renderToStaticMarkup(
      React.createElement(CloudSeaResultPage, { query: fixture.query, result, viewModel }),
    );
    expect(html).not.toContain("降水：降水：");
    expect(html).not.toContain("。。");
  });
  it("uses an exact six-hour near-term interval including the final row's full hour", () => {
    const fixture = cloudSeaRegressionFixture("genericHighMountainGoodCloudSeaCase");
    const data = buildCloudSeaForecastViewModel(fixture.result).displayData.currentNearTermWeather;
    expect(Date.parse(data.anchorEnd) - Date.parse(data.anchorStart)).toBe(6 * 3_600_000);
    expect(
      data.rows.every(
        (row) =>
          Date.parse(row.time) >= Date.parse(data.anchorStart) &&
          Date.parse(row.time) < Date.parse(data.anchorEnd),
      ),
    ).toBe(true);
  });
  it("keeps the target score card on the calibrated Cloud Sea scale", () => {
    const fixture = cloudSeaRegressionFixture("genericHighMountainGoodCloudSeaCase");
    const result: ForecastCalculationResult = {
      ...fixture.result,
      finalScore: 22,
      cloudSeaAnalysis: {
        ...fixture.result.cloudSeaAnalysis,
        scoreCalibration: {
          ...fixture.result.cloudSeaAnalysis.scoreCalibration,
          finalCloudSeaScore: 44,
        },
      },
    };

    expect(buildCloudSeaForecastViewModel(result).displayData.scoreCard.score).toBe(44);
  });

  it("surfaces score calibration caps in score card, window card, action plan,", () => {
    const fixture = cloudSeaRegressionFixture("genericHighMountainGoodCloudSeaCase");
    const capReason = "开口稳定性中等，云层、能见度或降水资料仍有复核项，最终分数不按近满分处理。";
    const capPhrase = capReason.replace(/。$/, "");
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
    expect(html).toContain("data-subject-decision-report=");
    expect(html).not.toMatch(/<table|role="tablist"|data-professional-hourly-row=/);
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
    expect(html).toContain("data-subject-decision-report=");
    expect(html).not.toMatch(/<table|role="tablist"|data-professional-hourly-row=/);
  });

  it("recomputes field coverage after clipping provider rows to the selected horizon", () => {
    const fixture = cloudSeaRegressionFixture("genericHighMountainGoodCloudSeaCase");
    const baseRow = fixture.result.professionalHourlyData?.[0];
    if (!baseRow) {
      throw new Error("Cloud Sea regression fixture must include professional hourly rows.");
    }
    const rows = hourlyRowsFrom(baseRow, "2026-06-04T09:00:00+08:00", 48);
    const future48Result = future48RollingResult(fixture.result, rows);
    const result: ForecastCalculationResult = {
      ...future48Result,
      horizon: "24h",
      forecastEnd: "2026-06-05T09:00:00+08:00",
      calendarBasis: {
        ...future48Result.calendarBasis,
        forecastEnd: "2026-06-05T09:00:00+08:00",
        horizonHours: 24,
      },
      professionalHourlyDataTimeBasis: {
        ...future48Result.professionalHourlyDataTimeBasis!,
        anchorEndLocal: "2026-06-05T08:00:00+08:00",
        horizonHours: 24,
        expectedRowCount: 24,
        requestedHours: 24,
        professionalCoverageNoteZh: "原始服务商字段覆盖 54 / 72 小时。",
        fieldCoverageSummary: {
          totalHours: 48,
          totalCloudCoverage: 48,
          cloudLowCoverage: 48,
          cloudMidCoverage: 48,
          cloudHighCoverage: 48,
          temperatureCoverage: 48,
          terrainAdjustedTemperatureCoverage: 48,
          dewPointCoverage: 48,
          dewPointSpreadCoverage: 48,
          humidityCoverage: 48,
          precipitationAmountCoverage: 48,
          precipitationProbabilityCoverage: 48,
          visibilityCoverage: 48,
          windSpeedCoverage: 48,
          windDirectionCoverage: 48,
          weatherCodeCoverage: 48,
        },
      },
    };

    const display = buildCloudSeaForecastViewModel(result).displayData.professionalHourlyData;

    expect(display.rows).toHaveLength(24);
    expect(display.timeBasis?.fieldCoverageSummary).toMatchObject({
      totalHours: 24,
      totalCloudCoverage: 24,
      cloudLowCoverage: 24,
      cloudMidCoverage: 24,
      cloudHighCoverage: 24,
    });
    expect(display.timeBasis?.professionalCoverageNoteZh).toContain("24/24");
    expect(JSON.stringify(display)).not.toContain("54 / 72");
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
