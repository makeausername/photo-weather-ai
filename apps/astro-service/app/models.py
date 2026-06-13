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
LightPollutionQuantileBasis = Literal[
    "adaptive_positive_log_radiance_quantiles",
    "log_radiance_dataset_quantiles",
]
TerrainHorizonObstructionLevel = Literal["clear", "marginal", "obstructed", "unknown"]
TerrainHorizonConfidence = Literal["high", "medium", "low", "unknown"]
TerrainHorizonTarget = Literal[
    "milky_way",
    "sunrise",
    "sunset",
    "moonrise",
    "moonset",
    "landscape",
    "custom",
]
TerrainDemObserverElevationSource = Literal["input", "dem", "unknown"]
TerrainDemTileStatus = Literal["available", "missing", "invalid", "pending"]
SkyBrightnessValueType = Literal[
    "sqm",
    "artificial_brightness_mcd_m2",
    "ratio_to_natural",
    "radiance",
    "bortle_class",
    "unknown",
]
SkyBrightnessHealthStatus = Literal[
    "available",
    "missing",
    "metadata_missing",
    "unreadable",
    "unsupported_value_type",
    "insufficient_data",
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
    quantileBasis: LightPollutionQuantileBasis
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


class SkyBrightnessQueryRequest(BaseModel):
    latitudeWgs84: float = Field(ge=-90, le=90)
    longitudeWgs84: float = Field(ge=-180, le=180)
    timezone: str = "Asia/Shanghai"

    @field_validator("latitudeWgs84", "longitudeWgs84")
    @classmethod
    def sky_brightness_coordinates_must_be_finite(cls, value: float) -> float:
        if value != value or value in (float("inf"), float("-inf")):
            raise ValueError("coordinate must be finite")
        return value


class SkyBrightnessBounds(BaseModel):
    west: float
    south: float
    east: float
    north: float


class SkyBrightnessResolution(BaseModel):
    xDegrees: float
    yDegrees: float


class SkyBrightnessEstimatedBortleRange(BaseModel):
    available: bool
    minClass: int | None = None
    maxClass: int | None = None
    rangeLabelZh: str
    confidence: ConfidenceLevel
    basisZh: str
    methodVersion: Literal["wa-modeled-sqm-v1"]
    unavailableReason: str | None = None


class ChinaDarkSkyReference(BaseModel):
    available: bool
    labelZh: str | None = None
    noteZh: str
    modelDerived: bool = True
    measured: bool = False
    official: bool = False


class SkyBrightnessDiagnostics(BaseModel):
    healthStatus: SkyBrightnessHealthStatus
    rasterPath: str | None = None
    metadataPath: str | None = None
    metadataExists: bool = False
    datasetExists: bool = False
    loadError: str | None = None
    bounds: SkyBrightnessBounds | None = None
    resolution: SkyBrightnessResolution | None = None
    sampleCount: int = 0
    validSampleCount: int = 0
    conversionNotes: list[str] = []
    uncertaintyNotes: list[str] = []


class SkyBrightnessQueryResponse(BaseModel):
    available: bool
    dataAvailable: bool
    unavailableReason: str | None = None
    sourceName: str | None = None
    sourceType: str | None = None
    datasetName: str | None = None
    datasetYear: int | None = None
    datasetVersion: str | None = None
    checksumShort: str | None = None
    valueType: SkyBrightnessValueType
    rawValue: float | None = None
    valueUnit: str | None = None
    modeledSqm: float | None = None
    artificialBrightness: float | None = None
    estimatedBortleRange: SkyBrightnessEstimatedBortleRange | None = None
    chinaDarkSkyReference: ChinaDarkSkyReference | None = None
    confidence: ConfidenceLevel
    diagnostics: SkyBrightnessDiagnostics
    queryElapsedMs: float | None = None
    cacheHit: bool = False


class TerrainDemProfileQueryRequest(BaseModel):
    latitudeWgs84: float = Field(ge=-90, le=90)
    longitudeWgs84: float = Field(ge=-180, le=180)
    observerElevationMeters: float | None = None
    target: TerrainHorizonTarget = "milky_way"
    targetAzimuthDegrees: float | None = Field(default=None, ge=0, le=360)
    targetAltitudeDegrees: float | None = None
    maxDistanceMeters: float = Field(default=30000, ge=100, le=100000)
    sampleIntervalMeters: float = Field(default=250, ge=10, le=5000)
    sampleCount: int | None = Field(default=None, ge=2, le=2000)

    @field_validator(
        "latitudeWgs84",
        "longitudeWgs84",
        "observerElevationMeters",
        "targetAzimuthDegrees",
        "targetAltitudeDegrees",
        "maxDistanceMeters",
        "sampleIntervalMeters",
    )
    @classmethod
    def terrain_numeric_fields_must_be_finite(cls, value: float | None) -> float | None:
        if value is None:
            return value
        if value != value or value in (float("inf"), float("-inf")):
            raise ValueError("value must be finite")
        return value


class TerrainDemBounds(BaseModel):
    west: float
    south: float
    east: float
    north: float


class TerrainDemResolution(BaseModel):
    xDegrees: float
    yDegrees: float
    approximateMeters: float | None = None


class TerrainDemMetadata(BaseModel):
    datasetExists: bool
    datasetName: str | None = None
    datasetVersion: str | None = None
    datasetYear: int | None = None
    sourceName: str | None = None
    crs: str | None = None
    width: int | None = None
    height: int | None = None
    bounds: TerrainDemBounds | None = None
    resolution: TerrainDemResolution | None = None
    verticalUnit: str | None = None
    noDataValue: float | None = None
    checksumShort: str | None = None
    importedAt: str | None = None
    rasterPath: str | None = None
    healthStatus: str


class TerrainDemTile(BaseModel):
    tileId: str
    sourceName: str
    datasetName: str
    datasetVersion: str | None = None
    datasetYear: int | None = None
    minLatitude: float
    maxLatitude: float
    minLongitude: float
    maxLongitude: float
    localPath: str
    fileExists: bool
    metadataExists: bool
    checksum: str | None = None
    importedAt: str | None = None
    status: TerrainDemTileStatus
    resolutionMeters: float | None = None
    verticalUnit: str | None = None
    notes: str | None = None


class TerrainDemTileCoverageDiagnostics(BaseModel):
    requiredTileId: str | None = None
    status: TerrainDemTileStatus
    coveredByActiveDataset: bool
    tileFileExists: bool
    tileMetadataExists: bool
    sourceName: str | None = None
    datasetName: str | None = None
    datasetVersion: str | None = None
    datasetYear: int | None = None
    resolutionMeters: float | None = None
    localPath: str | None = None
    noteZh: str


class TerrainDemCoordinateCoverage(BaseModel):
    latitudeWgs84: float
    longitudeWgs84: float
    validCoordinate: bool
    requiredTileId: str | None = None
    coveredByActiveDataset: bool
    tileStatus: TerrainDemTileStatus
    noteZh: str


class TerrainDemCoverageImportReadiness(BaseModel):
    readyForImport: bool
    reasonZh: str
    importCommand: str | None = None


class TerrainDemCoverageStatusResponse(BaseModel):
    datasetKey: str
    sourceName: str
    datasetName: str
    datasetVersion: str | None = None
    datasetYear: int | None = None
    activeDatasetBounds: TerrainDemBounds | None = None
    activeDatasetTileCount: int
    requiredTileIds: list[str]
    existingTileIds: list[str]
    missingTileIds: list[str]
    requiredTileCount: int
    availableTileCount: int
    missingTileCount: int
    estimatedFileCount: int
    estimatedLocalPaths: list[str]
    suggestedDownloadUrls: list[str]
    tiles: list[TerrainDemTile]
    coordinateCoverage: list[TerrainDemCoordinateCoverage]
    allCoordinatesCoveredByActiveDataset: bool | None = None
    importReadiness: TerrainDemCoverageImportReadiness
    generatedAt: str


class TerrainDemProfileSample(BaseModel):
    distanceMeters: float
    latitudeWgs84: float
    longitudeWgs84: float
    terrainElevationMeters: float
    apparentTerrainAngleDegrees: float


class TerrainDemCalculationBasis(BaseModel):
    samplingConfigVersion: str
    coordinateSystem: Literal["WGS84"]
    verticalUnit: str
    maxDistanceMeters: float
    sampleIntervalMeters: float
    requestedSampleCount: int
    demResolutionMeters: float | None = None
    obstructionRule: str


class TerrainDemProfileQueryResponse(BaseModel):
    available: bool
    dataAvailable: bool
    unavailableReason: str | None = None
    sourceName: str | None = None
    datasetName: str | None = None
    datasetYear: int | None = None
    datasetVersion: str | None = None
    checksumShort: str | None = None
    observerElevationMeters: float | None = None
    observerElevationSource: TerrainDemObserverElevationSource = "unknown"
    target: TerrainHorizonTarget = "milky_way"
    targetAzimuthDegrees: float | None = None
    targetAltitudeDegrees: float | None = None
    horizonAltitudeDegrees: float | None = None
    obstructionClearanceDegrees: float | None = None
    obstructionLevel: TerrainHorizonObstructionLevel = "unknown"
    confidence: TerrainHorizonConfidence = "low"
    sampleCount: int
    validSampleCount: int
    maxSampleDistanceMeters: float | None = None
    maxObstructionSample: TerrainDemProfileSample | None = None
    profileSamples: list[TerrainDemProfileSample]
    calculationBasis: TerrainDemCalculationBasis | None = None
    demCoverage: TerrainDemTileCoverageDiagnostics | None = None
    terrainHorizonNoteZh: str
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
    skyBrightness: SkyBrightnessQueryResponse | None = None


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
    skyBrightnessAvailable: bool = False
    skyBrightnessDatasetPathConfigured: bool = False
    skyBrightnessDatasetExists: bool = False
    skyBrightnessMetadataAvailable: bool = False
    skyBrightnessDatasetName: str | None = None
    skyBrightnessDatasetYear: int | None = None
    skyBrightnessDatasetVersion: str | None = None
    skyBrightnessValueType: SkyBrightnessValueType | None = None
    skyBrightnessChecksumShort: str | None = None
    skyBrightnessHealthStatus: str | None = None
    skyBrightnessLoadError: str | None = None
    terrainDemAvailable: bool = False
    terrainDemDatasetPathConfigured: bool = False
    terrainDemDatasetExists: bool = False
    terrainDemMetadataAvailable: bool = False
    terrainDemDatasetName: str | None = None
    terrainDemDatasetYear: int | None = None
    terrainDemDatasetVersion: str | None = None
    terrainDemChecksumShort: str | None = None
    terrainDemHealthStatus: str | None = None
    terrainDemLoadError: str | None = None
