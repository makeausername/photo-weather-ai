export type GlowSolarPhase = "sunrise" | "sunset";

export type GlowSolarAltitudeDirection = "rising" | "setting";

export type GlowSolarAltitudeBand = {
  readonly direction: GlowSolarAltitudeDirection;
  readonly startAltitudeDegrees: number;
  readonly endAltitudeDegrees: number;
};

export type GlowSolarAltitudePhaseConfig = {
  readonly candidate: GlowSolarAltitudeBand;
  readonly best: GlowSolarAltitudeBand;
};

export const glowSolarAltitudeGeometryConfig = {
  version: "solar-altitude-glow-v1",
  windowDerivationMethod: "solar_altitude_weather_v1",
  solarCalculationResolutionMinutes: 1,
  weatherResolutionMinutes: 60,
  displayRoundingMinutes: 5,
  sunrise: {
    candidate: {
      direction: "rising",
      startAltitudeDegrees: -6,
      endAltitudeDegrees: 2,
    },
    best: {
      direction: "rising",
      startAltitudeDegrees: -4,
      endAltitudeDegrees: 1,
    },
  },
  sunset: {
    candidate: {
      direction: "setting",
      startAltitudeDegrees: 2,
      endAltitudeDegrees: -6,
    },
    best: {
      direction: "setting",
      startAltitudeDegrees: 1,
      endAltitudeDegrees: -4,
    },
  },
} as const satisfies {
  readonly version: string;
  readonly windowDerivationMethod: string;
  readonly solarCalculationResolutionMinutes: number;
  readonly weatherResolutionMinutes: number;
  readonly displayRoundingMinutes: number;
  readonly sunrise: GlowSolarAltitudePhaseConfig;
  readonly sunset: GlowSolarAltitudePhaseConfig;
};

export function isCanonicalGlowWindowType(type: string): type is "sunrise_glow" | "sunset_glow" {
  return type === "sunrise_glow" || type === "sunset_glow";
}
