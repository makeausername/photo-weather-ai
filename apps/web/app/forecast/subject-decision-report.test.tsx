import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ForecastCalculationResult, ForecastQueryInput } from "@photo-weather/shared";
import { buildMockForecastInput, calculateForecast } from "../../../../packages/scoring/src/index";
import { cloudSeaRegressionFixture } from "./__tests__/fixtures/cloudSeaRegressionFixtures";
import {
  buildAstroForecastViewModel,
  buildCloudSeaForecastViewModel,
  buildGlowForecastViewModel,
} from "./forecast-result-view-model";
import {
  buildAstroDecisionReport,
  buildCloudSeaDecisionReport,
  buildGlowDecisionReport,
  type SubjectReportTarget,
} from "./subject-decision-report";
import {
  AstroResultPage,
  CloudSeaResultPage,
  ForecastResultView,
  GlowResultPage,
} from "./forecast-result-client";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const fixture = cloudSeaRegressionFixture("genericHighMountainGoodCloudSeaCase");
function query(
  target: SubjectReportTarget,
  horizon: ForecastQueryInput["horizon"] = "48h",
): ForecastQueryInput {
  return { ...fixture.query, target, horizon };
}
function forecast(
  target: SubjectReportTarget,
  horizon: ForecastQueryInput["horizon"] = "48h",
): ForecastCalculationResult {
  const result =
    target === "cloud_sea"
      ? fixture.result
      : calculateForecast(
          buildMockForecastInput(query(target, horizon), { now: "2026-10-06T08:00:00+08:00" }),
        );
  return {
    ...result,
    target,
    isMock: false,
    weatherDataMode: "real",
    weatherEvidenceStatus: "sufficient",
    weatherDataFreshness: "fresh",
    decisionMode: "strong_go",
    finalRecommendationLevel: "recommended",
    riskFlags: [],
    weatherFusionSummary: undefined,
  };
}
function report(result: ForecastCalculationResult) {
  if (result.target === "cloud_sea")
    return buildCloudSeaDecisionReport(result, buildCloudSeaForecastViewModel(result));
  if (result.target === "glow")
    return buildGlowDecisionReport(result, buildGlowForecastViewModel(result));
  return buildAstroDecisionReport(result, buildAstroForecastViewModel(result));
}

