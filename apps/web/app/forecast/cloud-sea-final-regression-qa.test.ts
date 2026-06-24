import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  buildCloudLayerCompletenessContext,
  buildCloudSeaCloudBasisConsistencyContext,
  buildCloudSeaRecommendationGuard,
  buildCloudSeaWeatherVariableConsistencyContext,
} from "@photo-weather/shared";
import {
  allCloudSeaRegressionFixtures,
  cloudSeaRegressionFixture,
  cloudSeaRegressionFixtures,
  type CloudSeaRegressionFixture,
  type CloudSeaRegressionFixtureName,
} from "./__tests__/fixtures/cloudSeaRegressionFixtures";
import {
  CloudSeaResultPage,
  type ForecastPageMode,
  resolveForecastPageMode,
} from "./forecast-result-client";
import { buildCloudSeaForecastViewModel } from "./forecast-result-view-model";
import { buildCloudSeaRuleContext } from "./cloud-sea-rule-context";
import { buildCloudSeaTerrainContextFromResult } from "./cloud-sea-terrain-context";

vi.mock("next/navigation", () => ({
  usePathname: () => "/forecast",
}));

const testGlobal = globalThis as typeof globalThis & { React: typeof React };
testGlobal.React = React;
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");

const requiredFixtureNames: readonly CloudSeaRegressionFixtureName[] = [
  "genericHighMountainGoodCloudSeaCase",
  "genericHighMountainWarmGridCoolCameraCase",
  "genericHighMountainRawOnlyCase",
  "genericLowElevationNoCorrectionCase",
  "genericLowElevationWeakCloudSeaCase",
  "genericMissingLayerDataCase",
  "genericCloudBasisMismatchCase",
  "genericMidHighCloudOnlyCase",
  "genericPrecipProbabilityOnlyCase",
  "genericMeaningfulPrecipitationCase",
  "genericProbabilityOnlyTraceRainCase",
  "genericLightShowerNearWindowCase",
  "genericMeaningfulRainNearWindowCase",
  "genericHeavyRainCase",
  "genericRainOutsideWindowCase",
  "genericMissingAmountWithProbabilityCase",
  "genericAmountWithoutProbabilityCase",
  "genericHumidityDewPointConflictCase",
  "genericLowScoreContradictionCase",
  "genericUnknownTerrainCase",
];

describe("Cloud Sea Final Regression QA fixtures", () => {
  it("defines every required generic Cloud Sea scenario without real location names", () => {
    expect(Object.keys(cloudSeaRegressionFixtures).sort()).toEqual(
      [...requiredFixtureNames].sort(),
    );

    for (const fixture of allCloudSeaRegressionFixtures) {
      expect(fixture.result.place.name).toMatch(/^generic/);
      expect(fixture.result.place.name).not.toMatch(
        /黄山|光明顶|玉京峰|三清山|瓯江|老君山|武功山|平顶山/,
      );
      expect(fixture.result.professionalHourlyData?.length).toBeGreaterThan(0);
    }
  });
});

