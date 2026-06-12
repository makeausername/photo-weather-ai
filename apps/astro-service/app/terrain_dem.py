from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import json
import math
from threading import RLock
from time import perf_counter
from typing import Any

try:
    import numpy as np
    import rasterio
    from pyproj import Geod
    from rasterio.errors import RasterioIOError
except Exception as exc:  # pragma: no cover - exercised when optional deps are absent.
    np = None  # type: ignore[assignment]
    rasterio = None  # type: ignore[assignment]
    Geod = None  # type: ignore[assignment]
    RasterioIOError = Exception  # type: ignore[assignment]
    RASTER_DEPENDENCY_ERROR: Exception | None = exc
else:
    RASTER_DEPENDENCY_ERROR = None

from .models import (
    TerrainDemBounds,
    TerrainDemCalculationBasis,
    TerrainDemMetadata,
    TerrainDemProfileQueryRequest,
    TerrainDemProfileQueryResponse,
    TerrainDemProfileSample,
    TerrainDemResolution,
)
from .terrain_dem_coverage import coverage_for_coordinate, load_active_bounds


SAMPLING_CONFIG_VERSION = "terrain-dem-profile-v1"
OBSTRUCTION_RULE = "clearance = target altitude - terrain horizon altitude; clear >= 3 deg; marginal 0-3 deg; obstructed < 0 deg"
DEFAULT_UNAVAILABLE_NOTE_ZH = (
    "本地 DEM 地形数据暂不可用；本次不按无遮挡处理，仍需现场复核银河方向地平线。"
)
DEFAULT_AVAILABLE_NOTE_ZH = (
    "已使用本地 DEM 沿目标方位采样地形剖面；DEM 分辨率、坐标误差和近景遮挡仍需现场复核。"
)


@dataclass(frozen=True)
class DatasetSignature:
    checksum_short: str | None
    dataset_mtime_ns: int
    metadata_mtime_ns: int


@dataclass(frozen=True)
class HealthState:
    available: bool
    dataset_path_configured: bool
    dataset_exists: bool
    metadata_available: bool
    dataset_name: str | None
    dataset_year: int | None
    dataset_version: str | None
    checksum_short: str | None
    health_status: str
    load_error: str | None


