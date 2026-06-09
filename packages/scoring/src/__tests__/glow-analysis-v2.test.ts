import { describe, expect, it } from "vitest";
import type {
  AstroSummary,
  ForecastCalculationInput,
  ForecastQueryInput,
  HorizonProfileSummary,
  NormalizedHourlyWeather,
  TerrainAnalysisSummary,
} from "@photo-weather/shared";
import { buildMockForecastInput, calculateForecast, calculateGlowAnalysis } from "../index.js";

const fixedNow = "2026-05-20T00:00:00+08:00";

const query: ForecastQueryInput = {
  name: "黄山光明顶",
  source: "local_photo_spot",
  latitudeGcj02: 30.13254,
  longitudeGcj02: 118.16876,
  latitudeWgs84: 30.13012,
  longitudeWgs84: 118.16389,
  horizon: "72h",
  target: "glow",
  elevationMeters: 1860,
  photoSpotId: "spot-guangmingding",
};

const dryRisk = {
  precipitationProbabilityPercent: 5,
  precipitationAmountMm: 0,
  rainRiskLevel: "none" as const,
  rainRiskLabelZh: "无明显降水",
  affectedWindows: [],
  recommendationZh: "窗口内降水不明显。",
};

const rainRisk = {
  precipitationProbabilityPercent: 90,
  precipitationAmountMm: 4,
  rainRiskLevel: "high" as const,
  rainRiskLabelZh: "高",
  affectedWindows: ["朝霞晚霞窗口"],
  recommendationZh: "降水可能打断拍摄窗口。",
};

const favorableGlowPatch: Partial<NormalizedHourlyWeather> = {
  cloudTotal: 58,
  cloudLow: 24,
  cloudMid: 44,
  cloudHigh: 52,
  humidity: 68,
  dewPointSpread: 6,
  precipitation: 0,
  precipitationAmountMm: 0,
  rainAmountMm: 0,
  snowAmountMm: 0,
  precipitationProbability: 5,
  precipitationRisk: dryRisk,
  visibility: 24,
  photographyTransparencyScore: 82,
  windSpeed: 2.6,
  windGust: 5,
  weatherTextZh: "多云",
  missingFields: [],
};

const activeRainPatch: Partial<NormalizedHourlyWeather> = {
  precipitation: 4,
  precipitationAmountMm: 4,
  rainAmountMm: 4,
  precipitationProbability: 90,
  precipitationRisk: rainRisk,
  visibility: 8,
  humidity: 92,
  weatherTextZh: "中雨",
};

function favorableGlowInput(): ForecastCalculationInput {
  return patchAllWeather(buildMockForecastInput(query, { now: fixedNow }), favorableGlowPatch);
}

function patchAllWeather(
  input: ForecastCalculationInput,
  patch: Partial<NormalizedHourlyWeather>,
): ForecastCalculationInput {
  return withHourlyWeather(input, (hour) => ({ ...hour, ...patch }));
}

function patchWeatherRange(
  input: ForecastCalculationInput,
  start: string,
  end: string,
  patch: Partial<NormalizedHourlyWeather>,
): ForecastCalculationInput {
  return withHourlyWeather(input, (hour) =>
    hourOverlaps(hour, start, end) ? { ...hour, ...patch } : hour,
  );
}

function withHourlyWeather(
  input: ForecastCalculationInput,
  mapper: (hour: NormalizedHourlyWeather) => NormalizedHourlyWeather,
): ForecastCalculationInput {
  return {
    ...input,
    hourlyWeather: input.hourlyWeather.map(mapper),
  };
}

function withHorizon(
  input: ForecastCalculationInput,
  horizonPatch: Partial<HorizonProfileSummary>,
  terrainPatch: Partial<TerrainAnalysisSummary["terrainProfile"]> = {},
): ForecastCalculationInput {
  return {
    ...input,
    terrainAnalysis: {
      ...input.terrainAnalysis,
      terrainProfile: {
        ...input.terrainAnalysis.terrainProfile,
        ...terrainPatch,
      },
      horizonProfile: {
        ...input.terrainAnalysis.horizonProfile,
        ...horizonPatch,
      },
    },
  };
}

