from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, field_validator


ForecastHorizon = Literal["24h", "48h", "72h", "7d"]
MoonImpactLevel = Literal["low", "medium", "high"]
ConfidenceLevel = Literal["low", "medium", "high"]
LightPollutionRiskLevel = Literal[
    "very_low",
    "low",
    "medium",
    "high",
    "very_high",
    "insufficient",
]
LightPollutionDirection = Literal[
    "north",
    "northeast",
    "east",
    "southeast",
    "south",
    "southwest",
    "west",
    "northwest",
]


class AstroCalculateRequest(BaseModel):
    latitudeWgs84: float = Field(ge=-90, le=90)
    longitudeWgs84: float = Field(ge=-180, le=180)
    elevationMeters: float | None = None
    timezone: str = "Asia/Shanghai"
    horizon: ForecastHorizon = "24h"
    startDateTime: str | None = None
    targetDate: str | None = None

    @field_validator("latitudeWgs84", "longitudeWgs84")
    @classmethod
    def coordinates_must_be_finite(cls, value: float) -> float:
        if value != value or value in (float("inf"), float("-inf")):
            raise ValueError("coordinate must be finite")
        return value


class DailySun(BaseModel):
    date: str
    sunrise: str | None = None
    sunset: str | None = None
    solarNoon: str | None = None
    civilDawn: str | None = None
    civilDusk: str | None = None
    nauticalDawn: str | None = None
    nauticalDusk: str | None = None
    astronomicalDawn: str | None = None
    astronomicalDusk: str | None = None
    sunriseAzimuth: float | None = None
    sunsetAzimuth: float | None = None
    sunriseGlowCandidateStart: str | None = None
    sunriseGlowCandidateEnd: str | None = None
    sunriseGlowBestStart: str | None = None
    sunriseGlowBestEnd: str | None = None
    sunsetGlowCandidateStart: str | None = None
    sunsetGlowCandidateEnd: str | None = None
    sunsetGlowBestStart: str | None = None
    sunsetGlowBestEnd: str | None = None


class MoonAltitudeSample(BaseModel):
    time: str
    altitude: float
    azimuth: float


class DailyMoon(BaseModel):
    date: str
    moonPhaseValue: float
    moonPhaseNameZh: str
    moonIllumination: float
    waxingOrWaning: Literal["waxing", "waning", "unknown"]
    moonrise: str | None = None
    moonset: str | None = None
    moonAltitudeByHour: list[MoonAltitudeSample]
    moonImpactLevel: MoonImpactLevel
    moonImpactScore: float
    moonImpactReasonsZh: list[str]


class AstronomicalNightWindow(BaseModel):
    date: str
    start: str
    end: str
    durationMinutes: int
    noteZh: str


class MoonlessNightWindow(BaseModel):
    date: str
    start: str
    end: str
    durationMinutes: int
    reasonZh: str


class MilkyWayCandidateWindow(BaseModel):
    date: str
    start: str
    end: str
    bestTime: str | None = None
    minAltitude: float
    maxAltitude: float
    bestAzimuth: float | None = None
    directionZh: str
    confidenceLevel: ConfidenceLevel
    noteZh: str


class RecommendedMilkyWayWindow(BaseModel):
    date: str
    start: str
    end: str
    bestTime: str | None = None
    durationMinutes: int
    directionZh: str
    bestAzimuth: float | None = None
    moonImpactLevel: MoonImpactLevel
    galacticCenterMaxAltitude: float
    reasonZh: str
    limitationsZh: list[str]


class LightPollutionQueryRequest(BaseModel):
    latitudeWgs84: float = Field(ge=-90, le=90)
    longitudeWgs84: float = Field(ge=-180, le=180)
    observerElevationMeters: float | None = None
    targetAzimuthDegrees: float | None = Field(default=None, ge=0, le=360)
    timezone: str = "Asia/Shanghai"

    @field_validator("latitudeWgs84", "longitudeWgs84", "targetAzimuthDegrees")
    @classmethod
    def numeric_fields_must_be_finite(cls, value: float | None) -> float | None:
        if value is None:
            return value
        if value != value or value in (float("inf"), float("-inf")):
            raise ValueError("value must be finite")
        return value