class TerrainDemDataset:
    def __init__(self, dataset_path: Path, metadata_path: Path) -> None:
        self.dataset_path = dataset_path
        self.metadata_path = metadata_path
        self._lock = RLock()
        self._dataset: Any | None = None
        self._metadata: dict[str, Any] | None = None
        self._signature: DatasetSignature | None = None
        self._load_error: str | None = None
        self._health_status = "missing"

    @property
    def load_error(self) -> str | None:
        return self._load_error

    @property
    def health_status(self) -> str:
        return self._health_status

    @property
    def metadata(self) -> dict[str, Any] | None:
        with self._lock:
            self._ensure_open_locked(raise_on_error=False)
            return dict(self._metadata) if self._metadata else read_metadata_file_safe(self.metadata_path)

    @property
    def signature(self) -> DatasetSignature | None:
        with self._lock:
            self._ensure_open_locked(raise_on_error=False)
            return self._signature

    def close(self) -> None:
        with self._lock:
            if self._dataset is not None:
                self._dataset.close()
            self._dataset = None
            self._metadata = None
            self._signature = None

    def open(self):
        with self._lock:
            self._ensure_open_locked(raise_on_error=True)
            return self._dataset

    def health_state(self) -> HealthState:
        if RASTER_DEPENDENCY_ERROR is not None:
            return HealthState(
                available=False,
                dataset_path_configured=bool(str(self.dataset_path)),
                dataset_exists=self.dataset_path.exists(),
                metadata_available=self.metadata_path.exists(),
                dataset_name=None,
                dataset_year=None,
                dataset_version=None,
                checksum_short=None,
                health_status="dependency_missing",
                load_error=f"dependency_missing:{RASTER_DEPENDENCY_ERROR}",
            )

        with self._lock:
            self._ensure_open_locked(raise_on_error=False)
            metadata = self._metadata or read_metadata_file_safe(self.metadata_path) or {}
            return HealthState(
                available=self._dataset is not None and self._load_error is None,
                dataset_path_configured=bool(str(self.dataset_path)),
                dataset_exists=self.dataset_path.exists(),
                metadata_available=self.metadata_path.exists(),
                dataset_name=safe_str(metadata.get("datasetName")),
                dataset_year=safe_int(metadata.get("datasetYear")),
                dataset_version=safe_str(metadata.get("datasetVersion")),
                checksum_short=checksum_short_from_metadata(metadata),
                health_status=self._health_status,
                load_error=self._load_error,
            )

    def metadata_response(self) -> TerrainDemMetadata:
        metadata = self.metadata or {}
        bounds = bounds_from_metadata(metadata)
        resolution = resolution_from_metadata(metadata)
        return TerrainDemMetadata(
            datasetExists=self.dataset_path.exists(),
            datasetName=safe_str(metadata.get("datasetName")),
            datasetVersion=safe_str(metadata.get("datasetVersion")),
            datasetYear=safe_int(metadata.get("datasetYear")),
            sourceName=safe_str(metadata.get("sourceName")),
            crs=safe_str(metadata.get("crs")),
            width=safe_int(metadata.get("width")),
            height=safe_int(metadata.get("height")),
            bounds=bounds,
            resolution=resolution,
            verticalUnit=safe_str(metadata.get("verticalUnit")) or "meter",
            noDataValue=safe_float(metadata.get("noDataValue")),
            checksumShort=checksum_short_from_metadata(metadata),
            importedAt=safe_str(metadata.get("importedAt")),
            rasterPath=safe_str(metadata.get("rasterPath")) or str(self.dataset_path),
            healthStatus=self._health_status,
        )

    def _ensure_open_locked(self, *, raise_on_error: bool) -> None:
        if RASTER_DEPENDENCY_ERROR is not None:
            self._reset_open_state("dependency_missing", f"dependency_missing:{RASTER_DEPENDENCY_ERROR}")
            if raise_on_error:
                raise RuntimeError(self._load_error or "dependency_missing")
            return

        if not self.dataset_path.exists():
            self._reset_open_state("missing", "terrain_dem_missing")
            return
        if not self.metadata_path.exists():
            self._reset_open_state("metadata_missing", "terrain_dem_metadata_missing")
            return

        signature = self._current_signature()
        if self._dataset is not None and self._signature == signature:
            return

        if self._dataset is not None:
            self._dataset.close()
            self._dataset = None

        try:
            metadata = read_metadata_file(self.metadata_path)
            if metadata is None:
                raise RuntimeError("terrain_dem_metadata_invalid")
            dataset = rasterio.open(self.dataset_path)  # type: ignore[union-attr]
            if dataset.count < 1:
                raise RuntimeError("dataset_has_no_band")
            if dataset.width <= 0 or dataset.height <= 0:
                raise RuntimeError("dataset_has_invalid_dimensions")
            if dataset.crs is None or dataset.crs.to_epsg() != 4326:
                raise RuntimeError("dataset_crs_is_not_epsg4326")
            self._metadata = metadata
            self._dataset = dataset
            self._signature = signature
            self._load_error = None
            self._health_status = "available"
        except (RasterioIOError, OSError, RuntimeError, json.JSONDecodeError) as exc:
            self._reset_open_state("unreadable", f"{type(exc).__name__}:{exc}")
            if raise_on_error:
                raise

    def _current_signature(self) -> DatasetSignature:
        metadata = read_metadata_file(self.metadata_path)
        if metadata is None:
            raise RuntimeError("terrain_dem_metadata_invalid")
        return DatasetSignature(
            checksum_short=checksum_short_from_metadata(metadata),
            dataset_mtime_ns=self.dataset_path.stat().st_mtime_ns,
            metadata_mtime_ns=self.metadata_path.stat().st_mtime_ns,
        )

    def _reset_open_state(self, health_status: str, error: str) -> None:
        if self._dataset is not None:
            self._dataset.close()
        self._dataset = None
        self._metadata = None
        self._signature = None
        self._health_status = health_status
        self._load_error = error