describe("Cloud Sea helper-level final regression QA", () => {
  it("allows classic high-mountain wording only when terrain, layers, and risk support it", () => {
    const { result } = cloudSeaRegressionFixture("genericHighMountainGoodCloudSeaCase");
    const terrainContext = buildCloudSeaTerrainContextFromResult(result);
    const ruleContext = buildCloudSeaRuleContext(result);
    const layerContext = buildCloudLayerCompletenessContext(result.professionalHourlyData);
    const basisContext = buildCloudSeaCloudBasisConsistencyContext({
      hourlyRows: result.professionalHourlyData,
      cloudLayerCompletenessContext: layerContext,
    });

    expect(terrainContext.terrainClass).toBe("high_mountain");
    expect(terrainContext.isClassicCloudSeaEligible).toBe(true);
    expect(terrainContext.shouldDowngradeCloudSeaWording).toBe(false);
    expect(layerContext.layerCompletenessLevel).toBe("complete");
    expect(basisContext.cloudBasisLevel).toBe("consistent");
    expect(ruleContext.cloudLayerRoleContext.dominantRole).toBe("cloud_sea");
    expect(ruleContext.recommendationGuardContext.finalRecommendationLevel).toBe(
      "strong_special_trip",
    );
    expect(ruleContext.recommendationGuardContext.isSpecialTripRecommended).toBe(true);
  });

  it("downgrades weak low-elevation cloud-sea semantics and blocks special-trip copy", () => {
    const { result } = cloudSeaRegressionFixture("genericLowElevationWeakCloudSeaCase");
    const context = buildCloudSeaRuleContext(result);

    expect(context.terrainContext.terrainClass).toBe("low_elevation");
    expect(context.terrainContext.shouldDowngradeCloudSeaWording).toBe(true);
    expect([
      "do_not_go_special",
      "backup_only",
      "cautious_reference",
      "observe_if_nearby",
    ]).toContain(context.recommendationGuardContext.finalRecommendationLevel);
    expect(context.recommendationGuardContext.isSpecialTripRecommended).toBe(false);
    expect(context.recommendationGuardContext.finalRecommendationLabel).not.toMatch(
      /强推荐|推荐安排|推荐专程云海|云海主守/,
    );
  });

  it("keeps total-only cloud layers as missing data instead of filling low/mid/high cloud", () => {
    const { result } = cloudSeaRegressionFixture("genericMissingLayerDataCase");
    const layerContext = buildCloudLayerCompletenessContext(result.professionalHourlyData);
    const basisContext = buildCloudSeaCloudBasisConsistencyContext({
      hourlyRows: result.professionalHourlyData,
      cloudLayerCompletenessContext: layerContext,
    });
    const ruleContext = buildCloudSeaRuleContext(result);

    expect(layerContext.cloudLayerBasis).toBe("total_only");
    expect(layerContext.hasLowCloudLayer).toBe(false);
    expect(layerContext.layerCompletenessLevel).toBe("missing");
    expect(basisContext.cloudBasisLevel).toBe("total_only");
    expect(ruleContext.cloudLayerRoleContext.dominantRole).toBe("needs_review");
    expect(ruleContext.recommendationGuardContext.finalRecommendationLevel).toBe(
      "cautious_reference",
    );
  });

  it("detects cloud-basis mismatch and does not normalize raw professional values", () => {
    const { result } = cloudSeaRegressionFixture("genericCloudBasisMismatchCase");
    const basisContext = buildCloudSeaCloudBasisConsistencyContext(result.professionalHourlyData);
    const ruleContext = buildCloudSeaRuleContext(result);

    expect(basisContext.cloudBasisLevel).toBe("mixed_basis");
    expect(basisContext.mismatchFields).toContain("low");
    expect(basisContext.shouldLowerCloudSeaConfidence).toBe(true);
    expect(result.professionalHourlyData?.[0]?.cloudTotalPercent).toBe(20);
    expect(result.professionalHourlyData?.[0]?.cloudLowPercent).toBe(70);
    expect(ruleContext.recommendationGuardContext.finalRecommendationLevel).toBe(
      "cautious_reference",
    );
  });

  it("routes mid/high-cloud-only rows to glow or texture reference, not cloud sea evidence", () => {
    const { result } = cloudSeaRegressionFixture("genericMidHighCloudOnlyCase");
    const context = buildCloudSeaRuleContext(result);

    expect(context.cloudLayerRoleContext.redirectedMidHighHoursCount).toBeGreaterThan(0);
    expect(["glow_reference", "texture"]).toContain(context.cloudLayerRoleContext.dominantRole);
    expect(context.recommendationGuardContext.finalRecommendationLevel).toBe("cautious_reference");
    expect(context.recommendationGuardContext.isSpecialTripRecommended).toBe(false);
  });

  it("separates precipitation probability-only from meaningful precipitation", () => {
    const probabilityOnly = cloudSeaRegressionFixture("genericPrecipProbabilityOnlyCase");
    const meaningful = cloudSeaRegressionFixture("genericMeaningfulPrecipitationCase");

    const probabilityOnlyContext = buildCloudSeaWeatherVariableConsistencyContext({
      hourlyRows: probabilityOnly.result.professionalHourlyData,
      cloudLayerCompletenessContext: buildCloudLayerCompletenessContext(
        probabilityOnly.result.professionalHourlyData,
      ),
    });
    const meaningfulContext = buildCloudSeaWeatherVariableConsistencyContext({
      hourlyRows: meaningful.result.professionalHourlyData,
      cloudLayerCompletenessContext: buildCloudLayerCompletenessContext(
        meaningful.result.professionalHourlyData,
      ),
    });

    expect(probabilityOnlyContext.precipitationSignalStatus).toBe("probability_only");
    expect(probabilityOnlyContext.shouldDowngradePrecipitationWording).toBe(true);
    expect(
      buildCloudSeaRuleContext(probabilityOnly.result).recommendationGuardContext
        .finalRecommendationLevel,
    ).toBe("strong_special_trip");
    expect(meaningfulContext.precipitationSignalStatus).toBe("meaningful_precipitation");
    expect(meaningfulContext.shouldDowngradePrecipitationWording).toBe(false);
  });

  it("calibrates generic precipitation amount and window overlap before capping recommendations", () => {
    const trace = buildCloudSeaRuleContext(
      cloudSeaRegressionFixture("genericProbabilityOnlyTraceRainCase").result,
    );
    const light = buildCloudSeaRuleContext(
      cloudSeaRegressionFixture("genericLightShowerNearWindowCase").result,
    );
    const meaningful = buildCloudSeaRuleContext(
      cloudSeaRegressionFixture("genericMeaningfulRainNearWindowCase").result,
    );
    const heavy = buildCloudSeaRuleContext(cloudSeaRegressionFixture("genericHeavyRainCase").result);
    const outside = buildCloudSeaRuleContext(
      cloudSeaRegressionFixture("genericRainOutsideWindowCase").result,
    );

    expect(trace.precipitationSignalContext.precipitationSignalType).toBe("light_disturbance");
    expect(trace.precipitationSignalContext.shouldAvoidStrongRainWording).toBe(true);
    expect(trace.recommendationGuardContext.finalRecommendationLevel).toBe("strong_special_trip");

    expect(light.precipitationSignalContext.precipitationSignalType).toBe("short_shower");
    expect(light.precipitationSignalContext.riskLabelZh).toBe("短时小雨");
    expect(light.precipitationSignalContext.shouldAvoidStrongRainWording).toBe(true);

    expect(meaningful.precipitationSignalContext.precipitationSignalType).toBe("meaningful_rain");
    expect(meaningful.precipitationSignalContext.shouldDowngradeWindow).toBe(true);
    expect(meaningful.recommendationGuardContext.finalRecommendationLevel).toBe(
      "cautious_reference",
    );

    expect(heavy.precipitationSignalContext.precipitationSignalType).toBe("sustained_rain");
    expect(heavy.recommendationGuardContext.finalRecommendationLevel).toBe("backup_only");

    expect(outside.precipitationSignalContext.precipitationSignalType).toBe("sustained_rain");
    expect(outside.precipitationSignalContext.affectsMainWindow).toBe(false);
    expect(outside.precipitationSignalContext.shouldDowngradeWindow).toBe(false);
    expect(outside.recommendationGuardContext.finalRecommendationLevel).toBe(
      "strong_special_trip",
    );
  });

  it("treats humidity and dew-point conflicts as review-only water-vapor evidence", () => {
    const { result } = cloudSeaRegressionFixture("genericHumidityDewPointConflictCase");
    const context = buildCloudSeaRuleContext(result);

    expect(context.weatherVariableConsistencyContext.humidityDewPointStatus).toBe("conflict");
    expect(context.weatherVariableConsistencyContext.shouldAvoidStrongWording).toBe(true);
    expect(context.recommendationGuardContext.finalRecommendationLevel).toBe("cautious_reference");
    expect(context.recommendationGuardContext.isSpecialTripRecommended).toBe(false);
  });

  it("caps a low-score contradiction through the recommendation guard", () => {
    const { result } = cloudSeaRegressionFixture("genericLowScoreContradictionCase");
    const context = buildCloudSeaRuleContext(result);
    const directGuard = buildCloudSeaRecommendationGuard({
      cloudSeaScore: 32,
      shootabilityScore: 32,
      formationScore: 34,
      whiteoutRiskScore: 42,
      proposedRecommendationLabel: "强推荐专程",
      terrainContext: {
        shouldDowngradeCloudSeaWording: false,
        isClassicCloudSeaEligible: true,
        terrainClass: "high_mountain",
      },
      cloudLayerCompletenessContext: context.cloudLayerCompletenessContext,
      bestWindow: result.cloudSeaAnalysis.bestCloudSeaWindow,
      hasWindow: true,
      lowCloudSignalSupported: false,
    });

    expect(context.recommendationGuardContext.finalRecommendationLevel).toBe("do_not_go_special");
    expect(directGuard.finalRecommendationLevel).toBe("do_not_go_special");
    expect(context.recommendationGuardContext.finalRecommendationLabel).toBe("不建议专程");
  });

  it("keeps unknown terrain cautious and asks for terrain review", () => {
    const { result } = cloudSeaRegressionFixture("genericUnknownTerrainCase");
    const context = buildCloudSeaRuleContext(result);

    expect(context.terrainContext.terrainClass).toBe("low_elevation");
    expect(context.terrainContext.shouldDowngradeCloudSeaWording).toBe(true);
    expect(context.terrainContext.terrainNoteZh).toContain("地形数据不足");
    expect(context.recommendationGuardContext.isSpecialTripRecommended).toBe(false);
  });
});

