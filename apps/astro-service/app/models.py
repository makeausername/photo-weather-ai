from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


ForecastHorizon = Literal["24h", "48h", "72h", "7d"]
MoonImpactLevel = Literal["low", "medium", "high"]
ConfidenceLevel = Literal["low", "medium", "high"]


class AstroCalculateRequest(BaseModel):
    latitudeWgs84: float = Field(ge=-90, le=90)
    longitudeWgs84: float = Field(ge=-180, le=180)
    elevationMeters: float | None = None
    timezone: str = "Asia/Shanghai"
    horizon: ForecastHorizon = "24h"
    startDateTime: str | None = None
    targetDate: str | None = None


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
    moonImpactLevel: MoonImpactLevel
    galacticCenterMaxAltitude: float
    reasonZh: str
    limitationsZh: list[str]


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


class HealthResponse(BaseModel):
    ok: bool
    service: str
    ephemerisAvailable: bool
    ephemerisFileName: str
    ephemerisPath: str
    timezoneAvailable: bool
    defaultTimezone: str
