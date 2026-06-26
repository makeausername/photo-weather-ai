import { describe, expect, it } from "vitest";
import type {
  AstroAnalysisResult,
  CloudSeaAnalysisResult,
  ForecastCalculationInput,
  ForecastDecisionConvergenceResult,
  ForecastQueryInput,
  ForecastRiskFlag,
  ForecastTarget,
  ForecastTimeWindow,
  GlowAnalysisResult,
  HorizonProfileSummary,
  TerrainHorizonDirectionSample,
  WeatherFusionSummary,
} from "@photo-weather/shared";
import { buildMockForecastInput, calculateForecast, convergeForecastDecision } from "../index.js";

const fixedNow = "2026-05-20T00:00:00+08:00";

const query: ForecastQueryInput = {
  name: "黄山光明顶",
  source: "local_photo_spot",
  latitudeGcj02: 30.13254,
  longitudeGcj02: 118.16876,
  latitudeWgs84: 30.13012,
  longitudeWgs84: 118.16389,
  horizon: "48h",
  target: "glow",
  locationId: "location-huangshan",
  photoSpotId: "spot-guangmingding",
};

type ConvergenceOverrides = {
  readonly input?: (input: ForecastCalculationInput) => ForecastCalculationInput;
  readonly baseOverallScore?: number;
  readonly cloudSeaAnalysis?: Partial<CloudSeaAnalysisResult>;
  readonly glowAnalysis?: Partial<GlowAnalysisResult>;
  readonly astroAnalysis?: Partial<AstroAnalysisResult>;
  readonly riskFlags?: readonly ForecastRiskFlag[];
  readonly bestWindows?: readonly ForecastTimeWindow[];
};

function convergeForTarget(
  target: ForecastTarget,
  overrides: ConvergenceOverrides = {},
): ForecastDecisionConvergenceResult {
  const baseInput = reliableInput(buildMockForecastInput({ ...query, target }, { now: fixedNow }));
  const baseResult = calculateForecast(baseInput);
  const input = overrides.input ? overrides.input(baseInput) : baseInput;

  return convergeForecastDecision({
    input,
    target,
    baseOverallScore: overrides.baseOverallScore ?? 86,
    baseRecommendationLevel: "recommended",
    baseRecommendationLabel: "强推荐",
    scores: baseResult.scores,
    cloudSeaAnalysis: {
      ...baseResult.cloudSeaAnalysis,
      ...overrides.cloudSeaAnalysis,
    } as CloudSeaAnalysisResult,
    glowAnalysis: {
      ...baseResult.glowAnalysis,
      ...overrides.glowAnalysis,
    } as GlowAnalysisResult,
    astroAnalysis: {
      ...baseResult.astroAnalysis,
      ...overrides.astroAnalysis,
    } as AstroAnalysisResult,
    riskFlags: overrides.riskFlags ?? [],
    bestWindows: overrides.bestWindows ?? [bestWindow(target)],
  });
}

function reliableInput(input: ForecastCalculationInput): ForecastCalculationInput {
  return {
    ...input,
    isMock: false,
    weatherDataMode: "real",
    weatherFusionSummary: reliableFusionSummary(),
  };
}

function reliableFusionSummary(
  patch: Partial<WeatherFusionSummary> = {},
): WeatherFusionSummary {
  return {
    primarySource: "primary",
    auxiliarySources: [],
    professionalSourceStatus: "available",
    confidenceLevel: "high",
    confidenceByTarget: {
      general: 0.84,
      cloud_sea: 0.84,
      glow: 0.84,
      astro: 0.84,
    },
    conflictStatusZh: "无明显冲突",
    dataStatusZh: "关键字段可用",
    ...patch,
  };
}

function withFusionSummary(
  input: ForecastCalculationInput,
  patch: Partial<WeatherFusionSummary>,
): ForecastCalculationInput {
  return {
    ...input,
    weatherFusionSummary: reliableFusionSummary(patch),
  };
}

function bestWindow(target: ForecastTarget): ForecastTimeWindow {
  return {
    label: "可执行窗口",
    date: "2026-05-20",
    startTime: "2026-05-20T18:00:00+08:00",
    endTime: "2026-05-20T20:00:00+08:00",
    score: 86,
    target,
    windowLevel: "best",
    executableForDedicatedTrip: true,
  };
}