class TerrainDemService:
    def __init__(self, dataset_path: Path, metadata_path: Path) -> None:
        self.dataset = TerrainDemDataset(dataset_path, metadata_path)
        self._geod = Geod(ellps="WGS84") if Geod is not None else None
        self._data_dir = dataset_path.parent.parent

    def close(self) -> None:
        self.dataset.close()

    def health_state(self) -> HealthState:
        return self.dataset.health_state()

    def metadata(self) -> TerrainDemMetadata:
        return self.dataset.metadata_response()

    def coverage_for_coordinate(self, latitude: float, longitude: float):
        return coverage_for_coordinate(
            latitude,
            longitude,
            data_dir=self._data_dir,
            active_bounds=load_active_bounds(self.dataset.metadata_path),
        )

    def query_profile(self, request: TerrainDemProfileQueryRequest) -> TerrainDemProfileQueryResponse:
        started_at = perf_counter()
        coverage = self.coverage_for_coordinate(request.latitudeWgs84, request.longitudeWgs84)
        if RASTER_DEPENDENCY_ERROR is not None:
            return unavailable_response(
                "terrain_dem_unreadable",
                coverage=coverage,
                query_elapsed_ms=elapsed_ms(started_at),
                load_error=str(RASTER_DEPENDENCY_ERROR),
            )
        if not valid_coordinate(request.latitudeWgs84, request.longitudeWgs84):
            return unavailable_response(
                "invalid_coordinate",
                coverage=coverage,
                query_elapsed_ms=elapsed_ms(started_at),
            )

        signature = self.dataset.signature
        metadata = self.dataset.metadata or {}
        if signature is None:
            return unavailable_response(
                map_load_error_to_reason(self.dataset.load_error or self.dataset.health_status),
                metadata=metadata,
                coverage=coverage,
                query_elapsed_ms=elapsed_ms(started_at),
            )

        dataset = self.dataset.open()
        if not coordinate_within_bounds(dataset.bounds, request.longitudeWgs84, request.latitudeWgs84):
            return unavailable_response(
                "terrain_dem_out_of_bounds",
                metadata=metadata,
                request=request,
                coverage=coverage,
                query_elapsed_ms=elapsed_ms(started_at),
            )
        if request.targetAzimuthDegrees is None:
            return unavailable_response(
                "missing_target_geometry",
                metadata=metadata,
                request=request,
                coverage=coverage,
                query_elapsed_ms=elapsed_ms(started_at),
            )

        observer_elevation_source = "input"
        observer_elevation = finite_float(request.observerElevationMeters)
        if observer_elevation is None:
            observer_elevation = sample_elevation(
                dataset,
                request.longitudeWgs84,
                request.latitudeWgs84,
            )
            observer_elevation_source = "dem" if observer_elevation is not None else "unknown"
        if observer_elevation is None:
            return unavailable_response(
                "missing_observer_elevation",
                metadata=metadata,
                request=request,
                coverage=coverage,
                query_elapsed_ms=elapsed_ms(started_at),
            )

        distances = sample_distances(request)
        profile_samples: list[TerrainDemProfileSample] = []
        sample_count = len(distances)
        for distance_meters in distances:
            lon, lat = self._project(
                request.longitudeWgs84,
                request.latitudeWgs84,
                request.targetAzimuthDegrees,
                distance_meters,
            )
            elevation = sample_elevation(dataset, lon, lat)
            if elevation is None:
                continue
            angle = apparent_angle_degrees(observer_elevation, elevation, distance_meters)
            profile_samples.append(
                TerrainDemProfileSample(
                    distanceMeters=round(distance_meters, 1),
                    latitudeWgs84=round(lat, 7),
                    longitudeWgs84=round(lon, 7),
                    terrainElevationMeters=round(elevation, 1),
                    apparentTerrainAngleDegrees=round(angle, 3),
                )
            )

        valid_count = len(profile_samples)
        if valid_count == 0:
            return unavailable_response(
                "terrain_dem_no_data",
                metadata=metadata,
                request=request,
                coverage=coverage,
                observer_elevation=observer_elevation,
                observer_elevation_source=observer_elevation_source,
                query_elapsed_ms=elapsed_ms(started_at),
                sample_count=sample_count,
            )
        if valid_count < minimum_valid_samples(sample_count):
            return unavailable_response(
                "insufficient_directional_sample",
                metadata=metadata,
                request=request,
                coverage=coverage,
                observer_elevation=observer_elevation,
                observer_elevation_source=observer_elevation_source,
                query_elapsed_ms=elapsed_ms(started_at),
                sample_count=sample_count,
                valid_sample_count=valid_count,
            )

        max_sample = max(profile_samples, key=lambda sample: sample.apparentTerrainAngleDegrees)
        horizon_altitude = round(max_sample.apparentTerrainAngleDegrees, 3)
        target_altitude = finite_float(request.targetAltitudeDegrees)
        clearance = (
            round(target_altitude - horizon_altitude, 3) if target_altitude is not None else None
        )
        obstruction_level = classify_obstruction(clearance)
        confidence = confidence_from_samples(valid_count, sample_count, metadata)
        basis = calculation_basis(request, metadata, sample_count)

        return TerrainDemProfileQueryResponse(
            available=True,
            dataAvailable=True,
            sourceName=safe_str(metadata.get("sourceName")),
            datasetName=safe_str(metadata.get("datasetName")),
            datasetYear=safe_int(metadata.get("datasetYear")),
            datasetVersion=safe_str(metadata.get("datasetVersion")),
            checksumShort=checksum_short_from_metadata(metadata),
            observerElevationMeters=round(observer_elevation, 1),
            observerElevationSource=observer_elevation_source,  # type: ignore[arg-type]
            target=request.target,
            targetAzimuthDegrees=round(float(request.targetAzimuthDegrees % 360), 3),
            targetAltitudeDegrees=round_optional(target_altitude, 3),
            horizonAltitudeDegrees=horizon_altitude,
            obstructionClearanceDegrees=clearance,
            obstructionLevel=obstruction_level,  # type: ignore[arg-type]
            confidence=confidence,  # type: ignore[arg-type]
            sampleCount=sample_count,
            validSampleCount=valid_count,
            maxSampleDistanceMeters=round(max(distances), 1) if distances else None,
            maxObstructionSample=max_sample,
            profileSamples=profile_samples,
            calculationBasis=basis,
            demCoverage=coverage,
            terrainHorizonNoteZh=DEFAULT_AVAILABLE_NOTE_ZH,
            queryElapsedMs=elapsed_ms(started_at),
            cacheHit=False,
        )

    def _project(self, lon: float, lat: float, azimuth: float, distance_meters: float) -> tuple[float, float]:
        if self._geod is None:
            return lon, lat
        projected_lon, projected_lat, _ = self._geod.fwd(lon, lat, azimuth, distance_meters)
        return float(projected_lon), float(projected_lat)


