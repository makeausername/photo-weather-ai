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
  AiExplanationPanel,
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

const requiredFixtureNames: readonly CloudSeaRegressionFixtureName[] = [
  "genericHighMountainGoodCloudSeaCase",
  "genericLowElevationWeakCloudSeaCase",
  "genericMissingLayerDataCase",
  "genericCloudBasisMismatchCase",
  "genericMidHighCloudOnlyCase",
  "genericPrecipProbabilityOnlyCase",
  "genericMeaningfulPrecipitationCase",
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
    expect(rendered.html).toContain('data-cloud-sea-section="CloudSeaAiInterpretation"');
    expect(rendered.html).toContain("生成智能解读");
    expect(rendered.html).toContain("总云量 %");
    expect(rendered.html).toContain("高云量 %");
    expect(rendered.html).toContain("中云量 %");
    expect(rendered.html).toContain("低云量 %");
    expectMarkersInOrder(rendered.html, [
      "CloudSeaTopResultHeader",
      "CloudSeaCoreMetrics",
      "CloudSeaNearTermWeather",
      "CloudSeaWindowCards",
      "CloudSeaProfessionalHourlyData",
      "CloudSeaDailyTrend",
      "CloudSeaReasoning",
      "CloudSeaActionPlan",
      "CloudSeaRiskSummary",
      "CloudSeaAiInterpretation",
    ]);
  });

  it("keeps missing layer values as dashes and never fills them from total cloud", () => {
    const { html } = renderCloudSeaFixture(
      cloudSeaRegressionFixture("genericMissingLayerDataCase"),
    );
    const professionalSection = sectionBetween(
      html,
      "CloudSeaProfessionalHourlyData",
      "CloudSeaDailyTrend",
    );

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
    const professionalSection = sectionBetween(
      html,
      "CloudSeaProfessionalHourlyData",
      "CloudSeaDailyTrend",
    );

    expect(viewModel.cloudBasisConsistency.cloudBasisLevel).toBe("mixed_basis");
    expect(viewModel.recommendationGuard.finalRecommendationLevel).toBe("cautious_reference");
    expect(professionalSection).toMatch(/data-professional-hourly-cell="cloud-total"[\s\S]*?20%/);
    expect(professionalSection).toMatch(/data-professional-hourly-cell="cloud-low"[^>]*>70%/);
    expect(professionalSection).toContain("口径需复核");
    expect(professionalSection).not.toContain("可拍窗口</span>");
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

  it("places Cloud Sea AI interpretation at the bottom and does not auto-run it", () => {
    const fixture = cloudSeaRegressionFixture("genericHighMountainGoodCloudSeaCase");
    const fetchMock = vi.fn(() => {
      throw new Error("Cloud Sea AI interpretation should be manual-trigger only");
    });
    vi.stubGlobal("fetch", fetchMock);

    try {
      const { html } = renderCloudSeaFixture(fixture);
      const aiSection = sectionAfter(html, "CloudSeaAiInterpretation");

      expect(fetchMock).not.toHaveBeenCalled();
      expect(html).toContain("生成智能解读");
      expectMarkersInOrder(html, [
        "CloudSeaProfessionalHourlyData",
        "CloudSeaReasoning",
        "CloudSeaActionPlan",
        "CloudSeaRiskSummary",
        "CloudSeaAiInterpretation",
        "智能解读",
      ]);
      expect(aiSection).not.toContain("CloudSeaProfessionalHourlyData");
      expect(aiSection).not.toContain("CloudSeaReasoning");
      expect(aiSection).not.toContain("CloudSeaActionPlan");
      expect(aiSection).not.toContain("CloudSeaRiskSummary");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("only calls the intelligent interpretation handler from the generate button", () => {
    const onGenerate = vi.fn();
    const element = AiExplanationPanel({
      status: "idle",
      explanation: null,
      errorMessage: "",
      retryable: false,
      onGenerate,
    });
    const onClick = firstOnClickHandler(element);

    expect(onGenerate).not.toHaveBeenCalled();
    expect(onClick).not.toBeNull();

    onClick?.();

    expect(onGenerate).toHaveBeenCalledTimes(1);
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

function expectMarkersInOrder(html: string, markers: readonly string[]) {
  let previous = -1;
  for (const marker of markers) {
    const current = html.indexOf(marker);
    expect(current, marker).toBeGreaterThan(previous);
    previous = current;
  }
}

function firstOnClickHandler(node: React.ReactNode): (() => void) | null {
  if (!React.isValidElement<{ children?: React.ReactNode; onClick?: () => void }>(node)) {
    return null;
  }
  if (typeof node.props.onClick === "function") {
    return node.props.onClick;
  }

  for (const child of React.Children.toArray(node.props.children)) {
    const handler = firstOnClickHandler(child);
    if (handler) {
      return handler;
    }
  }

  return null;
}