class DirectionalLightPollutionRisk(BaseModel):
    direction: LightPollutionDirection
    directionLabelZh: str
    azimuthDegrees: float
    radiance: float | None = None
    riskIndex: int | None = None
    riskLevel: LightPollutionRiskLevel
    riskLevelLabelZh: str
    sampleCount: int
    validSampleCount: int


class LightPollutionCalculationBasis(BaseModel):
    samplingConfigVersion: str
    coordinateSystem: Literal["WGS84"]
    distancesKm: list[float]
    distanceWeights: dict[str, float]
    localNeighborhoodKm: list[float]
    directionSectorsDegrees: int
    quantileBasis: Literal["log_radiance_dataset_quantiles"]
    scoringMode: Literal["heuristic"]
    nonSqmBortleNoticeZh: str


class LightPollutionQueryResponse(BaseModel):
    available: bool
    dataAvailable: bool
    unavailableReason: str | None = None
    sourceCode: str | None = None
    sourceLabel: str | None = None
    datasetYear: int | None = None
    datasetVersion: str | None = None
    checksumShort: str | None = None
    localRadiance: float | None = None
    localRadiancePercentile: float | None = None
    surroundingHaloRadiance: float | None = None
    ambientRiskIndex: int | None = None
    ambientRiskLevel: LightPollutionRiskLevel
    ambientRiskLevelLabelZh: str
    directionalRisk: list[DirectionalLightPollutionRisk]
    targetAzimuthDegrees: float | None = None
    targetDirectionRisk: int | None = None
    targetDirectionLevel: LightPollutionRiskLevel | None = None
    targetDirectionLevelLabelZh: str | None = None
    confidence: ConfidenceLevel
    sampleCount: int
    validSampleCount: int
    calculationBasis: LightPollutionCalculationBasis | None = None
    lightPollutionNoteZh: str
    queryElapsedMs: float | None = None
    cacheHit: bool = False


class SunBlock(BaseModel):
    daily: list[DailySun]


class MoonBlock(BaseModel):
    daily: list[DailyMoon]
    altitudeByHour: list[MoonAltitudeSample]


class NightBlock(BaseModel):
    astronomicalNightWindows: list[AstronomicalNightWindow]
    moonlessNightWindows: list[MoonlessNightWindow]


class MilkyWayBlock(BaseModel):
    candidateWindows: list[MilkyWayCandidateWindow]
    recommendedWindows: list[RecommendedMilkyWayWindow]
    directionSummaryZh: str
    calculationNoteZh: str


class CalculationBasis(BaseModel):
    ephemerisFileName: str
    coordinateSystem: Literal["WGS84"]
    timezone: str
    elevationMeters: float | None = None
    generatedAt: str
    computeElapsedMs: float | None = None
    samplingResolutionMinutes: dict[str, int] | None = None


class AstroCalculateResponse(BaseModel):
    forecastStart: str
    forecastEnd: str
    targetDates: list[str]
    sun: SunBlock
    moon: MoonBlock
    night: NightBlock
    milkyWay: MilkyWayBlock
    calculationBasis: CalculationBasis
    lightPollution: LightPollutionQueryResponse | None = None


class HealthResponse(BaseModel):
    ok: bool
    service: str
    ephemerisAvailable: bool
    ephemerisFileName: str
    ephemerisPath: str
    timezoneAvailable: bool
    defaultTimezone: str
    lightPollutionAvailable: bool = False
    lightPollutionDatasetPathConfigured: bool = False
    lightPollutionMetadataAvailable: bool = False
    lightPollutionDatasetYear: int | None = None
    lightPollutionDatasetVersion: str | None = None
    lightPollutionChecksumShort: str | None = None
    lightPollutionLoadError: str | None = None