def unavailable_response(
    reason: str,
    *,
    metadata: dict[str, Any] | None = None,
    request: TerrainDemProfileQueryRequest | None = None,
    observer_elevation: float | None = None,
    observer_elevation_source: str = "unknown",
    query_elapsed_ms: float | None = None,
    sample_count: int = 0,
    valid_sample_count: int = 0,
    load_error: str | None = None,
    coverage=None,
) -> TerrainDemProfileQueryResponse:
    metadata = metadata or {}
    if load_error:
        reason = f"{reason}:{load_error}"
    target_azimuth = request.targetAzimuthDegrees if request else None
    target_altitude = request.targetAltitudeDegrees if request else None
    return TerrainDemProfileQueryResponse(
        available=False,
        dataAvailable=False,
        unavailableReason=reason,
        sourceName=safe_str(metadata.get("sourceName")),
        datasetName=safe_str(metadata.get("datasetName")),
        datasetYear=safe_int(metadata.get("datasetYear")),
        datasetVersion=safe_str(metadata.get("datasetVersion")),
        checksumShort=checksum_short_from_metadata(metadata),
        observerElevationMeters=round_optional(observer_elevation, 1),
        observerElevationSource=observer_elevation_source,  # type: ignore[arg-type]
        target=request.target if request else "milky_way",
        targetAzimuthDegrees=round_optional(target_azimuth, 3),
        targetAltitudeDegrees=round_optional(target_altitude, 3),
        obstructionLevel="unknown",
        confidence="low",
        sampleCount=sample_count,
        validSampleCount=valid_sample_count,
        profileSamples=[],
        calculationBasis=calculation_basis(request, metadata, sample_count) if request else None,
        demCoverage=coverage,
        terrainHorizonNoteZh=DEFAULT_UNAVAILABLE_NOTE_ZH,
        queryElapsedMs=query_elapsed_ms,
        cacheHit=False,
    )