describe("subject decision reports", () => {
  it.each(["cloud_sea", "glow", "astro"] as const)(
    "renders %s as an immediate decision without metrics or hidden hourly panels",
    (target) => {
      const result = forecast(target);
      const html = renderToStaticMarkup(
        <ForecastResultView query={query(target)} result={result} />,
      );
      expect(html).toContain(`data-subject-decision-report="${target}"`);
      expect(html).toContain("这趟值不值得去");
      expect(html).toContain("什么时候拍");
      expect(html).toContain("到场安排");
      expect(html).not.toMatch(
        /<table|role="tablist"|专业小时|专业数据|data-professional-hourly|评分|\d+(?:\.\d+)?%/,
      );
      expect(html).not.toMatch(/raw JSON|API key|latitude|longitude|checksum|calibrationMode/);
      expect(html).not.toMatch(
        /QWeather|Open-Meteo|meteoblue|Copernicus|DEM|SQM|mag\/arcsec|官方认证|国家标准/,
      );
    },
  );

  for (const target of ["cloud_sea", "glow", "astro"] as const) {
    it.each(["mock", "stale", "insufficient", "old-evidence"])(
      `blocks ${target} travel advice for %s evidence including direct page rendering`,
      (state) => {
        const result: ForecastCalculationResult = {
          ...forecast(target),
          isMock: state === "mock",
          weatherDataFreshness: state === "stale" ? "stale" : "fresh",
          weatherEvidenceStatus:
            state === "insufficient"
              ? "insufficient"
              : state === "old-evidence"
                ? "stale"
                : "sufficient",
        };
        const value = report(result);
        expect(value.verdict).toBe("资料不足，暂不安排专程");
        expect(value.dates).toHaveLength(0);
        expect(value.timing).toContain("待确认");
        const element =
          target === "cloud_sea" ? (
            <CloudSeaResultPage
              query={query(target)}
              result={result}
              viewModel={buildCloudSeaForecastViewModel(result)}
            />
          ) : target === "glow" ? (
            <GlowResultPage
              query={query(target)}
              result={result}
              viewModel={buildGlowForecastViewModel(result)}
            />
          ) : (
            <AstroResultPage
              query={query(target)}
              result={result}
              viewModel={buildAstroForecastViewModel(result)}
            />
          );
        const html = renderToStaticMarkup(element);
        expect(html).toContain(value.verdict);
        expect(html).not.toMatch(/重点守候|强推荐专程|推荐前往/);
      },
    );
    it.each(["not_recommended", "wait_for_update", "data_insufficient"] as const)(
      `does not promote ${target} when the overall decision is %s`,
      (decisionMode) => {
        const value = report({ ...forecast(target), decisionMode });
        expect(value.verdict).not.toMatch(/强推荐|推荐前往|值得专程/);
        expect(value.timing).toContain("待复核");
        expect(value.arrival).toContain("暂不");
        expect(value.dates.flatMap((d) => d.lines).join(" ")).not.toMatch(
          /(?<!不)(?:强推荐专程|值得专程|推荐前往)/,
        );
      },
    );
  }

  it("keeps lowland fog distinct from mountaintop cloud-sea photography", () => {
    const low = {
      ...cloudSeaRegressionFixture("genericLowElevationWeakCloudSeaCase").result,
      weatherDataMode: "real" as const,
    };
    const value = buildCloudSeaDecisionReport(low, buildCloudSeaForecastViewModel(low));
    expect(value.title).toContain("低云/晨雾");
    expect(value.shooting.lines.join(" ")).toContain("前景");
    expect(value.shooting.lines.join(" ")).not.toContain("先确认机位高于云层");
    expect(value.arrival).toContain("不为参考窗口专程");
    const mountain = report(forecast("cloud_sea"));
    expect(mountain.shooting.lines.join(" ")).toContain("机位高于云层");
    expect(mountain.risks.title).toContain("白墙");
  });

  it("retains cloud inconsistency and serious weather risks in plain language", () => {
    const result = {
      ...cloudSeaRegressionFixture("genericCloudBasisMismatchCase").result,
      weatherDataMode: "real" as const,
    };
    const value = report({
      ...result,
      riskFlags: [
        { key: "wind", label: "大风", level: "high", description: "山脊阵风强，停止等待" },
      ],
    });
    expect(value.verdict).toContain("复核");
    expect(value.caution).toContain("云量口径不一致");
    expect(value.risks.lines).toContain("山脊阵风强，停止等待");
  });

  it("distinguishes ended sunrise, future sunset and uncovered dates without fake zero probabilities", () => {
    const result = forecast("glow");
    const vm = buildGlowForecastViewModel(result);
    const value = buildGlowDecisionReport(result, vm);
    expect(value.dates[0]!.lines[0]).toContain("窗口已结束");
    expect(value.dates[0]!.lines[1]).toContain(vm.dailyOpportunities[0]!.sunset.timeLabel);
    expect(value.dates.at(-1)!.lines.join(" ")).toContain("超出本次预报范围");
    expect(JSON.stringify(value)).not.toMatch(/0%|评分/);
  });

  it.each(["朝霞", "晚霞"] as const)(
    "provides %s direction, exact selected date and arrival plan",
    (preferredTarget) => {
      const result = forecast("glow");
      const base = buildGlowForecastViewModel(result);
      const vm = {
        ...base,
        overallRecommendation: {
          ...base.overallRecommendation,
          preferredTarget,
          hasActionableWindow: true,
          recommendation: "推荐前往" as const,
          preferredDate: "10月7日",
          preferredWindow: "17:40–18:05",
          arrivalAdvice: "17:10 前到场",
        },
      };
      const value = buildGlowDecisionReport(result, vm);
      expect(value.verdict).toBe(`${preferredTarget} · 推荐前往`);
      expect(value.timing).toBe("10月7日 17:40–18:05");
      expect(value.arrival).toBe("17:10 前到场");
      expect(value.shooting.lines[0]).toContain(preferredTarget === "朝霞" ? "东侧" : "西侧");
      expect(value.shooting.lines.join(" ")).toContain("包围曝光");
    },
  );

  it("does not schedule a glow trip after all actionable windows are gone", () => {
    const result = forecast("glow");
    const vm = buildGlowForecastViewModel(result);
    const value = buildGlowDecisionReport(result, {
      ...vm,
      overallRecommendation: {
        ...vm.overallRecommendation,
        hasActionableWindow: false,
        preferredWindow: "过期窗口",
      },
    });
    expect(value.verdict).toContain("暂不");
    expect(value.timing).not.toContain("过期窗口");
    expect(value.arrival).toContain("先不安排");
  });

  it("uses the subject decision when reusing a general report, but still rejects stale evidence", () => {
    const source = forecast("glow");
    const base = buildGlowForecastViewModel(source);
    const vm = {
      ...base,
      overallRecommendation: {
        ...base.overallRecommendation,
        preferredTarget: "晚霞" as const,
        hasActionableWindow: true,
        recommendation: "推荐前往" as const,
      },
    };
    const result = {
      ...source,
      target: "general" as const,
      decisionMode: "not_recommended" as const,
      finalRecommendationLevel: "not_recommended" as const,
    };
    expect(buildGlowDecisionReport(result, vm).verdict).toBe("晚霞 · 推荐前往");
    expect(buildGlowDecisionReport({ ...result, weatherDataFreshness: "stale" }, vm).verdict).toBe(
      "资料不足，暂不安排专程",
    );
  });

  it("uses terrain for the selected sunset instead of the first sunrise or another date", () => {
    const result = forecast("glow");
    const base = buildGlowForecastViewModel(result);
    const card = base.terrainObstructionCards[0]!;
    const vm = {
      ...base,
      overallRecommendation: {
        ...base.overallRecommendation,
        preferredTarget: "晚霞" as const,
        windowStartAt: "2026-10-07T10:00:00Z",
      },
      terrainObstructionCards: [
        { ...card, key: "2026-10-06-sunset", detail: "另一日遮挡" },
        { ...card, key: "2026-10-07-sunrise", detail: "朝霞方向遮挡" },
        { ...card, key: "2026-10-07-sunset", detail: "所选晚霞方向需避开山脊" },
      ],
    };
    const text = buildGlowDecisionReport(result, vm).shooting.lines.join(" ");
    expect(text).toContain("所选晚霞方向需避开山脊");
    expect(text).not.toMatch(/另一日遮挡|朝霞方向遮挡/);
  });

  it("preserves the return link to the originating weather overview", () => {
    const result = forecast("cloud_sea");
    const html = renderToStaticMarkup(
      <CloudSeaResultPage
        query={query("cloud_sea")}
        result={result}
        viewModel={buildCloudSeaForecastViewModel(result)}
        returnUrl="/forecast?target=general"
      />,
    );
    expect(html).toContain('href="/forecast?target=general"');
    expect(html).toContain("返回天气概览");
  });

  it("keeps every linked night on its own conclusion, direction, moon and window", () => {
    const result = forecast("astro");
    const base = buildAstroForecastViewModel(result);
    const best = {
      ...base.nightlyCards[0]!,
      conciseReason: "另一夜理由",
      bestShootingWindowLabel: "另一夜窗口",
      directionSummaryLabel: "另一夜方向",
    };
    const selected = {
      ...base.nightlyCards[1]!,
      conciseReason: "本夜云层遮挡",
      bestShootingWindowLabel: "本夜窗口",
      directionSummaryLabel: "本夜方向",
      recommendationLabel: "不建议前往",
      actionNote: "本夜不安排赶场",
      moon: { ...base.nightlyCards[1]!.moon, moonlightInterferenceLevel: "本夜月光强" },
    };
    const vm = { ...base, bestNight: best, nightlyCards: [best, selected] };
    const value = buildAstroDecisionReport(result, vm, selected.localEveningDate);
    expect(value.verdict).toBe("不建议前往");
    expect(value.reason).toBe("本夜云层遮挡");
    expect(value.timing).toContain("本夜窗口");
    expect(value.arrival).toBe("本夜不安排赶场");
    expect(value.dates).toHaveLength(1);
    expect(value.shooting.lines.join(" ")).toContain("本夜方向");
    expect(value.dates[0]!.lines.join(" ")).toContain("本夜月光强");
    expect(JSON.stringify(value)).not.toContain("另一夜");
    const missing = buildAstroDecisionReport(result, vm, "2026-12-31");
    expect(missing.verdict).toContain("资料不足");
    expect(missing.dates).toHaveLength(0);
    expect(JSON.stringify(missing)).not.toContain("另一夜");
  });

  it.each(["24h", "48h", "72h", "7d"] as const)(
    "keeps %s astro nights visible with partial coverage and subject-specific advice",
    (horizon) => {
      const result = forecast("astro", horizon);
      const vm = buildAstroForecastViewModel(result);
      const value = buildAstroDecisionReport(result, vm);
      expect(value.dates).toHaveLength(vm.nightlyCards.length);
      for (const night of vm.nightlyCards)
        expect(value.dates.some((d) => d.title === night.localEveningDateLabel)).toBe(true);
      expect(value.shooting.lines.join(" ")).toContain("手动对焦");
      expect(value.shooting.lines.join(" ")).toContain("光污染");
      expect(value.risks.lines.join(" ")).toContain("结露");
      expect(JSON.stringify(value)).not.toMatch(/\d+(?:\.\d+)?%|高度\s*[\d.]+°/);
    },
  );
});