function hourOverlaps(hour: NormalizedHourlyWeather, start: string, end: string): boolean {
  const hourStart = Date.parse(hour.time);
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  return Number.isFinite(hourStart) && hourStart < endMs && hourStart + 60 * 60 * 1000 > startMs;
}

function shiftMinutes(time: string, minutes: number): string {
  return new Date(Date.parse(time) + minutes * 60 * 1000).toISOString();
}

function firstAstro(input: ForecastCalculationInput): AstroSummary & {
  readonly sunrise: string;
  readonly sunset: string;
} {
  const astro = input.astroSummaries[0];
  if (!astro?.sunrise || !astro.sunset) {
    throw new Error("mock glow tests require sunrise and sunset");
  }
  return astro as AstroSummary & { readonly sunrise: string; readonly sunset: string };
}

function withFirstAstro(
  input: ForecastCalculationInput,
  patch: Partial<AstroSummary>,
): ForecastCalculationInput {
  return {
    ...input,
    astroSummaries: input.astroSummaries.map((astro, index) =>
      index === 0 ? { ...astro, ...patch } : astro,
    ),
  };
}

function firstAstroWithGlowGeometry(input: ForecastCalculationInput): AstroSummary & {
  readonly sunrise: string;
  readonly sunset: string;
  readonly sunriseGlowCandidateStartAt: string;
  readonly sunriseGlowCandidateEndAt: string;
  readonly sunriseGlowBestStartAt: string;
  readonly sunriseGlowBestEndAt: string;
  readonly sunsetGlowCandidateStartAt: string;
  readonly sunsetGlowCandidateEndAt: string;
  readonly sunsetGlowBestStartAt: string;
  readonly sunsetGlowBestEndAt: string;
} {
  const astro = firstAstro(input);
  if (
    !astro.sunriseGlowCandidateStartAt ||
    !astro.sunriseGlowCandidateEndAt ||
    !astro.sunriseGlowBestStartAt ||
    !astro.sunriseGlowBestEndAt ||
    !astro.sunsetGlowCandidateStartAt ||
    !astro.sunsetGlowCandidateEndAt ||
    !astro.sunsetGlowBestStartAt ||
    !astro.sunsetGlowBestEndAt
  ) {
    throw new Error("mock glow tests require solar-altitude glow geometry");
  }
  return astro as ReturnType<typeof firstAstro> & {
    readonly sunriseGlowCandidateStartAt: string;
    readonly sunriseGlowCandidateEndAt: string;
    readonly sunriseGlowBestStartAt: string;
    readonly sunriseGlowBestEndAt: string;
    readonly sunsetGlowCandidateStartAt: string;
    readonly sunsetGlowCandidateEndAt: string;
    readonly sunsetGlowBestStartAt: string;
    readonly sunsetGlowBestEndAt: string;
  };
}

function allGlowWindows(input: ForecastCalculationInput) {
  const analysis = calculateGlowAnalysis(input);
  return [
    ...analysis.bestGlowWindows,
    ...analysis.watchableGlowWindows,
    ...analysis.notRecommendedGlowWindows,
  ];
}