function highRiskFlag(key: string): ForecastRiskFlag {
  return {
    key,
    label: key,
    level: "high",
    description: `${key} risk`,
  };
}

function withHorizon(
  input: ForecastCalculationInput,
  horizonPatch: Partial<HorizonProfileSummary>,
): ForecastCalculationInput {
  return {
    ...input,
    terrainAnalysis: {
      ...input.terrainAnalysis,
      horizonProfile: {
        ...input.terrainAnalysis.horizonProfile,
        ...horizonPatch,
      },
    },
  };
}

function withGlowTerrain(
  input: ForecastCalculationInput,
  sunrise: NonNullable<TerrainHorizonDirectionSample["obstructionLevel"]>,
  sunset: NonNullable<TerrainHorizonDirectionSample["obstructionLevel"]>,
): ForecastCalculationInput {
  return withHorizon(input, {
    sunriseHorizonAngle: undefined,
    sunsetHorizonAngle: undefined,
    directionSamples: [terrainSample("sunrise", sunrise), terrainSample("sunset", sunset)],
  });
}

function terrainSample(
  phase: "sunrise" | "sunset",
  obstructionLevel: NonNullable<TerrainHorizonDirectionSample["obstructionLevel"]>,
): TerrainHorizonDirectionSample {
  const targetAltitudeDegrees = 1;
  const horizonAltitudeDegrees =
    obstructionLevel === "clear" ? -2 : obstructionLevel === "marginal" ? 0.8 : 5;

  return {
    target: phase,
    azimuthDegrees: phase === "sunrise" ? 67 : 293,
    targetAltitudeDegrees,
    horizonAltitudeDegrees,
    obstructionClearanceDegrees: Number(
      (targetAltitudeDegrees - horizonAltitudeDegrees).toFixed(1),
    ),
    obstructionLevel,
    dataSource: "dem_raster",
    dataSourceLabelZh: "方向地形剖面",
    confidence: "high",
    sampleCount: 120,
    validSampleCount: 120,
    sourceWindowKey: `${phase}:2026-05-20:test`,
    sourceDate: "2026-05-20",
    sourcePhase: phase,
    lightPathRole: phase === "sunrise" ? "sunrise_low_angle" : "sunset_low_angle",
  };
}