describe("Cloud Sea result page final regression QA", () => {
  const uiCases: readonly CloudSeaRegressionFixtureName[] = [
    "genericHighMountainGoodCloudSeaCase",
    "genericLowElevationWeakCloudSeaCase",
    "genericMissingLayerDataCase",
    "genericCloudBasisMismatchCase",
    "genericLowScoreContradictionCase",
    "genericMeaningfulPrecipitationCase",
  ];

  it.each(uiCases)("renders the required result sections for %s", (fixtureName) => {
    const rendered = renderCloudSeaFixture(cloudSeaRegressionFixture(fixtureName));

    expect(rendered.html).toContain("CloudSeaTopResultHeader");
    expect(rendered.html).toContain('data-cloud-sea-section="CloudSeaWindowDecision"');
    expect(rendered.html).toContain('data-cloud-sea-section="CloudSeaDailyCards"');
    expect(rendered.html).toContain('data-cloud-sea-section="CloudSeaDecisionSupport"');
    expect(rendered.html).toContain('data-cloud-sea-section="CloudSeaProfessionalData"');
    expect(rendered.html).toContain('data-cloud-sea-professional-data-expanded="true"');
    expect(rendered.html).toContain("CloudSeaHeroConclusion");
    expect(rendered.html).toContain('data-cloud-sea-section="CloudSeaScoreCard"');
    expect(rendered.html).toContain('data-cloud-sea-metric-card="true"');
    expect(rendered.html).toContain('data-testid="cloud-sea-near-term-weather"');
    expect(rendered.html).toContain('data-testid="cloud-sea-window-cards-section"');
    expect(rendered.html).toContain('data-testid="professional-hourly-data"');
    expect(rendered.html).toContain("CloudSeaDailyTrend");
    expect(rendered.html).toContain("CloudSeaReasoning");
    expect(rendered.html).toContain("CloudSeaActionPlan");
    expect(rendered.html).toContain("CloudSeaRiskSummary");
    expect(rendered.html).toContain("总云量 %");
    expect(rendered.html).toContain("高云量 %");
    expect(rendered.html).toContain("中云量 %");
    expect(rendered.html).toContain("低云量 %");
    expectMarkersInOrder(rendered.html, [
      "CloudSeaWindowDecision",
      "CloudSeaTopResultHeader",
      "CloudSeaCoreMetrics",
      "CloudSeaNearTermWeather",
      "CloudSeaWindowCards",
      "CloudSeaDailyCards",
      "CloudSeaDailyTrend",
      "CloudSeaDecisionSupport",
      "CloudSeaReasoning",
      "CloudSeaActionPlan",
      "CloudSeaRiskSummary",
      "CloudSeaProfessionalData",
      "CloudSeaProfessionalHourlyData",
    ]);
    const professionalSection = sectionAfter(rendered.html, "CloudSeaProfessionalData");
    expect(professionalSection).not.toContain("CloudSeaReasoning");
    expect(professionalSection).not.toContain("CloudSeaActionPlan");
    expect(professionalSection).not.toContain("CloudSeaRiskSummary");
  });

  it("uses adjusted high-mountain display temperature instead of warm raw grid values", () => {
    const { html, viewModel } = renderCloudSeaFixture(
      cloudSeaRegressionFixture("genericHighMountainWarmGridCoolCameraCase"),
    );
    const nearTermSection = sectionBetween(html, "CloudSeaNearTermWeather", "CloudSeaWindowCards");
    const actionSection = sectionBetween(html, "CloudSeaActionPlan", "CloudSeaRiskSummary");
    const professionalSection = sectionAfter(html, "CloudSeaProfessionalData");

    expect(viewModel.displayTemperatureContext.basis).toBe("terrain_adjusted");
    expect(viewModel.displayData.displayDataMeta.temperatureBasis).toBe("terrain_adjusted");
    expect(viewModel.displayTemperatureContext.displayTemperatureC).toBe(18);
    expect(nearTermSection).toContain("机位估算温度");
    expect(nearTermSection).toContain("18°C");
    expect(nearTermSection).toMatch(/山地体感\s*16°C/);
    expect(nearTermSection).not.toContain("30°C");
    expect(nearTermSection).not.toContain("山顶估算温度");
    expect(nearTermSection).not.toContain("山地体感 29°C");
    expect(nearTermSection).not.toContain("山地体感 30°C");
    expect(actionSection).toContain("防风 / 防潮 / 轻保暖");
    expect(actionSection).not.toContain("30°C");
    expect(professionalSection).toContain("原始格点气温 °C");
    expect(professionalSection).toContain("机位估算气温 °C");
    expect(professionalSection).toContain("30°C");
  });

  it("keeps near-term precipitation aligned with professional hourly rows instead of stale current zero", () => {
    const fixture = cloudSeaRegressionFixture("genericMeaningfulRainNearWindowCase");
    const result = {
      ...fixture.result,
      currentWeather: fixture.result.currentWeather
        ? {
            ...fixture.result.currentWeather,
            precipitation: 0,
            precipitationAmountMm: 0,
            rainAmountMm: 0,
            precipitationProbability: 0,
            precipitationProbabilityPercent: 0,
          }
        : fixture.result.currentWeather,
      professionalHourlyData: fixture.result.professionalHourlyData?.map((row, index) =>
        index === 0
          ? {
              ...row,
              precipitationAmountMm: 1.2,
              precipitationProbabilityPercent: 72,
            }
          : row,
      ),
    };
    const viewModel = buildCloudSeaForecastViewModel(result);
    const html = renderToStaticMarkup(
      React.createElement(CloudSeaResultPage, {
        query: fixture.query,
        result,
        viewModel,
        returnUrl: "/forecast?target=general",
      }),
    );
    const nearTermSection = sectionBetween(html, "CloudSeaNearTermWeather", "CloudSeaWindowCards");
    const precipitationCard =
      viewModel.displayData.currentNearTermWeather.cards.find(
        (card) => card.key === "wind_precipitation",
      ) ?? null;

    expect(precipitationCard?.value).toContain("1.2 mm");
    expect(precipitationCard?.detail).toContain("可计量降水");
    expect(nearTermSection).toContain("1.2 mm");
    expect(nearTermSection).not.toContain("预计雨量 0 mm");
    expect(viewModel.displayData.displayDataMeta.staleFieldWarnings).toContain(
      "near-term precipitation display ignored stale zero current-weather amount",
    );
  });

  it("labels high-mountain raw-only temperature as raw grid reference with a warning", () => {
    const { html, viewModel } = renderCloudSeaFixture(
      cloudSeaRegressionFixture("genericHighMountainRawOnlyCase"),
    );
    const nearTermSection = sectionBetween(html, "CloudSeaNearTermWeather", "CloudSeaWindowCards");

    expect(viewModel.displayTemperatureContext.basis).toBe("raw_grid_with_warning");
    expect(viewModel.displayTemperatureContext.isUserFacingTemperatureReliable).toBe(false);
    expect(nearTermSection).toContain("原始格点温度，未做海拔订正");
    expect(nearTermSection).toContain("29°C");
    expect(nearTermSection).toContain("高山机位体感可能更冷");
    expect(nearTermSection).not.toContain("山顶估算温度");
    expect(nearTermSection).not.toMatch(/机位估算温度：29°C/);
  });

  it("leaves low-elevation raw temperatures uncorrected without high-mountain warning", () => {
    const { html, viewModel } = renderCloudSeaFixture(
      cloudSeaRegressionFixture("genericLowElevationNoCorrectionCase"),
    );
    const nearTermSection = sectionBetween(html, "CloudSeaNearTermWeather", "CloudSeaWindowCards");

    expect(viewModel.displayTemperatureContext.basis).toBe("provider_point");
    expect(viewModel.displayTemperatureContext.isHighMountainTemperatureSensitive).toBe(false);
    expect(viewModel.displayTemperatureContext.displayTemperatureC).toBe(29);
    expect(nearTermSection).toContain("29°C");
    expect(nearTermSection).not.toContain("原始格点温度，未做海拔订正");
    expect(nearTermSection).not.toContain("高山机位体感可能更冷");
    expect(nearTermSection).not.toContain("高山体感需复核");
  });

  it("keeps Cloud Sea user-facing cards on the display temperature context", () => {
    const source = readFileSync(
      resolve(repoRoot, "apps/web/app/forecast/forecast-result-client.tsx"),
      "utf8",
    );
    const nearTermSource = source.slice(
      source.indexOf("function CloudSeaNearTermWeatherSection"),
      source.indexOf("type CloudSeaWindowCategoryKey"),
    );

    expect(nearTermSource).toContain("CloudSeaCurrentNearTermWeatherDisplay");
    expect(nearTermSource).toContain("display.cards.map");
    expect(nearTermSource).not.toMatch(
      /rawGridTemperatureC|rawTemperatureC|current\?\.temperature|weather\.tempMin|weather\.tempMax/,
    );
  });

  it("keeps Cloud Sea result UI on displayData instead of direct raw result paths", () => {
    const source = readFileSync(
      resolve(repoRoot, "apps/web/app/forecast/forecast-result-client.tsx"),
      "utf8",
    );
    const resultPageSource = source.slice(
      source.indexOf("export function CloudSeaResultPage"),
      source.indexOf("export function GlowResultPage"),
    );

    expect(resultPageSource).toContain("viewModel.displayData");
    expect(resultPageSource).not.toMatch(
      /result\.professionalHourlyData|result\.currentWeather|rawGridTemperatureC|providerTemperatureC|result\.cloudSeaAnalysis\.(formationScore|shootableScore|whiteoutRiskScore)|result\.dailySummaries/,
    );
  });

  it("keeps missing layer values as dashes and never fills them from total cloud", () => {
    const { html } = renderCloudSeaFixture(
      cloudSeaRegressionFixture("genericMissingLayerDataCase"),
    );
    const professionalSection = sectionAfter(html, "CloudSeaProfessionalData");

    expect(professionalSection).toContain("需复核");
    expect(professionalSection).toMatch(/data-professional-hourly-cell="cloud-total"[^>]*>88%/);
    expect(professionalSection).toMatch(/data-professional-hourly-cell="cloud-low"[^>]*>—<\/td>/);
    expect(professionalSection).toMatch(/data-professional-hourly-cell="cloud-mid"[^>]*>—<\/td>/);
    expect(professionalSection).toMatch(/data-professional-hourly-cell="cloud-high"[^>]*>—<\/td>/);
    expect(professionalSection).not.toMatch(
      /data-professional-hourly-cell="cloud-(low|mid|high)"[^>]*>(88|86|42)%<\/td>/,
    );
  });

  it("shows cloud-basis mismatch notes while preserving raw total and low cloud values", () => {
    const { html, viewModel } = renderCloudSeaFixture(
      cloudSeaRegressionFixture("genericCloudBasisMismatchCase"),
    );
    const professionalSection = sectionAfter(html, "CloudSeaProfessionalData");

    expect(viewModel.cloudBasisConsistency.cloudBasisLevel).toBe("mixed_basis");
    expect(
      viewModel.displayData.currentNearTermWeather.cards.find(
        (card) => card.key === "cloud_visibility",
      )?.value,
    ).toContain("低云 70%");
    expect(viewModel.recommendationGuard.finalRecommendationLevel).toBe("cautious_reference");
    expect(professionalSection).toMatch(/data-professional-hourly-cell="cloud-total"[\s\S]*?20%/);
    expect(professionalSection).toMatch(/data-professional-hourly-cell="cloud-low"[^>]*>70%/);
    expect(professionalSection).toContain("口径需复核");
    expect(professionalSection).not.toContain("可拍窗口</span>");
  });

  it("renders centralized recommendation explanation across summary, cards, windows, daily, and action plan", () => {
    const { html, viewModel } = renderCloudSeaFixture(
      cloudSeaRegressionFixture("genericCloudBasisMismatchCase"),
    );
    const firstDaily = viewModel.dailyTrend[0];
    const firstWindow = viewModel.cloudSeaWindows[0];
    const actionSection = sectionBetween(html, "CloudSeaActionPlan", "CloudSeaRiskSummary");

    expect(viewModel.recommendationGuard.finalRecommendationLevel).toBe("cautious_reference");
    expect(viewModel.displayData.recommendationCards[0]?.value).toBe(
      viewModel.recommendationGuard.finalRecommendationLabel,
    );
    expect(viewModel.displayData.actionPlan).toHaveLength(viewModel.actionPlan.length);
    expect(viewModel.displayData.actionPlan.find((item) => item.key === "departure")).toEqual(
      viewModel.actionPlan.find((item) => item.key === "departure"),
    );
    expect(viewModel.displayData.actionPlan.find((item) => item.key === "arrival")).toMatchObject({
      label: "到达参考",
      value: expect.stringContaining("如仍前往，建议到达"),
      detail: expect.stringContaining("出发前必须复核"),
    });
    expect(viewModel.displayData.riskReview).toBe(viewModel.riskSummary);
    expect(viewModel.recommendationExplanation.whyNotStrongerZh).toContain("评分较高");
    expect(viewModel.recommendationExplanation.whyNotStrongerZh).toContain("云量口径");
    expect(html).toContain(viewModel.recommendationExplanation.oneLineConclusionZh);
    expect(viewModel.recommendationExplanation.scoreReasonZh).toContain("评分较高");
    expect(viewModel.recommendationExplanation.userFacingSummaryZh).toContain("评分看云层机会");
    expect(html).toContain(viewModel.recommendationExplanation.actionSummaryZh);
    expect(actionSection).toContain("出发前必须复核");
    expect(firstDaily?.decisionReason).toBeTruthy();
    expect(html).toContain(firstSentenceForTest(firstDaily?.decisionReason ?? ""));
    expect(firstWindow?.labelReason).toBeTruthy();
    expect(html).toContain(firstSentenceForTest(firstWindow?.labelReason ?? ""));
    expect(html).toContain('data-testid="professional-hourly-data"');
    expect(html).toContain("总云量 %");
    expect(html).toContain("高云量 %");
    expect(html).toContain("中云量 %");
    expect(html).toContain("低云量 %");
    expect(html).not.toMatch(/latitude|longitude|WGS84|GCJ-02|经度|纬度/i);
  });

  it("keeps low-elevation, low-score, mid/high-only, and unknown-terrain cases free of strong trip copy", () => {
    const cappedCases: readonly CloudSeaRegressionFixtureName[] = [
      "genericLowElevationWeakCloudSeaCase",
      "genericMidHighCloudOnlyCase",
      "genericHumidityDewPointConflictCase",
      "genericLowScoreContradictionCase",
      "genericUnknownTerrainCase",
    ];

    for (const fixtureName of cappedCases) {
      const { html, viewModel } = renderCloudSeaFixture(cloudSeaRegressionFixture(fixtureName));
      expect(viewModel.recommendationGuard.isSpecialTripRecommended).toBe(false);
      expect(html).not.toContain("强推荐专程");
      expect(html).not.toContain("推荐专程云海");
      expect(html).not.toContain("云海主守");
    }
  });

  it("keeps recommendation labels consistent across summary, cards, daily trend, windows, and action plan", () => {
    const allowedRecommendationLabels = new Set([
      "强推荐专程",
      "推荐安排",
      "谨慎参考",
      "已在附近可观察",
      "仅作备选",
      "不建议专程",
    ]);

    for (const fixture of allCloudSeaRegressionFixtures) {
      const { viewModel } = renderCloudSeaFixture(fixture);
      const departure = viewModel.actionPlan.find((item) => item.key === "departure");

      expect(viewModel.hero.recommendationLabel).toBe(
        viewModel.recommendationGuard.finalRecommendationLabel,
      );
      expect(departure?.value).toBe(viewModel.recommendationGuard.actionPlanLabels.departure);
      expect(departure?.value).toBe(viewModel.hero.recommendationLabel);

      if (!viewModel.recommendationGuard.isSpecialTripRecommended) {
        const labels = [
          viewModel.hero.recommendationLabel,
          ...viewModel.dailyTrend.map((item) => item.recommendedAction),
          ...viewModel.cloudSeaWindows.map((item) => item.recommendationLabel),
          ...viewModel.actionPlan.map((item) => item.value),
        ].join(" ");

        expect(labels).not.toMatch(/强推荐专程|推荐安排|推荐专程云海|云海主守/);
      }

      const recommendationLabels = [
        viewModel.hero.recommendationLabel,
        ...viewModel.dailyTrend.map((item) => item.recommendedAction),
        ...viewModel.cloudSeaWindows.map((item) => item.recommendationLabel),
        departure?.value,
      ].filter((label): label is string => Boolean(label));

      for (const label of recommendationLabels) {
        expect(allowedRecommendationLabels.has(label), label).toBe(true);
      }
    }
  });

  it("keeps final Cloud Sea copy free of developer/demo/fallback wording and coordinates", () => {
    const forbiddenPatterns = [
      /页面预设|体验模式|演示数据|数据提醒|开发测试/,
      /确定性简版|基于确定性计算结果生成的简版解读|兜底解读/,
      /\bguard\b/i,
      /raw JSON|API key|provider/i,
      /latitude|longitude|WGS84|GCJ-02|经度|纬度/i,
    ];

    for (const fixtureName of uiCases) {
      const { html } = renderCloudSeaFixture(cloudSeaRegressionFixture(fixtureName));

      for (const pattern of forbiddenPatterns) {
        expect(html).not.toMatch(pattern);
      }
    }
  });

  it("keeps repeated Cloud Sea caution phrases from becoming mechanical", () => {
    const repeatedPhrases = [
      "云顶高度需复核",
      "分层云量不完整，低云判断需临近复核",
      "低云分层缺失，不能强推云海",
      "不建议只为该窗口专程",
    ];

    for (const fixtureName of uiCases) {
      const { html } = renderCloudSeaFixture(cloudSeaRegressionFixture(fixtureName));

      for (const phrase of repeatedPhrases) {
        expect(countOccurrences(html, phrase), phrase).toBeLessThanOrEqual(2);
      }
    }
  });

  it("keeps low-elevation wording downgraded while high-mountain wording remains available", () => {
    const low = renderCloudSeaFixture(cloudSeaRegressionFixture("genericLowElevationWeakCloudSeaCase"));
    const high = renderCloudSeaFixture(cloudSeaRegressionFixture("genericHighMountainGoodCloudSeaCase"));

    expect(low.viewModel.terrainContext.shouldDowngradeCloudSeaWording).toBe(true);
    expect(low.html).toContain("低云观察与备选");
    expect(low.html).toContain("低云");
    expect(low.html).toContain("晨雾");
    expect(low.html).toContain("通透");
    expect(low.html).not.toMatch(
      /高山云海|山顶云海|云海主守|推荐专程云海|强推荐专程云海|云海窗口与备选/,
    );

    expect(high.viewModel.terrainContext.shouldDowngradeCloudSeaWording).toBe(false);
    expect(high.html).toContain("云海形成");
    expect(high.html).toContain("云海可拍");
    expect(high.html).toContain("白墙风险");
  });

  it("keeps professional hourly table columns visible after copy polish", () => {
    const { html } = renderCloudSeaFixture(cloudSeaRegressionFixture("genericHighMountainGoodCloudSeaCase"));
    const professionalSection = sectionAfter(html, "CloudSeaProfessionalData");

    for (const header of [
      "专业小时数据",
      "总云量 %",
      "高云量 %",
      "中云量 %",
      "低云量 %",
      "气温",
      "露点 °C",
      "露点差 °C",
      "湿度 %",
      "降水 mm / 降水概率 %",
      "能见度 km",
      "风速 m/s",
      "风向",
    ]) {
      expect(professionalSection).toContain(header);
    }
  });

  it("keeps probability-only precipitation local while meaningful precipitation affects action advice", () => {
    const probabilityOnly = renderCloudSeaFixture(
      cloudSeaRegressionFixture("genericPrecipProbabilityOnlyCase"),
    );
    const meaningful = renderCloudSeaFixture(
      cloudSeaRegressionFixture("genericMeaningfulPrecipitationCase"),
    );

    expect(
      probabilityOnly.viewModel.ruleContext.weatherVariableConsistencyContext
        .precipitationSignalStatus,
    ).toBe("probability_only");
    expect(probabilityOnly.html).toContain("局地短时扰动");
    expect(probabilityOnly.html).not.toContain("强降水干扰");
    expect(probabilityOnly.viewModel.recommendationGuard.isSpecialTripRecommended).toBe(true);

    expect(
      meaningful.viewModel.ruleContext.weatherVariableConsistencyContext.precipitationSignalStatus,
    ).toBe("meaningful_precipitation");
    expect(meaningful.html).toContain("可计量降水");
    expect(meaningful.html).toContain("防水");
  });

  it("keeps General Forecast page mode independent from Cloud Sea-specific result logic", () => {
    const mode: ForecastPageMode = resolveForecastPageMode({
      query: {
        name: "genericGeneralSmokeSpot",
        source: "regression",
        latitudeGcj02: 30,
        longitudeGcj02: 118,
        latitudeWgs84: 30,
        longitudeWgs84: 118,
        horizon: "48h",
        target: "general",
      },
      status: "loading",
      hasResult: false,
    });

    expect(mode).toBe("loading");
  });
});