def sample_distances(request: TerrainDemProfileQueryRequest) -> list[float]:
    requested_count = request.sampleCount
    if requested_count is None:
        requested_count = int(math.ceil(request.maxDistanceMeters / request.sampleIntervalMeters))
    count = max(2, min(2000, requested_count))
    return [float(request.maxDistanceMeters) * index / count for index in range(1, count + 1)]


def sample_elevation(dataset: Any, lon: float, lat: float) -> float | None:
    if not coordinate_within_bounds(dataset.bounds, lon, lat):
        return None
    try:
        sample = next(dataset.sample([(lon, lat)], indexes=1, masked=True))
    except (StopIteration, RasterioIOError, ValueError):
        return None
    return masked_sample_value(sample)


def masked_sample_value(sample: Any) -> float | None:
    if np is None:
        return None
    array = np.ma.asarray(sample)
    if array.size == 0 or np.ma.is_masked(array[0]):
        return None
    value = float(array[0])
    if not math.isfinite(value):
        return None
    return value


def apparent_angle_degrees(
    observer_elevation_meters: float,
    terrain_elevation_meters: float,
    distance_meters: float,
) -> float:
    if distance_meters <= 0:
        return 90.0 if terrain_elevation_meters > observer_elevation_meters else -90.0
    return math.degrees(math.atan((terrain_elevation_meters - observer_elevation_meters) / distance_meters))


def classify_obstruction(clearance_degrees: float | None) -> str:
    if clearance_degrees is None:
        return "unknown"
    if clearance_degrees >= 3:
        return "clear"
    if clearance_degrees >= 0:
        return "marginal"
    return "obstructed"


def confidence_from_samples(valid_count: int, sample_count: int, metadata: dict[str, Any]) -> str:
    if sample_count <= 0:
        return "low"
    ratio = valid_count / sample_count
    resolution = resolution_from_metadata(metadata)
    coarse_dem = resolution and resolution.approximateMeters and resolution.approximateMeters > 1000
    if valid_count >= 80 and ratio >= 0.8 and not coarse_dem:
        return "high"
    if valid_count >= 12 and ratio >= 0.55:
        return "medium"
    return "low"


def minimum_valid_samples(sample_count: int) -> int:
    return min(8, max(3, int(math.ceil(sample_count * 0.2))))