describe("forecast decision convergence", () => {
  it("caps blocked glow light paths below a strong trip decision", () => {
    const result = convergeForTarget("glow", {
      input: (input) => withGlowTerrain(input, "obstructed", "obstructed"),
      glowAnalysis: {
        glowLightPathObstructionRisk: 88,
      },
    });

    expect(result.appliedCaps).toContain("glow_light_path");
    expect(result.decisionMode).toBe("not_recommended");
    expect(result.finalScore).toBeLessThanOrEqual(48);
    expect(result.finalScore).toBeLessThanOrEqual(86);
  });

  it("does not let clear terrain raise the base score", () => {
    const result = convergeForTarget("glow", {
      baseOverallScore: 72,
      input: (input) => withGlowTerrain(input, "clear", "clear"),
      glowAnalysis: {
        glowLightPathDataAvailability: "available",
        glowLightPathObstructionRisk: 8,
        lowCloudObstructionRisk: 12,
        cloudSuppressionRisk: 10,
        precipitationDisruptionRisk: 0,
      },
    });

    expect(result.finalScore).toBeLessThanOrEqual(72);
    expect(result.appliedCaps).not.toContain("terrain_unavailable");
    expect(result.appliedCaps).not.toContain("glow_light_path");
    expect(result.appliedCaps).not.toContain("glow_light_path_marginal");
  });

  it("caps marginal glow terrain when other sky risks are present", () => {
    const result = convergeForTarget("glow", {
      input: (input) => withGlowTerrain(input, "marginal", "clear"),
      glowAnalysis: {
        glowLightPathDataAvailability: "available",
        glowLightPathObstructionRisk: 42,
        lowCloudObstructionRisk: 61,
      },
    });

    expect(result.appliedCaps).toContain("glow_light_path_marginal");
    expect(result.decisionMode).toBe("nearby_watch");
    expect(result.finalScore).toBeLessThanOrEqual(64);
  });

  it("caps high transparency penalties without exposing provider or model internals", () => {
    const result = convergeForTarget("glow", {
      input: (input) =>
        withGlowTerrain(
          withFusionSummary(input, {
            transparencyPenaltyByTarget: {
              glow: 0.18,
            },
          }),
          "clear",
          "clear",
        ),
      glowAnalysis: {
        glowLightPathDataAvailability: "available",
        glowLightPathObstructionRisk: 8,
        lowCloudObstructionRisk: 12,
        cloudSuppressionRisk: 10,
        precipitationDisruptionRisk: 0,
      },
    });

    expect(result.appliedCaps).toContain("transparency");
    expect(result.decisionMode).toBe("nearby_watch");
    expect(result.finalScore).toBeLessThanOrEqual(62);
    expectPublicDecisionCopyHasNoInternals(result);
  });

  it("downgrades high model disagreement with low target confidence", () => {
    const result = convergeForTarget("glow", {
      input: (input) =>
        withFusionSummary(input, {
          confidenceLevel: "low",
          confidenceByTarget: {
            glow: 0.42,
          },
          multiSourceAgreementContext: {
            agreementLevel: "low",
            disagreementLevel: "high",
            fieldDisagreements: [],
            keyWarningsZh: [],
            userSummaryZh: "模型分歧较大",
            professionalSummaryZh: "模型分歧较大",
            shouldLowerConfidence: true,
            shouldShowReviewWarning: true,
          },
          multiModelConsensusDiagnostics: {
            multiModelConsensusHours: 12,
            multiModelConsensusFields: ["cloudTotal"],
            multiModelHighSpreadHours: 4,
            multiModelCloudSpreadMax: 48,
            multiModelLowCloudSpreadMax: 38,
            multiModelVisibilitySpreadMax: null,
            multiModelConfidencePenaltyByTarget: {
              glow: 0.18,
            },
          },
        }),
    });

    expect(result.appliedCaps).toContain("multi_model");
    expect(result.decisionConfidence).toBe("low");
    expect(result.decisionMode).not.toBe("strong_go");
    expect(result.finalScore).toBeLessThanOrEqual(64);
  });

  it("caps cloud sea whiteout risk before public recommendation labels", () => {
    const result = convergeForTarget("cloud_sea", {
      cloudSeaAnalysis: {
        whiteoutRiskScore: 84,
      },
    });

    expect(result.appliedCaps).toContain("cloud_sea_whiteout");
    expect(result.decisionMode).toBe("not_recommended");
    expect(result.finalScore).toBeLessThanOrEqual(46);
  });

  it("treats missing terrain clearance as uncertainty, not as clear sky", () => {
    const result = convergeForTarget("astro", {
      astroAnalysis: {
        terrainHorizonAssessment: undefined,
      },
    });

    expect(result.appliedCaps).toContain("terrain_unavailable");
    expect(result.decisionMode).toBe("data_insufficient");
    expect(result.decisionConfidence).toBe("low");
    expect(result.finalScore).toBeLessThanOrEqual(58);
    expectPublicDecisionCopyHasNoInternals(result);
  });

  it("caps precipitation or wind risk without increasing score", () => {
    const result = convergeForTarget("general", {
      riskFlags: [highRiskFlag("precipitation"), highRiskFlag("wind")],
    });

    expect(result.appliedCaps).toContain("precipitation_wind");
    expect(result.decisionMode).toBe("not_recommended");
    expect(result.finalScore).toBeLessThanOrEqual(46);
    expect(result.finalScore).toBeLessThanOrEqual(86);
  });
});

function expectPublicDecisionCopyHasNoInternals(
  result: ForecastDecisionConvergenceResult,
): void {
  const publicText = [
    result.finalRecommendationLabel,
    result.finalTripDecisionLabel,
    result.finalDecisionSummaryZh,
    ...result.capReasonsZh,
    ...result.positiveReasonsZh,
    ...result.riskReasonsZh,
    ...result.uncertaintyReasonsZh,
    ...result.publicDecisionTags,
  ].join("\n");
  const forbiddenFragments = [
    "DEM",
    "Copernicus",
    "GLO-30",
    "VRT",
    "raster",
    "tile",
    "GFS",
    "NOAA",
    "NCEP",
    "ECMWF",
    "ICON",
    "Open-Meteo",
    "meteoblue",
    "provider",
    "model",
    "horizonAltitudeDegrees",
    "obstructionClearanceDegrees",
  ];

  for (const fragment of forbiddenFragments) {
    expect(publicText).not.toContain(fragment);
  }
}