describe("glow analysis v2", () => {
  it("uses moderate high and mid cloud as color carriers", () => {
    const favorable = favorableGlowInput();
    const noCarrier = patchAllWeather(favorable, {
      cloudTotal: 6,
      cloudLow: 4,
      cloudMid: 0,
      cloudHigh: 0,
    });

    const favorableAnalysis = calculateGlowAnalysis(favorable);
    const noCarrierAnalysis = calculateGlowAnalysis(noCarrier);

    expect(favorableAnalysis.colorCarrierScore).toBeGreaterThan(
      noCarrierAnalysis.colorCarrierScore,
    );
    expect(favorableAnalysis.sunriseGlowScore).toBeGreaterThan(noCarrierAnalysis.sunriseGlowScore);
  });

  it("raises low cloud obstruction and lowers practical score when low cloud is excessive", () => {
    const openLowCloud = patchAllWeather(favorableGlowInput(), {
      cloudTotal: 58,
      cloudLow: 24,
    });
    const blockedLowCloud = patchAllWeather(favorableGlowInput(), {
      cloudTotal: 96,
      cloudLow: 92,
    });

    const open = calculateGlowAnalysis(openLowCloud);
    const blocked = calculateGlowAnalysis(blockedLowCloud);

    expect(blocked.lowCloudObstructionRisk).toBeGreaterThan(open.lowCloudObstructionRisk);
    expect(blocked.practicalGlowScore).toBeLessThan(open.practicalGlowScore);
  });

  it("penalizes total overcast even when cloud layers exist", () => {
    const favorable = favorableGlowInput();
    const overcast = patchAllWeather(favorable, {
      cloudTotal: 98,
      cloudLow: 88,
      cloudMid: 88,
      cloudHigh: 90,
    });

    expect(calculateGlowAnalysis(overcast).practicalGlowScore).toBeLessThan(
      calculateGlowAnalysis(favorable).practicalGlowScore,
    );
  });

  it("lowers the sunrise score when active rain overlaps the sunrise window", () => {
    const dry = favorableGlowInput();
    const { sunrise } = firstAstro(dry);
    const rainySunrise = patchWeatherRange(
      dry,
      shiftMinutes(sunrise, -20),
      shiftMinutes(sunrise, 20),
      activeRainPatch,
    );

    const dryAnalysis = calculateGlowAnalysis(dry);
    const rainyAnalysis = calculateGlowAnalysis(rainySunrise);

    expect(rainyAnalysis.rainOverlapsSunriseWindow).toBe(true);
    expect(rainyAnalysis.sunriseGlowScore).toBeLessThan(dryAnalysis.sunriseGlowScore);
  });

  it("detects a post-rain opening before sunset without marking sunset rain overlap", () => {
    const input = favorableGlowInput();
    const { sunset } = firstAstro(input);
    const postRainSunset = patchWeatherRange(
      input,
      shiftMinutes(sunset, -180),
      shiftMinutes(sunset, -150),
      activeRainPatch,
    );

    const analysis = calculateGlowAnalysis(postRainSunset);

    expect(analysis.rainOverlapsSunsetWindow).toBe(false);
    expect(["medium", "high"]).toContain(analysis.postRainOpeningChance);
  });

  it("does not over-penalize sunrise when rain starts after the morning glow windows", () => {
    const dry = favorableGlowInput();
    const { sunrise } = firstAstro(dry);
    const rainAfterWindow = patchWeatherRange(
      dry,
      shiftMinutes(sunrise, 150),
      shiftMinutes(sunrise, 240),
      activeRainPatch,
    );

    const dryAnalysis = calculateGlowAnalysis(dry);
    const laterRainAnalysis = calculateGlowAnalysis(rainAfterWindow);

    expect(laterRainAnalysis.rainOverlapsSunriseWindow).toBe(false);
    expect(laterRainAnalysis.sunriseGlowScore).toBeGreaterThanOrEqual(
      dryAnalysis.sunriseGlowScore - 5,
    );
  });

  it("builds deterministic solar-altitude morning and evening glow windows with timezone", () => {
    const input = favorableGlowInput();
    const astro = firstAstroWithGlowGeometry(input);
    const windows = allGlowWindows(input);
    const types = windows.map((window) => window.type);
    const sunriseWindow = windows.find(
      (window) => window.type === "sunrise_glow" && window.date === astro.date,
    );
    const sunsetWindow = windows.find(
      (window) => window.type === "sunset_glow" && window.date === astro.date,
    );

    expect(types).toEqual(expect.arrayContaining(["sunrise_glow", "sunset_glow"]));
    for (const legacyType of [
      "pre_dawn_glow",
      "sunrise_core",
      "morning_warm_light",
      "sunset_warm_light",
      "sunset_core",
      "afterglow",
    ]) {
      expect(types).not.toContain(legacyType);
    }
    expect(sunriseWindow).toBeDefined();
    expect(sunsetWindow).toBeDefined();
    if (!sunriseWindow || !sunsetWindow) {
      throw new Error("expected canonical sunrise and sunset glow windows");
    }
    expect(sunriseWindow.phase).toBe("sunrise");
    expect(sunsetWindow.phase).toBe("sunset");
    expect(sunriseWindow.start).toBe(astro.sunriseGlowBestStartAt);
    expect(sunriseWindow.end).toBe(astro.sunriseGlowBestEndAt);
    expect(sunsetWindow.start).toBe(astro.sunsetGlowBestStartAt);
    expect(sunsetWindow.end).toBe(astro.sunsetGlowBestEndAt);
    expect(Date.parse(sunriseWindow.end)).not.toBe(Date.parse(shiftMinutes(astro.sunrise, 75)));
    expect(Date.parse(sunsetWindow.start)).not.toBe(Date.parse(shiftMinutes(astro.sunset, -75)));
    expect(Date.parse(astro.sunriseGlowCandidateStartAt)).toBeLessThan(
      Date.parse(sunriseWindow.start),
    );
    expect(Date.parse(sunriseWindow.end)).toBeLessThan(Date.parse(astro.sunriseGlowCandidateEndAt));
    expect(Date.parse(astro.sunsetGlowCandidateStartAt)).toBeLessThan(
      Date.parse(sunsetWindow.start),
    );
    expect(Date.parse(sunsetWindow.end)).toBeLessThan(Date.parse(astro.sunsetGlowCandidateEndAt));
    expect(windows.every((window) => /[+-]\d{2}:\d{2}$/.test(window.start))).toBe(true);
    expect(windows.every((window) => /[+-]\d{2}:\d{2}$/.test(window.end))).toBe(true);
  });

  it("does not promote old sunrise +75 or sunset -75 fixed offsets as public glow", () => {
    const input = withFirstAstro(favorableGlowInput(), {
      sunrise: "2026-05-20T05:17:00+08:00",
      sunriseGlowCandidateStartAt: "2026-05-20T04:50:00+08:00",
      sunriseGlowCandidateEndAt: "2026-05-20T05:31:00+08:00",
      sunriseGlowBestStartAt: "2026-05-20T05:00:00+08:00",
      sunriseGlowBestEndAt: "2026-05-20T05:24:00+08:00",
      sunset: "2026-05-20T19:37:00+08:00",
      sunsetGlowCandidateStartAt: "2026-05-20T19:23:00+08:00",
      sunsetGlowCandidateEndAt: "2026-05-20T20:10:00+08:00",
      sunsetGlowBestStartAt: "2026-05-20T19:30:00+08:00",
      sunsetGlowBestEndAt: "2026-05-20T19:55:00+08:00",
    });
    const analysis = calculateGlowAnalysis(input);
    const windows = [
      ...analysis.bestGlowWindows,
      ...analysis.watchableGlowWindows,
      ...analysis.notRecommendedGlowWindows,
    ];
    const sunriseWindow = windows.find((window) => window.type === "sunrise_glow");
    const sunsetWindow = windows.find((window) => window.type === "sunset_glow");

    expect(windows.some((window) => window.type === "morning_warm_light")).toBe(false);
    expect(windows.some((window) => window.type === "sunset_warm_light")).toBe(false);
    expect(sunriseWindow).toBeDefined();
    expect(sunsetWindow).toBeDefined();
    if (!sunriseWindow || !sunsetWindow) {
      throw new Error("expected canonical glow windows");
    }
    expect(Date.parse(sunriseWindow.start)).not.toBe(Date.parse("2026-05-20T05:17:00+08:00"));
    expect(Date.parse(sunriseWindow.end)).not.toBe(Date.parse("2026-05-20T06:32:00+08:00"));
    expect(Date.parse(sunsetWindow.start)).not.toBe(Date.parse("2026-05-20T18:22:00+08:00"));
    expect(Date.parse(sunsetWindow.end)).not.toBe(Date.parse("2026-05-20T19:37:00+08:00"));
    expect(analysis.sunriseGlowWindow?.eventAt).toBe("2026-05-20T05:17:00+08:00");
    expect(analysis.sunriseGlowWindow?.bestStartAt).toBe("2026-05-20T05:00:00+08:00");
    expect(analysis.sunsetGlowWindow?.eventAt).toBe("2026-05-20T19:37:00+08:00");
    expect(analysis.sunsetGlowWindow?.bestStartAt).toBe("2026-05-20T19:30:00+08:00");
  });

  it("never classifies a 19:00 evening glow window as morning glow", () => {
    const result = calculateForecast(favorableGlowInput());
    const eveningWindow = result.bestWindows.find(
      (window) =>
        window.target === "glow" &&
        Date.parse(window.startTime) <= Date.parse("2026-05-20T19:00:00+08:00") &&
        Date.parse(window.endTime) >= Date.parse("2026-05-20T19:00:00+08:00"),
    );

    expect(eveningWindow?.label).not.toContain("朝霞");
    expect(eveningWindow?.lightPhase).toBe("sunset");
  });

  it("applies east obstruction to sunrise and west obstruction to sunset", () => {
    const open = favorableGlowInput();
    const eastBlocked = withHorizon(open, {
      sunriseHorizonAngle: 18,
      blockedDirectionsZh: ["东"],
    });
    const westBlocked = withHorizon(open, {
      sunsetHorizonAngle: 18,
      blockedDirectionsZh: ["西"],
    });

    expect(calculateGlowAnalysis(eastBlocked).sunriseGlowScore).toBeLessThan(
      calculateGlowAnalysis(open).sunriseGlowScore,
    );
    expect(calculateGlowAnalysis(westBlocked).sunsetGlowScore).toBeLessThan(
      calculateGlowAnalysis(open).sunsetGlowScore,
    );
  });

  it("lowers confidence for unknown terrain without inventing obstruction", () => {
    const open = favorableGlowInput();
    const unknownTerrain = withHorizon(
      open,
      {
        sunriseHorizonAngle: undefined,
        sunsetHorizonAngle: undefined,
        blockedDirectionsZh: [],
      },
      {
        elevationConfidence: "low",
        viewingDirection: "unknown",
      },
    );

    const openAnalysis = calculateGlowAnalysis(open);
    const unknownAnalysis = calculateGlowAnalysis(unknownTerrain);

    expect(unknownAnalysis.confidence).toBeLessThan(openAnalysis.confidence);
    expect(unknownAnalysis.lowCloudObstructionRisk).toBeLessThan(70);
  });

  it("returns no high-certainty glow window when nothing is shootable", () => {
    const blocked = patchAllWeather(favorableGlowInput(), {
      cloudTotal: 99,
      cloudLow: 94,
      cloudMid: 4,
      cloudHigh: 4,
      visibility: 2,
      humidity: 98,
      precipitation: 5,
      precipitationAmountMm: 5,
      rainAmountMm: 5,
      precipitationProbability: 95,
      precipitationRisk: rainRisk,
      weatherTextZh: "大雨",
    });

    const analysis = calculateGlowAnalysis(blocked);

    expect(analysis.bestGlowWindow).toBeUndefined();
    expect(analysis.bestGlowWindows).toHaveLength(0);
    expect(analysis.labels.bestWindowLabel).toBe("暂无高确定性霞光窗口");
  });

  it("does not recommend glow when only the sun time exists but carrier clouds are weak", () => {
    const clearSky = patchAllWeather(favorableGlowInput(), {
      cloudTotal: 4,
      cloudLow: 2,
      cloudMid: 0,
      cloudHigh: 0,
      visibility: 26,
      photographyTransparencyScore: 82,
      precipitation: 0,
      precipitationAmountMm: 0,
      precipitationProbability: 0,
      weatherTextZh: "晴",
    });

    const analysis = calculateGlowAnalysis(clearSky);

    expect(analysis.bestGlowWindows).toHaveLength(0);
    expect(analysis.recommendationLabel).not.toBe("推荐重点关注");
    expect(analysis.labels.bestWindowLabel).toBe("暂无高确定性霞光窗口");
  });

  it("downgrades sunset glow when rain overlaps the sunset window", () => {
    const dry = favorableGlowInput();
    const { sunset } = firstAstro(dry);
    const rainySunset = patchWeatherRange(
      dry,
      shiftMinutes(sunset, -90),
      shiftMinutes(sunset, 25),
      activeRainPatch,
    );

    const analysis = calculateGlowAnalysis(rainySunset);

    expect(analysis.rainOverlapsSunsetWindow).toBe(true);
    expect(
      analysis.bestGlowWindows.find(
        (window) => window.date === firstAstro(dry).date && window.type.startsWith("sunset"),
      ),
    ).toBeUndefined();
    expect(
      analysis.watchableGlowWindows.concat(analysis.notRecommendedGlowWindows).length,
    ).toBeGreaterThan(0);
  });

  it("can recommend glow when mid and high cloud support is strong and low cloud stays open", () => {
    const analysis = calculateGlowAnalysis(favorableGlowInput());

    expect(analysis.bestGlowWindows.length).toBeGreaterThan(0);
    expect(analysis.colorCarrierScore).toBeGreaterThanOrEqual(55);
    expect(analysis.lowCloudObstructionRisk).toBeLessThan(76);
    expect(analysis.glowWindowRainRisk).toBe("low");
  });

  it("allows a shootable evening glow window to become the best window", () => {
    const poorBase = patchAllWeather(favorableGlowInput(), {
      cloudTotal: 6,
      cloudLow: 4,
      cloudMid: 0,
      cloudHigh: 0,
      visibility: 18,
    });
    const { sunset } = firstAstro(poorBase);
    const eveningOnly = patchWeatherRange(
      poorBase,
      shiftMinutes(sunset, -90),
      shiftMinutes(sunset, 50),
      favorableGlowPatch,
    );

    const analysis = calculateGlowAnalysis(eveningOnly);

    expect(analysis.bestGlowWindow?.type).toBe("sunset_glow");
    expect(analysis.sunsetGlowScore).toBeGreaterThan(analysis.sunriseGlowScore);
  });

  it("keeps missing aerosol unavailable instead of treating it as clean air", () => {
    const input = patchAllWeather(favorableGlowInput(), {
      aerosolOpticalDepth550: undefined,
      pm25: undefined,
      pm10: undefined,
      dust: undefined,
      aerosolAvailability: undefined,
    });

    const analysis = calculateGlowAnalysis(input);

    expect(analysis.aerosolAssessment.availability).toBe("unavailable");
    expect(analysis.aerosolAssessment.scoreImpact).toBe(0);
    expect(analysis.bestGlowWindows.some((window) => window.aerosolScore === 0)).toBe(false);
  });

  it("penalizes excessive aerosol and particulate without making moderate scatter negative", () => {
    const moderate = patchAllWeather(favorableGlowInput(), {
      aerosolOpticalDepth550: 0.12,
      pm25: 16,
      pm10: 30,
      dust: 8,
      aerosolAvailability: "available",
      aerosolConfidence: "high",
    });
    const hazy = patchAllWeather(favorableGlowInput(), {
      aerosolOpticalDepth550: 0.72,
      pm25: 88,
      pm10: 180,
      dust: 130,
      aerosolAvailability: "available",
      aerosolConfidence: "high",
    });

    const moderateAnalysis = calculateGlowAnalysis(moderate);
    const hazyAnalysis = calculateGlowAnalysis(hazy);

    expect(moderateAnalysis.aerosolAssessment.state).toBe("favorable_scatter");
    expect(moderateAnalysis.aerosolAssessment.scoreImpact).toBeGreaterThanOrEqual(0);
    expect(hazyAnalysis.aerosolAssessment.state).toBe("dusty");
    expect(hazyAnalysis.aerosolAssessment.scoreImpact).toBeLessThan(0);
    expect(hazyAnalysis.practicalGlowScore).toBeLessThan(moderateAnalysis.practicalGlowScore);
  });

  it("marks terrain obstruction unavailable when only single-point terrain evidence exists", () => {
    const input = withHorizon(
      favorableGlowInput(),
      {
        sunriseHorizonAngle: 4,
        sunsetHorizonAngle: 4,
        blockedDirectionsZh: [],
        obstructionNoteZh: "",
      },
      {
        localReliefMeters: null,
        elevationDiff5km: null,
        minElevation1km: null,
        minElevation3km: null,
        maxElevation5km: null,
      },
    );

    const analysis = calculateGlowAnalysis(input);

    expect(analysis.terrainObstructionAssessments.length).toBeGreaterThan(0);
    expect(analysis.terrainObstructionAssessments.every((item) => !item.dataAvailable)).toBe(true);
    expect(
      analysis.terrainObstructionAssessments.every(
        (item) => item.obstructionStatus === "unavailable",
      ),
    ).toBe(true);
  });
});