function renderCloudSeaFixture(fixture: CloudSeaRegressionFixture) {
  const viewModel = buildCloudSeaForecastViewModel(fixture.result);
  const html = renderToStaticMarkup(
    React.createElement(CloudSeaResultPage, {
      query: fixture.query,
      result: fixture.result,
      viewModel,
      returnUrl: "/forecast?target=general",
    }),
  );

  return { html, viewModel };
}

function sectionBetween(html: string, startMarker: string, endMarker: string): string {
  const start = html.indexOf(startMarker);
  const end = html.indexOf(endMarker, start + startMarker.length);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return html.slice(start, end);
}

function sectionAfter(html: string, marker: string): string {
  const start = html.indexOf(marker);
  expect(start).toBeGreaterThanOrEqual(0);
  return html.slice(start);
}

function firstSentenceForTest(value: string): string {
  const trimmed = value.trim();
  const match = trimmed.match(/^[^。！？；?!;]+[。！？；?!;]?/);
  return (match?.[0] ?? trimmed).replace(/[。！？；?!;]?$/, "。");
}

function expectMarkersInOrder(html: string, markers: readonly string[]) {
  let previous = -1;
  for (const marker of markers) {
    const current = html.indexOf(marker);
    expect(current, marker).toBeGreaterThan(previous);
    previous = current;
  }
}

function countOccurrences(value: string, needle: string): number {
  if (!needle) {
    return 0;
  }
  return value.split(needle).length - 1;
}