def calculation_basis(
    request: TerrainDemProfileQueryRequest | None,
    metadata: dict[str, Any],
    sample_count: int,
) -> TerrainDemCalculationBasis | None:
    if request is None:
        return None
    resolution = resolution_from_metadata(metadata)
    return TerrainDemCalculationBasis(
        samplingConfigVersion=SAMPLING_CONFIG_VERSION,
        coordinateSystem="WGS84",
        verticalUnit=safe_str(metadata.get("verticalUnit")) or "meter",
        maxDistanceMeters=float(request.maxDistanceMeters),
        sampleIntervalMeters=float(request.sampleIntervalMeters),
        requestedSampleCount=sample_count,
        demResolutionMeters=resolution.approximateMeters if resolution else None,
        obstructionRule=OBSTRUCTION_RULE,
    )


def read_metadata_file(path: Path) -> dict[str, Any] | None:
    if not path.exists():
        return None
    with path.open("r", encoding="utf-8") as handle:
        content = json.load(handle)
    if not isinstance(content, dict):
        return None
    return content


def read_metadata_file_safe(path: Path) -> dict[str, Any] | None:
    try:
        return read_metadata_file(path)
    except (OSError, json.JSONDecodeError):
        return None


def checksum_short_from_metadata(metadata: dict[str, Any] | None) -> str | None:
    if not metadata:
        return None
    checksum = safe_str(metadata.get("checksumSha256"))
    return checksum[:12] if checksum else None


def bounds_from_metadata(metadata: dict[str, Any]) -> TerrainDemBounds | None:
    raw = metadata.get("bounds") or metadata.get("geographicBounds")
    if not isinstance(raw, dict):
        return None
    west = safe_float(raw.get("west"))
    south = safe_float(raw.get("south"))
    east = safe_float(raw.get("east"))
    north = safe_float(raw.get("north"))
    if None in (west, south, east, north):
        return None
    return TerrainDemBounds(west=west, south=south, east=east, north=north)  # type: ignore[arg-type]


def resolution_from_metadata(metadata: dict[str, Any]) -> TerrainDemResolution | None:
    raw = metadata.get("resolution") or metadata.get("pixelSizeDegrees")
    if not isinstance(raw, dict):
        return None
    x_degrees = safe_float(raw.get("xDegrees") or raw.get("x"))
    y_degrees = safe_float(raw.get("yDegrees") or raw.get("y"))
    if x_degrees is None or y_degrees is None:
        return None
    approximate = safe_float(raw.get("approximateMeters"))
    if approximate is None:
        approximate = (abs(x_degrees) + abs(y_degrees)) * 0.5 * 111_320.0
    return TerrainDemResolution(
        xDegrees=abs(x_degrees),
        yDegrees=abs(y_degrees),
        approximateMeters=round(approximate, 2),
    )


def coordinate_within_bounds(bounds: Any, lon: float, lat: float) -> bool:
    return bounds.left <= lon <= bounds.right and bounds.bottom <= lat <= bounds.top


def valid_coordinate(lat: float, lon: float) -> bool:
    return math.isfinite(lat) and math.isfinite(lon) and -90 <= lat <= 90 and -180 <= lon <= 180


def map_load_error_to_reason(error: str) -> str:
    if "metadata_missing" in error or "terrain_dem_metadata_missing" in error:
        return "terrain_dem_metadata_missing"
    if "missing" in error:
        return "terrain_dem_missing"
    return "terrain_dem_unreadable"


def finite_float(value: float | int | None) -> float | None:
    if value is None:
        return None
    number = float(value)
    return number if math.isfinite(number) else None


def safe_float(value: Any) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def safe_int(value: Any) -> int | None:
    try:
        if value is None or value == "":
            return None
        return int(value)
    except (TypeError, ValueError):
        return None


def safe_str(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def round_optional(value: float | int | None, digits: int) -> float | None:
    if value is None:
        return None
    if not math.isfinite(float(value)):
        return None
    return round(float(value), digits)


def elapsed_ms(started_at: float) -> float:
    return round((perf_counter() - started_at) * 1000, 1)
